#!/usr/bin/env python3
"""Exercise the actual workflow's AVD boundary with synthetic SDK subprocesses.

This does not download an SDK, start an emulator, install an APK or certify a
device. The workflow runs unchanged until the first emulator launch; external
SDK replies are injected to test conflicting homes and fail-closed discovery.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest
from unittest.mock import patch

WORKFLOW = Path(os.environ.get('KNABA_NATIVE_WORKFLOW_PATH',
                             Path(__file__).resolve().parents[1] / '.github/workflows/native.yml'))
SOURCE_SHA = 'a' * 40


def emulator_program():
    step = WORKFLOW.read_text().split(
        '      - name: Install and launch the delivered APK on an isolated Android 35 emulator\n', 1)[1]
    program = step.split("          python3 - <<'PY'\n", 1)[1].split('\n          PY\n', 1)[0]
    return compile(textwrap.dedent(program), str(WORKFLOW) + ':android-emulator-block', 'exec')


class VerifiedLaunchBoundary(Exception):
    """Stop before any device work: only subprocess invocation was inspected."""


class AndroidEmulatorBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.space = tempfile.TemporaryDirectory(prefix='knaba-avd-workflow-test-')
        self.addCleanup(self.space.cleanup)
        self.root = Path(self.space.name)
        self.sdk = self.root / 'sdk'
        self.runner_temp = self.root / 'runner-temp'
        self.runner_temp.mkdir()
        for relative in ('emulator/source.properties',
                         'system-images/android-35/google_apis/x86_64/source.properties'):
            target = self.sdk / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('Synthetic SDK protocol fixture\n')
        distribution = self.root / 'build/distribution/prototype'
        distribution.mkdir(parents=True)
        apk = b'synthetic APK bytes; never installed'
        (distribution / 'fixture.apk').write_bytes(apk)
        (distribution / 'receipt.json').write_text(json.dumps({
            'artifact': 'fixture.apk', 'sha256': hashlib.sha256(apk).hexdigest(),
            'bytes': len(apk), 'sourceGitSha': SOURCE_SHA, 'package': 'de.knaba.mobile.test',
        }))
        (self.root / 'build/evidence/android-emulator').mkdir(parents=True)
        self.calls = []
        self.launches = []
        self.mode = 'success'
        self.created_path = None
        self.original_home = os.environ.get('HOME')

    def run_sdk(self, command, **kwargs):
        command = [str(part) for part in command]
        env = kwargs.get('env')
        effective = os.environ if env is None else env
        self.calls.append({'command': command, 'env': None if env is None else dict(env)})
        name, arguments = Path(command[0]).name, command[1:]
        output, code = '', 0
        if name == 'avdmanager' and arguments[:2] == ['list', 'device']:
            output = 'id: 0 or "pixel_6"\n'
        elif name == 'avdmanager' and arguments[:2] == ['create', 'avd']:
            if self.mode == 'create-failure':
                return subprocess.CompletedProcess(command, 2, '', 'Synthetic creation failure')
            # SDK-manager preference home and emulator defaults may disagree;
            # explicit ANDROID_AVD_HOME must bind both tools to the same files.
            default = Path(effective['ANDROID_USER_HOME']) / 'avd'
            directory = Path(effective.get('ANDROID_AVD_HOME', default))
            directory.mkdir(parents=True, exist_ok=True)
            avd_name = arguments[arguments.index('--name') + 1]
            data = (Path(arguments[arguments.index('--path') + 1])
                    if '--path' in arguments else directory / (avd_name + '.avd'))
            data.mkdir(parents=True)
            self.created_path = data
            if self.mode != 'missing-config':
                (data / 'config.ini').write_text('image.sysdir.1=system-images/android-35/google_apis/x86_64/\n')
            if self.mode != 'missing-ini':
                target = self.root / 'wrong-avd' if self.mode == 'wrong-path' else data
                (directory / (avd_name + '.ini')).write_text('avd.ini.encoding=UTF-8\npath=' + str(target) + '\n')
        elif name == 'avdmanager' and arguments == ['list', 'avd']:
            output = 'Name: knaba-api35\nPath: ' + str(self.created_path) + '\n'
        elif name == 'emulator' and arguments == ['-list-avds']:
            directory = Path(effective['ANDROID_AVD_HOME'])
            names = sorted(path.stem for path in directory.glob('*.ini'))
            if self.mode == 'invisible-avd':
                names = []
            elif self.mode == 'unexpected-avd':
                names.append('unrelated-avd')
            output = '\n'.join(names) + '\n'
        elif name == 'emulator' and arguments == ['-version']:
            output = 'Synthetic emulator protocol fixture\n'
        elif name == 'emulator' and arguments == ['-accel-check']:
            output = 'Synthetic acceleration protocol fixture\n'
        elif name == 'adb' and arguments == ['version']:
            output = 'Synthetic adb protocol fixture\n'
        elif name == 'adb' and arguments == ['start-server']:
            pass
        elif name == 'sdkmanager':
            pass
        else:
            raise AssertionError('Unexpected SDK command: ' + repr(command))
        return subprocess.CompletedProcess(command, code, output, '')

    def launch_emulator(self, command, **kwargs):
        self.launches.append({'command': command, **kwargs})
        env = kwargs.get('env')
        self.assertIsNotNone(env, 'AVD creation and launch lack a shared explicit environment')
        self.assertEqual(env.get('HOME'), self.original_home, 'HOME must not be repurposed')
        self.assertEqual(env['ANDROID_HOME'], str(self.sdk))
        avd_home = Path(env['ANDROID_AVD_HOME'])
        self.assertTrue(avd_home.is_relative_to(self.runner_temp))
        self.assertNotEqual(avd_home, self.root / 'inherited-avd')
        self.assertEqual(avd_home, Path(env['ANDROID_USER_HOME']) / 'avd')
        self.assertEqual(env['ANDROID_EMULATOR_HOME'], env['ANDROID_USER_HOME'])
        self.assertEqual(self.created_path, avd_home / 'knaba-api35.avd')
        self.assertTrue((avd_home / 'knaba-api35.ini').is_file())
        for entry in self.calls:
            self.assertTrue(entry['env'] == env, 'SDK subprocess environments differ')
        create = next(entry['command'] for entry in self.calls if 'create' in entry['command'])
        self.assertEqual(create[create.index('--path') + 1], str(self.created_path))
        self.assertTrue(any(entry['command'][-1:] == ['-list-avds'] for entry in self.calls))
        raise VerifiedLaunchBoundary()

    def exercise(self, mode='success'):
        self.mode = mode
        environment = {
            'ANDROID_HOME': str(self.sdk), 'RUNNER_TEMP': str(self.runner_temp),
            'NATIVE_SOURCE_SHA': SOURCE_SHA,
            'ANDROID_USER_HOME': str(self.root / 'inherited-user'),
            'ANDROID_EMULATOR_HOME': str(self.root / 'inherited-emulator'),
            'ANDROID_AVD_HOME': str(self.root / 'inherited-avd'),
        }
        previous = Path.cwd()
        try:
            os.chdir(self.root)
            with patch.dict(os.environ, environment), \
                    patch('subprocess.check_output', return_value=SOURCE_SHA + '\n'), \
                    patch('subprocess.run', side_effect=self.run_sdk), \
                    patch('subprocess.Popen', side_effect=self.launch_emulator):
                exec(emulator_program(), {'__name__': '__main__'})
        finally:
            os.chdir(previous)

    def assert_refused_before_launch(self, mode, message):
        with self.assertRaisesRegex(AssertionError, message):
            self.exercise(mode)
        self.assertEqual(self.launches, [])
        self.assertFalse(any(entry['command'][-1:] == ['start-server'] for entry in self.calls))
        failure = json.loads((self.root / 'build/evidence/android-emulator/failure.json').read_text())
        self.assertEqual(failure['stage'], 'sdk-and-avd')
        self.assertEqual(failure['completion'], 'FAILED')

    def test_shared_environment_overrides_conflicting_tool_defaults(self):
        with self.assertRaises(VerifiedLaunchBoundary):
            self.exercise()
        self.assertEqual(len(self.launches), 1)
        setup = json.loads((self.root / 'build/evidence/android-emulator/avd-setup.json').read_text())
        self.assertEqual(setup['emulatorVisibleAvds'], ['knaba-api35'])

    def test_missing_ini_is_refused(self):
        self.assert_refused_before_launch('missing-ini', 'AVD index file is missing')

    def test_missing_config_is_refused(self):
        self.assert_refused_before_launch('missing-config', 'AVD config file is missing')

    def test_index_pointing_outside_task_avd_is_refused(self):
        self.assert_refused_before_launch('wrong-path', 'AVD index points outside the task directory')

    def test_emulator_cannot_see_created_avd_is_refused(self):
        self.assert_refused_before_launch('invisible-avd', 'Emulator cannot see exactly the task AVD')

    def test_unrelated_avd_is_refused(self):
        self.assert_refused_before_launch('unexpected-avd', 'Emulator cannot see exactly the task AVD')

    def test_creation_failure_is_not_converted_into_acceptance(self):
        with self.assertRaises(subprocess.CalledProcessError):
            self.exercise('create-failure')
        self.assertEqual(self.launches, [])


if __name__ == '__main__':
    unittest.main()

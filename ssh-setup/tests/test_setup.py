#!/usr/bin/env python3
"""Isolated Bash policy tests. No real service, package, or SSH operations run."""

import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest


TEST_FILE = Path(__file__).resolve()
SCRIPT = TEST_FILE.parents[2] / "ssh.sh"  # Published: ssh-setup/tests/ and root ssh.sh.
if not SCRIPT.is_file():
    SCRIPT = TEST_FILE.parents[1] / "setup.sh"  # Local staging layout.


MOCKS = r'''
record() { printf '%s\n' "$*" >> "$TEST_LOG"; }
check_environment() { :; }
sshd_command() {
    record "sshd $*"
    if [[ "$TEST_VALID" != 1 ]]; then
        printf '%s\n' "fixture: invalid SSH configuration" >&2
        return 1
    fi
    case " $* " in
        *" -T "*) printf '%s\n' "port 2222" "listenaddress 0.0.0.0:2222" \
            "permitrootlogin prohibit-password" "passwordauthentication no" \
            "pubkeyauthentication yes" "authenticationmethods publickey" ;;
        *" -t "*) return 0 ;;
        *) printf 'Unexpected sshd call: %s\n' "$*" >&2; return 91 ;;
    esac
}
systemctl() {
    record "systemctl $*"
    local unit=ssh.service arg
    for arg in "$@"; do
        case "$arg" in ssh.socket|ssh.service|sshd.service) unit="$arg";; esac
    done
    case " $* " in
        *" is-active "*)
            if [[ "$unit" == ssh.socket ]]; then [[ "$TEST_SOCKET_ACTIVE" == 1 ]];
            else [[ "$TEST_SERVICE_ACTIVE" == 1 ]]; fi ;;
        *" is-enabled "*)
            if [[ "$TEST_MASKED" == "$unit" ]]; then
                printf '%s\n' masked; return 1
            fi
            if [[ "$unit" != ssh.socket || "$TEST_SOCKET_ENABLED" == 1 ]]; then
                printf '%s\n' enabled
            else printf '%s\n' disabled; return 1; fi ;;
        *" show "*)
            if [[ "$TEST_MANAGER_FAIL" == 1 ]]; then
                printf '%s\n' 'fixture: systemd manager unavailable' >&2; return 1
            fi
            if [[ "$TEST_NO_SERVICE" == 1 && "$unit" == ssh.service ]]; then
                if [[ " $* " == *"--property=LoadState"* ]]; then
                    printf '%s\n' not-found
                else printf '%s\n' 'fixture: unit does not exist' >&2; fi
                return 4
            fi
            if [[ " $* " == *"--property=ExecStart"* ]]; then
                printf '%s\n' "$TEST_EXEC_START"
            elif [[ " $* " == *"--property=EnvironmentFiles"* ]]; then
                printf '%s\n' '/etc/default/ssh (ignore_errors=yes)'
            elif [[ " $* " == *"--property=Environment"* ]]; then
                return 0
            elif [[ " $* " == *"--property=LoadState"* ]]; then
                if [[ "$TEST_MASKED" == "$unit" ]]; then printf '%s\n' masked;
                else printf '%s\n' loaded; fi
            else printf '%s\n' "Id=$unit" "ActiveState=active"; fi ;;
        *" cat "*) printf '%s\n' '[Service]' "ExecStart=$TEST_EXEC_START" ;;
        *" enable "*|*" start "*)
            record "MUTATE systemctl $*"
            if [[ "$unit" == ssh.socket ]]; then TEST_SOCKET_ACTIVE=1; else TEST_SERVICE_ACTIVE=1; fi ;;
        *" daemon-reload "*) record "MUTATE systemctl $*" ;;
        *) printf 'Unexpected systemctl call: %s\n' "$*" >&2; return 91 ;;
    esac
}
apt-get() {
    record "MUTATE apt-get $*"
    if [[ " $* " == *" install "* ]]; then
        printf '#!/bin/sh\nexit 91\n' > "$SSH_SETUP_SSHD"
        chmod 700 "$SSH_SETUP_SSHD"
        TEST_NO_SERVICE=0
    fi
}
install() {
    record "MUTATE install $*"
    python3 "$TEST_INSTALL_HELPER" "$@"
}
ssh-keygen() { record "MUTATE ssh-keygen $*"; }
ss() { record "ss $*"; printf '%s\n' 'LISTEN 0 128 0.0.0.0:2222 users:(("sshd",pid=42,fd=3))'; }
hostname() { printf '%s\n' 192.0.2.10; }
'''


INSTALL_HELPER = r'''
import os
from pathlib import Path
import shutil
import sys
args = iter(sys.argv[1:])
paths, directory, mode = [], False, 0o755
for arg in args:
    if arg == "-d": directory = True
    elif arg in ("-D", "--"): pass
    elif arg == "-m": mode = int(next(args), 8)
    elif arg in ("-o", "-g"): next(args)
    elif arg.startswith("-"): raise SystemExit("unsupported install flag in fixture: " + arg)
    else: paths.append(Path(arg))
root = Path(os.environ["TEST_ROOT"]).resolve()
for path in paths:
    if not path.resolve().is_relative_to(root):
        raise SystemExit("fixture refused write/read outside temporary root: " + str(path))
if directory:
    for path in paths:
        path.mkdir(parents=True, exist_ok=True)
        path.chmod(mode)
else:
    if len(paths) != 2: raise SystemExit("expected source and destination")
    src, dst = paths
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    dst.chmod(mode)
'''


class SetupPolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="ssh-setup-test-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.config = self.root / "sshd_config"
        self.template = self.root / "stock_sshd_config"
        self.runtime = self.root / "run-sshd"
        self.os_release = self.root / "os-release"
        self.defaults = self.root / "ssh-defaults"
        self.binary = self.root / "sshd"
        self.log = self.root / "calls.log"
        self.helper = self.root / "install_fixture.py"
        self.config.write_text("# existing administrator configuration\nPort 2222\nPasswordAuthentication no\n")
        self.template.write_text("# package template\nPort 22\n")
        self.os_release.write_text('ID=ubuntu\nVERSION_ID="24.04"\n')
        self.defaults.write_text('SSHD_OPTS=""\n')
        self.binary.write_text("#!/bin/sh\nexit 91\n")
        self.binary.chmod(0o700)
        self.helper.write_text(INSTALL_HELPER)
        self.env = dict(os.environ, TEST_ROOT=str(self.root), TEST_LOG=str(self.log),
                        TEST_INSTALL_HELPER=str(self.helper), TEST_VALID="1",
                        TEST_SOCKET_ACTIVE="0", TEST_SOCKET_ENABLED="0",
                        TEST_SERVICE_ACTIVE="1", TEST_MASKED="",
                        TEST_NO_SERVICE="0", TEST_MANAGER_FAIL="0",
                        TEST_EXEC_START="{ path=/usr/sbin/sshd ; argv[]=/usr/sbin/sshd -D $SSHD_OPTS ; ignore_errors=no ; }")

    def run_bash(self, code, *, patch="", real_environment=False):
        mappings = {
            "SSH_SETUP_CONFIG": self.config,
            "SSH_SETUP_TEMPLATE": self.template,
            "SSH_SETUP_RUN_DIR": self.runtime,
            "SSH_SETUP_OS_RELEASE": self.os_release,
            "SSH_SETUP_DEFAULTS": self.defaults,
            "SSH_SETUP_SSHD": self.binary,
        }
        prefix = "source " + shlex.quote(str(SCRIPT)) + "\n"
        prefix += "\n".join(f"{key}={shlex.quote(str(value))}" for key, value in mappings.items()) + "\n"
        mocks = MOCKS
        if real_environment:
            mocks = mocks.replace("check_environment() { :; }\n", "")
        return subprocess.run(["bash", "-c", prefix + mocks + "\n" + patch + "\n" + code],
                              env=self.env, text=True, capture_output=True, timeout=15)

    def calls(self):
        return self.log.read_text() if self.log.exists() else ""

    def assert_ok(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr + self.calls())

    def test_help_does_not_perform_system_operations(self):
        result = self.run_bash("main --help")
        self.assert_ok(result)
        self.assertEqual(self.calls(), "")

    def test_check_is_read_only(self):
        before = self.config.read_bytes()
        result = self.run_bash("main --check")
        self.assert_ok(result)
        self.assertNotIn("MUTATE", self.calls())
        self.assertFalse(self.runtime.exists())
        self.assertEqual(self.config.read_bytes(), before)
        self.assertIn("passwordauthentication no", result.stdout)

    def test_invalid_configuration_blocks_activation(self):
        self.env["TEST_VALID"] = "0"
        result = self.run_bash("main")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("MUTATE systemctl", self.calls())
        self.assertNotIn("MUTATE ssh-keygen", self.calls())

    def test_existing_configuration_is_preserved(self):
        before = self.config.read_bytes()
        result = self.run_bash("main")
        self.assert_ok(result)
        self.assertEqual(self.config.read_bytes(), before)
        self.assertNotIn("MUTATE ssh-keygen", self.calls())
        self.assertNotIn("MUTATE apt-get", self.calls())

    def test_missing_configuration_uses_package_template(self):
        self.config.unlink()
        result = self.run_bash("initialize_missing_config")
        self.assert_ok(result)
        self.assertEqual(self.config.read_bytes(), self.template.read_bytes())
        self.assertIn("MUTATE ssh-keygen -A", self.calls())

    def test_dangling_config_symlink_is_not_replaced(self):
        self.config.unlink()
        self.config.symlink_to(self.root / "missing-custom-config")
        result = self.run_bash("initialize_missing_config")
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(self.config.is_symlink())
        self.assertFalse((self.root / "missing-custom-config").exists())
        self.assertNotIn("MUTATE install", self.calls())
        self.assertNotIn("MUTATE ssh-keygen", self.calls())

    def test_active_socket_mode_is_preserved(self):
        self.env["TEST_SOCKET_ACTIVE"] = "1"
        result = self.run_bash("activate_ssh")
        self.assert_ok(result)
        mutations = [line for line in self.calls().splitlines() if line.startswith("MUTATE")]
        self.assertFalse(any("ssh.service" in line for line in mutations), mutations)
        self.assertFalse(any("restart" in line or "unmask" in line for line in mutations), mutations)

    def test_enabled_socket_mode_is_preserved(self):
        self.env["TEST_SOCKET_ENABLED"] = "1"
        result = self.run_bash("activate_ssh")
        self.assert_ok(result)
        mutations = [line for line in self.calls().splitlines() if line.startswith("MUTATE")]
        self.assertTrue(any("ssh.socket" in line for line in mutations), mutations)
        self.assertFalse(any("ssh.service" in line for line in mutations), mutations)

    def test_masked_service_is_not_unmasked_or_started(self):
        self.env["TEST_MASKED"] = "ssh.service"
        result = self.run_bash("activate_ssh")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("MUTATE systemctl", self.calls())

    def test_active_socket_does_not_hide_masked_service(self):
        self.env["TEST_SOCKET_ACTIVE"] = "1"
        self.env["TEST_MASKED"] = "ssh.service"
        result = self.run_bash("main")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("MUTATE", self.calls())

    def test_custom_config_arguments_stop_before_mutations(self):
        self.env["TEST_EXEC_START"] = "{ path=/usr/sbin/sshd ; argv[]=/usr/sbin/sshd -D -f /custom/sshd_config ; ignore_errors=no ; }"
        result = self.run_bash("main")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("MUTATE", self.calls())

    def test_unsupported_os_fails_before_mutations(self):
        self.os_release.write_text("ID=fedora\n")
        result = self.run_bash("check_environment", real_environment=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Ubuntu та Debian", result.stderr)
        self.assertNotIn("MUTATE", self.calls())

    def test_repeated_setup_does_not_rewrite_config_or_keys(self):
        self.config.unlink()
        first = self.run_bash("main")
        self.assert_ok(first)
        original = self.config.read_bytes()
        self.log.write_text("")
        second = self.run_bash("main")
        self.assert_ok(second)
        self.assertEqual(self.config.read_bytes(), original)
        self.assertNotIn("MUTATE ssh-keygen", self.calls())
        self.assertNotIn("MUTATE apt-get", self.calls())

    def test_missing_server_is_installed_before_validation(self):
        self.binary.unlink()
        self.env["TEST_NO_SERVICE"] = "1"
        result = self.run_bash("main")
        self.assert_ok(result)
        self.assertIn("MUTATE apt-get install -y openssh-server", self.calls())
        self.assertLess(self.calls().index("MUTATE apt-get install"), self.calls().index("sshd -t"))

    def test_manager_failure_does_not_trigger_install(self):
        self.binary.unlink()
        self.env["TEST_MANAGER_FAIL"] = "1"
        result = self.run_bash("main")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("MUTATE", self.calls())

    def test_missing_service_with_existing_binary_stops_before_mutation(self):
        self.env["TEST_NO_SERVICE"] = "1"
        result = self.run_bash("main")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("MUTATE", self.calls())

    def test_defaults_options_are_not_executed_or_ignored(self):
        self.defaults.write_text('SSHD_OPTS="-f /custom/sshd_config"\n')
        result = self.run_bash("main")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("MUTATE", self.calls())

    def test_check_missing_binary_does_not_install(self):
        self.binary.unlink()
        result = self.run_bash("main --check")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("MUTATE", self.calls())

    def test_bash_c_help_executes_main_guard(self):
        result = subprocess.run(["bash", "-c", SCRIPT.read_text(), "ssh-setup", "--help"],
                                env=self.env, text=True, capture_output=True, timeout=15)
        self.assert_ok(result)
        self.assertIn("--check", result.stdout)


class BootstrapTests(unittest.TestCase):
    COMMAND = 'ssh_setup=$(curl -fsSL https://fixture.invalid/ssh.sh) && sudo bash -c "$ssh_setup"'

    def test_partial_failed_download_is_never_executed(self):
        with tempfile.TemporaryDirectory(prefix="ssh-bootstrap-test-") as temp:
            marker = Path(temp) / "executed"
            stub = r'''
curl() { printf '%s\n' 'printf executed > "$TEST_MARKER"'; return 23; }
sudo() { printf '%s\n' 'sudo should not run' >&2; "$@"; }
'''
            result = subprocess.run(["bash", "-c", stub + self.COMMAND],
                                    env=dict(os.environ, TEST_MARKER=str(marker)),
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 23)
            self.assertFalse(marker.exists())
            self.assertNotIn("sudo should not run", result.stderr)

    def test_complete_download_executes_and_preserves_failure_status(self):
        with tempfile.TemporaryDirectory(prefix="ssh-bootstrap-test-") as temp:
            marker = Path(temp) / "executed"
            stub = r'''
curl() { printf '%s\n' 'printf executed > "$TEST_MARKER"' 'exit 17'; }
sudo() { "$@"; }
'''
            result = subprocess.run(["bash", "-c", stub + self.COMMAND],
                                    env=dict(os.environ, TEST_MARKER=str(marker)),
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 17)
            self.assertEqual(marker.read_text(), "executed")

    def test_check_argument_reaches_script_after_bash_c_name(self):
        with tempfile.TemporaryDirectory(prefix="ssh-bootstrap-test-") as temp:
            marker = Path(temp) / "mode"
            stub = r'''
curl() { printf '%s\n' 'printf "%s" "${1:-setup}" > "$TEST_MARKER"'; }
sudo() { "$@"; }
'''
            result = subprocess.run(["bash", "-c", stub + self.COMMAND + " -- --check"],
                                    env=dict(os.environ, TEST_MARKER=str(marker)),
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(marker.read_text(), "--check")


if __name__ == "__main__":
    unittest.main(verbosity=2)

#!/usr/bin/python3
"""Install reviewed panel files; privilege revocation and GUI shutdown are separate."""
import datetime
import grp
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import shutil
import stat
import subprocess


def command(argv, timeout=15):
    result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError("Command failed: " + argv[0])
    return result.stdout


def trusted_path(path):
    """Existing ancestors of every root write must be immutable to tenants."""
    path = Path(path)
    assert path.is_absolute()
    for item in [path, *path.parents]:
        try:
            info = item.lstat()
        except FileNotFoundError:
            continue
        assert not stat.S_ISLNK(info.st_mode), 'Symlink in installation path'
        assert info.st_uid == 0 and not info.st_mode & 0o022, 'Untrusted installation path'


def atomic_write(path, data, mode):
    path = Path(path)
    trusted_path(path)
    temporary = path.with_name(path.name + '.sitepanel-new')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.chmod(mode)
    temporary.replace(path)


def install(files, registry, expected_machine):
    assert os.getuid() == 0
    assert hashlib.sha256(Path('/etc/machine-id').read_bytes()).hexdigest() == expected_machine
    assert {int(uid): account['name'] for uid, account in registry['accounts'].items()} == {1000: 'knaba', 2002: 'vsp'}
    for uid, account in registry['accounts'].items():
        assert pwd.getpwnam(account['name']).pw_uid == int(uid)
    assert command(['sudo', '-u', 'sentinelx', 'sudo', '-n', 'id', '-u']).strip() == '0'
    new_targets = ['/etc/systemd/system/sitepanel.service', '/etc/sitepanel',
                   '/usr/local/libexec/sitepanel', '/usr/local/share/cockpit/sitepanel',
                   '/usr/local/bin/sitepanel']
    for target in new_targets:
        assert not os.path.lexists(target), 'Panel target already exists: inspect before update/recovery'
        trusted_path(target)
    trusted_path('/var/lib/sitepanel')
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    root = Path('/var/lib/sitepanel')
    if root.exists():
        assert not root.is_symlink() and root.stat().st_uid == 0
    root.mkdir(mode=0o700, exist_ok=True)
    os.chmod(root, 0o700)
    stage = root / 'install' / stamp
    stage.mkdir(mode=0o700, parents=True)
    for parent in [root / 'install', stage]:
        os.chmod(parent, 0o700)
    backup = stage / 'before'
    backup.mkdir(mode=0o700)
    paths = ['/etc/pam.d/cockpit', '/etc/pam.d/su', '/etc/cockpit/cockpit.conf',
             '/etc/cockpit/users.override.json', '/etc/cockpit/systemd.override.json',
             '/etc/lightdm/lightdm.conf.d/50-knaba-server.conf', '/etc/group', '/etc/gshadow',
             '/etc/passwd', '/etc/shadow']
    originals = {}
    for value in paths:
        path = Path(value)
        originals[value] = path.exists()
        if path.exists():
            trusted_path(path)
            destination = backup / value.lstrip('/')
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            shutil.copy2(path, destination)
            os.chmod(destination, 0o600)
    directories = ['/srv/knaba', '/srv/vsp', '/srv/vsp-studio', '/opt/knaba/avenqo-public',
                   '/home/knaba', '/home/vsp']
    metadata = {}
    for value in directories:
        path = Path(value)
        info = path.lstat()
        assert stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode)
        metadata[value] = {'uid': info.st_uid, 'gid': info.st_gid, 'mode': stat.S_IMODE(info.st_mode),
                           'acl': command(['getfacl', '-p', value])}
    ids = command(['docker', 'ps', '-aq']).split()
    containers = json.loads(command(['docker', 'inspect', *ids])) if ids else []
    before = {'created_at': stamp, 'files_existed': originals, 'directories': metadata,
              'groups': {u: command(['id', '-nG', u]).strip().split() for u in ['knaba', 'vsp']},
              'default_target': command(['systemctl', 'get-default']).strip(),
              'tailscale_serve': json.loads(command(['tailscale', 'serve', 'status', '--json'])),
              'containers': [{'name': c['Name'].lstrip('/'), 'id': c['Id'],
                              'started_at': c['State']['StartedAt'], 'running': c['State']['Running']} for c in containers]}
    (stage / 'before.json').write_text(json.dumps(before, indent=2))
    for item in files:
        relative = Path(item['path'])
        assert not relative.is_absolute() and '..' not in relative.parts
        data = item['content'].encode()
        assert hashlib.sha256(data).hexdigest() == item['sha256']
        path = stage / 'candidate' / relative
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        path.write_bytes(data)
        path.chmod(0o600)
    candidate = stage / 'candidate'
    specification = importlib.util.spec_from_file_location('candidate_sitepanel', candidate / 'sitepanel.py')
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    module.validate_config(registry)
    runtime = module.Runtime()
    for resource in registry['resources'].values():
        runtime.status(resource)
    command(['systemd-analyze', 'verify', str(candidate / 'sitepanel.service')])
    (stage / 'receipt.json').write_text(json.dumps({'phase': 'preflight-complete', 'stage': str(stage)}))
    print(json.dumps({'phase': 'preflight-complete', 'stage': str(stage)}), flush=True)
    try:
        group = grp.getgrnam('sitepanel')
        assert set(group.gr_mem) <= {'knaba', 'vsp'}
    except KeyError:
        command(['groupadd', '--system', 'sitepanel'])
    for user in ['knaba', 'vsp']:
        command(['usermod', '-aG', 'sitepanel', user])
    # Protect the parent of the existing root backup controller before exposing it.
    for value, group_name in [('/srv/knaba', 'knaba'), ('/srv/vsp', 'vsp'),
                              ('/srv/vsp-studio', 'vsp'), ('/opt/knaba/avenqo-public', 'vsp')]:
        os.chown(value, 0, grp.getgrnam(group_name).gr_gid)
        os.chmod(value, 0o750)
    for resource in registry['resources'].values():
        if resource.get('backup'):
            module.trusted_file(resource['backup']['controller'])
    destinations = {'sitepanel.py': '/usr/local/libexec/sitepanel/sitepanel.py',
                    'sitepanel': '/usr/local/bin/sitepanel',
                    'sitepanel.service': '/etc/systemd/system/sitepanel.service'}
    for name in ['manifest.json', 'index.html', 'app.js', 'style.css']:
        destinations['cockpit/sitepanel/' + name] = '/usr/local/share/cockpit/sitepanel/' + name
    for source, destination in destinations.items():
        path = Path(destination)
        path.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
        atomic_write(path, (candidate / source).read_bytes(), 0o755 if source == 'sitepanel' else 0o644)
    Path('/etc/sitepanel').mkdir(mode=0o700, exist_ok=True)
    atomic_write('/etc/sitepanel/sites.json', json.dumps(registry, ensure_ascii=False, indent=2).encode(), 0o600)
    for package in ['users', 'systemd']:
        atomic_write('/etc/cockpit/' + package + '.override.json', b'{"menu": null}\n', 0o644)
    atomic_write('/etc/cockpit/cockpit.conf', b'[WebService]\nLoginTo=false\nAllowMultiHost=false\n\n[Session]\nIdleTimeout=20\n', 0o644)
    command(['systemctl', 'daemon-reload'])
    command(['systemctl', 'enable', '--now', 'sitepanel.service'])
    command(['systemctl', 'is-active', 'sitepanel.service'])
    receipt = {'phase': 'broker-installed', 'stage': str(stage),
               'sha256': {destination: hashlib.sha256(Path(destination).read_bytes()).hexdigest()
                          for destination in destinations.values()},
               'credential_status': 'unchanged', 'privileges_status': 'not-yet-revoked',
               'gui_status': 'unchanged'}
    (stage / 'receipt.json').write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', required=True)
    parser.add_argument('--registry', required=True)
    parser.add_argument('--machine-sha256', required=True)
    args = parser.parse_args()
    install(json.loads(Path(args.bundle).read_text())['files'],
            json.loads(Path(args.registry).read_text()), args.machine_sha256)

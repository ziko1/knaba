#!/usr/bin/python3
"""Apply the reviewed two-account host policy; password is runtime input only."""
import base64
import hashlib
import http.client
import json
import os
from pathlib import Path
import ssl
import stat
import subprocess
import tempfile


def configure(password, stage, expected_machine, expected_certificate):
    assert os.getuid() == 0
    assert hashlib.sha256(Path('/etc/machine-id').read_bytes()).hexdigest() == expected_machine
    stage = Path(stage)
    assert stage.parent == Path('/var/lib/sitepanel/install')
    # Load the separately reviewed first-install helpers from the protected snapshot.
    helper_path = stage / 'candidate/install_stage.py'
    for item in [helper_path, *helper_path.parents]:
        info = item.lstat()
        assert info.st_uid == 0 and not info.st_mode & 0o022 and not stat.S_ISLNK(info.st_mode)
    assert hashlib.sha256(helper_path.read_bytes()).hexdigest() == '548c80d0d28fba1bd90d6afc554f0ca7ac84850312a6e428b3e6f7171751d187'
    namespace = {'__name__': 'sitepanel_install_helpers'}
    exec(helper_path.read_text(), namespace)
    command, write, trusted = namespace['command'], namespace['atomic_write'], namespace['trusted_path']
    trusted(stage / 'before.json')
    assert command(['sudo', '-u', 'sentinelx', 'sudo', '-n', 'id', '-u']).strip() == '0'
    assert command(['systemctl', 'is-active', 'sitepanel.service']).strip() == 'active'
    assert isinstance(password, str) and len(password) >= 12 and not any(x in password for x in ['\n', '\r', ':'])
    for file in ['/etc/pam.d/cockpit', '/etc/pam.d/su']:
        assert Path(file).read_bytes() == (stage / 'before' / file.lstrip('/')).read_bytes(), 'PAM changed concurrently'
    for file in ['/etc/sudoers.d/99-sitepanel-tenants', '/etc/polkit-1/rules.d/00-sitepanel-tenants.rules', '/etc/cockpit/allowed-site-users']:
        assert not os.path.lexists(file), 'Account policy already exists: inspect before updating'
        trusted(file)
    sudoers = b'knaba ALL=(ALL:ALL) !ALL\nvsp ALL=(ALL:ALL) !ALL\n'
    sudo_candidate = stage / 'tenant-sudoers'
    sudo_candidate.write_bytes(sudoers)
    sudo_candidate.chmod(0o440)
    command(['visudo', '-cf', str(sudo_candidate)])
    # Explicit user denials also cover old sessions retaining a sudo group.
    write('/etc/sudoers.d/99-sitepanel-tenants', sudoers, 0o440)
    command(['visudo', '-c'])
    policy = stage / 'candidate/00-sitepanel-tenants.rules'
    trusted(policy)
    write('/etc/polkit-1/rules.d/00-sitepanel-tenants.rules', policy.read_bytes(), 0o644)
    write('/etc/cockpit/allowed-site-users', b'knaba\nvsp\n', 0o644)
    cockpit = Path('/etc/pam.d/cockpit').read_text()
    gate = 'account requisite pam_listfile.so item=user sense=allow file=/etc/cockpit/allowed-site-users onerr=fail\n'
    write('/etc/pam.d/cockpit', (gate + cockpit).encode(), 0o644)
    su = Path('/etc/pam.d/su').read_text()
    marker = 'auth       sufficient pam_rootok.so'
    assert marker in su
    su = su.replace(marker, marker + '\nauth requisite pam_succeed_if.so quiet use_uid user notingroup sitepanel', 1)
    write('/etc/pam.d/su', su.encode(), 0o644)
    command(['usermod', '-G', 'users,sitepanel', 'knaba'])
    command(['usermod', '-G', 'sitepanel', 'vsp'])
    # Preserve the KNABA owner's existing password; set only the authorized VSP password.
    current_vsp_shadow = next(line for line in Path('/etc/shadow').read_text().splitlines() if line.startswith('vsp:'))
    write(stage / 'vsp-shadow-before-password', (current_vsp_shadow + '\n').encode(), 0o600)
    changed = subprocess.run(['chpasswd'], input='vsp:' + password + '\n', text=True, capture_output=True, timeout=10)
    assert changed.returncode == 0, 'VSP password update failed'
    assert command(['sudo', '-u', 'sentinelx', 'sudo', '-n', 'id', '-u']).strip() == '0'
    command(['systemctl', 'try-restart', 'cockpit.service'])
    report = {'phase': 'account-policy-applied', 'groups': {}, 'sudo_denied': {}, 'knaba_password': 'preserved'}
    for user in ['knaba', 'vsp']:
        report['groups'][user] = command(['id', '-nG', user]).strip().split()
        denied = subprocess.run(['runuser', '-u', user, '--', 'sudo', '-n', 'id', '-u'], capture_output=True, timeout=5)
        report['sudo_denied'][user] = denied.returncode != 0
        assert report['sudo_denied'][user]
    write(stage / 'account-policy-result.json', json.dumps(report, indent=2).encode(), 0o600)
    print(json.dumps({'phase': report['phase'], 'stage': str(stage)}), flush=True)
    # Verify an actual password-authenticated SSH connection, without placing the
    # password in process arguments, returned data or a persistent file.
    with tempfile.TemporaryDirectory(prefix='sitepanel-login-', dir='/run') as temporary:
        folder = Path(temporary)
        helper = folder / 'askpass'
        helper.write_text('#!/usr/bin/python3\nimport os\nprint(os.environ["SITEPANEL_LOGIN_PASSWORD"])\n')
        helper.chmod(0o700)
        known = folder / 'known_hosts'
        known.write_text('127.0.0.1 ' + Path('/etc/ssh/ssh_host_ed25519_key.pub').read_text())
        known.chmod(0o600)
        env = {'PATH': '/usr/bin:/bin', 'HOME': '/root', 'DISPLAY': ':sitepanel',
               'SSH_ASKPASS': str(helper), 'SSH_ASKPASS_REQUIRE': 'force',
               'SITEPANEL_LOGIN_PASSWORD': password}
        ssh = subprocess.run(['ssh', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(known),
                              '-o', 'PreferredAuthentications=password', '-o', 'PubkeyAuthentication=no',
                              '-o', 'NumberOfPasswordPrompts=1', '-o', 'ConnectTimeout=5',
                              'vsp@127.0.0.1', 'id', '-un'], env=env, stdin=subprocess.DEVNULL,
                             capture_output=True, text=True, timeout=15)
        report['vsp_ssh_password_login'] = ssh.returncode == 0 and ssh.stdout.strip() == 'vsp'
        assert report['vsp_ssh_password_login'], 'SSH authentication needs review'
    context = ssl._create_unverified_context()
    connection = http.client.HTTPSConnection('127.0.0.1', 9090, context=context, timeout=12)
    connection.connect()
    report['cockpit_certificate_sha256'] = hashlib.sha256(connection.sock.getpeercert(binary_form=True)).hexdigest()
    assert report['cockpit_certificate_sha256'] == expected_certificate
    token = base64.b64encode(('vsp:' + password).encode()).decode()
    connection.request('GET', '/cockpit/login', headers={'Authorization': 'Basic ' + token})
    response = connection.getresponse()
    data = response.read()
    report['vsp_cockpit_login_http'] = response.status
    report['vsp_cockpit_login'] = response.status == 200 and json.loads(data).get('user') == 'vsp'
    cookie = response.getheader('Set-Cookie', '').split(';', 1)[0]
    assert report['vsp_cockpit_login'], 'Cockpit authentication needs review'
    connection.request('GET', '/cockpit/@localhost/sitepanel/index.html', headers={'Cookie': cookie})
    page = connection.getresponse()
    report['cockpit_sitepanel_asset_http'] = page.status
    report['cockpit_sitepanel_asset'] = page.status == 200 and b'app.js' in page.read()
    assert report['cockpit_sitepanel_asset']
    connection.close()
    (stage / 'account-policy-result.json').write_text(json.dumps(report, indent=2))
    (stage / 'account-policy-result.json').chmod(0o600)
    print(json.dumps(report))

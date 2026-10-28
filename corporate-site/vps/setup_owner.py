#!/usr/bin/env python3
"""KNABA owner-side configuration; never creates privileged accounts implicitly."""
import argparse, os, pathlib, re, sys
from urllib.parse import urlsplit

def email(value):
    value=value.strip().lower()
    if len(value)>254 or not re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}",value):
        raise ValueError('Invalid email')
    return value

def origin(value):
    u=urlsplit(value)
    if u.scheme!='https' or not u.hostname or not u.hostname.count('.') or u.username or u.password or u.port or u.path not in ('','/') or u.query or u.fragment:
        raise ValueError('Expected bare HTTPS origin, e.g. https://knaba.de')
    if u.hostname in ('localhost','127.0.0.1'):
        raise ValueError('Public hostname required')
    return 'https://'+u.hostname.lower()

def main():
    parser=argparse.ArgumentParser(description='Create owner-side KNABA config; never prints secrets')
    parser.add_argument('--owner-email',required=True)
    parser.add_argument('--origin',required=True)
    parser.add_argument('--destination',default='.')
    a=parser.parse_args()
    try:
        owner=email(a.owner_email)
        public=origin(a.origin)
        root=pathlib.Path(a.destination).resolve()
        if not root.is_dir() or root.is_symlink():raise ValueError('Destination must be an existing directory')
        config=root/'config'
        if config.is_symlink():raise ValueError('Refusing symlink config directory')
        config.mkdir(mode=0o700,exist_ok=True)
        os.chmod(config,0o700)
        targets=[(config/'site.env','OWNER_EMAIL='+owner+'\n'),(root/'.env','KNABA_PUBLIC_ORIGIN='+public+'\n')]
        for path,_ in targets:
            if path.exists() or path.is_symlink():raise ValueError('Existing configuration not overwritten: '+str(path))
        created=[]
        try:
            for path,content in targets:
                fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
                created.append(path)
                with os.fdopen(fd,'w',encoding='utf8') as f:f.write(content)
                os.chmod(path,0o600)
        except BaseException:
            for path in created:path.unlink(missing_ok=True)
            raise
        print('Owner configuration created (mode 0600). Next: docker compose config, migrate, init-owner; then owner-approved invite-developer.')
    except (ValueError,OSError) as exc:
        print('Configuration refused: '+str(exc),file=sys.stderr)
        return 1
    return 0
if __name__=='__main__':sys.exit(main())

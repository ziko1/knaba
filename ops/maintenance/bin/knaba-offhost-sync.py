#!/usr/bin/env python3
from __future__ import annotations
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

SOURCE=Path("/srv/knaba/lead-agent/backups")
BASE=Path("/srv/knaba/maintenance/offhost")
CONFIG=BASE/"rclone.conf"
STATUS=BASE/"latest.json"
REMOTE="knaba-offsite"
RCLONE="/usr/bin/rclone"

def eligible(path:Path)->bool:
    try:
        resolved=path.resolve()
    except OSError:
        return False
    if resolved.parent != SOURCE:
        return False
    return resolved.name.endswith(".tar.enc") or resolved.name.endswith(".tar.enc.hmac")

def config_status(path:Path)->str:
    if not path.is_file() or path.is_symlink():
        return "PENDING_CONFIGURATION"
    if path.stat().st_mode & 0o077:
        return "UNSAFE_CONFIGURATION"
    p=subprocess.run([RCLONE,"listremotes","--config",str(path)],text=True,capture_output=True,timeout=15,check=False)
    if p.returncode!=0:
        return "INVALID_CONFIGURATION"
    remotes={x.strip().rstrip(":") for x in p.stdout.splitlines() if x.strip()}
    return "READY" if REMOTE in remotes else "REMOTE_MISSING"

def sha256(path:Path)->str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):
            h.update(chunk)
    return h.hexdigest()

def atomic(path:Path,payload:dict):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd,tmp=tempfile.mkstemp(prefix=".offhost-",suffix=".tmp",dir=path.parent)
    try:
        with os.fdopen(fd,"w",encoding="utf-8") as f:
            os.fchmod(f.fileno(),0o600)
            json.dump(payload,f,ensure_ascii=False,indent=2); f.write("\n")
            f.flush(); os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.lexists(tmp): os.unlink(tmp)

def latest_pair():
    backups=sorted(
        [p for p in SOURCE.glob("*.tar.enc") if p.is_file() and not p.is_symlink()],
        key=lambda x:x.stat().st_mtime,reverse=True
    )
    if not backups:
        return None,[]
    enc=backups[0]
    hmac=Path(str(enc)+".hmac")
    files=[enc]
    if hmac.is_file() and not hmac.is_symlink():
        files.append(hmac)
    return enc,files

def main()->int:
    now=dt.datetime.now(dt.timezone.utc)
    state=config_status(CONFIG)
    payload={"schema":1,"created_at":now.isoformat(),"status":state,"remote":REMOTE,"uploaded":[]}
    if state!="READY":
        atomic(STATUS,payload)
        print(json.dumps(payload))
        return 4
    enc,files=latest_pair()
    if enc is None or len(files)!=2 or not all(eligible(x) for x in files):
        payload["status"]="NO_VERIFIED_ENCRYPTED_PAIR"
        atomic(STATUS,payload); print(json.dumps(payload)); return 2

    for src in files:
        destination=f"{REMOTE}:KNABA/lead-agent/{src.name}"
        p=subprocess.run(
            [RCLONE,"copyto","--config",str(CONFIG),"--immutable","--checksum",
             "--transfers","1","--checkers","2","--contimeout","15s","--timeout","2m",
             str(src),destination],
            text=True,capture_output=True,timeout=600,check=False,
        )
        if p.returncode!=0:
            payload["status"]="UPLOAD_FAILED"
            payload["failed_file"]=src.name
            atomic(STATUS,payload); print(json.dumps(payload)); return 2
        payload["uploaded"].append({"name":src.name,"bytes":src.stat().st_size,"sha256":sha256(src)})

    manifest=BASE/"last-upload-manifest.json"
    manifest_payload={"schema":1,"created_at":now.isoformat(),"remote":REMOTE,"files":payload["uploaded"]}
    atomic(manifest,manifest_payload)
    p=subprocess.run(
        [RCLONE,"copyto","--config",str(CONFIG),"--immutable",
         str(manifest),f"{REMOTE}:KNABA/lead-agent/manifests/{enc.name}.manifest.json"],
        text=True,capture_output=True,timeout=120,check=False,
    )
    if p.returncode!=0:
        payload["status"]="MANIFEST_UPLOAD_FAILED"
        atomic(STATUS,payload); print(json.dumps(payload)); return 2

    payload["status"]="SYNC_VERIFIED"
    atomic(STATUS,payload)
    print(json.dumps(payload))
    return 0

if __name__=="__main__":
    raise SystemExit(main())

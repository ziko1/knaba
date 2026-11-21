#!/usr/bin/env python3
from __future__ import annotations
import datetime as dt, json, os, re, subprocess, sys, tempfile
from pathlib import Path

BASE=Path("/srv/knaba/maintenance/failures")
ALLOWED=re.compile(r"^knaba-[A-Za-z0-9@_.-]+\.(service|timer)$")

def build_payload(unit:str,state:dict)->dict:
    return {
        "schema":1,
        "created_at":dt.datetime.now(dt.timezone.utc).isoformat(),
        "unit":unit,
        "result":state.get("Result"),
        "exec_main_status":state.get("ExecMainStatus"),
        "active_state":state.get("ActiveState"),
        "sub_state":state.get("SubState"),
    }

def atomic(path:Path,payload:dict):
    fd,tmp=tempfile.mkstemp(prefix=".failure-",suffix=".tmp",dir=path.parent)
    try:
        with os.fdopen(fd,"w",encoding="utf-8") as f:
            os.fchmod(f.fileno(),0o640)
            json.dump(payload,f,ensure_ascii=False,indent=2); f.write("\n")
            f.flush(); os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.lexists(tmp): os.unlink(tmp)

def main()->int:
    if len(sys.argv)!=2 or not ALLOWED.fullmatch(sys.argv[1]):
        return 64
    unit=sys.argv[1]
    p=subprocess.run(["systemctl","show",unit,"--property=Result,ExecMainStatus,ActiveState,SubState","--no-pager"],
                     text=True,capture_output=True,timeout=10,check=False)
    state={}
    if p.returncode==0:
        for line in p.stdout.splitlines():
            if "=" in line:
                k,v=line.split("=",1); state[k]=v
    BASE.mkdir(parents=True,exist_ok=True,mode=0o750)
    payload=build_payload(unit,state)
    stamp=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    atomic(BASE/f"{stamp}-{unit.replace('/','_')}.json",payload)
    atomic(BASE/"latest.json",payload)
    items=sorted([x for x in BASE.glob("*.json") if x.name!="latest.json"],key=lambda x:x.stat().st_mtime,reverse=True)
    for old in items[199:]:
        old.unlink(missing_ok=True)
    print(json.dumps(payload))
    return 0

if __name__=="__main__":
    raise SystemExit(main())

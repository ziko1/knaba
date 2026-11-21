#!/usr/bin/env python3
from __future__ import annotations
import re, subprocess, sys
from pathlib import Path

ENV=Path("/srv/knaba/lead-agent/private/runtime.env")
OPERATOR=Path("/srv/knaba/lead-agent/ops/backup-lead-agent.py")
OPS=Path("/srv/knaba/lead-agent/ops")

def valid_sha(value:str)->bool:
    return re.fullmatch(r"[a-f0-9]{40}",value or "") is not None

def read_git_sha(path:Path)->str:
    found=None
    for raw in path.read_text().splitlines():
        line=raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key,value=line.split("=",1)
        if key=="GIT_SHA":
            if found is not None:
                raise RuntimeError("DUPLICATE_GIT_SHA")
            found=value
    if not found or not valid_sha(found):
        raise RuntimeError("INVALID_GIT_SHA")
    return found

def main()->int:
    if Path("/srv/knaba-nas").is_symlink():
        print("BLOCKED: NAS path is symlink",file=sys.stderr); return 78
    sha=read_git_sha(ENV)
    receipt=OPS/f"build-{sha}.json"
    if not receipt.is_file():
        print("BLOCKED: current build receipt missing",file=sys.stderr); return 2
    cmd=["/usr/bin/python3",str(OPERATOR),"run","--sha",sha,"--private-env",str(ENV)]
    p=subprocess.run(cmd,timeout=1800,check=False)
    return p.returncode

if __name__=="__main__":
    raise SystemExit(main())

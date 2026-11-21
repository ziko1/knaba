#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
import urllib.request
import urllib.error

BASE=Path("/srv/knaba/maintenance")
REPORTS=BASE/"health-reports"

KEY_CONTAINERS=(
    "knaba-nas-app","knaba-nas-db","knaba-nas-redis",
    "knaba-customer-prod","knaba-customer-test",
    "knaba-lead-agent-test-api-1","knaba-lead-agent-test-worker-1",
)
CUSTOMER_BACKUP_GLOBS=(
    "/srv/knaba/customer/backups/production/*.sqlite",
)
LEAD_AGENT_BACKUP_GLOBS=(
    "/srv/knaba/lead-agent/backups/*.tar.enc",
)
HTTPS_URLS=(
    "https://knaba.de/healthz",
    "https://bot.knaba.de/",
    "https://vsp.rest/",
    "https://avenqo.pro/",
)
REQUIRED_UNITS=(
    "docker.service",
    "cloudflared-knaba.service",
    "cloudflared-knaba-customer-production.service",
    "cloudflared-knaba-customer-testing.service",
    "cloudflared-knaba-lead-agent.service",
    "sitepanel.service",
    "vsp-code-server.service",
    "vsp-knaba-development.service",
    "knaba-storage-guardian.timer",
    "knaba-nas-cron.timer",
    "knaba-customer-backup.timer",
    "knaba-lead-agent-backup.timer",
    "knaba-offhost-sync.timer",
    "knaba-r2-offsite-sync.timer",
)

def run(argv, timeout=15):
    try:
        p=subprocess.run(argv,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                         timeout=timeout,check=False,env={**os.environ,"LC_ALL":"C"})
        return {"returncode":p.returncode,"stdout":p.stdout[:16000],"stderr":p.stderr[:1500]}
    except (OSError,subprocess.TimeoutExpired) as exc:
        return {"returncode":None,"stdout":"","stderr":f"{type(exc).__name__}: {exc}"}

def backup_age_status(age_hours, max_hours):
    if age_hours is None or age_hours > max_hours:
        return "CRITICAL"
    if age_hours > max_hours * 0.75:
        return "WARNING"
    return "OK"

def offhost_status(state, age_hours, max_hours):
    if state=="PENDING_CONFIGURATION":
        return "WARNING"
    if state!="SYNC_VERIFIED":
        return "CRITICAL"
    if age_hours is None or age_hours > max_hours:
        return "CRITICAL"
    if age_hours > max_hours * 0.75:
        return "WARNING"
    return "OK"

def r2_offhost_health():
    path=Path("/var/lib/knaba-cloudflare-monitor/r2-sync.json")
    if not path.is_file() or path.is_symlink():
        return None
    try:
        data=json.loads(path.read_text())
        created=dt.datetime.fromisoformat(str(data["timestamp"]).replace("Z","+00:00"))
        age=(dt.datetime.now(dt.timezone.utc)-created).total_seconds()/3600
        files=data.get("files",[])
        names={f.get("file","") for f in files if isinstance(f,dict)}
        pair=any(name.endswith(".tar.enc") and name+".hmac" in names for name in names)
        proofs=len(files)==2 and pair and all(
            isinstance(f,dict) and f.get("readback_verified") is True
            and re.fullmatch(r"[0-9a-f]{64}",str(f.get("sha256","")))
            and isinstance(f.get("size"),int) and f["size"]>0 for f in files)
        if data.get("status")!="SYNC_VERIFIED" or not proofs:
            return {"status":"CRITICAL","provider_status":"R2_INVALID_PROOF","remote":"cloudflare-r2"}
        service=backup_service_state("knaba-r2-offsite-sync.service")
        if not service["ok"]:
            return {"status":"CRITICAL","provider_status":"R2_SYNC_SERVICE_FAILED","remote":"cloudflare-r2"}
        state=offhost_status("SYNC_VERIFIED",age,36)
        return {"status":state,"provider_status":"SYNC_VERIFIED",
            "age_hours":round(age,2),"remote":"cloudflare-r2",
            "bucket":data.get("bucket"),"verified_files":len(files),
            "legacy_remote":"knaba-offsite"}
    except (OSError,ValueError,KeyError,TypeError):
        return {"status":"CRITICAL","provider_status":"R2_INVALID_STATUS","remote":"cloudflare-r2"}

def offhost_health():
    r2=r2_offhost_health()
    if r2 is not None:
        return r2
    p=BASE/"offhost"/"latest.json"
    if not p.is_file() or p.is_symlink():
        return {"status":"PENDING_CONFIGURATION","age_hours":None}
    try:
        data=json.loads(p.read_text())
        created=dt.datetime.fromisoformat(str(data.get("created_at")).replace("Z","+00:00"))
        age=(dt.datetime.now(dt.timezone.utc)-created).total_seconds()/3600
        state=str(data.get("status") or "UNKNOWN")
        return {"status":offhost_status(state,age,36),"provider_status":state,"age_hours":round(age,2),"remote":data.get("remote")}
    except Exception as exc:
        return {"status":"CRITICAL","provider_status":"INVALID_STATUS_FILE","age_hours":None,"error":type(exc).__name__}

def disk_status(used_percent, inode_percent):
    pressure=max(used_percent,inode_percent)
    if pressure >= 90:
        return "CRITICAL"
    if pressure >= 80:
        return "WARNING"
    return "OK"

def overall_status(required_checks, warnings):
    if not all(required_checks):
        return "CRITICAL"
    if warnings:
        return "WARNING"
    return "OK"

def filesystem():
    st=os.statvfs("/")
    total=st.f_blocks*st.f_frsize
    used=(st.f_blocks-st.f_bfree)*st.f_frsize
    available=st.f_bavail*st.f_frsize
    used_pct=((100*used+used+available-1)//(used+available)) if used+available else 100
    inode_pct=((100*(st.f_files-st.f_ffree)+st.f_files-1)//st.f_files) if st.f_files else 100
    return {"total_bytes":total,"used_bytes":used,"available_bytes":available,
            "used_percent":used_pct,"inode_percent":inode_pct,
            "status":disk_status(used_pct,inode_pct)}

def memory():
    vals={}
    for line in Path("/proc/meminfo").read_text().splitlines():
        k,v=line.split(":",1)
        vals[k]=int(v.strip().split()[0])*1024
    return {
        "mem_total_bytes":vals.get("MemTotal"),
        "mem_available_bytes":vals.get("MemAvailable"),
        "swap_total_bytes":vals.get("SwapTotal"),
        "swap_free_bytes":vals.get("SwapFree"),
    }

def backup_service_ok(state):
    return state.get("Result") in (None, "", "success") and str(state.get("ExecMainStatus", "0")) == "0"

def backup_service_state(name):
    r=run(["systemctl","show",name,"--property=Result,ExecMainStatus,ExecMainExitTimestamp","--no-pager"],8)
    data={}
    if r["returncode"]==0:
        for line in r["stdout"].splitlines():
            if "=" in line:
                k,v=line.split("=",1); data[k]=v
    return {"ok": backup_service_ok(data), **data}

def unit_state(name):
    r=run(["systemctl","show",name,"--property=ActiveState,SubState,UnitFileState,Result","--no-pager"],8)
    data={}
    if r["returncode"]==0:
        for line in r["stdout"].splitlines():
            if "=" in line:
                k,v=line.split("=",1); data[k]=v
    active=data.get("ActiveState")
    unitfile=data.get("UnitFileState")
    ok=(active=="active" and unitfile in ("enabled","static","generated","enabled-runtime"))
    return {"ok":ok,"active":active,"sub":data.get("SubState"),"enabled":unitfile,"result":data.get("Result")}

def failed_units():
    r=run(["systemctl","--failed","--no-legend","--no-pager"],10)
    lines=[x for x in r["stdout"].splitlines() if x.strip() and "Sin salida" not in x]
    return {"ok":r["returncode"]==0 and not lines,"items":lines[:50]}

def container_state(name):
    r=run(["/usr/bin/docker","inspect","--format",
           "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}",
           name],8)
    if r["returncode"]!=0:
        return {"ok":False,"status":"inspect-failed"}
    parts=r["stdout"].strip().split("|")
    status=parts[0] if len(parts)>0 else "unknown"
    health=parts[1] if len(parts)>1 else "unknown"
    restarts=int(parts[2]) if len(parts)>2 and parts[2].isdigit() else None
    return {"ok":status=="running" and health in ("healthy","none"),
            "status":status,"health":health,"restarts":restarts}

def http_check(url):
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"KNABA-host-health/1.0"})
        with urllib.request.urlopen(req,timeout=12) as resp:
            return {"ok":200 <= resp.status < 400,"status":resp.status,"final_url":resp.url}
    except urllib.error.HTTPError as exc:
        return {"ok":False,"status":exc.code,"final_url":exc.url}
    except Exception as exc:
        return {"ok":False,"error":f"{type(exc).__name__}: {exc}"[:300]}

def smart_health():
    dev="/dev/nvme0n1"
    r=run(["/usr/sbin/smartctl","-H","-A","-j",dev],15)
    if r["returncode"] not in (0,4):
        return {"ok":False,"device":dev,"error":r["stderr"][:500],"returncode":r["returncode"]}
    try:
        obj=json.loads(r["stdout"])
    except json.JSONDecodeError:
        return {"ok":False,"device":dev,"error":"invalid-smart-json","returncode":r["returncode"]}
    passed=(obj.get("smart_status") or {}).get("passed")
    nvme=obj.get("nvme_smart_health_information_log") or {}
    return {
        "ok":passed is True,
        "device":dev,
        "smart_passed":passed,
        "temperature_c":(nvme.get("temperature")),
        "percentage_used":nvme.get("percentage_used"),
        "available_spare":nvme.get("available_spare"),
        "critical_warning":nvme.get("critical_warning"),
    }

def newest_age_hours(globs):
    newest=None
    newest_path=None
    for pattern in globs:
        for p in Path("/").glob(pattern.lstrip("/")):
            try:
                if p.is_file():
                    m=p.stat().st_mtime
                    if newest is None or m>newest:
                        newest=m; newest_path=str(p)
            except OSError:
                pass
    if newest is None:
        return None,None
    return (dt.datetime.now(dt.timezone.utc).timestamp()-newest)/3600,newest_path

def backups():
    customer_age,customer_path=newest_age_hours(CUSTOMER_BACKUP_GLOBS)
    lead_age,lead_path=newest_age_hours(LEAD_AGENT_BACKUP_GLOBS)
    return {
        "customer":{"age_hours":round(customer_age,2) if customer_age is not None else None,
                    "path":customer_path,"status":backup_age_status(customer_age,36)},
        "lead_agent":{"age_hours":round(lead_age,2) if lead_age is not None else None,
                      "path":lead_path,"status":backup_age_status(lead_age,36)},
    }

def fstrim_state():
    r=run(["systemctl","show","fstrim.timer","--property=ActiveState,UnitFileState,LastTriggerUSec,NextElapseUSecRealtime","--no-pager"],8)
    return {"ok":r["returncode"]==0 and "ActiveState=active" in r["stdout"],"raw":r["stdout"].strip()[:1000]}

def atomic_json(path,payload):
    fd,tmp=tempfile.mkstemp(prefix=".knaba-health-",suffix=".tmp",dir=path.parent)
    try:
        with os.fdopen(fd,"w",encoding="utf-8") as f:
            os.fchmod(f.fileno(),0o640)
            json.dump(payload,f,ensure_ascii=False,indent=2)
            f.write("\n"); f.flush(); os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.lexists(tmp): os.unlink(tmp)

def trim_reports(keep=120):
    items=sorted([p for p in REPORTS.glob("health-*.json") if p.is_file() and not p.is_symlink()],
                 key=lambda p:p.stat().st_mtime,reverse=True)
    removed=0
    for p in items[keep:]:
        p.unlink(missing_ok=True); removed+=1
    return removed

def main():
    if os.geteuid()!=0:
        print("ERROR root required",file=sys.stderr); return 77
    REPORTS.mkdir(parents=True,exist_ok=True,mode=0o750)
    now=dt.datetime.now(dt.timezone.utc)

    fs=filesystem()
    mem=memory()
    units={name:unit_state(name) for name in REQUIRED_UNITS}
    failed=failed_units()
    containers={name:container_state(name) for name in KEY_CONTAINERS}
    https={url:http_check(url) for url in HTTPS_URLS}
    smart=smart_health()
    bkp=backups()
    trim=fstrim_state()
    offhost=offhost_health()
    backup_services={
        "customer": backup_service_state("knaba-customer-backup.service"),
        "lead_agent": backup_service_state("knaba-lead-agent-backup.service"),
    }
    reboot_required=Path("/var/run/reboot-required").exists()

    warnings=[]
    if fs["status"]=="WARNING": warnings.append("disk-pressure-warning")
    if reboot_required: warnings.append("reboot-required")
    if bkp["customer"]["status"]=="WARNING": warnings.append("customer-backup-aging")
    if bkp["lead_agent"]["status"]=="WARNING": warnings.append("lead-agent-backup-aging")
    if offhost["status"]=="WARNING": warnings.append("offhost-backup-"+str(offhost.get("provider_status","warning")).lower())

    required=[
        fs["status"]!="CRITICAL",
        failed["ok"],
        all(x["ok"] for x in units.values()),
        all(x["ok"] for x in containers.values()),
        all(x["ok"] for x in https.values()),
        smart["ok"],
        bkp["customer"]["status"]!="CRITICAL",
        bkp["lead_agent"]["status"]!="CRITICAL",
        backup_services["customer"]["ok"],
        backup_services["lead_agent"]["ok"],
        offhost["status"]!="CRITICAL",
        trim["ok"],
    ]
    status=overall_status(required,warnings)
    report={
        "schema":1,"host":"knaba","created_at":now.isoformat(),"status":status,
        "filesystem":fs,"memory":mem,"smart":smart,"failed_units":failed,
        "required_units":units,"containers":containers,"https":https,
        "backups":bkp,"backup_services":backup_services,"offhost":offhost,"fstrim":trim,"reboot_required":reboot_required,"warnings":warnings,
    }
    path=REPORTS/f"health-{now:%Y%m%dT%H%M%SZ}-{os.getpid()}.json"
    atomic_json(path,report); atomic_json(REPORTS/"latest.json",report)
    removed=trim_reports()
    print(json.dumps({"status":status,"report":str(path),"warnings":warnings,
                      "disk_used_percent":fs["used_percent"],
                      "disk_available_bytes":fs["available_bytes"],
                      "smart_ok":smart["ok"],"customer_backup":bkp["customer"]["status"],
                      "lead_agent_backup":bkp["lead_agent"]["status"],
                      "https_ok":all(x["ok"] for x in https.values()),
                      "containers_ok":all(x["ok"] for x in containers.values()),
                      "failed_units":len(failed["items"]),"reports_trimmed":removed}))
    return 0 if status in ("OK","WARNING") else 2

if __name__=="__main__":
    import sys
    raise SystemExit(main())

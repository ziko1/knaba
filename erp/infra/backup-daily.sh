#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
knaba_backup_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# Pruning is confined to the sidecar's own mounted volume, after a successful backup.
[[ "${BACKUP_DIR:-}" == /backups ]] || { echo 'FAILED: VPS_BACKUP_DIRECTORY_REQUIRED' >&2; exit 1; }
bash "$knaba_backup_root/infra/backup.sh"
node "$knaba_backup_root/scripts/prune-vps-backups.mjs"

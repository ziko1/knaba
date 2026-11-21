#!/usr/bin/env bash
# KNABA — prepare Cloudflare R2 as the existing knaba-offsite rclone remote.
# Run on the KNABA server as an administrator via: sudo bash knaba-r2-setup.sh
# Does not upload, start timers, delete objects, or change running services.
set -Eeuo pipefail
umask 077
CONFIG='/srv/knaba/maintenance/offhost/rclone.conf'
BUCKET="${KNABA_R2_BUCKET:-}"
if [[ ! "$BUCKET" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]]; then
  echo 'Set KNABA_R2_BUCKET to the private R2 bucket name before running setup.' >&2
  exit 2
fi
ROOT_REMOTE='knaba-r2'
ALIAS_REMOTE='knaba-offsite'

if [[ ${EUID} -ne 0 ]]; then
  echo 'ERROR: run with sudo on the KNABA server.' >&2; exit 1
fi
if ! command -v rclone >/dev/null 2>&1; then
  echo 'ERROR: rclone not installed; no changes made.' >&2; exit 1
fi
if [[ -e "$CONFIG" || -L "$CONFIG" ]]; then
  echo "STOP: $CONFIG already exists. Refusing to overwrite credentials." >&2
  echo 'Use an audited manual migration instead.' >&2; exit 1
fi
if [[ ! -d /srv/knaba/maintenance/offhost ]]; then
  echo 'ERROR: expected KNABA offhost directory is missing; no changes made.' >&2; exit 1
fi
printf 'Cloudflare R2 prerequisite: create a PRIVATE Standard bucket %s\n' "$BUCKET"
printf '%s\n' 'Create a bucket-scoped R2 Object Read & Write API credential.'
printf '%s\n' 'You will type its Access Key ID and Secret Access Key directly into rclone.'
printf '%s\n' 'Do NOT use an ordinary Cloudflare DNS API token.'
printf '\n'
read -r -p 'Have you created the R2 bucket and bucket-scoped credentials? [yes/NO] ' READY
[[ $READY == 'yes' ]] || { echo 'Cancelled, no changes made.'; exit 2; }

# rclone interactive wizard creates the sensitive file with protected umask.
# At the wizard: name knaba-r2, storage s3, provider Cloudflare, access keys,
# account-specific R2 endpoint; do not create the knaba-offsite remote yet.
echo 'Config wizard: create a remote named knaba-r2 (storage=s3; provider=Cloudflare).'
rclone config --config "$CONFIG"
chmod 600 "$CONFIG"
chown root:root "$CONFIG"
if ! rclone listremotes --config "$CONFIG" | grep -Fxq "$ROOT_REMOTE:"; then
  echo 'ERROR: knaba-r2 not found; no alias created.' >&2; exit 3
fi
if rclone listremotes --config "$CONFIG" | grep -Fxq "$ALIAS_REMOTE:"; then
  echo 'STOP: existing knaba-offsite remote must be reviewed; no overwrite.' >&2; exit 4
fi
# Alias scopes the existing backup script's path KNABA/... to the private bucket.
rclone config create "$ALIAS_REMOTE" alias remote "$ROOT_REMOTE:$BUCKET" --config "$CONFIG" >/dev/null
chmod 600 "$CONFIG"
chown root:root "$CONFIG"
# Only read remote metadata; does not upload anything.
if ! rclone lsd "$ROOT_REMOTE:$BUCKET" --config "$CONFIG" >/dev/null; then
  echo 'WARNING: R2 bucket list failed. Check endpoint, bucket name and access rights.' >&2
  exit 5
fi
printf '\nSUCCESS: R2 remote and knaba-offsite alias configured. No uploads started.\n'
printf 'Verify: sudo rclone lsd knaba-offsite: --config %s\n' "$CONFIG"
printf 'Inspect state: sudo cat /srv/knaba/maintenance/offhost/latest.json\n'
printf 'Next: require explicit approval and a measured quota check before starting any upload.\n'

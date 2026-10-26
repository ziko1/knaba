#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
knaba_repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?A separate private BACKUP_PASSPHRASE is required}"
if (( ${#BACKUP_PASSPHRASE} < 32 )); then
  echo 'FAILED: BACKUP_PASSPHRASE must have at least 32 characters.' >&2
  exit 1
fi
for knaba_binary in node openssl tar; do command -v "$knaba_binary" >/dev/null || { echo "FAILED: missing $knaba_binary" >&2; exit 1; }; done
knaba_backup_dir=${BACKUP_DIR:-"$knaba_repo_root/backups"}
mkdir -p -- "$knaba_backup_dir"
knaba_backup_file=${1:-"$knaba_backup_dir/knaba-de-$(date -u +%Y%m%dT%H%M%SZ).tar.enc"}
if [[ -e "$knaba_backup_file" || -e "$knaba_backup_file.hmac" ]]; then echo 'FAILED: backup destination already exists.' >&2; exit 1; fi
knaba_work_dir=$(mktemp -d)
trap 'rm -rf -- "$knaba_work_dir"' EXIT
node "$knaba_repo_root/scripts/backup-db.mjs" "$knaba_work_dir"
if [[ -n ${BACKUP_PRIVATE_STORAGE_DIR:-} ]]; then
  [[ -d "$BACKUP_PRIVATE_STORAGE_DIR" ]] || { echo 'FAILED: private storage directory does not exist.' >&2; exit 1; }
  mkdir -- "$knaba_work_dir/private-files"
  cp -a -- "$BACKUP_PRIVATE_STORAGE_DIR/." "$knaba_work_dir/private-files/"
fi
node "$knaba_repo_root/scripts/backup-files.mjs" create "$knaba_work_dir"
tar -C "$knaba_work_dir" -cf "$knaba_work_dir/archive.tar" database.dump manifest.json file-checksums.json ${BACKUP_PRIVATE_STORAGE_DIR:+private-files}
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -md sha256 -pass env:BACKUP_PASSPHRASE -in "$knaba_work_dir/archive.tar" -out "$knaba_backup_file"
node "$knaba_repo_root/scripts/backup-mac.mjs" sign "$knaba_backup_file"
chmod 600 -- "$knaba_backup_file" "$knaba_backup_file.hmac"
node "$knaba_repo_root/scripts/backup-mac.mjs" verify "$knaba_backup_file"
echo "PASSED: encrypted and authenticated backup created at $knaba_backup_file"

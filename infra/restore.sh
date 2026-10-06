#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
knaba_repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
: "${RESTORE_DATABASE_URL:?Explicit RESTORE_DATABASE_URL for a new empty database is required}"
: "${BACKUP_PASSPHRASE:?The private original BACKUP_PASSPHRASE is required}"
knaba_backup_file=${1:?Usage: infra/restore.sh encrypted-backup --confirm-empty}
[[ ${2:-} == --confirm-empty ]] || { echo 'FAILED: --confirm-empty is required for an isolated empty destination.' >&2; exit 1; }
for knaba_binary in node openssl tar; do command -v "$knaba_binary" >/dev/null || { echo "FAILED: missing $knaba_binary" >&2; exit 1; }; done
knaba_work_dir=$(mktemp -d)
trap 'rm -rf -- "$knaba_work_dir"' EXIT
# Authenticate the ciphertext before attempting any decryption or database write.
node "$knaba_repo_root/scripts/backup-mac.mjs" verify "$knaba_backup_file"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -pass env:BACKUP_PASSPHRASE -in "$knaba_backup_file" -out "$knaba_work_dir/archive.tar"
node "$knaba_repo_root/scripts/backup-files.mjs" inspect "$knaba_work_dir/archive.tar"
tar --no-same-owner --no-same-permissions -C "$knaba_work_dir" -xf "$knaba_work_dir/archive.tar"
node "$knaba_repo_root/scripts/backup-files.mjs" verify "$knaba_work_dir"
if [[ -d "$knaba_work_dir/private-files" ]]; then
  : "${RESTORE_PRIVATE_STORAGE_DIR:?The backup contains filesystem blobs; set an empty RESTORE_PRIVATE_STORAGE_DIR}"
  mkdir -p -- "$RESTORE_PRIVATE_STORAGE_DIR"
  [[ -z $(find "$RESTORE_PRIVATE_STORAGE_DIR" -mindepth 1 -maxdepth 1 -print -quit) ]] || { echo 'FAILED: private storage restore destination is not empty.' >&2; exit 1; }
fi
node "$knaba_repo_root/scripts/restore-db.mjs" "$knaba_work_dir" --confirm-empty
if [[ -d "$knaba_work_dir/private-files" ]]; then cp -a -- "$knaba_work_dir/private-files/." "$RESTORE_PRIVATE_STORAGE_DIR/"; fi
echo 'PASSED: isolated database and private blobs restored; source database unchanged.'

#!/usr/bin/env bash
# KNABA customer-server handover. PREPARE never deploys or changes existing services/DNS.
set -Eeuo pipefail
umask 077
action="${1:-preflight}"
root="${KNABA_INSTALL_ROOT:-/srv/knaba/vps}"
die(){ printf 'KNABA_HANDOVER_ERROR: %s\n' "$*" >&2; exit 2; }
need(){ command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"; }
require_root(){ (( EUID == 0 )) || die "Run this action as root on the authorized target server."; }
validate_root(){
 [[ "$root" == /srv/knaba/vps ]] || die 'Use the dedicated /srv/knaba/vps path; do not overwrite other projects.'
 [[ -d /srv ]] || die 'Missing /srv.'
}
validate_key(){
 local file="$1"
 [[ -f "$file" && ! -L "$file" ]] || die 'Missing regular SSH public key file.'
 need ssh-keygen
 ssh-keygen -lf "$file" >/dev/null || die 'Invalid SSH public key.'
 local lines
 lines="$(wc -l < "$file")"
 [[ "$lines" == 1 ]] || die 'Exactly one public key per account is required.'
 grep -Eq '^(ssh-ed25519|ecdsa-sha2-nistp256|sk-ssh-ed25519@openssh.com) [A-Za-z0-9+/=]+' "$file" ||
   die 'Require a modern SSH public key, not a password.'
}
install_key(){
 local account="$1" file="$2" home_dir group
 home_dir="$(getent passwd "$account" | cut -d: -f6)"
 group="$(id -gn "$account")"
 [[ -d "$home_dir" && "$home_dir" == /home/* ]] || die 'Unsafe home directory for SSH user.'
 install -d -o "$account" -g "$group" -m 700 "$home_dir/.ssh"
 if [[ ! -e "$home_dir/.ssh/authorized_keys" ]];then
   install -o "$account" -g "$group" -m 600 "$file" "$home_dir/.ssh/authorized_keys"
 else
   [[ -f "$home_dir/.ssh/authorized_keys" && ! -L "$home_dir/.ssh/authorized_keys" ]] ||
     die 'Existing authorized_keys must be a regular file.'
   chmod 600 "$home_dir/.ssh/authorized_keys"
   local value
   value="$(cat "$file")"
   if ! grep -Fxq -- "$value" "$home_dir/.ssh/authorized_keys";then
     printf '%s\n' "$value" >> "$home_dir/.ssh/authorized_keys"
   fi
   chown "$account:$group" "$home_dir/.ssh/authorized_keys"
 fi
}
check_disk(){
 need df
 local kb
 kb="$(df -Pk /srv | awk 'NR==2{print $4}')"
 [[ "$kb" =~ ^[0-9]+$ ]] || die 'Cannot measure storage.'
 (( kb >= 8*1024*1024 )) || die 'Less than 8GiB free; no safe migration.'
}
check_host(){
 need getent
 validate_root
 check_disk
 if command -v docker >/dev/null 2>&1;then
   docker compose version >/dev/null 2>&1 || die 'Docker Compose plugin missing.'
 else
   printf 'WARN: Docker must be installed/verified before deployment.\n' >&2
 fi
 printf 'PREFLIGHT_OK free_space_checked=true users_present='
 for account in knaba vsp;do
   if id "$account" >/dev/null 2>&1;then printf '%s ' "$account";else printf '(new:%s) ' "$account";fi
 done
 printf '\n'
}
prepare(){
 require_root
 check_host
 [[ -n "${OWNER_SSH_PUBKEY_FILE:-}" && -n "${DEVELOPER_SSH_PUBKEY_FILE:-}" ]] ||
   die 'Set OWNER_SSH_PUBKEY_FILE and DEVELOPER_SSH_PUBKEY_FILE first.'
 [[ "${OWNER_SSH_PUBKEY_FILE}" != "${DEVELOPER_SSH_PUBKEY_FILE}" ]] ||
   die 'Owner and developer need different authorized key files.'
 [[ "$(sha256sum "$OWNER_SSH_PUBKEY_FILE"|cut -d' ' -f1)" != "$(sha256sum "$DEVELOPER_SSH_PUBKEY_FILE"|cut -d' ' -f1)" ]] ||
   die 'Owner and developer must use distinct SSH public keys.'
 [[ ! -e "$root/current" && ! -e "$root/state/site.sqlite" ]] ||
   die 'Active KNABA environment already detected. No preparation changes on an existing installation.'
 validate_key "$OWNER_SSH_PUBKEY_FILE"
 validate_key "$DEVELOPER_SSH_PUBKEY_FILE"
 for account in knaba vsp;do
   if ! id "$account" >/dev/null 2>&1;then
     useradd --create-home --shell /bin/bash "$account"
     passwd -l "$account" >/dev/null
   fi
 done
 install_key knaba "$OWNER_SSH_PUBKEY_FILE"
 install_key vsp "$DEVELOPER_SSH_PUBKEY_FILE"
 # No docker-group, unrestricted sudo or shared production-secret permissions.
 install -d -o root -g root -m 755 /srv/knaba
 install -d -o root -g knaba -m 750 "$root"
 install -d -o knaba -g knaba -m 750 "$root/releases"
 install -d -o knaba -g knaba -m 700 "$root/state" "$root/state/backups"
 install -d -o root -g root -m 700 "$root/config"
 if [[ ! -e "$root/config/site.env" ]];then
   install -o root -g root -m 600 /dev/null "$root/config/site.env"
 fi
 printf 'PREPARED_NO_DEPLOY users=knaba,vsp root=%s\n' "$root"
 printf 'NEXT: transfer protected database using SQLite online backup+SSH, configure site.env, stage reviewed release, then run owner UAT.\n'
}
bundle(){
 need git;need tar;need sha256sum
 local project sha bundle dir
 project="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
 [[ -f "$project/dist/client/index.html" && -f "$project/dist/server/index.js" &&
    -f "$project/vps/server.mjs" && -f "$project/drizzle/meta/_journal.json" ]] ||
    die 'Missing verified production build; run build and verify:build first.'
 sha="$(git -C "$project" rev-parse --verify HEAD^{commit})"
 [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die 'Invalid source revision.'
 [[ -z "$(git -C "$project" status --porcelain)" ]] || die 'Source tree is not clean; commit and review first.'
 dir="${KNABA_BUNDLE_DIR:-$PWD}"
 [[ -d "$dir" ]] || die 'Create a private output folder for the release bundle.'
 bundle="$dir/knaba-candidate-$sha.tar.gz"
 [[ ! -e "$bundle" ]] || die 'Bundle already exists; no replacement without review.'
 # Includes ONLY reviewed application release artifacts, never config, secrets, raw SQLite or node_modules.
 tar -C "$project" -czf "$bundle" dist vps drizzle package.json
 chmod 600 "$bundle"
 sha256sum "$bundle" > "$bundle.sha256"
 chmod 600 "$bundle.sha256"
 printf 'BUNDLE_CREATED source=%s archive_sha256=%s\n' "$sha" "$(sha256sum "$bundle"|cut -d' ' -f1)"
}
install_bundle(){
 require_root
 need tar;need sha256sum
 check_host
 [[ -n "${KNABA_BUNDLE_FILE:-}" && -n "${KNABA_EXPECTED_SHA:-}" ]] ||
   die 'Set KNABA_BUNDLE_FILE and KNABA_EXPECTED_SHA from reviewed GitHub commit.'
 [[ "${KNABA_EXPECTED_SHA}" =~ ^[0-9a-f]{40}$ ]] || die 'Expected SHA must be an exact 40-character Git SHA.'
 local bundle="$KNABA_BUNDLE_FILE" expected="$KNABA_EXPECTED_SHA"
 [[ -f "$bundle" && -f "$bundle.sha256" && ! -L "$bundle" ]] || die 'Signed-off transfer artifacts missing.'
 (cd "$(dirname "$bundle")" && sha256sum -c "$(basename "$bundle").sha256") >/dev/null ||
   die 'Bundle SHA256 mismatch.'
 tar -tzf "$bundle" | awk '/^\// || /(^|\/)\.\.($|\/)/ {bad=1} END {exit bad}' ||
   die 'Unsafe archive paths.'
 [[ -d "$root/releases" && -d "$root/config" ]] ||
   die 'First run prepare with SSH keys.'
 local dest="$root/releases/$expected" tmp
 [[ ! -e "$dest" ]] || die 'Release already exists; refusing overwrite.'
 tmp="$(mktemp -d "$root/releases/.stage.XXXXXXXX")"
 chown knaba:knaba "$tmp"
 install -o knaba -g knaba -m 600 "$bundle" "$tmp/.release-bundle.tar.gz"
 if ! sudo -u knaba tar -xzf "$tmp/.release-bundle.tar.gz" --no-same-owner -C "$tmp";then
   # Do not remove staged evidence automatically after a failed extraction.
   die "Extraction failed. Inspect protected staging folder."
 fi
 rm -f "$tmp/.release-bundle.tar.gz"
 [[ -f "$tmp/dist/server/index.js" && -f "$tmp/vps/server.mjs" && -f "$tmp/package.json" ]] ||
   die 'Incomplete application bundle.'
 mv "$tmp" "$dest"
 printf 'STAGED_NOT_ACTIVE source_sha=%s path=%s\n' "$expected" "$dest"
 printf 'Owner acceptance, DB backup/import, migrations, HTTPS/DNS and rollback gates remain mandatory.\n'
}
case "$action" in
 preflight) check_host ;;
 prepare) prepare ;;
 bundle) bundle ;;
 stage) install_bundle ;;
 *) die 'Usage: owner-server-setup.sh preflight|prepare|bundle|stage' ;;
esac

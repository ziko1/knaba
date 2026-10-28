#!/data/data/com.termux/files/usr/bin/bash
# KNABA physical server: one-time setup from Termux on the server's Wi-Fi.
# Creates TWO PHONE-LOCAL private keys with no passphrase for passwordless login.
# Keep the phone locked. Never share files without the .pub suffix.
# Server identity and addresses verified on 2026-10-28 via authenticated SentinelX.
set -euo pipefail
umask 077

die() { printf 'ПОМИЛКА: %s\n' "$*" >&2; exit 1; }
command -v pkg >/dev/null || die 'Запустіть цей файл у Termux на телефоні.'
[[ -t 0 ]] || die 'Запустіть bash файл у відкритому терміналі, не через pipe.'
printf '%s\n' 'Перший запуск: телефон і сервер мають бути в одній Wi-Fi мережі.'
printf '%s\n' 'Нові ключі будуть БЕЗ passphrase, тільки у приватній папці Termux.'
printf '%s\n' 'Пароль knaba потрібен для початкового входу та sudo. Введення невидиме.'
if ! command -v ssh >/dev/null || ! command -v python >/dev/null; then
  pkg install -y openssh python
fi

sshdir="$HOME/.ssh"
[[ ! -L "$sshdir" ]] || die '.ssh є symlink; автоматичне налаштування зупинено.'
mkdir -p "$sshdir"
chmod 700 "$sshdir"
for account in knaba vsp; do
  key="$sshdir/id_ed25519_${account}_phone"
  [[ ! -L "$key" && ! -L "$key.pub" ]] || die "Symlink ключа: $key"
  if [[ ! -e "$key" ]]; then
    [[ ! -e "$key.pub" ]] || die "Є лише $key.pub; відновіть приватний ключ або перейменуйте .pub."
    ssh-keygen -q -t ed25519 -N '' -C "termux-${account}-phone" -f "$key"
  fi
  [[ -f "$key" ]] || die "Не файл: $key"
  chmod 600 "$key"
  # Re-derive public material; never upload or print the private file.
  public=$(ssh-keygen -y -P '' -f "$key") || die 'Наявний ключ захищений passphrase або пошкоджений; його не змінено.'
  read -r kind material _ <<< "$public"
  [[ "$kind" == ssh-ed25519 && "$material" =~ ^[A-Za-z0-9+/]+=*$ ]] || die 'Потрібен ключ Ed25519.'
  printf '%s %s termux-%s-phone\n' "$kind" "$material" "$account" > "$key.pub"
done

# Pinned public SERVER key: NOT a private key, never learned from ssh-keyscan.
known="$sshdir/known_hosts_knaba_physical"
pinned='knaba-physical-20261028 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB5caZjd6zeR2+Q0SrN0DaCUmcJDq4E893jtdFs76ZXj'
[[ ! -L "$known" ]] || die 'Symlink known_hosts.'
if [[ -e "$known" ]]; then
  [[ -f "$known" && "$(cat "$known")" == "$pinned" ]] || die 'Наявний pinned host key відрізняється; потрібна перевірка.'
else
  printf '%s\n' "$pinned" > "$known"
fi
chmod 600 "$known"

conf="$sshdir/knaba-vsp.conf"
[[ ! -L "$conf" ]] || die 'Symlink конфігурації.'
if [[ -e "$conf" ]] && ! grep -qxF '# Managed: KNABA phone SSH 2026-10-28' "$conf"; then
  die 'knaba-vsp.conf вже існує і не належить цьому скрипту.'
fi
cat > "$conf" <<'CONFIG'
# Managed: KNABA phone SSH 2026-10-28
Host knaba knaba-lan vsp vsp-lan
    Port 22
    IdentitiesOnly yes
    PreferredAuthentications publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    StrictHostKeyChecking yes
    HostKeyAlias knaba-physical-20261028
    HostKeyAlgorithms ssh-ed25519
    UserKnownHostsFile ~/.ssh/known_hosts_knaba_physical
    GlobalKnownHostsFile /dev/null
    ForwardAgent no
    ServerAliveInterval 30
    ServerAliveCountMax 3
    ConnectTimeout 10
Host knaba vsp
    HostName 100.109.95.101
Host knaba-lan vsp-lan
    HostName 192.168.188.154
Host knaba knaba-lan
    User knaba
    IdentityFile ~/.ssh/id_ed25519_knaba_phone
Host vsp vsp-lan
    User vsp
    IdentityFile ~/.ssh/id_ed25519_vsp_phone
CONFIG
chmod 600 "$conf"

# Add our Include at the top; preserve original config and a backup.
python - "$sshdir" <<'PY'
import os, pathlib, stat, sys, tempfile
d = pathlib.Path(sys.argv[1]); p = d / 'config'
if p.is_symlink() or (p.exists() and not p.is_file()):
    raise SystemExit('Небезпечний тип ~/.ssh/config; зупинено.')
old = p.read_bytes() if p.exists() else b''
include = b'Include ~/.ssh/knaba-vsp.conf'
if not old.startswith(include + b'\nHost *\n'):
    if old:
        fd, backup = tempfile.mkstemp(prefix='config.before-knaba-', dir=d)
        with os.fdopen(fd, 'wb') as f: f.write(old)
        print('Резервна копія SSH config:', backup)
    fd, temp = tempfile.mkstemp(prefix='.config-', dir=d)
    with os.fdopen(fd, 'wb') as f:
        f.write(include + b'\nHost *\n' + old)
    os.replace(temp, p)
os.chmod(p, stat.S_IRUSR | stat.S_IWUSR)
PY

REMOTE_INSTALL=$(cat <<'REMOTE'
set -euo pipefail
umask 077
[[ $EUID -eq 0 && $# -eq 2 ]] || exit 1
exec 9>/run/knaba-termux-ssh.lock
flock -x -w 10 9
for u in knaba vsp; do
  key=$1; shift
  [[ "$key" =~ ^ssh-ed25519\ [A-Za-z0-9+/]+=*\ termux-(knaba|vsp)-phone$ ]] || exit 2
  h=$(getent passwd "$u" | cut -d: -f6)
  [[ "$h" == "/home/$u" && -d "$h" && ! -L "$h" ]] || exit 3
  d="$h/.ssh"; f="$d/authorized_keys"
  [[ -d "$d" && ! -L "$d" && -f "$f" && ! -L "$f" ]] || exit 4
  [[ $(stat -c %h "$f") == 1 ]] || exit 5
  [[ $(stat -c %s "$f") -le 1048576 ]] || exit 6
  chown "$u:$(id -gn "$u")" "$d" "$f"
  chmod 700 "$d"; chmod 600 "$f"
  read -r kind material comment <<< "$key"
  if grep -qF -- "$material" "$f"; then
    # Do not silently replace a restricted authorized_keys entry.
    awk -v k="$material" '$1 == "ssh-ed25519" && $2 == k {found=1} END {exit !found}' "$f" || exit 7
    printf '%s: ключ уже додано\n' "$u"
  else
    backup=$(mktemp "$d/authorized_keys.before-termux.XXXXXX")
    cp --preserve=mode,ownership -- "$f" "$backup"
    printf '\n%s\n' "$key" >> "$f"
    printf '%s: ключ додано; backup=%s\n' "$u" "$backup"
  fi
done
REMOTE
)
pub_knaba=$(cat "$sshdir/id_ed25519_knaba_phone.pub")
pub_vsp=$(cat "$sshdir/id_ed25519_vsp_phone.pub")
# Both remote login shells are /bin/bash (verified). %q quotes command and data.
printf -v remote_cmd 'sudo bash -c %q bash %q %q' "$REMOTE_INSTALL" "$pub_knaba" "$pub_vsp"
printf '\n%s\n' 'Встановлення тільки ПУБЛІЧНИХ ключів через knaba. Введіть пароль, якщо буде запит.'
ssh -F "$conf" -o PreferredAuthentications=publickey,password -o PasswordAuthentication=yes -tt knaba-lan "$remote_cmd"

for u in knaba vsp; do
  # Test the same main SSH config used by the short commands, including any
  # pre-existing user options. Do not switch Tailscale on a failed check.
  if ! result=$(ssh -o BatchMode=yes "$u-lan" 'id -un'); then
    die "Вхід $u-lan не пройшов. Tailscale SSH не змінено. Для діагностики: ssh -F ~/.ssh/knaba-vsp.conf $u-lan"
  fi
  [[ "$result" == "$u" ]] || die "Перевірка входу $u не пройшла. Tailscale SSH не змінено."
  printf 'ПЕРЕВІРЕНО: %s — вхід ключем через Wi-Fi без пароля.\n' "$u"
done

# Only after BOTH key logins succeed, stop the alternate SSH implementation
# intercepting Tailscale port 22. VPN connectivity and other prefs stay intact.
printf '\n%s\n' 'Обидва ключі працюють. Перемикаю Tailscale на стандартний OpenSSH.'
printf '%s\n' 'sudo може ще раз запитати пароль knaba.'
ssh -F "$conf" -tt knaba-lan 'sudo tailscale set --ssh=false'

remote_ok=yes
for u in knaba vsp; do
  if result=$(ssh -o BatchMode=yes "$u" 'id -un') && [[ "$result" == "$u" ]]; then
    printf 'ПЕРЕВІРЕНО: %s — вхід через Tailscale.\n' "$u"
  else
    remote_ok=no
    printf 'НЕ ПЕРЕВІРЕНО: %s через Tailscale. Увімкніть Tailscale на телефоні й перевірте доступ до сервера.\n' "$u"
  fi
done
printf '\n%s\n' 'Wi-Fi: ssh knaba-lan або ssh vsp-lan'
printf '%s\n' 'Через Tailscale: ssh knaba або ssh vsp'
printf '%s\n' 'Root: ssh knaba, потім sudo -i (потрібен пароль knaba).'
printf '%s\n' 'У vsp пароль заблокований: це не заважає входу ключем з поточним UsePAM=yes, але sudo може вимагати окремого налаштування.'
printf '%s\n' 'Після налаштування перевірте ssh knaba і ssh vsp з ВИМКНЕНИМ Wi-Fi телефона.'
[[ "$remote_ok" == yes ]] || exit 2

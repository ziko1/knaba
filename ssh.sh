#!/usr/bin/env bash
# Inspect or initialize the packaged OpenSSH server on Ubuntu/Debian.
# Existing access policy and host identities belong to the administrator.

SSH_SETUP_CONFIG=/etc/ssh/sshd_config
SSH_SETUP_TEMPLATE=/usr/share/openssh/sshd_config
SSH_SETUP_DEFAULTS=/etc/default/ssh
SSH_SETUP_RUN_DIR=/run/sshd
SSH_SETUP_OS_RELEASE=/etc/os-release
SSH_SETUP_SSHD=/usr/sbin/sshd

die() { printf 'Помилка: %s\n' "$*" >&2; exit 1; }
sshd_command() { "$SSH_SETUP_SSHD" "$@"; }

usage() {
  cat <<'HELP'
SSH server setup — Ubuntu/Debian із systemd
  sudo bash ssh.sh           створити відсутню конфігурацію та ввімкнути SSH
  sudo bash ssh.sh --check   лише перевірити, без змін
  bash ssh.sh --help         довідка

Запускайте у консолі сервера. Для входу потрібен наявний обліковий запис
і дозволений для нього пароль або SSH-ключ. Порт має бути доступним у firewall.
HELP
}

check_environment() {
  (( EUID == 0 )) || die "Запусти від root або через sudo bash ssh.sh."
  [[ -r "$SSH_SETUP_OS_RELEASE" ]] || die "Не вдалося визначити ОС."
  local ID=
  # shellcheck disable=SC1090
  . "$SSH_SETUP_OS_RELEASE"
  case "$ID" in ubuntu|debian) ;; *) die "Підтримуються лише Ubuntu та Debian." ;; esac
  [[ -d /run/systemd/system ]] || die "Потрібен сервер із запущеним systemd."
  systemctl show --property=Version --value >/dev/null || die "systemd недоступний."
}

check_service_configuration() {
  local ssh_exec ssh_argv_text ssh_env_files ssh_env ssh_line ssh_value ssh_load_state
  local -a ssh_argv
  ssh_load_state=$(systemctl show ssh.service --property=LoadState --value) || {
    [[ "$ssh_load_state" == not-found ]] || die "Не вдалося прочитати ssh.service у systemd."
  }
  case "$ssh_load_state" in
    not-found)
      [[ ! -x "$SSH_SETUP_SSHD" ]] || die "sshd існує, але ssh.service відсутня; перевір пакет або нестандартний запуск."
      return 0 ;;
    loaded) ;;
    masked) die "ssh.service заблоковано (masked); потрібне рішення адміністратора." ;;
    *) die "ssh.service має непідтримуваний стан: $ssh_load_state" ;;
  esac
  ssh_exec=$(systemctl show ssh.service --property=ExecStart --value)
  [[ -n "$ssh_exec" ]] || die "ssh.service не має ExecStart; потрібна ручна перевірка."
  if [[ -n "$ssh_exec" ]]; then
    local ssh_pattern='argv\[\]=([^;]+)'
    [[ "$ssh_exec" =~ $ssh_pattern ]] || die "Нестандартний ExecStart SSH; потрібна ручна перевірка."
    ssh_argv_text=${BASH_REMATCH[1]}
    read -r -a ssh_argv <<< "$ssh_argv_text"
    [[ ${ssh_argv[0]:-} == /usr/sbin/sshd ]] || die "SSH запускається нестандартним способом."
    for ssh_value in "${ssh_argv[@]:1}"; do
      case "$ssh_value" in
        -D|-e|-q|'$SSHD_OPTS'|'${SSHD_OPTS}') ;;
        *) die "ExecStart має додаткові параметри SSH; автоматичне налаштування зупинено." ;;
      esac
    done
  fi
  ssh_env_files=$(systemctl show ssh.service --property=EnvironmentFiles --value)
  ssh_env_files=${ssh_env_files//\/etc\/default\/ssh \(ignore_errors=yes\)/}
  [[ -z ${ssh_env_files//[[:space:]]/} ]] || die "SSH має нестандартний EnvironmentFile."
  ssh_env=$(systemctl show ssh.service --property=Environment --value)
  [[ "$ssh_env" != *SSHD_OPTS=* ]] || die "SSHD_OPTS задано в systemd; потрібна ручна перевірка."
  if [[ -f "$SSH_SETUP_DEFAULTS" ]]; then
    local ssh_assignment='^[[:space:]]*(export[[:space:]]+)?SSHD_OPTS[[:space:]]*=(.*)$'
    while IFS= read -r ssh_line || [[ -n "$ssh_line" ]]; do
      [[ "$ssh_line" =~ $ssh_assignment ]] || continue
      ssh_value=${BASH_REMATCH[2]}
      ssh_value=${ssh_value%%#*}
      ssh_value=${ssh_value//[[:space:]]/}
      case "$ssh_value" in ''|'""'|"''") ;; *) die "Непорожній SSHD_OPTS у /etc/default/ssh; потрібна ручна перевірка." ;; esac
    done < "$SSH_SETUP_DEFAULTS"
  fi
}

install_missing_server() {
  [[ ! -x "$SSH_SETUP_SSHD" ]] || return 0
  printf 'Встановлення openssh-server…\n'
  apt-get update
  apt-get install -y openssh-server
  [[ -x "$SSH_SETUP_SSHD" ]] || die "Пакет не відновив sshd; перевір його встановлення."
}

initialize_missing_config() {
  if [[ -L "$SSH_SETUP_CONFIG" && ! -e "$SSH_SETUP_CONFIG" ]]; then
    die "sshd_config — пошкоджене символічне посилання; перевір його вручну."
  fi
  if [[ ! -e "$SSH_SETUP_CONFIG" && ! -L "$SSH_SETUP_CONFIG" ]]; then
    [[ -f "$SSH_SETUP_TEMPLATE" ]] || die "Штатний шаблон SSH відсутній у пакеті."
    install -D -o root -g root -m 0644 "$SSH_SETUP_TEMPLATE" "$SSH_SETUP_CONFIG"
    ssh-keygen -A
    printf 'Створено стандартний sshd_config і відсутні серверні ключі.\n'
  fi
  [[ -f "$SSH_SETUP_CONFIG" ]] || die "sshd_config не є звичайним файлом."
  install -d -o root -g root -m 0755 "$SSH_SETUP_RUN_DIR"
}

validate_config() {
  if [[ ! -x "$SSH_SETUP_SSHD" ]]; then
    printf 'Помилка: SSH-сервер відсутній. Запусти без --check для встановлення.\n' >&2
    return 1
  fi
  if [[ ! -f "$SSH_SETUP_CONFIG" ]]; then
    printf 'Помилка: конфігурація SSH відсутня або недоступна.\n' >&2
    return 1
  fi
  if ! sshd_command -t; then
    printf 'Помилка: конфігурація або серверні ключі SSH не пройшли перевірку.\n' >&2
    return 1
  fi
}

activate_ssh() {
  local ssh_unit=ssh.service ssh_unit_state
  if systemctl is-active --quiet ssh.socket || systemctl is-enabled --quiet ssh.socket; then
    ssh_unit=ssh.socket
  fi
  ssh_unit_state=$(systemctl show "$ssh_unit" --property=LoadState --value)
  [[ "$ssh_unit_state" != masked ]] || die "$ssh_unit заблоковано (masked); потрібне рішення адміністратора."
  systemctl enable --now "$ssh_unit" || return 1
  systemctl is-active --quiet "$ssh_unit" || die "$ssh_unit не перейшов в активний стан."
}

report_runtime_state() {
  printf '\nСтан SSH і сокета:\n'
  systemctl show ssh.service ssh.socket -p Id -p LoadState -p ActiveState -p UnitFileState -p Listen --no-pager
  printf '\nПорти TCP, які сервер зараз слухає:\n'
  if command -v ss >/dev/null 2>&1; then
    ss -lntp
  else
    printf 'Не показано: команда ss (пакет iproute2) відсутня.\n'
  fi
}

report_state() {
  printf '\nПараметри з поточних конфігураційних файлів:\n'
  sshd_command -T | grep -E '^(port|listenaddress|permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|authenticationmethods|authorizedkeysfile|allowusers|allowgroups|denyusers|denygroups) '
  report_runtime_state
  printf '\nПравила Match можуть змінювати умови для конкретного логіна або IP.\n'
  printf 'Параметри з файлів можуть відрізнятися від уже запущеного процесу; фактичні порти наведено вище.\n'
  printf 'Для підключення використай IP із панелі хостингу, порт SSH і свій обліковий запис.\n'
}

main() {
  local ssh_mode=setup
  case "${1:-}" in
    --help|-h) usage; return 0 ;;
    --check) ssh_mode=check ;;
    '') ;;
    *) usage >&2; die "Невідомий параметр: $1" ;;
  esac
  (( $# <= 1 )) || die "Зайві аргументи."
  set -Eeuo pipefail
  trap 'printf "Виконання зупинено через помилку (рядок %s).\n" "$LINENO" >&2' ERR
  check_environment
  check_service_configuration
  if [[ "$ssh_mode" == check ]]; then
    if ! validate_config; then
      report_runtime_state
      return 1
    fi
    report_state
    return 0
  fi
  install_missing_server
  check_service_configuration
  initialize_missing_config
  validate_config || return 1
  activate_ssh
  report_state
}

if [[ -z ${BASH_SOURCE[0]:-} || ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi

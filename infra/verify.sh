#!/usr/bin/env bash
set -Eeuo pipefail
knaba_script_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
exec bash "$knaba_script_root/scripts/verify.sh" "$@"

#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
if [[ $# -lt 2 || $# -gt 3 ]]; then
  printf '%s\n' 'Usage: scripts/provision-user.sh ROLE USERNAME [PLATFORM]' >&2
  exit 2
fi
if [[ ! -f "$repo_root/gateway/dist/src/accounts/provision.js" ]]; then
  printf '%s\n' 'Build the gateway before provisioning accounts.' >&2
  exit 1
fi
IFS= read -rs -p 'Access code: ' provision_code </dev/tty
printf '\n' >/dev/tty
IFS= read -rs -p 'Repeat access code: ' provision_confirm </dev/tty
printf '\n' >/dev/tty
if [[ "$provision_code" != "$provision_confirm" ]]; then
  printf '%s\n' 'Access codes do not match.' >&2
  exit 1
fi
printf '%s' "$provision_code" | node "$repo_root/gateway/dist/src/accounts/provision.js" "$@"

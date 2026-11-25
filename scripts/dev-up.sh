#!/usr/bin/env bash
set -euo pipefail
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$repo_root"

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

for prerequisite in git make go docker docker-compose jq node npm openssl; do
  command -v "$prerequisite" >/dev/null || die "Missing prerequisite: $prerequisite."
done
docker info >/dev/null || die 'The Docker daemon is unavailable.'
docker compose version >/dev/null || die 'Docker Compose is unavailable.'

revision=8090e0ce58802c8a0f13d23a6abe5a2d35456cc5
if [[ -z "${DRUNIX_RUNTIME:-}" ]]; then
  runtime_parent=$(mktemp -d /tmp/parashield-drunix.XXXXXX)
  export DRUNIX_RUNTIME="$runtime_parent/drunix"
fi
export DRUNIX_RUNTIME
runtime=$(realpath -m -- "$DRUNIX_RUNTIME")
if [[ "$runtime" == "$repo_root" || "$runtime" == "$repo_root/"* ]]; then
  die 'Use a DRUNIX runtime directory outside this repository.'
fi
if [[ -d "$HOME/drunix" && "$runtime" -ef "$HOME/drunix" ]]; then
  die 'Use a writable runtime separate from the read-only reference checkout.'
fi

if [[ ! -e "$runtime" ]]; then
  if git -C "$HOME/drunix" cat-file -e "$revision^{commit}" 2>/dev/null; then
    git clone --no-hardlinks -- "$HOME/drunix" "$runtime"
  else
    git clone -- https://github.com/npci/drunix "$runtime"
  fi
  git -C "$runtime" checkout --detach "$revision"
fi
actual=$(git -C "$runtime" rev-parse HEAD) || die 'The runtime is not a DRUNIX Git checkout.'
[[ "$actual" == "$revision" ]] || die "DRUNIX runtime is at $actual. The verified revision is $revision."
export DRUNIX_RUNTIME="$runtime"

printf 'DRUNIX runtime: %s\n' "$DRUNIX_RUNTIME"
(
  cd -- "$DRUNIX_RUNTIME"
  make peer orderer configtxgen configtxlator osnadmin cryptogen discover ledgerutil
)
npm ci
npm --prefix gateway ci
npm --prefix oracles ci
npm --prefix mock-upi ci
npm --prefix gateway run build
npm --prefix oracles run build
scripts/network-up.sh
scripts/deploy-chaincode.sh
scripts/smoke-test.sh

export PARASHIELD_BENCHMARK_REPORT="${PARASHIELD_BENCHMARK_REPORT:-$repo_root/docs/benchmark-latest.json}"
exec node scripts/dev-stack.mjs

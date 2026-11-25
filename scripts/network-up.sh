#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/drunix-env.sh"

if ! channel_joined; then
  ./network.sh up createChannel -c "$channel" -s yugabyte ||
    fail 'DRUNIX sample failed to start or create the channel.'
fi
channel_joined || fail 'The parashield channel was not found on all four sample peers.'

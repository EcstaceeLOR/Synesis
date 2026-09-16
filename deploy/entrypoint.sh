#!/bin/sh
set -eu

if [ "${SYNESIS_MODE:-demo}" = "live" ] \
  && [ "${SYNESIS_LIVE_ACKNOWLEDGED:-}" != "I_UNDERSTAND_LIVE_VALUE_MOVEMENT" ]; then
  echo "Refusing live start: set SYNESIS_LIVE_ACKNOWLEDGED=I_UNDERSTAND_LIVE_VALUE_MOVEMENT" >&2
  exit 78
fi

exec "$@"

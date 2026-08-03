#!/usr/bin/env bash
# Copyright (c) 2026 Ada Technology. MIT License.
set -euo pipefail

readonly POLL_INTERVAL_SECONDS=10
readonly POLL_ATTEMPTS=90
readonly TERMINAL_FAILURE_STATUSES='FAILED CRASHED REMOVED SKIPPED'

usage() {
  echo "uso: $0 <deploy|has-succeeded> <serviço>" >&2
  exit 2
}

# `railway up --ci` sai assim que o build termina: quem diz se o release subiu é o status.
latest_status() {
  local service="$1"
  railway deployment list \
    --service "$service" \
    --environment "$TARGET_ENVIRONMENT" \
    --project "$RAILWAY_PROJECT_ID" \
    --json 2>/dev/null \
    | python3 -c 'import json,sys
try:
    deployments = json.load(sys.stdin)
except Exception:
    deployments = []
print(deployments[0]["status"] if deployments else "NONE")'
}

has_succeeded() {
  local service="$1"
  railway deployment list \
    --service "$service" \
    --environment "$TARGET_ENVIRONMENT" \
    --project "$RAILWAY_PROJECT_ID" \
    --json 2>/dev/null \
    | python3 -c 'import json,sys
try:
    deployments = json.load(sys.stdin)
except Exception:
    deployments = []
sys.exit(0 if any(d.get("status") == "SUCCESS" for d in deployments) else 1)'
}

wait_for_deployment() {
  local service="$1"
  local status

  for _ in $(seq 1 "$POLL_ATTEMPTS"); do
    status="$(latest_status "$service")"
    case " $TERMINAL_FAILURE_STATUSES " in
      *" $status "*)
        echo "::error::$service terminou em $status no ambiente $TARGET_ENVIRONMENT"
        railway logs --service "$service" --environment "$TARGET_ENVIRONMENT" --lines 100 || true
        return 1
        ;;
    esac
    if [ "$status" = SUCCESS ]; then
      echo "$service: deploy concluído"
      return 0
    fi
    echo "$service: $status"
    sleep "$POLL_INTERVAL_SECONDS"
  done

  echo "::error::$service não estabilizou dentro do tempo limite"
  return 1
}

deploy() {
  local service="$1"
  railway up \
    --ci \
    --service "$service" \
    --environment "$TARGET_ENVIRONMENT" \
    --project "$RAILWAY_PROJECT_ID" \
    --message "${GITHUB_SHA:-manual}"
  wait_for_deployment "$service"
}

[ $# -eq 2 ] || usage
: "${TARGET_ENVIRONMENT:?TARGET_ENVIRONMENT é obrigatório}"
: "${RAILWAY_PROJECT_ID:?RAILWAY_PROJECT_ID é obrigatório}"

case "$1" in
  deploy) deploy "$2" ;;
  has-succeeded) has_succeeded "$2" ;;
  *) usage ;;
esac

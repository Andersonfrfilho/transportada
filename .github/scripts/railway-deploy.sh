#!/usr/bin/env bash
# Copyright (c) 2026 Ada Technology. MIT License.
set -euo pipefail

readonly POLL_INTERVAL_SECONDS=10
readonly POLL_ATTEMPTS=90
readonly TERMINAL_FAILURE_STATUSES='FAILED CRASHED REMOVED SKIPPED'
# `SUCCESS` marca o release publicado, não o processo vivo: um contêiner em crash-loop passa por
# `SUCCESS` antes de virar `CRASHED`. Só aceitamos o deploy depois de o status se sustentar.
readonly STABLE_CONFIRMATIONS=3

usage() {
  echo "uso: $0 <deploy|has-succeeded|assert-migrations> <serviço>" >&2
  exit 2
}

# `railway up --ci` sai assim que o build termina: quem diz se o release subiu é o status.
latest_status() {
  local service="$1"
  railway deployment list \
    --service "$service" \
    --environment "$TARGET_ENVIRONMENT" \
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
  local confirmations=0

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
      confirmations=$((confirmations + 1))
      if [ "$confirmations" -ge "$STABLE_CONFIRMATIONS" ]; then
        echo "$service: deploy concluído"
        return 0
      fi
      echo "$service: SUCCESS ($confirmations/$STABLE_CONFIRMATIONS)"
    else
      confirmations=0
      echo "$service: $status"
    fi
    sleep "$POLL_INTERVAL_SECONDS"
  done

  echo "::error::$service não estabilizou dentro do tempo limite"
  return 1
}

# O `preDeployCommand` fica declarado em `deploy/api/railway.json`, e a Railway só o lê quando o
# ponteiro "Config as code" do serviço aponta para esse arquivo. Sem esta asserção o pipeline passa
# verde com o banco atrasado — foi assim que seis migrations ficaram sem aplicar em staging.
assert_migrations_applied() {
  local service="$1"
  local url status body

  url="$(railway domain --service "$service" --environment "$TARGET_ENVIRONMENT" --json 2>/dev/null \
    | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin)["domains"][0])
except Exception:
    print("")')"
  if [ -z "$url" ]; then
    echo "::error::$service não tem domínio público: readiness das migrations não pôde ser checada"
    return 1
  fi

  body="$(curl --silent --show-error --max-time 30 "$url/health/ready" || true)"
  status="$(printf '%s' "$body" | python3 -c 'import json,sys
try:
    print(json.load(sys.stdin)["dependencies"].get("migrations", "ausente"))
except Exception:
    print("ilegivel")')"

  if [ "$status" != up ]; then
    echo "::error::$service subiu com migrations pendentes (readiness: $status)."
    echo "::error::Confira o ponteiro Config as code do serviço para deploy/$service/railway.json."
    return 1
  fi
  echo "$service: migrations aplicadas"
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

# `railway deployment list` não aceita `--project` e project tokens não têm permissão
# para `railway link`. Escrevemos o vínculo manualmente no config global.
readonly ENV_ID="$(railway environment list --json \
  | python3 -c "import json,sys; envs=json.load(sys.stdin)['environments']; print(next(e['id'] for e in envs if e['name']=='$TARGET_ENVIRONMENT'))")"
mkdir -p ~/.railway
jq -n \
  --arg project "$RAILWAY_PROJECT_ID" \
  --arg environment "$ENV_ID" \
  --arg environmentName "$TARGET_ENVIRONMENT" \
  '{"projects": {($ENV.PWD): {"projectPath": $ENV.PWD, "project": $project, "environment": $environment, "environmentName": $environmentName}}}' \
  > ~/.railway/config.json

case "$1" in
  deploy) deploy "$2" ;;
  has-succeeded) has_succeeded "$2" ;;
  assert-migrations) assert_migrations_applied "$2" ;;
  *) usage ;;
esac

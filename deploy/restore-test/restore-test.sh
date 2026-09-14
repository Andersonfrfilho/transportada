#!/usr/bin/env bash
# Copyright (c) 2026 Ada Technology. MIT License.
#
# Teste mensal de restore das cópias de production.
#
# Backup que nunca voltou é arquivo, não backup. Uma vez por mês o ciclo mais recente do manifesto é
# restaurado num Postgres efêmero **dentro deste contêiner** e conferido contra o manifesto.
#
# Roda **dentro do Railway**, como o `deploy/staging-refresh/`, e não num runner do GitHub: o dump
# descriptografado tem dados pessoais e fiscais de terceiros, e num runner hospedado ele atravessaria
# infraestrutura que não é nossa. Aqui o dado decifrado nasce e morre no disco efêmero do contêiner,
# e o Postgres que o recebe não abre porta nenhuma — nem banco de production nem o de staging são
# tocados.
#
# `-E` pelo mesmo motivo do backup: sem ele o trap de ERR não é herdado pelas funções, e a falha não
# escreve o `step` nem avisa o monitor.
set -Eeuo pipefail

readonly REQUIRED_VARIABLES=(
  # De qual ambiente é a cópia. O bucket de ops guarda o prefixo de cada um; vazio colapsaria o
  # caminho para `db-backups//manifest.jsonl`.
  BACKUP_ENVIRONMENT
  BACKUP_ENCRYPTION_KEY
  BACKUP_S3_ENDPOINT
  BACKUP_S3_BUCKET
  BACKUP_S3_REGION
  BACKUP_S3_ACCESS_KEY_ID
  BACKUP_S3_SECRET_ACCESS_KEY
  # Ao contrário do backup, obrigatórias: restore que não avisa ninguém não vale como teste.
  RESTORE_HEARTBEAT_URL
  RESTORE_HEARTBEAT_TOKEN
)
# Nenhuma destas tem razão de existir aqui: o alvo é o Postgres que o próprio script sobe. Presente,
# qualquer uma é um caminho até banco vivo que a próxima edição pode acabar usando.
readonly REAL_DATABASE_VARIABLES=(
  DATABASE_URL
  APP_DATABASE_URL
  KEYCLOAK_DATABASE_URL
  STAGING_DATABASE_URL
  PGHOST
  PGHOSTADDR
  PGSERVICE
)
# Uma consulta por banco que só responde com linha se o restore trouxe o conteúdo, não só o schema.
declare -rA SANITY_TABLES=([app]=companies [keycloak]=realm)

CURRENT_STEP=boot
WORK_DIRECTORY=''
DATA_DIRECTORY=''
SOCKET_DIRECTORY=''
CYCLE_STAMP=''
CYCLE_PATH=''

log() {
  printf '{"level":"%s","event":"%s","at":"%s","service":"restore-test"%s}\n' \
    "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${3-}"
}

require_variables() {
  local missing=() name
  for name in "${REQUIRED_VARIABLES[@]}"; do
    [ -n "${!name:-}" ] || missing+=("$name")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    log error restore_test_configuration_missing ",\"variables\":\"${missing[*]}\""
    return 1
  fi
}

# Quem responde "que ambiente é este" é o `RAILWAY_ENVIRONMENT_NAME`, injetado pela plataforma — o
# mesmo raciocínio da guarda do `staging-refresh`: o DNS privado tem o mesmo nome nos dois ambientes.
refuse_non_production_environment() {
  local environment="${RAILWAY_ENVIRONMENT_NAME:-}"
  if [ "$environment" != production ]; then
    log error restore_test_wrong_environment ",\"environment\":\"${environment:-unknown}\""
    return 1
  fi
}

refuse_real_database_credentials() {
  local present=() name
  for name in "${REAL_DATABASE_VARIABLES[@]}"; do
    [ -z "${!name:-}" ] || present+=("$name")
  done
  if [ "${#present[@]}" -gt 0 ]; then
    log error restore_test_real_database_reachable ",\"variables\":\"${present[*]}\""
    return 1
  fi
}

# Só socket Unix, num diretório deste processo: sem porta TCP não há como outra coisa falar com este
# banco, nem este banco ser confundido com outro.
start_ephemeral_postgres() {
  DATA_DIRECTORY="${WORK_DIRECTORY}/data"
  SOCKET_DIRECTORY="${WORK_DIRECTORY}/socket"
  mkdir -p "$SOCKET_DIRECTORY"
  initdb --pgdata="$DATA_DIRECTORY" --username=postgres --auth=trust \
    --encoding=UTF8 --no-locale >/dev/null
  pg_ctl --pgdata="$DATA_DIRECTORY" --log="${WORK_DIRECTORY}/postgres.log" --wait --silent \
    --options="-c listen_addresses='' -c unix_socket_directories='${SOCKET_DIRECTORY}'" start
  log info restore_test_postgres_started ''
}

query() {
  psql --host="$SOCKET_DIRECTORY" --username=postgres --dbname="$1" \
    --tuples-only --no-align --quiet --set ON_ERROR_STOP=1 --command "$2"
}

# Mesmo desenho do backup: a credencial entra por stdin, porque em argv ela apareceria em qualquer
# `ps` do contêiner.
backup_object() {
  printf 'user = "%s:%s"\n' "$BACKUP_S3_ACCESS_KEY_ID" "$BACKUP_S3_SECRET_ACCESS_KEY" \
    | curl --config - --silent --show-error --fail --max-time 900 \
      --aws-sigv4 "aws:amz:${BACKUP_S3_REGION}:s3" \
      --output "$2" "${BACKUP_S3_ENDPOINT%/}/${BACKUP_S3_BUCKET}/$1"
}

# O ciclo sai da última linha do manifesto, não do objeto mais novo do bucket: um ciclo que morreu
# entre o upload da aplicação e o do Keycloak deixa `.enc` órfão e nenhuma linha, e restaurar esse
# órfão diria "verde" sobre um backup pela metade.
download_cycle() {
  local manifest="${WORK_DIRECTORY}/manifest.jsonl" lines line key
  backup_object "db-backups/${BACKUP_ENVIRONMENT}/manifest.jsonl" "$manifest"

  CYCLE_STAMP="$(tail -n 1 "$manifest" | jq -r .stamp)"
  CYCLE_PATH="${WORK_DIRECTORY}/cycle.jsonl"
  jq -c --arg stamp "$CYCLE_STAMP" 'select(.stamp == $stamp)' "$manifest" >"$CYCLE_PATH"
  lines="$(wc -l <"$CYCLE_PATH" | tr -d ' ')"
  if [ "$lines" -eq 2 ]; then :; else
    log error restore_test_incomplete_cycle ",\"stamp\":\"${CYCLE_STAMP}\",\"lines\":${lines}"
    return 1
  fi

  while IFS= read -r line <&3; do
    key="$(jq -r .object <<<"$line")"
    backup_object "$key" "${WORK_DIRECTORY}/$(basename "$key")"
  done 3<"$CYCLE_PATH"
  log info restore_test_cycle_downloaded ",\"stamp\":\"${CYCLE_STAMP}\""
}

restore_database() {
  local line="$1" name file plain database
  name="$(jq -r .database <<<"$line")"
  # O nome vira identificador de SQL: só o que o backup escreve passa daqui.
  if [ -z "${SANITY_TABLES[$name]:-}" ]; then
    log error restore_test_unknown_database ",\"database\":\"${name}\""
    return 1
  fi
  file="${WORK_DIRECTORY}/$(basename "$(jq -r .object <<<"$line")")"
  CURRENT_STEP="restore_${name}"

  printf '%s  %s\n' "$(jq -r .sha256 <<<"$line")" "$file" >"${file}.sha256"
  sha256sum -c "${file}.sha256" >/dev/null

  plain="${file%.enc}"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -pass env:BACKUP_ENCRYPTION_KEY -in "$file" -out "$plain"
  rm -f "$file"

  database="restore_${name}"
  query postgres "create database ${database}" >/dev/null
  # O stderr fica no disco efêmero: o erro de COPY cita a linha que falhou, com o conteúdo dela.
  if pg_restore --exit-on-error --no-owner --no-privileges \
    --host="$SOCKET_DIRECTORY" --username=postgres --dbname="$database" \
    "$plain" 2>"${WORK_DIRECTORY}/pg_restore.err"; then :; else
    log error restore_test_pg_restore_failed ",\"database\":\"${name}\""
    return 1
  fi
  rm -f "$plain"

  compare_with_manifest "$line" "$name"
  check_sanity "$name"
}

count_tables() {
  query "$1" "select count(*) from information_schema.tables
    where table_schema not in ('pg_catalog', 'information_schema') and table_type = 'BASE TABLE'"
}

last_migration() {
  if [ "$(query "$1" "select to_regclass('drizzle.__drizzle_migrations') is not null")" != t ]; then
    return 0
  fi
  query "$1" "select coalesce(max(name), '') from drizzle.__drizzle_migrations"
}

compare_with_manifest() {
  local line="$1" name="$2" tables migration expected_tables expected_migration
  tables="$(count_tables "restore_${name}")"
  migration="$(last_migration "restore_${name}")"
  expected_tables="$(jq -r .tableCount <<<"$line")"
  expected_migration="$(jq -r .lastMigration <<<"$line")"

  if [ "$tables" != "$expected_tables" ] || [ "$migration" != "$expected_migration" ]; then
    log error restore_test_manifest_mismatch \
      ",\"database\":\"${name}\",\"tables\":${tables},\"expectedTables\":${expected_tables},\"lastMigration\":\"${migration}\",\"expectedLastMigration\":\"${expected_migration}\""
    return 1
  fi
  log info restore_test_manifest_matched \
    ",\"database\":\"${name}\",\"tables\":${tables},\"lastMigration\":\"${migration}\""
}

check_sanity() {
  local name="$1" table="${SANITY_TABLES[$1]}" rows
  rows="$(query "restore_${name}" "select count(*) from ${table}")"
  if [ "$rows" -gt 0 ]; then :; else
    log error restore_test_sanity_empty ",\"database\":\"${name}\",\"table\":\"${table}\""
    return 1
  fi
  log info restore_test_sanity_passed ",\"database\":\"${name}\",\"table\":\"${table}\",\"rows\":${rows}"
}

restore_cycle() {
  local line
  while IFS= read -r line <&3; do
    restore_database "$line"
  done 3<"$CYCLE_PATH"
}

# O token vai por stdin pelo mesmo motivo da credencial do bucket. `--fail` porque sem ele o 502 da
# borda sai com código 0 e o push some sem rastro; `--retry` porque essa recusa é intermitente.
push_heartbeat() {
  printf 'header = "Authorization: Bearer %s"\n' "$RESTORE_HEARTBEAT_TOKEN" \
    | curl --config - --silent --show-error --fail --retry 3 --retry-all-errors --max-time 30 \
      --output /dev/null --request POST "${RESTORE_HEARTBEAT_URL}?success=$1"
}

run_cycle() {
  CURRENT_STEP=validate
  require_variables
  refuse_non_production_environment
  refuse_real_database_credentials

  WORK_DIRECTORY="$(mktemp -d)"
  CURRENT_STEP=download_cycle
  download_cycle
  CURRENT_STEP=start_postgres
  start_ephemeral_postgres
  restore_cycle

  CURRENT_STEP=heartbeat
  log info restore_test_completed ",\"stamp\":\"${CYCLE_STAMP}\""
  push_heartbeat true
}

discard_workspace() {
  if [ -n "$DATA_DIRECTORY" ] && [ -d "$DATA_DIRECTORY" ]; then
    pg_ctl --pgdata="$DATA_DIRECTORY" --mode=immediate --silent stop >/dev/null 2>&1 || true
  fi
  if [ -n "$WORK_DIRECTORY" ]; then
    rm -rf "$WORK_DIRECTORY"
  fi
}

# A ausência do ping não serve de alerta aqui: a janela é de 32 dias, e o Gatus só avalia heartbeat
# no tique do intervalo contado a partir do start do processo dele. Quem falha avisa na hora.
report_failure() {
  trap - ERR
  # Com `-E` o trap também dispara dentro de `$(…)`: ali só se sai, e quem reporta é o processo
  # principal, quando a substituição volta com erro — senão a mesma falha vira dois pushes.
  if [ "$BASH_SUBSHELL" -gt 0 ]; then
    exit 1
  fi
  log error restore_test_failed ",\"step\":\"${CURRENT_STEP}\",\"line\":$1"
  if [ -z "${RESTORE_HEARTBEAT_URL:-}" ] || [ -z "${RESTORE_HEARTBEAT_TOKEN:-}" ]; then
    log warn restore_test_failure_not_reported ''
    exit 1
  fi
  push_heartbeat false || log warn restore_test_failure_push_refused ''
  exit 1
}

trap discard_workspace EXIT
trap 'report_failure $LINENO' ERR

run_cycle "$@"

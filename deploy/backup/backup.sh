#!/usr/bin/env bash
# Copyright (c) 2026 Ada Technology. MIT License.
#
# Ciclo one-shot de backup: dumpa os dois bancos pela rede interna do Railway, cifra, guarda no
# bucket do projeto de ops e só então ping no heartbeat. Um passo que falha derruba o ciclo antes
# do ping — é a ausência do ping que vira alerta.
#
# `-E` não é enfeite: sem ele o trap de ERR não é herdado pelas funções, o ciclo morre calado e o
# `step` que o runbook manda ler nunca é escrito.
set -Eeuo pipefail

readonly OBJECT_ROOT='db-backups'
readonly STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
readonly REQUIRED_VARIABLES=(
  APP_DATABASE_URL
  KEYCLOAK_DATABASE_URL
  BACKUP_ENVIRONMENT
  BACKUP_ENCRYPTION_KEY
  BACKUP_S3_ENDPOINT
  BACKUP_S3_BUCKET
  BACKUP_S3_REGION
  BACKUP_S3_ACCESS_KEY_ID
  BACKUP_S3_SECRET_ACCESS_KEY
)

CURRENT_STEP=boot
RETENTION=daily
WORK_DIRECTORY=''
# Só depois da validação: o bucket de ops serve os dois ambientes, e um prefixo montado sobre
# `BACKUP_ENVIRONMENT` vazio juntaria staging e production no mesmo manifesto.
OBJECT_PREFIX=''
MANIFEST_KEY=''

log() {
  printf '{"level":"%s","event":"%s","at":"%s","service":"backup"%s}\n' \
    "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${3-}"
}

require_variables() {
  local missing=() name
  for name in "${REQUIRED_VARIABLES[@]}"; do
    [ -n "${!name:-}" ] || missing+=("$name")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    log error backup_configuration_missing ",\"variables\":\"${missing[*]}\""
    return 1
  fi
}

retention_for_today() {
  if [ "$(date -u +%u)" = 7 ]; then printf weekly; else printf daily; fi
}

query() {
  psql "$1" --tuples-only --no-align --quiet --command "$2"
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

dump_path_for() {
  printf '%s/backup-%s-%s.dump' "$WORK_DIRECTORY" "$STAMP" "$1"
}

object_key_for() {
  printf '%s/%s/backup-%s-%s.dump.enc' "$OBJECT_PREFIX" "$RETENTION" "$STAMP" "$1"
}

record_manifest_line() {
  local name="$1" database_url="$2"
  local encrypted_path
  encrypted_path="$(dump_path_for "$name").enc"

  printf '{"stamp":"%s","database":"%s","object":"%s","retention":"%s","sizeBytes":%s,"sha256":"%s","tableCount":%s,"lastMigration":"%s"}\n' \
    "$STAMP" "$name" "$(object_key_for "$name")" "$RETENTION" \
    "$(wc -c <"$encrypted_path" | tr -d ' ')" "$(file_digest "$encrypted_path")" \
    "$(count_tables "$database_url")" "$(last_migration "$database_url")" \
    >>"${WORK_DIRECTORY}/lines.jsonl"
}

backup_database() {
  local name="$1" database_url="$2"
  local dump_path object_key
  dump_path="$(dump_path_for "$name")"
  object_key="$(object_key_for "$name")"

  log info backup_dump_started ",\"database\":\"${name}\""
  pg_dump "$database_url" --format=custom --no-owner --file="$dump_path"
  # Um dump truncado ainda é um arquivo: só o índice lido de volta prova que ele restaura.
  pg_restore --list "$dump_path" >/dev/null

  openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt \
    -pass env:BACKUP_ENCRYPTION_KEY -in "$dump_path" -out "${dump_path}.enc"
  rm -f "$dump_path"
  write_digest_file "${dump_path}.enc"

  put_object "${dump_path}.enc" "$object_key"
  put_object "${dump_path}.enc.sha256" "${object_key}.sha256"
  record_manifest_line "$name" "$database_url"
  log info backup_dump_completed ",\"database\":\"${name}\",\"object\":\"${object_key}\""
}

file_digest() {
  sha256sum "$1" | cut -d' ' -f1
}

# O `.sha256` guarda o nome curto para `sha256sum -c` funcionar de onde o arquivo for baixado.
write_digest_file() {
  local path="$1"
  (cd "$(dirname "$path")" && sha256sum "$(basename "$path")") >"${path}.sha256"
}

# A credencial entra por stdin: em argv ela apareceria em qualquer `ps` do contêiner.
aws_curl() {
  printf 'user = "%s:%s"\n' "$BACKUP_S3_ACCESS_KEY_ID" "$BACKUP_S3_SECRET_ACCESS_KEY" \
    | curl --config - --silent --show-error --fail --max-time 900 \
      --aws-sigv4 "aws:amz:${BACKUP_S3_REGION}:s3" "$@"
}

object_url() {
  printf '%s/%s/%s' "${BACKUP_S3_ENDPOINT%/}" "$BACKUP_S3_BUCKET" "$1"
}

put_object() {
  aws_curl --upload-file "$1" --output /dev/null "$(object_url "$2")"
}

delete_object() {
  aws_curl --request DELETE --output /dev/null "$(object_url "$1")"
}

# Objeto ainda inexistente é o primeiro ciclo do bucket, não erro: o manifesto começa vazio.
get_object() {
  aws_curl --output - "$(object_url "$1")" 2>/dev/null || true
}

# Sem paginação de propósito: a retenção mantém ~120 objetos por prefixo, longe do teto de 1000.
list_keys() {
  aws_curl --get --data-urlencode 'list-type=2' --data-urlencode "prefix=$1" \
    "$(object_url '')" \
    | grep -o '<Key>[^<]*</Key>' | sed 's/<[^>]*>//g' || true
}

append_manifest() {
  local manifest_path="${WORK_DIRECTORY}/manifest.jsonl"
  get_object "$MANIFEST_KEY" >"$manifest_path"
  cat "${WORK_DIRECTORY}/lines.jsonl" >>"$manifest_path"
  put_object "$manifest_path" "$MANIFEST_KEY"
}

# Busybox não faz aritmética de data e a imagem é alpine: o corte vem do Postgres já conectado.
cutoff_day() {
  query "$APP_DATABASE_URL" \
    "select to_char((now() at time zone 'utc') - make_interval(days => $1), 'YYYY-MM-DD')"
}

sweep_retention() {
  local folder="$1" cutoff key day
  cutoff="$(cutoff_day "$2")"
  for key in $(list_keys "${OBJECT_PREFIX}/${folder}/"); do
    day="${key##*/backup-}"
    if [[ "${day:0:10}" < "$cutoff" ]]; then
      delete_object "$key"
      log info backup_object_expired ",\"key\":\"${key}\""
    fi
  done
}

# O monitor é um external endpoint do Gatus (ADR-0025): `POST ...?success=true` com o token em
# `Authorization: Bearer`. A URL diz qual monitor é, o token autoriza escrever nele — faltando um
# dos dois não há ping, e o alerta que sobra é a janela vencida, não um ciclo dado como perdido.
push_heartbeat() {
  if [ -z "${BACKUP_HEARTBEAT_URL:-}" ] || [ -z "${BACKUP_HEARTBEAT_TOKEN:-}" ]; then
    log warn backup_heartbeat_disabled
    return 0
  fi
  curl --silent --show-error --fail --max-time 15 --output /dev/null --request POST \
    --header "Authorization: Bearer ${BACKUP_HEARTBEAT_TOKEN}" \
    "${BACKUP_HEARTBEAT_URL}?success=true"
}

run_cycle() {
  CURRENT_STEP=validate
  require_variables
  OBJECT_PREFIX="${OBJECT_ROOT}/${BACKUP_ENVIRONMENT}"
  MANIFEST_KEY="${OBJECT_PREFIX}/manifest.jsonl"
  RETENTION="$(retention_for_today)"
  WORK_DIRECTORY="$(mktemp -d)"
  : >"${WORK_DIRECTORY}/lines.jsonl"

  CURRENT_STEP=dump_app
  backup_database app "$APP_DATABASE_URL"
  CURRENT_STEP=dump_keycloak
  backup_database keycloak "$KEYCLOAK_DATABASE_URL"

  CURRENT_STEP=manifest
  append_manifest
  CURRENT_STEP=retention
  sweep_retention daily "${BACKUP_RETENTION_DAILY_DAYS:-30}"
  sweep_retention weekly "${BACKUP_RETENTION_WEEKLY_DAYS:-90}"

  log info backup_cycle_completed ",\"stamp\":\"${STAMP}\",\"retention\":\"${RETENTION}\""
  CURRENT_STEP=heartbeat
  push_heartbeat
}

# Dump em claro num disco que sobrevive ao processo é vazamento: a limpeza não é zelo, é requisito.
discard_workspace() {
  [ -n "$WORK_DIRECTORY" ] && rm -rf "$WORK_DIRECTORY"
}

report_failure() {
  log error backup_cycle_failed ",\"step\":\"${CURRENT_STEP}\",\"line\":$1"
  exit 1
}

trap discard_workspace EXIT
trap 'report_failure $LINENO' ERR

run_cycle

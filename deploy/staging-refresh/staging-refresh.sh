#!/usr/bin/env bash
# Copyright (c) 2026 Ada Technology. MIT License.
#
# Espelha a base de produção em staging, uma vez por semana.
#
# Staging aponta para o ambiente de **homologação** da SEFAZ, e homologação não devolve nota real:
# a distribuição roda, responde, e traz nada. Sem massa, o que se testa em staging é tela vazia.
#
# Roda **dentro do Railway**, como o `deploy/backup/`, e não num runner do GitHub: o dump
# descriptografado e os XML fiscais são dados pessoais de terceiros, e num runner hospedado eles
# atravessariam infraestrutura que não é nossa. Aqui o dado não sai do perímetro, a conexão com o
# Postgres é pela rede interna, e não há teto de disco de runner para a base inteira.
#
# `-E` pelo mesmo motivo do backup: sem ele o trap de ERR não é herdado pelas funções, o ciclo morre
# calado e o `step` que o runbook manda ler nunca é escrito.
set -Eeuo pipefail

readonly REQUIRED_VARIABLES=(
  # Alvo, e o host que ele nunca pode ser.
  STAGING_DATABASE_URL
  PRODUCTION_DATABASE_HOST
  # Origem: o ciclo de backup cifrado de produção, no bucket de ops.
  SOURCE_BACKUP_ENVIRONMENT
  APPLICATION_DATABASE_NAME
  BACKUP_ENCRYPTION_KEY
  BACKUP_S3_ENDPOINT
  BACKUP_S3_BUCKET
  BACKUP_S3_REGION
  BACKUP_S3_ACCESS_KEY_ID
  BACKUP_S3_SECRET_ACCESS_KEY
  # Bucket fiscal: produção lê, staging escreve, credencial própria de cada lado.
  FISCAL_SOURCE_S3_ENDPOINT
  FISCAL_SOURCE_S3_BUCKET
  FISCAL_SOURCE_S3_REGION
  FISCAL_SOURCE_S3_ACCESS_KEY_ID
  FISCAL_SOURCE_S3_SECRET_ACCESS_KEY
  STAGING_S3_ENDPOINT
  STAGING_S3_BUCKET
  STAGING_S3_REGION
  STAGING_S3_ACCESS_KEY_ID
  STAGING_S3_SECRET_ACCESS_KEY
)

CURRENT_STEP=boot
WORK_DIRECTORY=''

log() {
  printf '{"level":"%s","event":"%s","at":"%s","service":"staging-refresh"%s}\n' \
    "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${3-}"
}

on_error() {
  log error staging_refresh_failed ",\"step\":\"${CURRENT_STEP}\""
}
trap on_error ERR

cleanup() {
  [ -n "$WORK_DIRECTORY" ] && rm -rf "$WORK_DIRECTORY"
}
trap cleanup EXIT

require_variables() {
  local missing=() name
  for name in "${REQUIRED_VARIABLES[@]}"; do
    [ -n "${!name:-}" ] || missing+=("$name")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    log error staging_refresh_configuration_missing ",\"variables\":\"${missing[*]}\""
    exit 1
  fi
}

# A guarda vem antes de tudo, inclusive do download. É a imagem espelhada da do `restore-test.yml`:
# aquele recusa qualquer alvo que **não** seja o Postgres efêmero; este recusa qualquer alvo que
# **seja** produção. Alvo errado descoberto depois do `pg_restore --clean` é tarde — os objetos já
# caíram.
refuse_production_target() {
  local host="${STAGING_DATABASE_URL#*@}"
  host="${host%%:*}"
  host="${host%%/*}"
  if [ "$host" = "$PRODUCTION_DATABASE_HOST" ]; then
    log error staging_refresh_target_is_production ",\"host\":\"${host}\""
    exit 1
  fi
  log info staging_refresh_target_confirmed ",\"host\":\"${host}\""
}

# Mesmo desenho do backup: a credencial entra por stdin, porque em argv ela apareceria em qualquer
# `ps` do contêiner.
s3_curl() {
  local access="$1" secret="$2" region="$3"
  shift 3
  printf 'user = "%s:%s"\n' "$access" "$secret" \
    | curl --config - --silent --show-error --fail --max-time 900 \
      --aws-sigv4 "aws:amz:${region}:s3" "$@"
}

backup_object() {
  s3_curl "$BACKUP_S3_ACCESS_KEY_ID" "$BACKUP_S3_SECRET_ACCESS_KEY" "$BACKUP_S3_REGION" \
    --output "$2" "${BACKUP_S3_ENDPOINT%/}/${BACKUP_S3_BUCKET}/$1"
}

# Lista com paginação: ao contrário do backup, que mantém ~120 objetos por prefixo, o bucket fiscal
# cresce sem teto — parar nos primeiros 1000 deixaria staging sem os XML mais antigos e sem dizer.
list_bucket_keys() {
  local endpoint="$1" bucket="$2" region="$3" access="$4" secret="$5"
  local token='' page
  while :; do
    if [ -z "$token" ]; then
      page="$(s3_curl "$access" "$secret" "$region" --get \
        --data-urlencode 'list-type=2' --data-urlencode 'max-keys=1000' \
        "${endpoint%/}/${bucket}")"
    else
      page="$(s3_curl "$access" "$secret" "$region" --get \
        --data-urlencode 'list-type=2' --data-urlencode 'max-keys=1000' \
        --data-urlencode "continuation-token=${token}" "${endpoint%/}/${bucket}")"
    fi
    printf '%s' "$page" | grep -o '<Key>[^<]*</Key>' | sed 's/<[^>]*>//g' || true
    printf '%s' "$page" | grep -q '<IsTruncated>true</IsTruncated>' || break
    token="$(printf '%s' "$page" | grep -o '<NextContinuationToken>[^<]*</NextContinuationToken>' \
      | sed 's/<[^>]*>//g')"
    [ -n "$token" ] || break
  done
}

# O bucket vem **antes** do banco. A ordem importa: o banco referencia `bucket`/`key`, e linha sem
# objeto é documento fiscal que não existe (mesma razão do `bucket-mirror.yml`). Copiar objeto que
# ainda não tem linha é inofensivo; o contrário, não.
mirror_fiscal_bucket() {
  local source_keys="${WORK_DIRECTORY}/source.keys"
  local target_keys="${WORK_DIRECTORY}/target.keys"
  local missing_keys="${WORK_DIRECTORY}/missing.keys"

  list_bucket_keys "$FISCAL_SOURCE_S3_ENDPOINT" "$FISCAL_SOURCE_S3_BUCKET" \
    "$FISCAL_SOURCE_S3_REGION" "$FISCAL_SOURCE_S3_ACCESS_KEY_ID" \
    "$FISCAL_SOURCE_S3_SECRET_ACCESS_KEY" | sort >"$source_keys"
  list_bucket_keys "$STAGING_S3_ENDPOINT" "$STAGING_S3_BUCKET" \
    "$STAGING_S3_REGION" "$STAGING_S3_ACCESS_KEY_ID" \
    "$STAGING_S3_SECRET_ACCESS_KEY" | sort >"$target_keys"
  comm -23 "$source_keys" "$target_keys" >"$missing_keys"

  local total copied=0 key body
  total="$(wc -l <"$missing_keys" | tr -d ' ')"
  log info staging_refresh_bucket_diff ",\"missing\":${total}"

  body="${WORK_DIRECTORY}/object.bin"
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    s3_curl "$FISCAL_SOURCE_S3_ACCESS_KEY_ID" "$FISCAL_SOURCE_S3_SECRET_ACCESS_KEY" \
      "$FISCAL_SOURCE_S3_REGION" --output "$body" \
      "${FISCAL_SOURCE_S3_ENDPOINT%/}/${FISCAL_SOURCE_S3_BUCKET}/${key}"
    s3_curl "$STAGING_S3_ACCESS_KEY_ID" "$STAGING_S3_SECRET_ACCESS_KEY" \
      "$STAGING_S3_REGION" --upload-file "$body" --output /dev/null \
      "${STAGING_S3_ENDPOINT%/}/${STAGING_S3_BUCKET}/${key}"
    copied=$((copied + 1))
  done <"$missing_keys"
  rm -f "$body"
  log info staging_refresh_bucket_mirrored ",\"copied\":${copied}"
}

# O ciclo sai da última linha do manifesto, não do objeto mais novo do bucket: ciclo que morreu
# entre o upload da aplicação e o do Keycloak deixa `.enc` órfão, e restaurar o órfão copiaria um
# banco pela metade para staging.
download_production_cycle() {
  local manifest="${WORK_DIRECTORY}/manifest.jsonl"
  backup_object "db-backups/${SOURCE_BACKUP_ENVIRONMENT}/manifest.jsonl" "$manifest"

  local stamp cycle lines
  stamp="$(tail -n 1 "$manifest" | sed 's/.*"stamp":"\([^"]*\)".*/\1/')"
  cycle="${WORK_DIRECTORY}/cycle.jsonl"
  grep -F "\"stamp\":\"${stamp}\"" "$manifest" >"$cycle"
  lines="$(wc -l <"$cycle" | tr -d ' ')"
  if [ "$lines" -ne 2 ]; then
    log error staging_refresh_incomplete_cycle ",\"stamp\":\"${stamp}\",\"lines\":${lines}"
    exit 1
  fi

  # **Só o banco da aplicação atravessa.** O do Keycloak fica onde está: o realm de staging tem os
  # próprios `redirect_uri`, client secret e usuários, todos apontando para o domínio de staging.
  # Restaurar o Keycloak de produção por cima trocaria isso pelos de produção e derrubaria o login
  # de staging inteiro — massa de nota não vale o ambiente.
  local line
  line="$(grep -F "\"database\":\"${APPLICATION_DATABASE_NAME}\"" "$cycle" || true)"
  if [ -z "$line" ]; then
    log error staging_refresh_application_line_missing ",\"stamp\":\"${stamp}\""
    exit 1
  fi

  CYCLE_STAMP="$stamp"
  CYCLE_OBJECT="$(printf '%s' "$line" | sed 's/.*"object":"\([^"]*\)".*/\1/')"
  CYCLE_SHA256="$(printf '%s' "$line" | sed 's/.*"sha256":"\([^"]*\)".*/\1/')"
  DUMP_PATH="${WORK_DIRECTORY}/$(basename "$CYCLE_OBJECT")"
  backup_object "$CYCLE_OBJECT" "$DUMP_PATH"
  log info staging_refresh_cycle_downloaded ",\"stamp\":\"${stamp}\",\"database\":\"${APPLICATION_DATABASE_NAME}\""
}

restore_over_staging() {
  echo "${CYCLE_SHA256}  $(basename "$DUMP_PATH")" >"${DUMP_PATH}.sha256"
  (cd "$(dirname "$DUMP_PATH")" && sha256sum -c "$(basename "$DUMP_PATH").sha256" >/dev/null)

  local plain="${DUMP_PATH%.enc}"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -pass env:BACKUP_ENCRYPTION_KEY -in "$DUMP_PATH" -out "$plain"

  # `--clean --if-exists` em vez de derrubar e recriar o banco: o Railway não entrega conexão de
  # manutenção, e `drop database` exigiria desconectar a app de staging inteira primeiro. O
  # `--clean` derruba objeto a objeto, e o que sobrou de um schema antigo sai junto.
  pg_restore --dbname "$STAGING_DATABASE_URL" --clean --if-exists --no-owner --no-privileges \
    <"$plain"
  rm -f "$plain"
  log info staging_refresh_restored ",\"stamp\":\"${CYCLE_STAMP}\""
}

# `stored_objects.bucket` guarda o nome do bucket de **quem escreveu** (a app resolve o dela por
# `OBJECT_STORAGE_BUCKET`, `main.ts:resolveStorageBucket`). Sem esta reescrita toda linha restaurada
# aponta para o bucket de produção, que a credencial de staging não lê — e cada documento fiscal
# viraria um 404 silencioso, com o objeto ali do lado no bucket certo.
repoint_stored_objects() {
  local updated
  updated="$(psql "$STAGING_DATABASE_URL" --tuples-only --no-align --quiet -c \
    "with changed as (
       update stored_objects set bucket = '${STAGING_S3_BUCKET}'
       where bucket <> '${STAGING_S3_BUCKET}' returning 1
     ) select count(*) from changed")"
  log info staging_refresh_objects_repointed ",\"rows\":${updated},\"bucket\":\"${STAGING_S3_BUCKET}\""
}

# Staging quase sempre está **à frente** de produção — é onde a branch publica primeiro. O dump
# acabou de puxar o schema para trás, e a app de staging, que espera o schema novo, quebraria em
# toda rota que usa coluna que ainda não existe.
#
# Quem migra é a própria API, no `preDeployCommand` (ver `.github/workflows/deploy.yml`) — por isso
# aqui não há bun nem código de aplicação: o passo é **disparar o redeploy** e deixar a máquina que
# já existe fazer o resto. Sem isto o refresh derruba staging toda semana.
redeploy_staging_api() {
  if [ -z "${RAILWAY_API_TOKEN:-}" ] || [ -z "${STAGING_API_SERVICE_ID:-}" ] \
    || [ -z "${STAGING_ENVIRONMENT_ID:-}" ]; then
    log error staging_refresh_redeploy_not_configured ''
    exit 1
  fi
  curl --silent --show-error --fail --max-time 60 --output /dev/null \
    --request POST 'https://backboard.railway.com/graphql/v2' \
    --header "Authorization: Bearer ${RAILWAY_API_TOKEN}" \
    --header 'Content-Type: application/json' \
    --data @- <<JSON
{"query":"mutation(\$serviceId:String!,\$environmentId:String!){serviceInstanceRedeploy(serviceId:\$serviceId,environmentId:\$environmentId)}","variables":{"serviceId":"${STAGING_API_SERVICE_ID}","environmentId":"${STAGING_ENVIRONMENT_ID}"}}
JSON
  log info staging_refresh_redeploy_requested ''
}

main() {
  CURRENT_STEP=require_variables
  require_variables
  CURRENT_STEP=refuse_production_target
  refuse_production_target

  WORK_DIRECTORY="$(mktemp -d)"

  CURRENT_STEP=mirror_bucket
  mirror_fiscal_bucket
  CURRENT_STEP=download_cycle
  download_production_cycle
  CURRENT_STEP=restore
  restore_over_staging
  CURRENT_STEP=repoint_objects
  repoint_stored_objects
  CURRENT_STEP=redeploy
  redeploy_staging_api

  CURRENT_STEP='done'
  log info staging_refresh_completed ",\"stamp\":\"${CYCLE_STAMP}\""
}

main "$@"

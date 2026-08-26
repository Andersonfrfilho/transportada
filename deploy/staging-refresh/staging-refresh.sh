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
  # Alvo. Quem prova que ele é staging é o `RAILWAY_ENVIRONMENT_NAME` injetado pela plataforma,
  # não uma variável nossa — ver `refuse_non_staging_environment`.
  STAGING_DATABASE_URL
  # Origem: o ciclo de backup cifrado de produção, no bucket de ops.
  SOURCE_BACKUP_ENVIRONMENT
  APPLICATION_DATABASE_NAME
  BACKUP_ENCRYPTION_KEY
  BACKUP_S3_ENDPOINT
  BACKUP_S3_BUCKET
  BACKUP_S3_REGION
  BACKUP_S3_ACCESS_KEY_ID
  BACKUP_S3_SECRET_ACCESS_KEY
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
# aquele recusa qualquer alvo que **não** seja o Postgres efêmero; este recusa rodar em qualquer
# ambiente que **não** seja staging. Alvo errado descoberto depois do `pg_restore --clean` é tarde —
# os objetos já caíram.
#
# Quem responde "que ambiente é este" é o `RAILWAY_ENVIRONMENT_NAME`, injetado pela plataforma. A
# primeira versão desta guarda comparava o host do banco alvo contra o de produção, e **não teria
# funcionado**: no Railway o DNS privado é `<serviço>.railway.internal` e o nome do serviço é o
# mesmo nos dois ambientes, então os dois hosts são a mesma string. Uma guarda que não distingue
# nada é pior que nenhuma, porque passa a sensação de proteção.
refuse_non_staging_environment() {
  local environment="${RAILWAY_ENVIRONMENT_NAME:-}"
  if [ -z "$environment" ]; then
    log error staging_refresh_environment_unknown ''
    exit 1
  fi
  if [ "$environment" != staging ]; then
    log error staging_refresh_wrong_environment ",\"environment\":\"${environment}\""
    exit 1
  fi
  log info staging_refresh_environment_confirmed ",\"environment\":\"${environment}\""
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

# "As notas, sem emissão alguma": o dump traz a base inteira, e o que **não** pode atravessar sai
# aqui, numa transação só. Três famílias, por três motivos diferentes:
#
# 1. **Emissão** (CT-e, MDF-e, NFS-e, faturamento). Nota que já chegou em staging com o CT-e
#    autorizado em cima não serve para testar o fluxo que emite o CT-e — o caso de teste vira o
#    estado final, não o inicial.
# 2. **Numeração fiscal** (`fiscal_sequences` e as reservas). Herdar o `next_number` de produção faria
#    staging emitir na faixa de numeração de produção. Zerado, staging numera do começo, que é o que
#    um ambiente de teste deve fazer.
# 3. **Material de assinatura.** `digital_certificates.secret_envelope` é o certificado A1 que assina
#    documento fiscal de verdade. Ele não tem o que fazer em staging: o envelope é anulado e a linha
#    fica, para o perfil fiscal da empresa não perder a referência. Sem isto, um restore cru poria o
#    certificado de produção num ambiente de teste — pior que qualquer dado pessoal que a decisão de
#    espelhar já assumiu.
#
# `nfse_provider_credentials` entra pela mesma razão do certificado: é credencial de provedor, não
# dado de nota. Os perfis de emissão (`cte_emission_profiles`, `nfse_emission_profiles`) **ficam** —
# são configuração de como emitir, e staging precisa deles para exercitar o fluxo.
strip_emission_data() {
  psql "$STAGING_DATABASE_URL" --quiet --set ON_ERROR_STOP=1 <<'SQL'
begin;

truncate table
  cte_batches, cte_batch_events, cte_batch_items, cte_batch_item_charges,
  cte_batch_item_documents, cte_fiscal_documents, cte_issuance_attempts,
  cte_issuance_diagnostics, cte_issuance_events, cte_issuance_outbox,
  cte_issuance_payloads, cte_processed_messages, cte_retry_schedules,
  cte_submission_records,
  mdfe_fiscal_documents, mdfe_issuance_attempts, mdfe_issuance_events,
  mdfe_issuance_outbox, mdfe_issuance_payloads, mdfe_manifests,
  mdfe_manifest_drivers, mdfe_manifest_items, mdfe_manifest_loading_cities,
  mdfe_processed_messages,
  nfse_fiscal_documents, nfse_issuance_attempts, nfse_issuance_events,
  nfse_issuance_outbox, nfse_issuance_payloads, nfse_processed_messages,
  nfse_service_invoices, nfse_service_invoice_charges, nfse_service_invoice_documents,
  nfse_provider_credentials,
  billing_invoices, billing_invoice_documents, billing_invoice_events, billing_invoice_items,
  fiscal_sequences, fiscal_sequence_reservations
  restart identity cascade;

-- A linha fica, o material de assinatura não: `company_fiscal_profiles` referencia o certificado, e
-- apagar a linha levaria o perfil junto no cascade.
update digital_certificates set secret_envelope = null where secret_envelope is not null;

commit;
SQL
  local notes
  notes="$(psql "$STAGING_DATABASE_URL" --tuples-only --no-align --quiet \
    -c 'select count(*) from nfe_documents')"
  log info staging_refresh_emission_stripped ",\"notes\":${notes}"
}

# Staging quase sempre está **à frente** de produção — é onde a branch publica primeiro. O dump
# acabou de puxar o schema para trás, e a app de staging, que espera o schema novo, quebraria em
# toda rota que usa coluna que ainda não existe.
#
# Quem migra é a própria API, no `preDeployCommand` (ver `.github/workflows/deploy.yml`) — por isso
# aqui não há bun nem código de aplicação: o passo é **disparar o redeploy** e deixar a máquina que
# já existe fazer o resto. Sem isto o refresh derruba staging toda semana.
redeploy_staging_api() {
  # O Railway tem dois tipos de token, e eles não se autenticam do mesmo jeito: o de conta/equipe vai
  # em `Authorization: Bearer`, o de projeto vai em `Project-Access-Token`. Mandar um no cabeçalho do
  # outro devolve 401 sem dizer por quê — daí aceitar os dois explicitamente, por variável separada.
  local authorization_header
  if [ -n "${RAILWAY_PROJECT_TOKEN:-}" ]; then
    authorization_header="Project-Access-Token: ${RAILWAY_PROJECT_TOKEN}"
  elif [ -n "${RAILWAY_API_TOKEN:-}" ]; then
    authorization_header="Authorization: Bearer ${RAILWAY_API_TOKEN}"
  else
    authorization_header=''
  fi

  if [ -z "$authorization_header" ] || [ -z "${STAGING_API_SERVICE_ID:-}" ]; then
    log error staging_refresh_redeploy_not_configured ''
    exit 1
  fi
  curl --silent --show-error --fail --max-time 60 --output /dev/null \
    --request POST 'https://backboard.railway.com/graphql/v2' \
    --header "$authorization_header" \
    --header 'Content-Type: application/json' \
    --data @- <<JSON
{"query":"mutation(\$serviceId:String!,\$environmentId:String!){serviceInstanceRedeploy(serviceId:\$serviceId,environmentId:\$environmentId)}","variables":{"serviceId":"${STAGING_API_SERVICE_ID}","environmentId":"${RAILWAY_ENVIRONMENT_ID}"}}
JSON
  log info staging_refresh_redeploy_requested ''
}

main() {
  CURRENT_STEP=require_variables
  require_variables
  CURRENT_STEP=refuse_non_staging_environment
  refuse_non_staging_environment

  WORK_DIRECTORY="$(mktemp -d)"

  CURRENT_STEP=download_cycle
  download_production_cycle
  CURRENT_STEP=restore
  restore_over_staging
  CURRENT_STEP=strip_emission
  strip_emission_data
  CURRENT_STEP=redeploy
  redeploy_staging_api

  CURRENT_STEP='done'
  log info staging_refresh_completed ",\"stamp\":\"${CYCLE_STAMP}\""
}

main "$@"

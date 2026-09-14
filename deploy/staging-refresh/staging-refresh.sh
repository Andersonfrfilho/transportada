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
  # Keycloak **de staging**: o issuer que a API de staging valida, e o client de admin que lê o
  # realm. É com eles que `rebind_staging_identities` religa os usuários depois do restore.
  KEYCLOAK_ISSUER
  KEYCLOAK_ADMIN_CLIENT_ID
  KEYCLOAK_ADMIN_CLIENT_SECRET
)

readonly REALM_PAGE_SIZE=100
# O nome que o `deploy/backup/backup.sh` grava na linha do Keycloak do manifesto.
readonly KEYCLOAK_DATABASE_NAME=keycloak
REBIND_SQL_PATH="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/rebind-identities.sql"
readonly REBIND_SQL_PATH
NEUTRALIZE_SQL_PATH="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/neutralize-external.sql"
readonly NEUTRALIZE_SQL_PATH

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

# A guarda vem antes de tudo, inclusive do download. É a imagem espelhada da do
# `deploy/restore-test/`: aquele recusa rodar fora de production e com qualquer URL de banco real no
# ambiente; este recusa rodar em qualquer ambiente que **não** seja staging. Alvo errado descoberto depois do `pg_restore --clean` é tarde —
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

  # **Só o banco da aplicação é restaurado.** O do Keycloak fica onde está: o realm de staging tem os
  # próprios `redirect_uri`, client secret e usuários, todos apontando para o domínio de staging.
  # Restaurar o Keycloak de produção por cima trocaria isso pelos de produção e derrubaria o login
  # de staging inteiro — massa de nota não vale o ambiente. O dump dele desce só para ser **lido**
  # por `extract_production_realm_users`.
  local line keycloak_line
  line="$(grep -F "\"database\":\"${APPLICATION_DATABASE_NAME}\"" "$cycle" || true)"
  keycloak_line="$(grep -F "\"database\":\"${KEYCLOAK_DATABASE_NAME}\"" "$cycle" || true)"
  if [ -z "$line" ] || [ -z "$keycloak_line" ]; then
    log error staging_refresh_application_line_missing ",\"stamp\":\"${stamp}\""
    exit 1
  fi

  CYCLE_STAMP="$stamp"
  CYCLE_OBJECT="$(printf '%s' "$line" | sed 's/.*"object":"\([^"]*\)".*/\1/')"
  CYCLE_SHA256="$(printf '%s' "$line" | sed 's/.*"sha256":"\([^"]*\)".*/\1/')"
  DUMP_PATH="${WORK_DIRECTORY}/$(basename "$CYCLE_OBJECT")"
  backup_object "$CYCLE_OBJECT" "$DUMP_PATH"

  local keycloak_object
  keycloak_object="$(printf '%s' "$keycloak_line" | sed 's/.*"object":"\([^"]*\)".*/\1/')"
  KEYCLOAK_SHA256="$(printf '%s' "$keycloak_line" | sed 's/.*"sha256":"\([^"]*\)".*/\1/')"
  KEYCLOAK_DUMP_PATH="${WORK_DIRECTORY}/$(basename "$keycloak_object")"
  backup_object "$keycloak_object" "$KEYCLOAK_DUMP_PATH"
  log info staging_refresh_cycle_downloaded ",\"stamp\":\"${stamp}\",\"database\":\"${APPLICATION_DATABASE_NAME}\""
}

# Confere o `sha256` do manifesto e decifra ao lado, sem a extensão `.enc`. Devolve o caminho claro.
decrypt_verified_dump() {
  local encrypted="$1" digest="$2" plain="${1%.enc}"
  echo "${digest}  $(basename "$encrypted")" >"${encrypted}.sha256"
  (cd "$(dirname "$encrypted")" && sha256sum -c "$(basename "$encrypted").sha256" >/dev/null)
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -pass env:BACKUP_ENCRYPTION_KEY -in "$encrypted" -out "$plain"
  printf '%s' "$plain"
}

# Lê o bloco `COPY <tabela> (...) FROM stdin` que o `pg_restore -f -` escreve e devolve, em TSV, só
# as colunas pedidas, na ordem pedida. A posição sai do cabeçalho do COPY, não de uma lista fixa:
# versão nova do Keycloak acrescenta coluna. `\N` (nulo) vira vazio.
copy_columns() {
  local table="$1"
  shift
  awk -v table="$table" -v wanted="$*" '
    BEGIN { count = split(wanted, names, " ") }
    !inside && $0 ~ ("^COPY ([^ ]+\\.)?" table " \\(") {
      header = $0
      sub(/^[^(]*\(/, "", header)
      sub(/\).*$/, "", header)
      total = split(header, columns, ", ")
      for (i = 1; i <= total; i++) position[columns[i]] = i
      inside = 1
      next
    }
    inside && $0 == "\\." { inside = 0; next }
    inside {
      split($0, fields, "\t")
      row = ""
      for (i = 1; i <= count; i++) {
        value = fields[position[names[i]]]
        if (value == "\\N") value = ""
        row = row (i > 1 ? "\t" : "") value
      }
      print row
    }'
}

# Os usuários do Keycloak de produção, para o religamento casar o realm de staging pelo username de
# produção — o subject de lá já está em `external_identities`. O dump **não é restaurado em lugar
# nenhum**: o `pg_restore -f -` só transcreve os dados de duas tabelas, e nenhuma conexão é aberta.
#
# Os dois TSV (`id, username, email, realm_id` e `id, name` do realm) são dado pessoal: moram no
# diretório de trabalho, que o `cleanup` apaga, e nunca são impressos. Qual realm é o de produção o
# SQL decide, pelo sufixo `/realms/<nome>` do issuer gravado em `external_identities`.
#
# Roda antes do restore: dump do Keycloak corrompido para o ciclo antes de staging ser tocado.
extract_production_realm_users() {
  local plain
  plain="$(decrypt_verified_dump "$KEYCLOAK_DUMP_PATH" "$KEYCLOAK_SHA256")"
  rm -f "$KEYCLOAK_DUMP_PATH"
  pg_restore --data-only --table=realm -f - "$plain" \
    | copy_columns realm id name >"${WORK_DIRECTORY}/production-realms.tsv"
  pg_restore --data-only --table=user_entity -f - "$plain" \
    | copy_columns user_entity id username email realm_id >"${WORK_DIRECTORY}/production-users.tsv"
  rm -f "$plain"
  log info staging_refresh_production_realm_read ",\"productionUsers\":$(wc -l <"${WORK_DIRECTORY}/production-users.tsv" | tr -d ' ')"
}

# Os schemas que o dump cria. A lista sai do **dump**, não de uma lista escrita aqui: os pacotes
# trazem schema próprio (`user`, `notification`, `meta_whatsapp`), o journal de migrations mora em
# `drizzle`, e pacote novo entraria no ciclo seguinte sem ninguém lembrar de acrescentá-lo.
#
# O `public` **não** aparece nela: todo banco nasce com ele, então o pg_dump não o recria — por isso
# o restore derruba o `public` por conta própria e o recria antes do pg_restore.
list_dump_schemas() {
  pg_restore --list "$1" | awk '$4 == "SCHEMA" && $5 == "-" { print $6 }' | sort -u | paste -sd ' ' -
}

# Derrubar schemas em vez do `--clean` do pg_restore. A razão é o ciclo de 04/09/2026, que não
# espelhou: **misturou**. O `--clean` só derruba o que está no dump, com `DROP TABLE` sem `CASCADE`.
# Staging está quase sempre à frente de produção, e tabela nova daqui — `trip_document_occurrences`,
# naquele dia — carrega FK para tabela que o dump conhece. A FK trava o DROP, o CREATE seguinte falha
# com "already exists", as constraints falham atrás dele, e o COPY despeja produção POR CIMA das
# linhas de staging que sobreviveram.
#
# A primeira correção derrubava só o `public`, e o ciclo de 13/09/2026 morreu com "errors ignored on
# restore: 78": os índices e as constraints de `user`, `notification` e `meta_whatsapp` já existiam.
# Agora cai todo schema que o dump traz; o que é do Postgres (`pg_*`, `information_schema`) nunca
# entra, nem se um dump estranho o listar. `drop database` continua fora: o Railway não entrega
# conexão de manutenção, e ele exigiria desconectar a app de staging antes.
restore_over_staging() {
  local plain dump_schemas schemas
  plain="$(decrypt_verified_dump "$DUMP_PATH" "$CYCLE_SHA256")"

  # Duas listas, de propósito: a do dump decide se o `public` precisa ser recriado aqui; a do drop é
  # ela mais o `public`. Uma lista só para as duas coisas deixou staging sem `public` no primeiro
  # ensaio — a condição de recriar via o `public` que o próprio script tinha acrescentado.
  dump_schemas="$(list_dump_schemas "$plain")"
  schemas="$(printf '%s\npublic\n' "${dump_schemas// /$'\n'}" | grep -v '^$' | sort -u | paste -sd ' ' -)"
  psql "$STAGING_DATABASE_URL" --quiet --set ON_ERROR_STOP=1 \
    --set schemas="$schemas" --set dump_schemas="$dump_schemas" <<'SQL'
begin;
-- O cascade avisa cada objeto que derruba, às centenas: no log do job isso enterra o que importa.
set local client_min_messages = warning;
select format('drop schema if exists %I cascade', name)
  from unnest(string_to_array(:'schemas', ' ')) as name
  where name !~ '^pg_' and name <> 'information_schema'
\gexec
select 'create schema public' where not ('public' = any(string_to_array(:'dump_schemas', ' ')))
\gexec
commit;
SQL
  log info staging_refresh_schemas_dropped ",\"schemas\":\"${schemas}\""

  pg_restore --dbname "$STAGING_DATABASE_URL" --no-owner --no-privileges <"$plain"
  rm -f "$plain"
  log info staging_refresh_restored ",\"stamp\":\"${CYCLE_STAMP}\""
}

# Mesmo desenho do `s3_curl`: o client secret entra por stdin, porque em argv ele apareceria em
# qualquer `ps` do contêiner.
keycloak_admin_token() {
  printf '%s' "$KEYCLOAK_ADMIN_CLIENT_SECRET" \
    | curl --silent --show-error --fail --max-time 60 \
      --data grant_type=client_credentials \
      --data-urlencode "client_id=${KEYCLOAK_ADMIN_CLIENT_ID}" \
      --data-urlencode client_secret@- \
      "${KEYCLOAK_ISSUER%/}/protocol/openid-connect/token" \
    | jq -r '.access_token // empty'
}

# O issuer já carrega a base e o realm (`<base>/realms/<realm>`); o Admin API os quer separados.
keycloak_admin_get() {
  local token="$1" path="$2" issuer="${KEYCLOAK_ISSUER%/}"
  printf 'header = "Authorization: Bearer %s"\n' "$token" \
    | curl --config - --silent --show-error --fail --max-time 60 \
      "${issuer%%/realms/*}/admin/realms/${issuer##*/realms/}/${path}"
}

# Um TSV `subject, username, email, is_service` por usuário do realm. O arquivo é dado pessoal: mora
# no diretório de trabalho, que o `cleanup` apaga, e nunca é impresso.
#
# As contas de serviço vêm do papel `transportada-service` (o mesmo que a API exige do token de
# máquina), não da listagem: o `GET /users` do Keycloak não devolve usuário de service account.
# Uma página basta ali — é um cliente por serviço, não uma lista que cresce com gente.
fetch_realm_users() {
  local token="$1" output="$2" first=0 page count service_accounts
  # Realm sem o papel responde 404: é "nenhuma conta de serviço", não motivo para parar o ciclo
  # depois do restore e antes de tirar a emissão.
  if service_accounts="$(keycloak_admin_get "$token" "roles/transportada-service/users?first=0&max=${REALM_PAGE_SIZE}")"; then
    jq -r '.[] | [.id, (.username // ""), (.email // ""), "t"] | @tsv' <<<"$service_accounts" >"$output"
  else
    log warn staging_refresh_service_role_missing ''
    : >"$output"
  fi
  while :; do
    page="$(keycloak_admin_get "$token" "users?briefRepresentation=true&first=${first}&max=${REALM_PAGE_SIZE}")"
    jq -r '.[] | [.id, (.username // ""), (.email // ""), "f"] | @tsv' <<<"$page" >>"$output"
    count="$(jq 'length' <<<"$page")"
    if [ "$count" -lt "$REALM_PAGE_SIZE" ]; then
      break
    fi
    first=$((first + REALM_PAGE_SIZE))
  done
}

# O Keycloak de staging não é restaurado (ver `download_production_cycle`), mas `external_identities`
# vem de produção, com o issuer e os subjects de lá. A API acha a pessoa por issuer + subject, então
# sem este passo todo login de staging responde 401. Aqui cada usuário do realm de staging é casado
# com o usuário do sistema pelo username ou pelo e-mail, e o vínculo é gravado no issuer de staging —
# as regras do casamento estão no `rebind-identities.sql`.
#
# O issuer é gravado **exatamente** como está na variável: é a string que a API compara com o `iss`
# do token. Achá-lo nos dados recém-restaurados só acontece se a variável aponta para o Keycloak de
# produção, e religar ali misturaria os dois realms — a regra é parar antes de escrever.
rebind_staging_identities() {
  local bound
  bound="$(psql "$STAGING_DATABASE_URL" --tuples-only --no-align --quiet --set ON_ERROR_STOP=1 \
    --set issuer="$KEYCLOAK_ISSUER" <<'SQL'
select count(*) from external_identities where issuer = :'issuer';
SQL
  )"
  if [ "$bound" -gt 0 ]; then
    log error staging_refresh_issuer_already_bound ",\"identities\":${bound}"
    exit 1
  fi

  local token users="${WORK_DIRECTORY}/realm-users.tsv"
  token="$(keycloak_admin_token)"
  if [ -z "$token" ]; then
    log error staging_refresh_keycloak_token_missing ''
    exit 1
  fi
  fetch_realm_users "$token" "$users"

  # O `cd` é o que deixa o SQL achar os TSV de produção por nome fixo: o `\copy` do psql não
  # interpola variável, e o caminho do diretório de trabalho só existe em tempo de execução.
  local counts realm_users skipped by_production by_username by_email by_service ambiguous unmatched
  counts="$(cd "$WORK_DIRECTORY" && psql "$STAGING_DATABASE_URL" --tuples-only --no-align --quiet \
    --field-separator ' ' --set ON_ERROR_STOP=1 --set issuer="$KEYCLOAK_ISSUER" \
    --file "$REBIND_SQL_PATH" <"$users")"
  rm -f "$users" "${WORK_DIRECTORY}/production-users.tsv" "${WORK_DIRECTORY}/production-realms.tsv"
  read -r realm_users skipped by_production by_username by_email by_service ambiguous unmatched <<<"$counts"
  log info staging_refresh_identities_rebound ",\"realmUsers\":${realm_users},\"serviceAccountsSkipped\":${skipped},\"linkedByProductionIdentity\":${by_production},\"linkedByUsername\":${by_username},\"linkedByEmail\":${by_email},\"linkedServiceAccounts\":${by_service},\"ambiguous\":${ambiguous},\"unmatched\":${unmatched}"
}

# Mesmo desenho do `keycloak_admin_get`, com o token por `--config` de um descritor (o stdin fica
# para o corpo). O `printf` é builtin: o token não vira argv de processo nenhum.
keycloak_admin_put() {
  local token="$1" path="$2" issuer="${KEYCLOAK_ISSUER%/}"
  curl --config <(printf 'header = "Authorization: Bearer %s"\n' "$token") \
    --silent --show-error --fail --max-time 60 --output /dev/null \
    --request PUT --header 'Content-Type: application/json' --data-binary @- \
    "${issuer%%/realms/*}/admin/realms/${issuer##*/realms/}/${path}"
}

# O token de staging traz `company_id` do atributo do usuário no Keycloak de staging, e a API recusa
# (403) quando ele não é a empresa do vínculo ativo — que, depois do restore, é a de produção. Aqui
# cada usuário religado com **exatamente um** vínculo ativo passa a apontar para essa empresa; zero ou
# mais de um fica como está, porque escolher entre duas empresas não é decisão deste script.
#
# GET e depois PUT da representação inteira: o PUT de `attributes` substitui o mapa todo, e mandar só
# o `company_id` apagaria os outros atributos do usuário.
align_staging_companies() {
  local token pairs="${WORK_DIRECTORY}/company-alignment.tsv"
  psql "$STAGING_DATABASE_URL" --tuples-only --no-align --quiet --field-separator $'\t' \
    --set ON_ERROR_STOP=1 --set issuer="$KEYCLOAK_ISSUER" >"$pairs" <<'SQL'
select e.subject, count(m.id), coalesce(min(m.company_id::text), '')
from external_identities e
left join user_company_memberships m on m.user_id = e.user_id and m.status = 'active'
where e.issuer = :'issuer'
group by e.subject;
SQL

  token="$(keycloak_admin_token)"
  if [ -z "$token" ]; then
    log error staging_refresh_keycloak_token_missing ''
    return 1
  fi

  local aligned=0 already_right=0 skipped=0 account memberships company representation
  while IFS=$'\t' read -r account memberships company; do
    if [ "$memberships" -ne 1 ]; then
      skipped=$((skipped + 1))
      continue
    fi
    representation="$(keycloak_admin_get "$token" "users/${account}")"
    if jq -e --arg company "$company" '(.attributes.company_id // []) == [$company]' \
      <<<"$representation" >/dev/null; then
      already_right=$((already_right + 1))
      continue
    fi
    jq --arg company "$company" '.attributes = ((.attributes // {}) + {company_id: [$company]})' \
      <<<"$representation" | keycloak_admin_put "$token" "users/${account}"
    aligned=$((aligned + 1))
  done <"$pairs"
  rm -f "$pairs"
  log info staging_refresh_companies_aligned ",\"companyAligned\":${aligned},\"companyAlreadyRight\":${already_right},\"companySkipped\":${skipped}"
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
update digital_certificates set status = 'retired', secret_envelope = null where secret_envelope is not null;

commit;
SQL
  local notes
  notes="$(psql "$STAGING_DATABASE_URL" --tuples-only --no-align --quiet \
    -c 'select count(*) from nfe_documents')"
  log info staging_refresh_emission_stripped ",\"notes\":${notes}"
}

# Staging nunca alcança produção nem terceiros reais (regra de 14/09/2026). A cópia traz o ambiente
# fiscal `production`, as credenciais por empresa (Nota RP, Meta, Resend), os tokens de push e os
# envios pendentes; o SQL em `neutralize-external.sql` neutraliza tudo numa transação só. O arquivo é
# separado para poder ser aplicado sozinho num staging já copiado. O log leva só contagens do que
# **sobrou** — zero em todas é o estado esperado.
neutralize_external_reach() {
  psql "$STAGING_DATABASE_URL" --quiet --set ON_ERROR_STOP=1 --file "$NEUTRALIZE_SQL_PATH"
  local production credentials pending
  read -r production credentials pending <<<"$(psql "$STAGING_DATABASE_URL" --tuples-only \
    --no-align --quiet --field-separator ' ' --set ON_ERROR_STOP=1 <<'SQL'
select
  (select count(*) from company_fiscal_profiles where environment <> 'homologation'),
  (select count(*) from nfse_provider_credentials) + (select count(*) from whatsapp_channels)
    + (select count(*) from contractor_mail_settings)
    + (select count(*) from digital_certificates where secret_envelope is not null)
    + (select count(*) from notification.devices),
  (select count(*) from processing_outbox where published_at is null)
    + (select count(*) from invitation_delivery_outbox where published_at is null)
    + (select count(*) from password_reset_delivery_outbox where published_at is null)
    + (select count(*) from contractor_mail_outbox where published_at is null)
    + (select count(*) from contractor_inbound_email_outbox where published_at is null)
    + (select count(*) from aggregate_attachment_outbox where published_at is null)
    + (select count(*) from notification.notifications where status in ('pending', 'scheduled'));
SQL
  )"
  log info staging_refresh_external_neutralized ",\"productionFiscalProfiles\":${production},\"externalCredentials\":${credentials},\"pendingDeliveries\":${pending}"
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
  CURRENT_STEP=extract_production_realm
  extract_production_realm_users
  CURRENT_STEP=restore
  restore_over_staging
  CURRENT_STEP=rebind_identities
  rebind_staging_identities
  CURRENT_STEP=strip_emission
  strip_emission_data
  CURRENT_STEP=neutralize_external
  neutralize_external_reach

  # Depois da limpeza, de propósito: o certificado e a emissão de produção já saíram quando o Admin
  # API do Keycloak é chamado. E a falha vira aviso, porque sem o redeploy seguinte a API de staging
  # fica atrás do schema. O subshell com `set -e` é o que faz a primeira falha parar o acerto — num
  # `if` ou `||` o bash desligaria o `-e` dentro da função e ela seguiria em frente. O trap de ERR sai
  # durante o subshell: com `-E` ele dispararia no status dele e escreveria `staging_refresh_failed`.
  CURRENT_STEP=align_companies
  local alignment_status=0
  set +e
  trap - ERR
  (set -e; align_staging_companies)
  alignment_status=$?
  trap on_error ERR
  set -e
  if [ "$alignment_status" -ne 0 ]; then
    log warn staging_refresh_company_alignment_failed ",\"status\":${alignment_status}"
  fi

  CURRENT_STEP=redeploy
  redeploy_staging_api

  CURRENT_STEP='done'
  log info staging_refresh_completed ",\"stamp\":\"${CYCLE_STAMP}\""
}

main "$@"

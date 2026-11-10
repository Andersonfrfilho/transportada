#!/usr/bin/env bash
# Só leitura. Diz por que as notas de um recibo de XML (WhatsApp ou e-mail) ficaram "com problema".
# Agrupa os itens das importações dos recibos recentes por situação e código de erro, com os primeiros nomes de arquivo.
# Uso: bash notas-com-problema-xml.sh <staging|production> [horas, padrão 48]
set -euo pipefail
PROJECT_ID="62de4c69-216a-4335-93a0-4942c6a95c54"
OUT_DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"
ENVIRONMENT="${1:-}"; HOURS="${2:-48}"
case "$ENVIRONMENT" in staging | production) ;; *) echo "uso: $0 <staging|production> [horas]" >&2; exit 1 ;; esac
printf '%s' "$HOURS" | grep -Eq '^[0-9]{1,4}$' || { echo "horas inválidas: $HOURS" >&2; exit 1; }
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/notas-com-problema-xml-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S).txt"
read -r -d '' JS <<'JS' || true
const sql = new Bun.SQL(process.env.DATABASE_URL)
const hours = Number(process.env.HOURS)
const out = { horas: hours }
try {
  out.recibos = await sql`
    select r.channel, r.status, r.reject_reason, r.last_error_code, r.files_count, r.created_at, r.import_id,
           i.status as import_status, i.received_count, i.imported_count, i.duplicated_count, i.invalid_count, i.rejected_count, i.failed_count, i.terminal_error
    from nfe_xml_receipts r left join nfe_imports i on i.id = r.import_id
    where r.created_at > now() - make_interval(hours => ${hours})
    order by r.created_at desc limit 20`
  out.itens = await sql`
    select r.channel, it.status, coalesce(it.error->>'code', '(sem erro)') as codigo,
           coalesce(it.error->>'message', '') as mensagem, count(*)::int as quantos,
           (array_agg(it.source_name order by it.ordinal))[1:3] as exemplos
    from nfe_xml_receipts r join nfe_import_items it on it.import_id = r.import_id
    where r.created_at > now() - make_interval(hours => ${hours}) and it.status <> 'imported' and it.status <> 'duplicated'
    group by r.channel, it.status, it.error->>'code', it.error->>'message'
    order by quantos desc`
  console.log('__RESULT__' + JSON.stringify(out))
} catch (e) { out.erro = String(e?.message ?? e); console.log('__RESULT__' + JSON.stringify(out)); process.exitCode = 1 }
await sql.close()
JS
ENCODED="$(printf '%s' "$JS" | base64 -w0)"
RAW="$(railway ssh -p "$PROJECT_ID" -s api -e "$ENVIRONMENT" -- sh -c \
  "echo $ENCODED | base64 -d > /tmp/prob.mjs && HOURS='$HOURS' bun /tmp/prob.mjs; rm -f /tmp/prob.mjs" 2>&1)" || { printf '%s\n' "$RAW" >"$OUT"; echo "$OUT"; exit 1; }
printf '%s\n' "$RAW" | grep '^__RESULT__' | sed 's/^__RESULT__//' >"$OUT" || printf '%s\n' "$RAW" >"$OUT"
echo "$OUT"

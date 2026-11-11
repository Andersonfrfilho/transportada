#!/usr/bin/env bash
# SOMENTE LEITURA em STAGING: por que a ocorrencia da Unica nao foi ao grupo do WhatsApp (spec 318)?
# Mostra: canal configurado da Unica, as ultimas ocorrencias nas notas dela (tipo, flags, modelo), e o registro do envio ao grupo.
# Uso: bash /home/miyazaki/Documents/personal/transportada/tmp/ops/staging-confere-ocorrencia-unica.sh
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"
if ! command -v railway >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
command -v railway >/dev/null 2>&1 || { echo "railway nao encontrado no PATH" >&2; exit 1; }
BASE="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"; mkdir -p "$BASE"
OUT="$BASE/staging-confere-ocorrencia-unica-$(date -u +%Y%m%dT%H%M%SZ).txt"
trap 'echo "$OUT"' EXIT
JS=$(cat <<'JSEOF'
const sql = new Bun.SQL(process.env.DATABASE_URL)
const p = (t, r) => console.log("__RESULT__== " + t + " ==\n" + JSON.stringify(r, null, 1))
await sql.begin(async (tx) => {
  await tx`set transaction read only`
  p("canal da Unica (mention_phone mascarado)", await tx`
    select c.display_name, o.channel, o.group_jid, o.group_name, right(o.mention_phone, 4) as fim_numero, o.email_fallback, o.updated_at
    from contractors c left join contractor_occurrence_channels o on o.company_id = c.company_id and o.contractor_id = c.id
    where c.tax_id = ${"26344834000108"}`)
  p("ultimas ocorrencias em notas da Unica", await tx`
    select oc.id, oc.created_at, oc.stage, t.name as tipo, t.emails_contractor, t.blocks_contractor_notice,
           t.contractor_notification_template_key as modelo, n.number as nota
    from trip_document_occurrences oc
    join company_occurrence_types t on t.company_id = oc.company_id and t.id = oc.occurrence_type_id
    join trip_documents d on d.company_id = oc.company_id and d.id = oc.trip_document_id
    join nfe_documents n on n.company_id = d.company_id and n.id = d.nfe_document_id
    join nfe_participants e on e.company_id = n.company_id and e.document_id = n.id and e.role = ${"emitter"}
    where e.tax_id = ${"26344834000108"} order by oc.created_at desc limit 5`)
  p("registros de envio ao grupo (idempotency_records)", await tx`
    select operation, idempotency_key, status, updated_at, response
    from idempotency_records where operation ilike ${"%occurrence%group%"} order by updated_at desc limit 5`)
  p("modelo existe no modulo de notificacao?", await tx`
    select key, status from notification.templates
    where key in (select contractor_notification_template_key from company_occurrence_types where contractor_notification_template_key is not null) limit 10`.catch((e) => [String(e.message)]))
})
await sql.close()
JSEOF
)
ENC=$(printf '%s' "$JS" | base64 -w0)
railway ssh -s api -e staging -- sh -c "echo $ENC | base64 -d > /tmp/q.mjs && bun /tmp/q.mjs; rm -f /tmp/q.mjs" 2>&1 | sed 's/^__RESULT__//' | grep -v '^$' > "$OUT" || true

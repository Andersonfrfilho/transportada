#!/usr/bin/env bash
# PRODUÇÃO (promoção #898, spec 318): publica o modelo WhatsApp geral `ocorrencia.contratante-grupo` (pt-BR),
# usado no aviso à contratante pelo grupo quando o tipo não tem texto WhatsApp próprio.
# Sem argumento = SIMULAÇÃO. --confirm grava a v1 (ou a próxima, com --overwrite e texto diferente). Nunca UPDATE.
# Uso: bash producao-promocao-898-modelo-grupo.sh [--confirm] [--overwrite]
# Imprime só o caminho do arquivo de saída.
set -euo pipefail
command -v railway >/dev/null 2>&1 || { echo "railway nao encontrado" >&2; exit 1; }
railway whoami >/dev/null 2>&1 || { echo "railway deslogado: rode 'railway login'" >&2; exit 1; }
CONFIRM=0; OVERWRITE=0
for a in "$@"; do case "$a" in --confirm) CONFIRM=1;; --overwrite) OVERWRITE=1;; *) echo "argumento desconhecido: $a" >&2; exit 1;; esac; done
BASE="${OUT_DIR:-/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas}"; mkdir -p "$BASE"
OUT="$BASE/producao-promocao-898-modelo-grupo-$(date -u +%Y%m%dT%H%M%SZ).txt"
trap 'echo "$OUT"' EXIT
JS=$(cat <<'JSEOF'
const sql = new Bun.SQL(process.env.DATABASE_URL)
const KEY = "ocorrencia.contratante-grupo"
const BODY = [
  "{{marcacao}}",
  "⚠️ *Ocorrência na {{momento}}*",
  "",
  "*Tipo:* {{tipoOcorrencia}}",
  "*Contratante:* {{contratante}}",
  "*Nota fiscal:* {{numeroNota}}",
  "*Cliente:* {{cliente}}",
  "*Endereço:* {{enderecoEntrega}}",
  "*Valor da nota:* R$ {{valorNota}}",
  "📅 *Vencimento pedido:* {{novaData}}",
  "*Registrada em:* {{data}}",
  "📝 {{observacao}}",
  "",
  "Qualquer dúvida, é só falar com a gente.",
].join("\n")
const CONFIRM = process.env.CONFIRM === "1", OVERWRITE = process.env.OVERWRITE === "1"
const out = { modo: CONFIRM ? "GRAVOU" : "SIMULACAO (nada gravado)", empresas: [] }
const companies = await sql`select id::text as id from companies`
for (const c of companies) {
  const companyId = c.id
  const [active] = await sql`select version, body from notification.templates
    where company_id = ${companyId}::uuid and key = ${KEY} and channel = ${"whatsapp"} and locale = ${"pt-BR"} and active
    order by version desc limit 1`
  const verdict = !active ? "create" : active.body === BODY ? "same" : "differs"
  const r = { empresa: companyId, chave: KEY, veredito: verdict, versaoAtiva: active ? active.version : null }
  const write = CONFIRM && (verdict === "create" || (verdict === "differs" && OVERWRITE))
  if (verdict === "differs" && !OVERWRITE) r.aviso = "ja existe texto diferente: use --overwrite para criar versao nova"
  if (write) {
    const next = active ? active.version + 1 : 1
    await sql.begin(async (tx) => {
      await tx`update notification.templates set active = false where company_id = ${companyId}::uuid and key = ${KEY} and channel = ${"whatsapp"} and locale = ${"pt-BR"} and active`
      await tx`insert into notification.templates (company_id, key, channel, locale, version, subject, body, active)
        values (${companyId}::uuid, ${KEY}, ${"whatsapp"}, ${"pt-BR"}, ${next}, ${""}, ${BODY}, true)`
    })
    r.gravouVersao = next
  }
  out.empresas.push(r)
}
console.log("__RESULT__" + JSON.stringify(out, null, 1))
await sql.close()
JSEOF
)
ENC=$(printf '%s' "$JS" | base64 -w0)
timeout 180 railway ssh -s api -e production -- sh -c "echo $ENC | base64 -d > /tmp/m.mjs && CONFIRM=$CONFIRM OVERWRITE=$OVERWRITE bun /tmp/m.mjs; rm -f /tmp/m.mjs" 2>&1 | sed -n '/__RESULT__/,$p' | sed 's/__RESULT__//' > "$OUT" || true

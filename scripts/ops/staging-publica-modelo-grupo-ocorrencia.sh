#!/usr/bin/env bash
# STAGING: publica o modelo WhatsApp `ocorrencia.contratante-grupo` (pt-BR) no modulo de notificacao (spec 318).
# Sem --confirm so mostra o plano (create/same/differs) e nao grava. Com --confirm grava a versao 1 (ou a proxima, se
# --overwrite e o texto for diferente). Nunca faz UPDATE: sempre versao nova. Somente staging.
# Uso: bash <este arquivo> [--confirm] [--overwrite]
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"
if ! command -v railway >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
command -v railway >/dev/null 2>&1 || { echo "railway nao encontrado no PATH" >&2; exit 1; }
railway whoami >/dev/null 2>&1 || { echo "railway deslogado: rode 'railway login'" >&2; exit 1; }
CONFIRM=0; OVERWRITE=0
for a in "$@"; do case "$a" in --confirm) CONFIRM=1;; --overwrite) OVERWRITE=1;; *) echo "argumento desconhecido: $a" >&2; exit 1;; esac; done
BASE="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"; mkdir -p "$BASE"
OUT="$BASE/staging-publica-modelo-grupo-ocorrencia-$(date -u +%Y%m%dT%H%M%SZ).txt"
trap 'echo "$OUT"' EXIT
JS=$(cat <<'JSEOF'
const sql = new Bun.SQL(process.env.DATABASE_URL)
const KEY = "ocorrencia.contratante-grupo"
const BODY = [
  "{{marcacao}}",
  "⚠️ *Ocorrência na {{momento}}*",
  "",
  "*Tipo:* {{tipoOcorrencia}}",
  "*Nota fiscal:* {{numeroNota}}",
  "*Registrada em:* {{data}}",
  "📝 {{observacao}}",
  "",
  "Qualquer dúvida, é só falar com a gente.",
].join("\n")
const CONFIRM = process.env.CONFIRM === "1", OVERWRITE = process.env.OVERWRITE === "1"
const out = { modo: CONFIRM ? "GRAVOU" : "SIMULACAO (nada gravado)", empresas: [] }
const companies = await sql`select id::text as id from companies`
if (companies.length !== 1) out.erro = "esperava 1 empresa em staging, achei " + companies.length
else {
  const companyId = companies[0].id
  const [active] = await sql`select version, body from notification.templates
    where company_id = ${companyId}::uuid and key = ${KEY} and channel = ${"whatsapp"} and locale = ${"pt-BR"} and active
    order by version desc limit 1`
  const verdict = !active ? "create" : active.body === BODY ? "same" : "differs"
  out.empresa = companyId; out.chave = KEY; out.veredito = verdict; out.versaoAtiva = active ? active.version : null
  out.texto = BODY
  const write = CONFIRM && (verdict === "create" || (verdict === "differs" && OVERWRITE))
  if (verdict === "differs" && !OVERWRITE) out.aviso = "ja existe um texto diferente: use --overwrite para criar versao nova"
  if (write) {
    const next = active ? active.version + 1 : 1
    await sql.begin(async (tx) => {
      await tx`update notification.templates set active = false where company_id = ${companyId}::uuid and key = ${KEY} and channel = ${"whatsapp"} and locale = ${"pt-BR"} and active`
      await tx`insert into notification.templates (company_id, key, channel, locale, version, subject, body, active)
        values (${companyId}::uuid, ${KEY}, ${"whatsapp"}, ${"pt-BR"}, ${next}, ${""}, ${BODY}, true)`
    })
    out.gravouVersao = next
  }
}
console.log("__RESULT__" + JSON.stringify(out, null, 1))
await sql.close()
JSEOF
)
ENC=$(printf '%s' "$JS" | base64 -w0)
railway ssh -s api -e staging -- sh -c "echo $ENC | base64 -d > /tmp/m.mjs && CONFIRM=$CONFIRM OVERWRITE=$OVERWRITE bun /tmp/m.mjs; rm -f /tmp/m.mjs" 2>&1 | sed -n '/__RESULT__/,$p' | sed 's/__RESULT__//' > "$OUT" || true

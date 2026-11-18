#!/usr/bin/env bash
# STAGING APENAS. Liga a nota as ocorrencias de parada sem nota, so quando a parada tem UMA nota viva (nao liberada).
# Sem --confirm so mostra o que faria. Com --confirm grava numa transacao e imprime o antes e o depois.
# Uso: bash <este arquivo> [--confirm] [--desde AAAA-MM-DD]   (padrao: hoje, horario de Brasilia)
set -euo pipefail
CONFIRM=0; SINCE=""
while [ $# -gt 0 ]; do case "$1" in --confirm) CONFIRM=1;; --desde) SINCE="$2"; shift;; *) echo "arg desconhecido: $1" >&2; exit 2;; esac; shift; done
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"
if ! command -v railway >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
command -v railway >/dev/null 2>&1 || { echo "railway nao encontrado no PATH" >&2; exit 1; }
railway whoami >/dev/null 2>&1 || { echo "railway deslogado: rode 'railway login'" >&2; exit 1; }
REPO="${REPO:-$(git rev-parse --show-toplevel)}"
cd "$REPO"
BASE="$REPO/tmp/ops/saidas"; mkdir -p "$BASE"
OUT="$BASE/corrige-ocorrencia-parada-sem-nota-$(date -u +%Y%m%dT%H%M%SZ).txt"
trap 'echo "$OUT"' EXIT
JS=$(cat <<JSEOF
const confirm = ${CONFIRM} === 1
const since = "${SINCE}" || null
const sql = new Bun.SQL(process.env.DATABASE_URL)
const pick = async (tx) => tx\`select o.id, o.company_id, o.stop_id, o.created_at, o.trip_document_id,
  (select count(*)::int from trip_documents d where d.company_id = o.company_id and d.stop_id = o.stop_id and d.released_at is null) as notas_vivas,
  (select d.id from trip_documents d where d.company_id = o.company_id and d.stop_id = o.stop_id and d.released_at is null order by d.id limit 1) as nota_id
  from trip_stop_occurrences o
  where o.trip_document_id is null
    and o.created_at >= coalesce(\${since}::date::timestamp at time zone 'America/Sao_Paulo', date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
  order by o.created_at\`
const before = await pick(sql)
const fixable = before.filter((r) => r.notas_vivas === 1)
let updated = 0
if (confirm) {
  await sql.begin(async (tx) => {
    for (const r of fixable) {
      const res = await tx\`update trip_stop_occurrences set trip_document_id = \${r.nota_id} where id = \${r.id} and company_id = \${r.company_id} and trip_document_id is null\`
      updated += res.count ?? 0
    }
  })
}
const after = confirm ? await pick(sql) : null
console.log("__RESULT__" + JSON.stringify({ modo: confirm ? "gravou" : "so-mostrou", encontradas: before.length, corrigiveis: fixable.length, atualizadas: updated, antes: before, depois: after }, null, 1))
await sql.close()
JSEOF
)
ENC=$(printf '%s' "$JS" | base64 -w0)
echo "=== staging ===" > "$OUT"
railway ssh -s api -e staging -- sh -c "echo $ENC | base64 -d > /tmp/fixnota.mjs && bun /tmp/fixnota.mjs; rm -f /tmp/fixnota.mjs" 2>&1 | sed -n '/__RESULT__/,$p' | sed 's/__RESULT__//' >> "$OUT" || echo "falhou" >> "$OUT"

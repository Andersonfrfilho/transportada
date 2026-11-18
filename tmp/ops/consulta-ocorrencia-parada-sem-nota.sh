#!/usr/bin/env bash
# SOMENTE LEITURA (fix do app que zerava a nota na ocorrencia de parada): conta as ocorrencias de parada sem nota,
# por tipo e por dia, em staging e producao. Uso: bash <este arquivo>
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"
if ! command -v railway >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
command -v railway >/dev/null 2>&1 || { echo "railway nao encontrado no PATH" >&2; exit 1; }
railway whoami >/dev/null 2>&1 || { echo "railway deslogado: rode 'railway login'" >&2; exit 1; }
REPO="${REPO:-$(git rev-parse --show-toplevel)}"
cd "$REPO"
BASE="$REPO/tmp/ops/saidas"; mkdir -p "$BASE"
OUT="$BASE/ocorrencia-parada-sem-nota-$(date -u +%Y%m%dT%H%M%SZ).txt"
trap 'echo "$OUT"' EXIT
JS=$(cat <<'JSEOF'
const sql = new Bun.SQL(process.env.DATABASE_URL)
const totals = await sql`select count(*)::int as total, count(*) filter (where trip_document_id is null)::int as sem_nota from trip_stop_occurrences`
const byType = await sql`select coalesce(t.name, o.kind) as tipo, to_char(o.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia, count(*)::int as sem_nota, count(distinct o.stop_id)::int as paradas from trip_stop_occurrences o left join company_occurrence_types t on t.company_id = o.company_id and t.id = o.occurrence_type_id where o.trip_document_id is null group by 1, 2 order by 2 desc, 1`
console.log("__RESULT__" + JSON.stringify({ totals, byType }, null, 1))
await sql.close()
JSEOF
)
ENC=$(printf '%s' "$JS" | base64 -w0)
: > "$OUT"
for ENV in staging production; do
  echo "=== $ENV ===" >> "$OUT"
  railway ssh -s api -e "$ENV" -- sh -c "echo $ENC | base64 -d > /tmp/semnota.mjs && bun /tmp/semnota.mjs; rm -f /tmp/semnota.mjs" 2>&1 | sed -n '/__RESULT__/,$p' | sed 's/__RESULT__//' >> "$OUT" || echo "falhou" >> "$OUT"
done

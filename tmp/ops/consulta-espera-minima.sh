#!/usr/bin/env bash
# SOMENTE LEITURA (spec 315 D10): quanto tempo de espera minima cada tipo de ocorrencia de parada tem configurado.
# Roda em staging e em producao. Uso: bash <este arquivo>
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"
if ! command -v railway >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
command -v railway >/dev/null 2>&1 || { echo "railway nao encontrado no PATH" >&2; exit 1; }
railway whoami >/dev/null 2>&1 || { echo "railway deslogado: rode 'railway login'" >&2; exit 1; }
REPO="${REPO:-$(git rev-parse --show-toplevel)}"
cd "$REPO"
BASE="$REPO/tmp/ops/saidas"; mkdir -p "$BASE"
OUT="$BASE/consulta-espera-minima-$(date -u +%Y%m%dT%H%M%SZ).txt"
trap 'echo "$OUT"' EXIT
JS=$(cat <<'JSEOF'
const sql = new Bun.SQL(process.env.DATABASE_URL)
const rows = await sql`select name, flow, active, min_wait_after_arrival_minutes, location_mode, arrival_time_mode from company_occurrence_types where flow = 'stop' order by name`
console.log("__RESULT__" + JSON.stringify(rows, null, 1))
await sql.close()
JSEOF
)
ENC=$(printf '%s' "$JS" | base64 -w0)
: > "$OUT"
for ENV in staging production; do
  echo "=== $ENV ===" >> "$OUT"
  railway ssh -s api -e "$ENV" -- sh -c "echo $ENC | base64 -d > /tmp/c315.mjs && bun /tmp/c315.mjs; rm -f /tmp/c315.mjs" 2>&1 | sed -n '/__RESULT__/,$p' | sed 's/__RESULT__//' >> "$OUT" || echo "falhou" >> "$OUT"
done

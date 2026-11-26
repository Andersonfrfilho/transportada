#!/usr/bin/env bash
# PRODUCAO, somente leitura: o que o bot fez com a resposta do Rogério (link do Maps) em 23/11/2026 ~13:14 UTC.
# Lê o pedido do grupo c6c437d5 (status, passo, tentativas, transcrição) e os eventos de parada do motorista.
set -euo pipefail
REPO="${REPO:-/home/miyazaki/Documents/personal/transportada}"
[ -f "$REPO/.github/scripts/railway-deploy.sh" ] || { echo "REPO invalido: $REPO" >&2; exit 1; }
command -v railway >/dev/null || { echo "railway CLI nao encontrado" >&2; exit 1; }
OUT_DIR="$REPO/tmp/ops/saidas"; mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/link-maps-bot-$(date +%Y%m%d-%H%M%S).txt"
cd "$REPO"
read -r -d '' JS <<'BUN' || true
const sql = new Bun.SQL(process.env.DATABASE_URL)
const out = {}
await sql.begin('read only', async (tx) => {
  out.request = await tx.unsafe(`select id, driver_id, status, step, attempts, opened_at, last_activity_at, closed_at, state from whatsapp_group_requests where id::text like 'c6c437d5%'`)
  const driver = out.request[0]?.driver_id
  if (driver) {
    out.vizinhos = await tx.unsafe(`select id, status, step, attempts, opened_at, closed_at from whatsapp_group_requests where driver_id = '${driver}' and opened_at > now() - interval '3 hours' order by opened_at`)
  }
})
console.log('__RESULT__' + JSON.stringify(out, null, 2))
await sql.close()
BUN
ENC="$(printf '%s' "$JS" | base64 -w0)"
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- \
  sh -c "cd /app/apps/api-transportada && bun -e \"\$(echo $ENC | base64 -d)\"" >"$OUT" 2>&1 || true
echo "$OUT"

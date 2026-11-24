#!/usr/bin/env bash
# PRODUCAO, somente leitura: a viagem do Rogério (cf87bd84) está pronta para o botão "Despachar" do painel?
# Mostra status, se tem rota congelada, a situação das notas e eventos já gravados nas paradas.
# Não grava nada. Depois de despachar no painel, rode de novo: o status deve sair como dispatched.
set -euo pipefail
REPO="${REPO:-/home/miyazaki/Documents/personal/transportada}"
[ -f "$REPO/.github/scripts/railway-deploy.sh" ] || { echo "REPO invalido: $REPO" >&2; exit 1; }
command -v railway >/dev/null || { echo "railway CLI nao encontrado" >&2; exit 1; }
OUT_DIR="$REPO/tmp/ops/saidas"; mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/viagem-rogerio-despacho-$(date +%Y%m%d-%H%M%S).txt"
cd "$REPO"
read -r -d '' JS <<'BUN' || true
const sql = new Bun.SQL(process.env.DATABASE_URL)
const TRIP = 'cf87bd84-4f54-49ef-aa4e-4f875470ae50'
const out = {}
const run = async (name, q) => { try { out[name] = await sql.begin('read only', (tx) => tx.unsafe(q)) } catch (e) { out[name] = 'ERRO: ' + String(e.message).slice(0, 300) } }
await run('viagem', `select id, status, updated_at, (planned_route is not null) as tem_rota_congelada, planned_route_frozen_at from trips where id = '${TRIP}'`)
await run('notas_por_status', `select separation_status, (released_at is not null) as liberada, count(*)::int as n from trip_documents where trip_id = '${TRIP}' group by 1, 2 order by 1, 2`)
await run('paradas', `select sequence, en_route_since, arrived_at, completed_at from trip_stops where trip_id = '${TRIP}' order by sequence`)
await run('eventos_de_status', `select from_status, to_status, channel, event_kind from trip_status_events where trip_id = '${TRIP}'`)
await run('snapshots_de_despacho', `select count(*)::int as n from trip_dispatch_snapshots where trip_id = '${TRIP}'`)
console.log('__RESULT__' + JSON.stringify(out, null, 2))
await sql.close()
BUN
ENC="$(printf '%s' "$JS" | base64 -w0)"
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- \
  sh -c "cd /app/apps/api-transportada && bun -e \"\$(echo $ENC | base64 -d)\"" >"$OUT" 2>&1 || true
echo "$OUT"

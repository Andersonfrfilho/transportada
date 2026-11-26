#!/usr/bin/env bash
# PRODUCAO, somente leitura: por que o bot respondeu "Essa parada não está mais disponível na viagem" ao Rogério (23/11/2026 13:14:36 UTC).
# Parada 0f5a811e-cecc-4bd4-84dc-adb1874cb557 (NF 933891), motorista 8adaa6dd-88f6-4370-bb81-c70a8aba120d.
set -euo pipefail
REPO="${REPO:-/home/miyazaki/Documents/personal/transportada}"
[ -f "$REPO/.github/scripts/railway-deploy.sh" ] || { echo "REPO invalido: $REPO" >&2; exit 1; }
command -v railway >/dev/null || { echo "railway CLI nao encontrado" >&2; exit 1; }
OUT_DIR="$REPO/tmp/ops/saidas"; mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/parada-indisponivel-$(date +%Y%m%d-%H%M%S).txt"
cd "$REPO"
read -r -d '' JS <<'BUN' || true
const sql = new Bun.SQL(process.env.DATABASE_URL)
const STOP = '0f5a811e-cecc-4bd4-84dc-adb1874cb557'
const DRIVER = '8adaa6dd-88f6-4370-bb81-c70a8aba120d'
const out = {}
const run = async (name, q) => { try { out[name] = await sql.begin('read only', (tx) => tx.unsafe(q)) } catch (e) { out[name] = 'ERRO: ' + String(e.message).slice(0, 300) } }
await run('parada', `select row_to_json(s) as r from trip_stops s where id = '${STOP}'`)
await run('viagem_da_parada', `select t.id, t.status, t.updated_at, t.created_at from trips t join trip_stops s on s.trip_id = t.id and s.company_id = t.company_id where s.id = '${STOP}'`)
await run('viagens_do_motorista', `select t.id, t.status, t.updated_at from trips t join trip_drivers d on d.trip_id = t.id and d.company_id = t.company_id where d.driver_id = '${DRIVER}' and t.updated_at > now() - interval '2 days' order by t.updated_at desc`)
await run('paradas_da_viagem', `select s.id, s.sequence, s.trip_id, s.created_at, s.en_route_since, s.arrived_at, s.completed_at from trip_stops s where s.trip_id in (select trip_id from trip_stops where id = '${STOP}') order by s.sequence`)
await run('eventos_status', `select e.* from trip_status_events e where e.trip_id in (select trip_id from trip_stops where id = '${STOP}') and e.created_at > now() - interval '6 hours' order by e.created_at`)
console.log('__RESULT__' + JSON.stringify(out, null, 2))
await sql.close()
BUN
ENC="$(printf '%s' "$JS" | base64 -w0)"
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- \
  sh -c "cd /app/apps/api-transportada && bun -e \"\$(echo $ENC | base64 -d)\"" >"$OUT" 2>&1 || true
echo "$OUT"

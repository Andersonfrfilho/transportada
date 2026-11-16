#!/usr/bin/env bash
# SOMENTE LEITURA em PRODUCAO (16/11/2026): por que o bot nao respondeu o "2" do Rogerio Lima na escolha de parada.
# Mostra o pedido do grupo, as mensagens aceitas, os eventos das paradas e o estado da viagem hoje.
# Grava tudo em saidas/ e imprime so o caminho do arquivo.
set -euo pipefail
DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"
mkdir -p "$DIR"
OUT="$DIR/producao-rogerio-escolha-parada-$(date +%Y-%m-%d-%H%M).txt"
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- bun -e '
const sql = new Bun.SQL(process.env.DATABASE_URL)
await sql`set transaction read only`.catch(() => {})
const run = async (t, q) => { console.log("== " + t + " =="); try { console.table(await q) } catch (e) { console.log("erro:", String(e.message || e)) } }
await run("pedido do grupo 1ccf5c6a", sql`select * from whatsapp_group_requests where id::text like ${"1ccf5c6a%"}`)
await run("mensagens aceitas no pedido", sql`select * from whatsapp_group_request_messages where request_id::text like ${"1ccf5c6a%"} order by received_at`)
await run("field reports do pedido", sql`select * from trip_field_reports where idempotency_key like ${"whatsapp-group-request:1ccf5c6a%"}`)
await run("paradas da viagem do motorista", sql`select s.id, s.trip_id, s.sequence, s.status, s.en_route_since, s.arrived_at, s.completed_at from trip_stops s where s.trip_id in (select t.trip_id from trip_drivers t join fleet_drivers d on d.id = t.driver_id where d.name ilike ${"%rog%rio%lima%"}) order by s.trip_id, s.sequence`)
await run("eventos de parada hoje", sql`select e.* from trip_stop_events e where e.recorded_at > now() - interval ${"3 hours"} order by e.recorded_at`)
await sql.close()
' 2>&1 | grep -v -i "warning" > "$OUT" || true
echo "$OUT"

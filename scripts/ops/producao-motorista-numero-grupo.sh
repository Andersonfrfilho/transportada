#!/usr/bin/env bash
# SOMENTE LEITURA em PRODUCAO (13/11/2026): por que o bot ignorou "sim" e "1" no grupo do motorista Thiago Fabris.
# Mostra o telefone cadastrado dos motoristas "thiago fabris", quem tem os numeros 98806-2774 / 98809-2774,
# o grupo do motorista e os pedidos do grupo de hoje (dono do pedido x quem escreveu).
# Grava tudo em saidas/ e imprime so o caminho do arquivo.
set -euo pipefail
DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"
mkdir -p "$DIR"
OUT="$DIR/producao-motorista-numero-grupo-$(date +%Y-%m-%d-%H%M).txt"
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- bun -e '
const sql = new Bun.SQL(process.env.DATABASE_URL)
await sql`set transaction read only`.catch(() => {})
const run = async (t, q) => { console.log("== " + t + " =="); try { console.table(await q) } catch (e) { console.log("erro:", String(e.message || e)) } }
await run("motoristas Thiago Fabris (telefone cadastrado)", sql`select id, company_id, name, phone, status from fleet_drivers where name ilike ${"%thiago%fabris%"}`)
await run("quem tem 98806-2774 ou 98809-2774 no cadastro", sql`select id, name, phone, status from fleet_drivers where regexp_replace(phone, ${"\\D"}, ${""}, ${"g"}) ~ ${"9880[69]2774$"}`)
await run("grupo vinculado aos motoristas Thiago Fabris", sql`select g.driver_id, d.name, g.group_jid, g.group_name from fleet_driver_whatsapp_groups g join fleet_drivers d on d.id = g.driver_id and d.company_id = g.company_id where d.name ilike ${"%thiago%fabris%"}`)
await run("pedidos do grupo hoje (dono x estado)", sql`select r.id, r.owner_number, r.status, r.step, r.opened_at, r.last_activity_at, r.expires_at, r.closed_at from whatsapp_group_requests r join fleet_driver_whatsapp_groups g on g.company_id = r.company_id and g.group_jid = r.group_jid join fleet_drivers d on d.id = g.driver_id and d.company_id = g.company_id where d.name ilike ${"%thiago%fabris%"} and r.opened_at > now() - interval ${"1 day"} order by r.opened_at`)
await run("mensagens aceitas nesses pedidos (quem escreveu)", sql`select m.sender_number, m.via, m.step_before, m.received_at from whatsapp_group_request_messages m where m.request_id in (select r.id from whatsapp_group_requests r join fleet_driver_whatsapp_groups g on g.company_id = r.company_id and g.group_jid = r.group_jid join fleet_drivers d on d.id = g.driver_id and d.company_id = g.company_id where d.name ilike ${"%thiago%fabris%"} and r.opened_at > now() - interval ${"1 day"}) order by m.received_at`)
await sql.close()
' 2>&1 | grep -v -i "warning" > "$OUT" || true
echo "$OUT"

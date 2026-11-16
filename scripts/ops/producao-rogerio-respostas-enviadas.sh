#!/usr/bin/env bash
# SOMENTE LEITURA em PRODUCAO (16/11/2026): o que o bot enviou ao grupo do Rogerio Lima e o ritmo de envio do numero.
# Grava tudo em saidas/ e imprime so o caminho do arquivo.
set -euo pipefail
DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"
mkdir -p "$DIR"
OUT="$DIR/producao-rogerio-respostas-enviadas-$(date +%Y-%m-%d-%H%M).txt"
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- bun -e '
const sql = new Bun.SQL(process.env.DATABASE_URL)
await sql`set transaction read only`.catch(() => {})
const run = async (t, q) => { console.log("== " + t + " =="); try { console.table(await q) } catch (e) { console.log("erro:", String(e.message || e)) } }
await run("ritmo de envio do numero", sql`select company_id, min_interval_seconds, next_send_at, now() as agora from whatsapp_evolution_settings`)
await run("mensagens do chat do grupo (07:45 a 08:05)", sql`select m.occurred_at, m.direction, m.author, m.status, m.failure_reason, left(m.body_text, 70) as texto from whatsapp_chat_messages m join whatsapp_chats c on c.id = m.chat_id and c.company_id = m.company_id where c.chat_jid = ${"120363430408718202@g.us"} and m.occurred_at > ${"2026-11-16T10:45:00Z"}::timestamptz and m.occurred_at < ${"2026-11-16T11:10:00Z"}::timestamptz order by m.occurred_at`)
await run("pedidos do grupo hoje", sql`select id, status, step, opened_at, closed_at from whatsapp_group_requests where group_jid = ${"120363430408718202@g.us"} and opened_at > ${"2026-11-16T10:00:00Z"}::timestamptz order by opened_at`)
await sql.close()
' 2>&1 | grep -v -i "warning" > "$OUT" || true
echo "$OUT"

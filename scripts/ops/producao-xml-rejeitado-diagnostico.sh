#!/usr/bin/env bash
# SOMENTE LEITURA em PRODUCAO: por que o XML da chave 35261161544313000103550010000021091615443137 (SPSUL, WhatsApp,
# 24/11/2026 10:15 e 10:19 BRT) foi respondido "o arquivo nao e uma NF-e valida". Grava em tmp/ops/saidas/ e imprime so o caminho.
# Uso: bash /home/miyazaki/Documents/personal/transportada/tmp/ops/producao-xml-rejeitado-diagnostico-v3.sh
set -euo pipefail
REPO="${REPO:-/home/miyazaki/Documents/personal/transportada}"
DIR="$REPO/tmp/ops/saidas"
mkdir -p "$DIR"
OUT="$DIR/producao-xml-rejeitado-v3-$(date +%Y%m%d-%H%M).txt"
cd "$REPO"
JS=$(cat <<'JSEOF'
const sql = new Bun.SQL(process.env.DATABASE_URL)
await sql`set transaction read only`.catch(() => {})
const KEY = "35261161544313000103550010000021091615443137"
const run = async (t, q) => { console.log("== " + t + " =="); try { console.log(await q) } catch (e) { console.log("erro:", String(e.message || e)) } }
await run("recibos 24h", sql`select id, channel, status, reject_reason, last_error_code, files_count, import_id, sender, created_at, summary_sent_at from nfe_xml_receipts where created_at > now() - interval '24 hours' order by created_at desc limit 10`)
await run("importacoes 24h", sql`select id, status, received_via, received_from, restricted_contractor_id, received_count, imported_count, duplicated_count, invalid_count, rejected_count, failed_count, terminal_error, created_at from nfe_imports where created_at > now() - interval '24 hours' order by created_at desc limit 10`)
await run("itens (status e erro)", sql`select i.import_id, i.ordinal, i.source_name, i.source_entry, i.status, i.error, i.access_key, i.variant from nfe_import_items i join nfe_imports n on n.id = i.import_id where n.created_at > now() - interval '24 hours' order by i.created_at desc limit 10`)
await run("nota ja cadastrada?", sql`select id, access_key, issued_at from nfe_documents where access_key = ${KEY}`)
await run("contratantes", sql`select id, tax_id, display_name, status from contractors order by display_name limit 80`)
await sql.close()
JSEOF
)
B64=$(printf '%s' "$JS" | base64 -w0)
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- sh -c "echo $B64 | base64 -d > /tmp/x.mjs && bun /tmp/x.mjs; rm -f /tmp/x.mjs" 2>&1 | grep -v -i "warning" > "$OUT" || true
echo "$OUT"

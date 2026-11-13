#!/usr/bin/env bash
# ESCRITA em PRODUCAO (pedida pelo Anderson em 13/11/2026): telefone do motorista thiago fabris de 16988062774 para 16988092774.
# Sem --confirm so simula (mostra antes e depois e desfaz). Idempotente: so mexe na linha que ainda tem o numero antigo.
# Grava tudo em saidas/ e imprime so o caminho do arquivo.
set -euo pipefail
CONFIRM="no"; [ "${1:-}" = "--confirm" ] && CONFIRM="yes"
DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"
mkdir -p "$DIR"
OUT="$DIR/producao-corrigir-telefone-thiago-$(date +%Y-%m-%d-%H%M).txt"
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- env CONFIRM="$CONFIRM" bun -e '
const sql = new Bun.SQL(process.env.DATABASE_URL)
const confirm = process.env.CONFIRM === "yes"
const OLD = "16988062774", NEW = "16988092774"
const show = async (t, q) => { console.log("== " + t + " =="); console.table(await q) }
class Undo extends Error {}
try {
  await sql.begin(async (tx) => {
    await show("antes", tx`select id, name, phone, version from fleet_drivers where name ilike ${"%thiago%fabris%"}`)
    const rows = await tx`update fleet_drivers set phone = ${NEW}, version = version + 1, updated_at = now() where name ilike ${"%thiago%fabris%"} and phone = ${OLD} returning id`
    console.log("linhas alteradas:", rows.length)
    await show("depois", tx`select id, name, phone, version from fleet_drivers where name ilike ${"%thiago%fabris%"}`)
    if (!confirm) { console.log("SIMULACAO: desfeito. Use --confirm para gravar."); throw new Undo() }
    console.log("GRAVADO.")
  })
} catch (e) { if (!(e instanceof Undo)) console.log("erro:", String(e.message || e)) }
await sql.close()
' 2>&1 | grep -v -i "warning" > "$OUT" || true
echo "$OUT"

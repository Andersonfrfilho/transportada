#!/usr/bin/env bash
# SOMENTE LEITURA em PRODUÇÃO (conferência pós-deploy da promoção #939 staging → main, 22/11/2026).
# Confirma: migration 20261121123415 aplicada (colunas dismissed_*, índice parcial, FK, CHECK),
# nenhuma linha de mensagens sem conversa já descartada, rotinas de Contas no estado que estava
# (não religa nada) e tipos de coleta de canhoto intactos. Grava em tmp/ops/saidas/ e imprime só o caminho.
# Uso: bash /home/miyazaki/Documents/personal/transportada/tmp/ops/producao-pos-promocao-939-confere.sh
set -euo pipefail
DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"
mkdir -p "$DIR"
OUT="$DIR/producao-pos-promocao-939-$(date +%Y-%m-%d-%H%M).txt"
command -v railway >/dev/null || { echo "railway CLI não encontrado" >&2; exit 1; }
echo "conectando ao api de produção (pode levar até 1 minuto)..." >&2
timeout 180 railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- bun -e '
const sql = new Bun.SQL(process.env.DATABASE_URL)
await sql`set transaction read only`.catch(() => {})
const run = async (t, q) => { console.log("== " + t + " =="); try { console.table(await q) } catch (e) { console.log("erro:", String(e.message || e)) } }
await run("colunas novas (esperado: 2 linhas)", sql`
  select column_name as coluna, data_type as tipo from information_schema.columns
  where table_name = ${"occurrence_conversation_unassigned"} and column_name in (${"dismissed_at"}, ${"dismissed_by_user_id"}) order by 1`)
await run("índice parcial e constraints (esperado: 3 linhas)", sql`
  select indexname as nome from pg_indexes where indexname = ${"occurrence_conversation_unassigned_open_idx"}
  union all select conname from pg_constraint where conname in (${"occurrence_conversation_unassigned_dismissed_by_user_fk"}, ${"occurrence_conversation_unassigned_dismissal_check"})`)
await run("mensagens sem conversa: abertas e descartadas", sql`
  select count(*) filter (where assigned_message_id is null and dismissed_at is null)::int as abertas,
         count(*) filter (where dismissed_at is not null)::int as descartadas
  from occurrence_conversation_unassigned`)
await run("rotinas de Contas (esperado: igual ao que estava, nada religado por esta promoção)", sql`
  select job, enabled, paused_origin from job_schedules where job like ${"company-expense.%"} order by 1`)
await run("tipos que criam coleta de canhoto", sql`
  select company_id as empresa, name, active from company_occurrence_types where creates_canhoto_pickup order by 1`)
await sql.close()
process.exit(0)
' 2>&1 | grep --line-buffered -v -i "warning" | tee "$OUT" || true
echo "$OUT"

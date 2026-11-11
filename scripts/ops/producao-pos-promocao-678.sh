#!/usr/bin/env bash
# SOMENTE LEITURA em PRODUÇÃO (conferência pós-deploy da promoção #678 staging → main, 11/11/2026): confirma que as
# 11 migrations chegaram, que o que nasce desligado está desligado (trava de eventos atrasados da spec 320, rotina de
# vencimento da spec 319, tipos que criam coleta de canhoto da spec 321) e que o lembrete do motorista (spec 299 D10)
# está no estado esperado. Grava tudo em tmp/ops/saidas/ e imprime só o caminho do arquivo.
# Uso: bash <repositório>/scripts/ops/producao-pos-promocao-678.sh   (railway CLI logado)
set -euo pipefail
REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && git rev-parse --show-toplevel)}"
cd "$REPO"
DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"
mkdir -p "$DIR"
OUT="$DIR/producao-pos-promocao-678-$(date +%Y-%m-%d-%H%M).txt"
echo "conectando ao api de produção (pode levar até 1 minuto)..." >&2
timeout 180 railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- bun -e '
console.log("== DRIVER_REMINDERS_ENABLED no api (esperado: true) ==")
console.log(process.env.DRIVER_REMINDERS_ENABLED === "true" ? "true" : "false (ausente ou outro valor)")
const sql = new Bun.SQL(process.env.DATABASE_URL)
await sql`set transaction read only`.catch(() => {})
const run = async (t, q) => { console.log("== " + t + " =="); try { console.table(await q) } catch (e) { console.log("erro:", String(e.message || e)) } }
await run("tabelas novas (esperado: 7 linhas)", sql`
  select table_name as tabela from information_schema.tables
  where table_schema = ${"public"} and table_name in (
    ${"company_field_report_hold_settings"}, ${"trip_field_report_holds"}, ${"salespeople"}, ${"trip_canhoto_pickups"},
    ${"whatsapp_chats"}, ${"whatsapp_chat_messages"}, ${"company_driver_occurrence_email_settings"})
  order by 1`)
await run("rotina de vencimento do chat (esperado: enabled=false, paused_origin=system)", sql`
  select job, enabled, paused_origin, interval_seconds from job_schedules where job = ${"whatsapp-inbox.chat.expire"}`)
await run("trava de eventos atrasados ligada em alguma empresa (esperado: 0 linhas)", sql`
  select company_id as empresa, hold_enabled, updated_at from company_field_report_hold_settings where hold_enabled`)
await run("tipos que criam coleta de canhoto (esperado: 0)", sql`
  select count(*)::int as tipos from company_occurrence_types where creates_canhoto_pickup`)
await run("tipo unexpected_charge depois da migration 317 (nome, ativo)", sql`
  select company_id as empresa, name, active from company_occurrence_types where stop_kind = ${"unexpected_charge"} order by 1`)
await run("interruptor do lembrete por empresa", sql`
  select company_id as empresa, enabled, updated_at from company_driver_reminder_settings order by 1`)
await run("chats do WhatsApp em modo atendente (esperado: 0 até alguém assumir)", sql`
  select count(*)::int as chats from whatsapp_chats where state = ${"operator"}`)
await sql.close()
process.exit(0)
' 2>&1 | grep --line-buffered -v -i "warning" | tee "$OUT" || true
echo "$OUT"

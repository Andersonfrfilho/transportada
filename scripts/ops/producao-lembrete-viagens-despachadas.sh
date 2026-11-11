#!/usr/bin/env bash
# SOMENTE LEITURA em PRODUÇÃO (spec 299, emenda D10 de 10/11/2026): quais viagens despachadas sem "Iniciar rota"
# passariam a receber o lembrete "sem evento" quando a emenda chegar à main. Lista, por empresa, as viagens em
# dispatched/in_transit com parada aberta e nenhuma parada a caminho ou com chegada em aberto, com a hora do despacho,
# o motorista e quantas paradas faltam; mostra também o interruptor da empresa e se DRIVER_REMINDERS_ENABLED está ligado
# no serviço api (só o valor true/false, nunca outra variável).
# Grava tudo em tmp/ops/saidas/ e imprime só o caminho do arquivo.
# Uso: bash <repositório>/scripts/ops/producao-lembrete-viagens-despachadas.sh   (railway CLI logado)
set -euo pipefail
REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && git rev-parse --show-toplevel)}"
cd "$REPO"
DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"
mkdir -p "$DIR"
OUT="$DIR/producao-lembrete-viagens-despachadas-$(date +%Y-%m-%d-%H%M).txt"
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- bun -e '
console.log("== DRIVER_REMINDERS_ENABLED no api ==")
console.log(process.env.DRIVER_REMINDERS_ENABLED === "true" ? "true" : "false (ausente ou outro valor)")
const sql = new Bun.SQL(process.env.DATABASE_URL)
await sql`set transaction read only`.catch(() => {})
const run = async (t, q) => { console.log("== " + t + " =="); try { console.table(await q) } catch (e) { console.log("erro:", String(e.message || e)) } }
await run("interruptor da empresa (company_driver_reminder_settings)", sql`select s.company_id as empresa, s.enabled, s.updated_at from company_driver_reminder_settings s order by 1`)
await run("viagens despachadas sem Iniciar rota, com parada aberta", sql`
  select t.company_id as empresa, t.id as viagem, t.status, snap.dispatched_at as despachada_em,
    round(extract(epoch from now() - snap.dispatched_at) / 3600)::int as horas_desde_despacho,
    (select fd.name from trip_drivers d join fleet_drivers fd on fd.company_id = d.company_id and fd.id = d.driver_id
      where d.company_id = t.company_id and d.trip_id = t.id order by d.position limit 1) as motorista,
    (select count(*)::int from trip_stops s where s.company_id = t.company_id and s.trip_id = t.id and s.completed_at is null) as paradas_abertas,
    coalesce(c.enabled, false) as empresa_ligada
  from trips t
  left join trip_dispatch_snapshots snap on snap.company_id = t.company_id and snap.trip_id = t.id
  left join company_driver_reminder_settings c on c.company_id = t.company_id
  where t.status in (${"dispatched"}, ${"in_transit"})
    and exists (select 1 from trip_stops s where s.company_id = t.company_id and s.trip_id = t.id and s.completed_at is null)
    and not exists (select 1 from trip_stops s where s.company_id = t.company_id and s.trip_id = t.id and s.completed_at is null
      and (s.en_route_since is not null or s.arrived_at is not null))
  order by snap.dispatched_at nulls first`)
await sql.close()
' 2>&1 | grep -v -i "warning" > "$OUT" || true
echo "$OUT"

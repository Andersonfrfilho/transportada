#!/usr/bin/env bash
# PRODUCAO, somente leitura: confere a tela Resultados (/contas/resultado) contra o banco.
# Uso: bash producao-resultado-confere.sh [AAAA-MM-DD_inicio AAAA-MM-DD_fim]   (padrao: mes corrente, America/Sao_Paulo)
# Lista as contas do periodo (a mesma regra da API: competencia entre os meses, cancelada fora), soma por grupo de custo,
# acha contas duplicadas e parcelas repetidas, e conta as viagens concluidas (mesma data de conclusao da API).
set -euo pipefail
REPO="${REPO:-/home/miyazaki/Documents/personal/transportada}"  # roda de qualquer pasta; o cwd não conta
[ -f "$REPO/.github/scripts/railway-deploy.sh" ] || { echo "REPO invalido: $REPO" >&2; exit 1; }
command -v railway >/dev/null || { echo "railway CLI nao encontrado" >&2; exit 1; }
FROM="${1:-$(TZ=America/Sao_Paulo date +%Y-%m-01)}"
TO="${2:-$(TZ=America/Sao_Paulo date +%Y-%m-%d)}"
OUT_DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"; mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/resultado-confere-$(date +%Y%m%d-%H%M%S).txt"
cd "$REPO"
read -r -d '' JS <<'BUN' || true
const sql = new Bun.SQL(process.env.DATABASE_URL)
const from = process.env.RC_FROM, to = process.env.RC_TO
const out = { from, to }
const considered = `case when o.status = 'paid' and o.paid_amount is not null then o.paid_amount else o.expected_amount end`
await sql.begin('read only', async (tx) => {
  out.companies = await tx.unsafe(`select id, name from companies`)
  out.config = await tx.unsafe(`select company_id, cost_group, criterion from company_expense_allocation_settings order by 1,2`)
  out.contas = await tx.unsafe(`
    select o.company_id, o.id as occurrence_id, e.id as expense_id, e.name, e.kind, e.recurrence, e.installments_total, e.active,
           c.name as category, c.cost_group, v.plate, o.competence, o.due_date, o.installment_number, o.slot, o.status,
           o.expected_amount, o.paid_amount, (${considered}) as considerado,
           coalesce((select sum(t.amount) from company_expense_occurrence_trips t where t.company_id = o.company_id and t.occurrence_id = o.id), 0) as incluido_nas_viagens
    from company_expense_occurrences o
    join company_expenses e on e.company_id = o.company_id and e.id = o.expense_id
    join company_expense_categories c on c.company_id = e.company_id and c.id = e.category_id
    left join fleet_vehicles v on v.company_id = e.company_id and v.id = e.vehicle_id
    where o.competence between '${from.slice(0, 7)}' and '${to.slice(0, 7)}'
    order by c.cost_group, e.name, o.due_date`)
  out.soma_por_grupo = await tx.unsafe(`
    select o.company_id, c.cost_group, (e.vehicle_id is not null) as com_veiculo, o.status, count(*)::int as qtd, sum(${considered}) as total
    from company_expense_occurrences o
    join company_expenses e on e.company_id = o.company_id and e.id = o.expense_id
    join company_expense_categories c on c.company_id = e.company_id and c.id = e.category_id
    where o.competence between '${from.slice(0, 7)}' and '${to.slice(0, 7)}'
    group by 1,2,3,4 order by 1,2,3,4`)
  out.duplicadas_mesma_conta = await tx.unsafe(`
    select o.company_id, o.expense_id, e.name, o.competence, o.installment_number, o.slot, count(*)::int as qtd
    from company_expense_occurrences o join company_expenses e on e.company_id = o.company_id and e.id = o.expense_id
    where o.competence between '${from.slice(0, 7)}' and '${to.slice(0, 7)}' and o.status <> 'canceled'
    group by 1,2,3,4,5,6 having count(*) > 1`)
  out.duplicadas_contas_iguais = await tx.unsafe(`
    select o.company_id, lower(trim(e.name)) as nome, o.expected_amount, o.due_date, count(distinct e.id)::int as contas, array_agg(distinct e.id::text) as expense_ids
    from company_expense_occurrences o join company_expenses e on e.company_id = o.company_id and e.id = o.expense_id
    where o.competence between '${from.slice(0, 7)}' and '${to.slice(0, 7)}' and o.status <> 'canceled'
    group by 1,2,3,4 having count(distinct e.id) > 1`)
  out.parcelas_fora_do_total = await tx.unsafe(`
    select e.id, e.name, e.installments_total, count(*) filter (where o.status <> 'canceled')::int as parcelas_ativas
    from company_expenses e join company_expense_occurrences o on o.company_id = e.company_id and o.expense_id = e.id
    where e.installments_total is not null
    group by 1,2,3 having count(*) filter (where o.status <> 'canceled') <> e.installments_total`)
  out.viagens_concluidas = await tx.unsafe(`
    select company_id, status, count(*)::int as qtd from trips group by 1,2 order by 1,2`)
  out.viagens_no_periodo = await tx.unsafe(`
    select t.company_id, t.id, t.vehicle_id, v.plate,
           to_char((coalesce((select max(s.occurred_at) from trip_status_events s where s.company_id = t.company_id and s.trip_id = t.id and s.to_status = 'completed'), t.closed_at, t.updated_at) at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as concluida_em
    from trips t left join fleet_vehicles v on v.company_id = t.company_id and v.id = t.vehicle_id
    where t.status = 'completed'
    and to_char((coalesce((select max(s.occurred_at) from trip_status_events s where s.company_id = t.company_id and s.trip_id = t.id and s.to_status = 'completed'), t.closed_at, t.updated_at) at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') between '${from}' and '${to}'
    order by 5`)
  out.veiculos_agregados = await tx.unsafe(`select plate, brand, model, model_year, ownership from fleet_vehicles where ownership <> 'own' order by plate`).catch((e) => String(e))
})
console.log('__RESULT__' + JSON.stringify(out, null, 2))
await sql.close()
BUN
ENC="$(printf '%s' "$JS" | base64 -w0)"
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- \
  sh -c "cd /app/apps/api-transportada && RC_FROM=$FROM RC_TO=$TO bun -e \"\$(echo $ENC | base64 -d)\"" >"$OUT" 2>&1 || true
echo "$OUT"

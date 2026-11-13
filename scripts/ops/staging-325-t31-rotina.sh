#!/usr/bin/env bash
# STAGING (spec 325 T3.1): confere migrations/tabelas de Contas e a rotina company-expense.occurrence.generate.
# Padrao: SOMENTE LEITURA.  Com --retomar: faz o mesmo UPDATE do botao "Retomar" do painel de rotinas (enabled=true,
# paused_*=null) e so entao le o estado. Rode sem flag (antes), com --retomar, e de novo sem flag depois de 2 ciclos.
# Uso: bash <este arquivo> [--retomar]
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"
if ! command -v railway >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
command -v railway >/dev/null 2>&1 || { echo "railway nao encontrado no PATH" >&2; exit 1; }
railway whoami >/dev/null 2>&1 || { echo "railway deslogado: rode 'railway login'" >&2; exit 1; }
RETOMAR=0; [ "${1:-}" = "--retomar" ] && RETOMAR=1
BASE="${SAIDAS:-/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas}"; mkdir -p "$BASE"
OUT="$BASE/staging-325-t31-rotina-$(date -u +%Y%m%dT%H%M%SZ).txt"
trap 'echo "$OUT"' EXIT
JS=$(cat <<JSEOF
const sql = new Bun.SQL(process.env.DATABASE_URL)
const retomar = $RETOMAR === 1
const out = {}
const safe = async (k, f) => { try { out[k] = await f() } catch (e) { out[k] = "erro: " + String(e.message).slice(0, 300) } }
await safe("tabelas_contas", () => sql\`select table_name from information_schema.tables where table_name like 'company_expense%' order by 1\`)
await safe("colunas_extras", () => sql\`select table_name, column_name from information_schema.columns where table_name = 'company_expense_categories' and column_name = 'cost_group'\`)
if (retomar) await safe("retomada", () => sql\`update job_schedules set enabled = true, paused_at = null, paused_by = null, paused_origin = null, updated_at = now() where job = 'company-expense.occurrence.generate' returning job, enabled, paused_origin, next_run_at\`)
await safe("relogio", () => sql\`select job, enabled, paused_origin, interval_seconds, next_run_at from job_schedules where job = 'company-expense.occurrence.generate'\`)
await safe("execucoes", () => sql\`select origin, started_at, finished_at, outcome, counters from job_executions where job = 'company-expense.occurrence.generate' order by started_at desc limit 6\`)
await safe("categorias_por_empresa", () => sql\`select company_id, count(*)::int as n from company_expense_categories group by 1\`)
await safe("contas", () => sql\`select kind, recurrence, active, count(*)::int as n from company_expenses group by 1,2,3 order by 1,2,3\`)
await safe("ocorrencias", () => sql\`select competence, status, count(*)::int as n, sum(expected_amount)::text as previsto from company_expense_occurrences group by 1,2 order by 1 desc, 2\`)
await safe("duplicadas", () => sql\`select expense_id, competence, slot, count(*)::int as n from company_expense_occurrences group by 1,2,3 having count(*) > 1\`)
await safe("viagens_incluidas", () => sql\`select parcel_kind, count(*)::int as n from company_expense_occurrence_trips group by 1\`)
console.log("__RESULT__" + JSON.stringify(out, null, 1))
await sql.close()
JSEOF
)
ENC=$(printf '%s' "$JS" | base64 -w0)
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e staging -- sh -c "echo $ENC | base64 -d > /tmp/t31.mjs && bun /tmp/t31.mjs; rm -f /tmp/t31.mjs" 2>&1 | sed -n '/__RESULT__/,$p' | sed 's/__RESULT__//' > "$OUT" || true
[ -s "$OUT" ] || echo "sem resultado: confira o railway ssh (servico api, ambiente staging)" > "$OUT"

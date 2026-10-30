#!/usr/bin/env bash
# SOMENTE LEITURA em PRODUÇÃO: validade do certificado digital A1 (digital_certificates), execuções da
# importação automática (job_executions nfe.distribution.pull) com certificate_expired e envios que
# mencionam certificado. Grava tudo em ativada/saidas/ e imprime só o caminho.
# Uso: bash /home/miyazaki/Documents/personal/ativada/producao-certificado-validade.sh   (railway CLI logado)
set -euo pipefail
DIR="/home/miyazaki/Documents/personal/ativada/saidas"
mkdir -p "$DIR"
OUT="$DIR/producao-certificado-validade-$(date +%Y-%m-%d-%H%M).txt"
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- bun -e '
const sql = new Bun.SQL(process.env.DATABASE_URL)
await sql`set transaction read only`.catch(() => {})
const run = async (t, q) => { console.log("== " + t + " =="); try { console.log(await q) } catch (e) { console.log("erro:", String(e.message || e)) } }
await run("certificados (sem segredo)", sql`select c.id, co.name as empresa, c.purpose, c.version, c.status, c.valid_from, c.expires_at, (c.expires_at < now()) as vencido, c.created_at from digital_certificates c join companies co on co.id = c.company_id order by c.company_id, c.purpose, c.version desc`)
await run("importacao automatica: resultados nos ultimos 30 dias", sql`select outcome, count(*)::int as total, min(started_at) as primeira, max(started_at) as ultima from job_executions where job = ${"nfe.distribution.pull"} and started_at > now() - interval ${"30 days"} group by 1 order by 4 desc`)
await run("execucoes com certificate_expired", sql`select started_at, finished_at, outcome, counters from job_executions where outcome like ${"certificate%"} order by started_at desc limit 20`)
await run("tabelas com notificacao/envio", sql`select table_name from information_schema.tables where table_schema = ${"public"} and (table_name ilike ${"%notif%"} or table_name ilike ${"%outbox%"} or table_name ilike ${"%mail%"}) order by 1`)
await run("auditoria sobre certificado", sql`select created_at, action, entity_type, result from audit_logs where action ilike ${"%certificate%"} or entity_type ilike ${"%certificate%"} order by created_at desc limit 20`)
await sql.close()
' 2>&1 | grep -v -i "warning" > "$OUT" || true
echo "$OUT"

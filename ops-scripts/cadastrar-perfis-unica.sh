#!/usr/bin/env bash
# Cadastra os dois perfis CT-e da UNICA (CNPJ 26344834000108): 5% Ribeirão Preto e 6% São José do Rio Preto,
# cada um com a sua lista de cidades de destino. Spec 312. Clona o perfil ativo da SPANI (raiz 05868574) como
# modelo SEM alterá-lo. Sem --apply roda tudo numa transação e desfaz (simulação).
# Uso: bash cadastrar-perfis-unica.sh <staging|production> [--apply]
set -euo pipefail
PROJECT_ID="62de4c69-216a-4335-93a0-4942c6a95c54"
OUT_DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"
ENVIRONMENT="${1:-}"; APPLY="${2:-}"
case "$ENVIRONMENT" in staging | production) ;; *) echo "uso: $0 <staging|production> [--apply]" >&2; exit 1 ;; esac
if [ "$APPLY" = "--apply" ]; then
  read -r -p "Gravar os 2 perfis da UNICA em $ENVIRONMENT? Digite sim: " ANSWER
  [ "$ANSWER" = "sim" ] || { echo "cancelado" >&2; exit 1; }
fi
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/cadastrar-perfis-unica-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S).txt"
read -r -d '' JS <<'JS' || true
const sql = new Bun.SQL(process.env.DATABASE_URL)
const apply = process.env.APPLY === '--apply'
const cities = JSON.parse(Buffer.from(process.env.CITIES_B64, 'base64').toString('utf8'))
const UNICA = '26344834000108'
const TARGETS = [
  { name: 'UNICA Ribeirão Preto 5%', pct: '0.050000', label: 'Frete UNICA 5', cities: cities.rp },
  { name: 'UNICA São José do Rio Preto 6%', pct: '0.060000', label: 'Frete UNICA 6', cities: cities.sj },
]
const pgArray = (list) => '{' + list.map((v) => '"' + v.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"').join(',') + '}'
const out = { modo: apply ? 'GRAVAR' : 'SIMULACAO', passos: [] }
const finish = async (code = 0) => { console.log('__RESULT__' + JSON.stringify(out)); await sql.close(); process.exit(code) }
try {
  const companies = await sql`select id from companies where status = 'active'`
  if (companies.length !== 1) { out.erro = 'precisa de exatamente uma empresa ativa'; await finish() }
  const companyId = companies[0].id
  const spani = await sql`select p.id, p.name, p.status, p.freight_rule_id, p.priority from cte_emission_profiles p join cte_emission_profile_matchers m on m.profile_id = p.id and m.company_id = p.company_id where p.company_id = ${companyId} and m.tax_id = '05868574' and p.status = 'active'`
  out.modeloSpani = spani.map((r) => ({ id: r.id, nome: r.name }))
  if (spani.length !== 1) { out.erro = 'esperava 1 perfil ativo da SPANI (raiz 05868574) como modelo'; await finish() }
  const src = spani[0]
  const existentes = await sql`select name from cte_emission_profiles where company_id = ${companyId} and name in ${sql(TARGETS.map((t) => t.name))}`
  if (existentes.length > 0) { out.erro = 'já existe perfil com esse nome'; out.existentes = existentes; await finish() }
  class Rollback extends Error {}
  try {
    await sql.begin(async (tx) => {
      for (const t of TARGETS) {
        const ruleId = crypto.randomUUID()
        const profileId = crypto.randomUUID()
        await tx`create temp table tr on commit drop as select * from freight_rules where id = ${src.freight_rule_id}`
        await tx`update tr set id = ${ruleId}, name = ${t.name}, status = 'active', current_version = 1, created_at = now(), updated_at = now()`
        await tx`insert into freight_rules select * from tr`
        await tx`create temp table tv on commit drop as select * from freight_rule_versions where freight_rule_id = ${src.freight_rule_id} order by version desc limit 1`
        await tx`update tv set id = gen_random_uuid(), freight_rule_id = ${ruleId}, version = 1, status = 'active', percentage = ${t.pct}, valid_from = now(), valid_until = null, created_at = now(), updated_at = now(), snapshot = snapshot || jsonb_build_object('freightRuleId', ${ruleId}::text, 'percentage', ${t.pct}::text, 'ruleVersion', '1', 'validFrom', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'validUntil', null)`
        await tx`insert into freight_rule_versions select * from tv`
        await tx`create temp table tp on commit drop as select * from cte_emission_profiles where id = ${src.id}`
        await tx`update tp set id = ${profileId}, name = ${t.name}, freight_rule_id = ${ruleId}, status = 'active', version = 1, charge_component_label = ${t.label}, created_at = now(), updated_at = now()`
        await tx`insert into cte_emission_profiles select * from tp`
        await tx`update cte_emission_profiles set destination_cities = ${pgArray(t.cities)}::text[] where id = ${profileId}`
        await tx`insert into cte_emission_profile_matchers (company_id, profile_id, tax_id, match_role) values (${companyId}, ${profileId}, ${UNICA}, 'sender')`
        await tx`create temp table tc on commit drop as select * from cte_emission_profile_components where profile_id = ${src.id}`
        await tx`update tc set id = gen_random_uuid(), profile_id = ${profileId}, created_at = now(), updated_at = now()`
        await tx`insert into cte_emission_profile_components select * from tc`
        const [chk] = await tx`select p.name, p.status, cardinality(p.destination_cities) as cidades, p.priority, r.status as regra, v.percentage from cte_emission_profiles p join freight_rules r on r.id = p.freight_rule_id join freight_rule_versions v on v.freight_rule_id = r.id where p.id = ${profileId}`
        out.passos.push(chk)
        await tx`drop table tr`; await tx`drop table tv`; await tx`drop table tp`; await tx`drop table tc`
      }
      if (!apply) throw new Rollback('simulacao')
    })
    out.gravado = true
  } catch (e) {
    if (e instanceof Rollback) out.desfeito = 'simulação concluída sem gravar'
    else { out.erro = String(e?.message ?? e); await finish(1) }
  }
  out.aviso = 'não grava audit_log; ativação e conferência pela tela de perfis'
  await finish()
} catch (e) { out.erro = String(e?.message ?? e); await finish(1) }
JS
CITIES_B64="eyJycCI6IFsiQUdVQUl8U1AiLCAiQUdVQVMgREEgUFJBVEF8U1AiLCAiQUxUSU5PUE9MSVN8U1AiLCAiQU1FUklDTyBCUkFTSUxJRU5TRXxTUCIsICJBTkFMQU5ESUF8U1AiLCAiQVJBTUlOQXxTUCIsICJBUkFSQVFVQVJBfFNQIiwgIkJBUlJFVE9TfFNQIiwgIkJBUlJJTkhBfFNQIiwgIkJBVEFUQUlTfFNQIiwgIkJFQkVET1VST3xTUCIsICJCT0EgRVNQRVJBTkNBIERPIFNVTHxTUCIsICJCUk9ET1dTS0l8U1AiLCAiQlVSSVRJWkFMfFNQIiwgIkNBSlVSVXxTUCIsICJDQU5ESUEgRElTVFJJVE98U1AiLCAiQ0FTQSBCUkFOQ0F8U1AiLCAiQ0FTU0lBIERPUyBDT1FVRUlST1N8U1AiLCAiQ09MSU5BfFNQIiwgIkNPTE9NQklBfFNQIiwgIkNSQVZJTkhPU3xTUCIsICJDUklTVEFJUyBQQVVMSVNUQXxTUCIsICJERVNDQUxWQURPfFNQIiwgIkRPQlJBREF8U1AiLCAiRE9VUkFET3xTUCIsICJEVU1PTlR8U1AiLCAiRVNQSVJJVE8gU0FOVE8gRE8gUElOSEFMfFNQIiwgIkZFUk5BTkRPIFBSRVNURVN8U1AiLCAiRlJBTkNBfFNQIiwgIkdVQUlSQXxTUCIsICJHVUFSQXxTUCIsICJHVUFSSUJBfFNQIiwgIklCQVRFfFNQIiwgIklHQVJBUEFWQXxTUCIsICJJUFVBfFNQIiwgIklUQVBPTElTfFNQIiwgIklUSVJBUElOQXxTUCIsICJJVElSQVBVQXxTUCIsICJJVE9CSXxTUCIsICJJVFVWRVJBVkF8U1AiLCAiSkFCT1JBTkRJfFNQIiwgIkpBQk9USUNBQkFMfFNQIiwgIkpBUkRJTk9QT0xJU3xTUCIsICJMVUlTIEFOVE9OSU98U1AiLCAiTUFUQU98U1AiLCAiTUlHVUVMT1BPTElTfFNQIiwgIk1PQ09DQXxTUCIsICJNT05URSBBTFRPfFNQIiwgIk1PTlRFIEFaVUwgUEFVTElTVEF8U1AiLCAiTU9SUk8gQUdVRE98U1AiLCAiTlVQT1JBTkdBfFNQIiwgIk9MSU1QSUF8U1AiLCAiT1JMQU5ESUF8U1AiLCAiUEFUUk9DSU5JTyBQQVVMSVNUQXxTUCIsICJQRURSRUdVTEhPfFNQIiwgIlBJUkFTU1VOVU5HQXxTUCIsICJQSVRBTkdVRUlSQVN8U1AiLCAiUE9OVEFMfFNQIiwgIlBPUlRPIEZFUlJFSVJBfFNQIiwgIlBSQURPUE9MSVN8U1AiLCAiUkVTVElOR0F8U1AiLCAiUklCRUlSQU8gQk9OSVRPfFNQIiwgIlJJQkVJUkFPIENPUlJFTlRFfFNQIiwgIlJJQkVJUkFPIFBSRVRPfFNQIiwgIlJJRkFJTkF8U1AiLCAiUklOQ0FPfFNQIiwgIlNBTEVTIE9MSVZFSVJBfFNQIiwgIlNBTlRBIENSVVogREEgQ09OQ0VJQ0FPfFNQIiwgIlNBTlRBIENSVVogREFTIFBBTE1FSVJBU3xTUCIsICJTQU5UQSBFUk5FU1RJTkF8U1AiLCAiU0FOVEEgTFVDSUF8U1AiLCAiU0FOVEEgUklUQSBETyBQQVNTQSBRVUFUUk98U1AiLCAiU0FOVEEgUk9TQSBERSBWSVRFUkJPfFNQIiwgIlNBTlRPIEFOVE9OSU8gREEgQUxFR1JJQXxTUCIsICJTQU5UTyBBTlRPTklPIERPIEpBUkRJTXxTUCIsICJTQU8gQ0FSTE9TfFNQIiwgIlNBTyBKT0FPIERBIEJPQSBWSVNUQXxTUCIsICJTQU8gSk9BUVVJTSBEQSBCQVJSQXxTUCIsICJTQU8gSk9TRSBEQSBCRUxBIFZJU1RBfFNQIiwgIlNBTyBKT1NFIERPIFJJTyBQQVJET3xTUCIsICJTQU8gU0VCQVNUSUFPIERBIEdSQU1BfFNQIiwgIlNBTyBTSU1BT3xTUCIsICJTRVJSQSBBWlVMfFNQIiwgIlNFUlJBTkF8U1AiLCAiU0VSVEFPWklOSE98U1AiLCAiU0VWRVJJTklBfFNQIiwgIlRBTUJBVXxTUCIsICJUQVBJUkFUSUJBfFNQIiwgIlRBUVVBUklUSU5HQXxTUCIsICJURVJSQSBST1hBfFNQIiwgIlZBUkdFTSBHUkFOREUgRE8gU1VMfFNQIiwgIlZJUkFET1VST3xTUCIsICJWSVNUQSBBTEVHUkUgRE8gQUxUT3xTUCJdLCAic2oiOiBbIkFET0xGT3xTUCIsICJBTFRPIEFMRUdSRXxTUCIsICJBTFZBUkVTIEZMT1JFTkNFfFNQIiwgIkFNRVJJQ08gREUgQ0FNUE9TfFNQIiwgIkFORFJBRElOQXxTUCIsICJBUEFSRUNJREEgRCdPRVNURXxTUCIsICJBUkFDQVRVQkF8U1AiLCAiQVJJUkFOSEF8U1AiLCAiQVNQQVNJQXxTUCIsICJBVVJJRkxBTUF8U1AiLCAiQkFEWSBCQVNTSVRUfFNQIiwgIkJBTFNBTU98U1AiLCAiQkFSQk9TQXxTUCIsICJCRU5UTyBERSBBQlJFVXxTUCIsICJCSUxBQ3xTUCIsICJCSVJJR1VJfFNQIiwgIkJPUkJPUkVNQXxTUCIsICJCUkFVTkF8U1AiLCAiQlJFSk8gQUxFR1JFfFNQIiwgIkJVUklUQU1BfFNQIiwgIkNBUkRPU098U1AiLCAiQ0FTVElMSE98U1AiLCAiQ0FUQU5EVVZBfFNQIiwgIkNBVElHVUF8U1AiLCAiQ0VEUkFMfFNQIiwgIkNMRU1FTlRJTkF8U1AiLCAiQ09ST0FET1N8U1AiLCAiQ09TTU9SQU1BfFNQIiwgIkRJUkNFIFJFSVN8U1AiLCAiRE9MQ0lOT1BPTElTfFNQIiwgIkVMSVNJQVJJT3xTUCIsICJFTUJBVUJBfFNQIiwgIkVTVFJFTEEgRCBPRVNURXxTUCIsICJGRVJOQU5ET1BPTElTfFNQIiwgIkZMT1JFQUx8U1AiLCAiR0FCUklFTCBNT05URUlST3xTUCIsICJHQVNUQU8gVklESUdBTHxTUCIsICJHRU5FUkFMIFNBTEdBRE98U1AiLCAiR0xJQ0VSSU98U1AiLCAiR1VBUElBQ1V8U1AiLCAiR1VBUkFDQUl8U1AiLCAiR1VBUkFOSSBEIE9FU1RFfFNQIiwgIkdVQVJBUkFQRVN8U1AiLCAiR1VaT0xBTkRJQXxTUCIsICJJQklSQXxTUCIsICJJQklUSU5HQXxTUCIsICJJQ0VNfFNQIiwgIklMSEEgU09MVEVJUkF8U1AiLCAiSU5ESUFQT1JBfFNQIiwgIklQSUdVQXxTUCIsICJJUkFQVUF8U1AiLCAiSVRBSk9CSXxTUCIsICJJVEFQVVJBfFNQIiwgIkpBQ0l8U1AiLCAiSkFMRVN8U1AiLCAiSk9TRSBCT05JRkFDSU98U1AiLCAiTEFWSU5JQXxTUCIsICJMT1VSREVTfFNQIiwgIkxVSVpJQU5JQXxTUCIsICJNQUNBVUJBTHxTUCIsICJNQUNFRE9OSUF8U1AiLCAiTUFHREF8U1AiLCAiTUFSQVBPQU1BfFNQIiwgIk1BUklOT1BPTElTfFNQIiwgIk1FTkRPTkNBfFNQIiwgIk1FUklESUFOT3xTUCIsICJNRVNPUE9MSVN8U1AiLCAiTUlSQSBFU1RSRUxBfFNQIiwgIk1JUkFORE9QT0xJU3xTUCIsICJNSVJBU1NPTHxTUCIsICJNSVJBU1NPTEFORElBfFNQIiwgIk1PTkNPRVN8U1AiLCAiTU9OVEUgQVBSQVpJVkVMfFNQIiwgIk1VUlVUSU5HQSBETyBTVUx8U1AiLCAiTkVWRVMgUEFVTElTVEF8U1AiLCAiTkhBTkRFQVJBfFNQIiwgIk5JUE9BfFNQIiwgIk5PVkEgQUxJQU5DQXxTUCIsICJOT1ZBIENBTkFBIFBBVUxJU1RBfFNQIiwgIk5PVkEgQ0FTVElMSE98U1AiLCAiTk9WQSBFVVJPUEF8U1AiLCAiTk9WQSBHUkFOQURBfFNQIiwgIk5PVkEgSU5ERVBFTkRFTkNJQXxTUCIsICJOT1ZBIExVWklUQU5JQXxTUCIsICJOT1ZPIEhPUklaT05URXxTUCIsICJPTkRBIFZFUkRFfFNQIiwgIk9SSU5ESVVWQXxTUCIsICJPVVJPRVNURXxTUCIsICJQQUxFU1RJTkF8U1AiLCAiUEFMTUFSRVMgUEFVTElTVEF8U1AiLCAiUEFMTUVJUkEgRGBPRVNURXxTUCIsICJQQVJBSVNPfFNQIiwgIlBBUkFOQVBVQXxTUCIsICJQQVJJU0l8U1AiLCAiUEFVTE8gREUgRkFSSUF8U1AiLCAiUEVEUkFOT1BPTElTfFNQIiwgIlBFTkFQT0xJU3xTUCIsICJQRVJFSVJBIEJBUlJFVE98U1AiLCAiUElBQ0FUVXxTUCIsICJQSU5ET1JBTUF8U1AiLCAiUElSQU5HSXxTUCIsICJQTEFOQUxUT3xTUCIsICJQT0xPTkl8U1AiLCAiUE9OVEFMSU5EQXxTUCIsICJQT05URVMgR0VTVEFMfFNQIiwgIlBPUFVMSU5BfFNQIiwgIlBPVElSRU5EQUJBfFNQIiwgIlJJT0xBTkRJQXxTUCIsICJSVUJJQUNFQXxTUCIsICJSVUJJTkVJQXxTUCIsICJTQU5UQSBBREVMSUF8U1AiLCAiU0FOVEEgQUxCRVJUSU5BfFNQIiwgIlNBTlRBIENMQVJBIERPRVNURXxTUCIsICJTQU5UQSBGRSBETyBTVUx8U1AiLCAiU0FOVEEgUklUQSBET0VTVEV8U1AiLCAiU0FOVEEgU0FMRVRFfFNQIiwgIlNBTlRBTkEgREEgUE9OVEUgUEVOU0F8U1AiLCAiU0FOVE8gQU5UT05JTyBETyBBUkFDQU5HVUF8U1AiLCAiU0FOVE9QT0xJUyBETyBBR1VBUEVJfFNQIiwgIlNBTyBGUkFOQ0lTQ098U1AiLCAiU0FPIEpPQU8gREFTIERVQVMgUE9OVEVTfFNQIiwgIlNBTyBKT0FPIERFIElSQUNFTUF8U1AiLCAiU0FPIEpPU0UgRE8gUklPIFBSRVRPfFNQIiwgIlNFQkFTVElBTk9QT0xJUyBETyBTVUx8U1AiLCAiU1VEIE1FTk5VQ0NJfFNQIiwgIlNVWkFOQVBPTElTfFNQIiwgIlRBQkFQVUF8U1AiLCAiVEFJQUNVfFNQIiwgIlRBSVVWQXxTUCIsICJUQU5BQkl8U1AiLCAiVFJFUyBGUk9OVEVJUkFTfFNQIiwgIlRVUklVQkF8U1AiLCAiVFVSTUFMSU5BfFNQIiwgIlVCQVJBTkF8U1AiLCAiVUNIT0F8U1AiLCAiVU5JQU8gUEFVTElTVEF8U1AiLCAiVVJBTklBfFNQIiwgIlZBTEVOVElNIEdFTlRJTHxTUCIsICJWQUxQQVJBSVNPfFNQIiwgIlZJVE9SSUEgQlJBU0lMfFNQIiwgIlZPVFVQT1JBTkdBfFNQIiwgIlpBQ0FSSUFTfFNQIl19"
ENCODED="$(printf '%s' "$JS" | base64 -w0)"
RAW="$(railway ssh -p "$PROJECT_ID" -s api -e "$ENVIRONMENT" -- sh -c \
  "echo $ENCODED | base64 -d > /tmp/unica.mjs && CITIES_B64='$CITIES_B64' APPLY='$APPLY' bun /tmp/unica.mjs; rm -f /tmp/unica.mjs" 2>&1)" || { printf '%s\n' "$RAW" >"$OUT"; echo "$OUT"; exit 1; }
printf '%s\n' "$RAW" | grep '^__RESULT__' | sed 's/^__RESULT__//' >"$OUT" || printf '%s\n' "$RAW" >"$OUT"
echo "$OUT"

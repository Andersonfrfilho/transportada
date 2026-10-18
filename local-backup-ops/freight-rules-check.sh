#!/usr/bin/env bash
# Somente leitura: lista regras de frete (versão corrente) e perfis de NFS-e do serviço api em produção.
# Uso (Ubuntu/WSL): bash ~/personal/freight-rules-check.sh
set -euo pipefail

export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"

PROJECT_ID="$(railway list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).find(x=>x.name==="transportada").id))')"

railway ssh -p "$PROJECT_ID" -s api -e production bun -e '
const sql = new Bun.SQL(process.env.DATABASE_URL);
await sql.begin("read only", async (tx) => {
const rules = await tx`
  select r.name, r.status, r.priority, v.version,
         (v.percentage * 100)::numeric(9,4) as percentage_pct,
         v.minimum_amount, v.maximum_amount, v.valid_from, v.valid_until,
         v.filters::text as filters
  from freight_rules r
  join freight_rule_versions v
    on v.company_id = r.company_id and v.freight_rule_id = r.id and v.version = r.current_version
  order by r.priority, r.name`;
console.log("== Regras de frete ==");
for (const r of rules) console.log(JSON.stringify(r));
const profiles = await tx`
  select p.name, p.status, p.version, p.freight_rule_id, r.name as freight_rule_name,
         p.municipality_ibge_code, p.nbs_code, p.iss_rate
  from nfse_emission_profiles p
  left join freight_rules r on r.company_id = p.company_id and r.id = p.freight_rule_id
  order by p.name`;
console.log("== Perfis NFS-e ==");
for (const p of profiles) console.log(JSON.stringify(p));
});
process.exit(0);
'

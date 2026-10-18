#!/usr/bin/env bash
# Perfil NFS-e "Transporte municipal - Ribeirão Preto" (produção).
# Sem argumento: SOMENTE LEITURA, mostra o perfil atual.
# Com --apply: em uma transação, grava os 3 campos abaixo e mostra antes/depois.
# Uso (Ubuntu/WSL): bash ~/personal/nfse-fill-profile.sh [--apply]
set -euo pipefail

MODE="read"
if [[ "${1:-}" == "--apply" ]]; then MODE="apply"; elif [[ -n "${1:-}" ]]; then echo "argumento inválido: $1" >&2; exit 1; fi

export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"

PROJECT_ID="$(railway list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).find(x=>x.name==="transportada").id))')"

railway ssh -p "$PROJECT_ID" -s api -e production bun -e '
const mode = "'"$MODE"'";
const PROFILE_NAME = "Transporte municipal - Ribeirão Preto";
const sql = new Bun.SQL(process.env.DATABASE_URL);
const show = async (tx, label) => {
  const rows = await tx`select * from nfse_emission_profiles where name = ${PROFILE_NAME}`;
  console.log("== " + label + " ==");
  for (const r of rows) console.log(JSON.stringify(r, null, 2));
  return rows;
};
await sql.begin(mode === "apply" ? "read write" : "read only", async (tx) => {
  const before = await show(tx, "ANTES");
  if (before.length !== 1) throw new Error("esperava 1 perfil, achei " + before.length);
  if (mode !== "apply") return;
  const updated = await tx`
    update nfse_emission_profiles
       set national_taxation_code = ${"160201"},
           municipal_taxation_code = ${"160101"},
           simples_national_rate = ${"4.500000"}
     where name = ${PROFILE_NAME}
    returning id`;
  if (updated.length !== 1) throw new Error("update afetou " + updated.length + " linhas; abortando");
  await show(tx, "DEPOIS");
});
console.log(mode === "apply" ? "Aplicado." : "Somente leitura; nada alterado. Use --apply para gravar.");
process.exit(0);
'

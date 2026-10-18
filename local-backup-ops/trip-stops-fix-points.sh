#!/usr/bin/env bash
# ESCREVE em produção (geocoded_addresses): grava o ponto manual dos endereços informados.
# Padrão é simulação (mostra o antes e o depois sem gravar). Para gravar: --confirm
#
# Uso (Ubuntu/WSL):
#   bash /mnt/c/Users/ander/Documentos/personal/trip-stops-fix-points.sh            # simulação
#   bash /mnt/c/Users/ander/Documentos/personal/trip-stops-fix-points.sh --confirm  # grava
#
# Outros pontos: --point "3551702|14179000|80=-21.1234567,-48.1234567" (pode repetir).
# Auditoria opcional: ACTOR_USER_ID=<uuid> grava também a trilha em geocoded_address_corrections.
set -euo pipefail

export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"

COMPANY_ID="ce523659-5e30-4b13-96ce-8d603d8cb9e9"
CONFIRM="false"
POINTS=(
  "3551702|14179000|971=-21.0758798,-47.9026041"
  "3551702|14179084|475=-21.0780176,-47.8991948"
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirm) CONFIRM="true"; shift ;;
    --point) POINTS+=("$2"); shift 2 ;;
    --valerini) POINTS+=("3551702|14179000|80=-21.069643,-47.90253"); shift ;;
    *) echo "argumento desconhecido: $1" >&2; exit 1 ;;
  esac
done

POINTS_JSON="["
for point in "${POINTS[@]}"; do
  if [[ ! "$point" =~ ^[0-9]+\|[0-9]+\|[0-9A-Za-z]+=-?[0-9]{1,2}\.[0-9]{1,7},-?[0-9]{1,3}\.[0-9]{1,7}$ ]]; then
    echo "ponto inválido (use ponto decimal): $point" >&2
    exit 1
  fi
  key="${point%%=*}"
  coords="${point#*=}"
  POINTS_JSON+="{\"addressKey\":\"$key\",\"latitude\":\"${coords%%,*}\",\"longitude\":\"${coords#*,}\"},"
done
POINTS_JSON="${POINTS_JSON%,}]"

ACTOR="${ACTOR_USER_ID:-}"
if [[ -n "$ACTOR" && ! "$ACTOR" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "ACTOR_USER_ID inválido" >&2
  exit 1
fi

PROJECT_ID="$(railway list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).find(x=>x.name==="transportada").id))')"

railway ssh -p "$PROJECT_ID" -s api -e production bun -e '
const sql = new Bun.SQL(process.env.DATABASE_URL);
const points = '"$POINTS_JSON"';
const companyId = "'"$COMPANY_ID"'";
const actor = "'"$ACTOR"'";
const confirm = '"$CONFIRM"';
const read = async (keys) => sql`select address_key, latitude, longitude, source from geocoded_addresses where address_key in ${sql(keys)} order by address_key`;
const keys = points.map((p) => p.addressKey);
console.log("ANTES"); console.table(await read(keys));
if (!confirm) { console.log("Simulação: nada foi gravado. Use --confirm para gravar."); process.exit(0); }
await sql.begin(async (tx) => {
  for (const p of points) {
    const [previous] = await tx`select latitude, longitude, source, precision from geocoded_addresses where address_key = ${p.addressKey}`;
    await tx`insert into geocoded_addresses (address_key, latitude, longitude, external_place_id, source, precision)
      values (${p.addressKey}, ${p.latitude}, ${p.longitude}, ${""}, ${"manual"}, ${"rooftop"})
      on conflict (address_key) do update set latitude = excluded.latitude, longitude = excluded.longitude,
        external_place_id = excluded.external_place_id, source = excluded.source, precision = excluded.precision,
        geocoded_at = now(), updated_at = now()`;
    if (actor !== "") {
      await tx`insert into geocoded_address_corrections
        (company_id, address_key, previous_latitude, previous_longitude, previous_source, previous_precision,
         new_latitude, new_longitude, new_source, new_precision, origin, actor_user_id, reason)
        values (${companyId}, ${p.addressKey}, ${previous?.latitude ?? null}, ${previous?.longitude ?? null},
         ${previous?.source ?? null}, ${previous?.precision ?? null}, ${p.latitude}, ${p.longitude},
         ${"manual"}, ${"rooftop"}, ${"operator"}, ${actor}, ${"correção via script, viagem ef64efdd"})`;
    }
  }
});
console.log("GRAVADO. DEPOIS"); console.table(await read(keys));
process.exit(0);
'

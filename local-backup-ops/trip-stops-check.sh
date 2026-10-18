#!/usr/bin/env bash
# Somente leitura: lista as paradas da viagem e diz quais estão sem coordenada ou sem nota viva.
# Uso (Ubuntu/WSL): bash ~/personal/trip-stops-check.sh [tripId]
set -euo pipefail

TRIP_ID="${1:-ef64efdd-b338-45e0-9bc2-77bd779d7fb3}"
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"

if [[ ! "$TRIP_ID" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "tripId inválido" >&2
  exit 1
fi

PROJECT_ID="$(railway list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).find(x=>x.name==="transportada").id))')"

railway ssh -p "$PROJECT_ID" -s api -e production bun -e '
const sql = new Bun.SQL(process.env.DATABASE_URL);
await sql`set transaction read only`.catch(() => {});
const rows = await sql`
  select s.id, s.sequence, s.address_key,
         g.latitude, g.longitude,
         (g.address_key is not null) as has_geocode_row,
         (select count(*) from trip_documents d
            where d.stop_id = s.id and d.released_at is null)::int as live_documents
  from trip_stops s
  left join geocoded_addresses g on g.address_key = s.address_key
  where s.trip_id = ${"'"$TRIP_ID"'"}
  order by s.sequence`;
console.table(rows);
const blocking = rows.filter((r) => r.latitude === null || r.longitude === null);
console.log(blocking.length === 0
  ? "Nenhuma parada sem coordenada."
  : "Paradas sem coordenada (travam o plan-route): " + blocking.map((r) => r.sequence + " (notas vivas: " + r.live_documents + ")").join(", "));
process.exit(0);
'

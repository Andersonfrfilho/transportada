#!/usr/bin/env bash
# Somente leitura: acha viagens ainda não despachadas com parada viva sem coordenada
# (a causa do 422 do plan-route) e paradas com ponto só do município (aproximado).
# Uso (Ubuntu/WSL): bash /mnt/c/Users/ander/Documentos/personal/trips-scan-missing-points.sh
set -euo pipefail

export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"

PROJECT_ID="$(railway list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).find(x=>x.name==="transportada").id))')"

railway ssh -p "$PROJECT_ID" -s api -e production bun -e '
const sql = new Bun.SQL(process.env.DATABASE_URL);
await sql`set transaction read only`.catch(() => {});
const statuses = ["draft", "route_planned", "separating", "loading"];
const live = sql`exists (select 1 from trip_documents d where d.stop_id = s.id and d.released_at is null)`;
const missing = await sql`
  select left(t.id::text, 8) as trip, t.status, s.sequence, s.address_key
  from trips t
  join trip_stops s on s.trip_id = t.id and s.company_id = t.company_id
  left join geocoded_addresses g on g.address_key = s.address_key
  where t.status in ${sql(statuses)}
    and g.address_key is null and ${live}
  order by t.id, s.sequence`;
console.log("SEM COORDENADA (travam o plan-route):"); console.table(missing);
const approx = await sql`
  select left(t.id::text, 8) as trip, t.status, s.sequence, s.address_key, g.precision
  from trips t
  join trip_stops s on s.trip_id = t.id and s.company_id = t.company_id
  join geocoded_addresses g on g.address_key = s.address_key
  where t.status in ${sql(statuses)}
    and g.precision = ${"city"} and ${live}
  order by t.id, s.sequence`;
console.log("PONTO APROXIMADO (centro do município):"); console.table(approx);
process.exit(0);
'

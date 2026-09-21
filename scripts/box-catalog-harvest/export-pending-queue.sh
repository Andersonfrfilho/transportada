#!/bin/zsh
# Exporta a fila (só GTIN da caixa + contagem, sem dado pessoal) de dentro do serviço api de produção,
# que alcança o Postgres pela rede interna. O banco segue sem proxy público.
set -euo pipefail
OUTPUT="${PENDING_QUEUE_PATH:-$HOME/.config/transportada/pending-gtins.json}"
QUERY_SCRIPT='const { SQL } = require("bun")
const database = new SQL(process.env.DATABASE_URL)
const rows = await database.begin("read only", (transaction) => transaction.unsafe(`select carton_gtin, count(*)::int as pending_boxes from nfe_package_boxes where carton_gtin is not null and length_mm is null group by carton_gtin order by pending_boxes desc`))
console.log("__QUEUE__" + JSON.stringify(rows))
await database.close()'
ENCODED=$(printf '%s' "$QUERY_SCRIPT" | base64 | tr -d '\n')
mkdir -p "$(dirname "$OUTPUT")"
railway ssh --service api --environment production -- sh -c "echo $ENCODED | base64 -d > /tmp/pending-queue.mjs && bun /tmp/pending-queue.mjs; rm -f /tmp/pending-queue.mjs" \
  | grep '^__QUEUE__' | sed 's/^__QUEUE__//' > "$OUTPUT.tmp"
mv "$OUTPUT.tmp" "$OUTPUT"
echo "fila exportada: $(bun -e "console.log(JSON.parse(await Bun.file('$OUTPUT').text()).length)") GTINs em $OUTPUT"

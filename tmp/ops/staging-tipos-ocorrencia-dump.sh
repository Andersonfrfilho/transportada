#!/usr/bin/env bash
# SOMENTE LEITURA em STAGING: despeja a configuração completa (todas as colunas) dos tipos "Espera longa",
# "Local fechado" e "Endereço incorreto", para o script de produção copiar o que a staging tem de verdade.
# Grava em tmp/ops/saidas/ e imprime só o caminho.
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"
if ! command -v railway >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
command -v railway >/dev/null || { echo "railway CLI não encontrado" >&2; exit 1; }
railway whoami >/dev/null || { echo "railway não está logado" >&2; exit 1; }
OUT_DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"; mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/staging-tipos-ocorrencia-dump-$(date +%Y%m%d-%H%M%S).txt"
SCRIPT=$(cat <<'JS'
const sql = new Bun.SQL(process.env.DATABASE_URL)
await sql`set transaction read only`.catch(() => {})
const rows = await sql`select * from company_occurrence_types where lower(btrim(name)) in ('espera longa','local fechado','endereço incorreto') order by name`
const clean = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + '…' : v])))
console.log('__RESULT__' + JSON.stringify(clean, null, 2))
await sql.close()
process.exit(0)
JS
)
ENCODED=$(printf '%s' "$SCRIPT" | base64 -w0)
railway ssh -s api -e staging -- sh -c "echo $ENCODED | base64 -d > /tmp/x.mjs && bun /tmp/x.mjs; rm -f /tmp/x.mjs" 2>&1 | sed -n '/__RESULT__/,$p' | sed 's/^__RESULT__//' > "$OUT"
[ -s "$OUT" ] || { echo "sem resultado" >&2; exit 1; }
echo "$OUT"

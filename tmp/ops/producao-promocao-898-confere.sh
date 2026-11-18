#!/usr/bin/env bash
# PRODUÇÃO (promoção #898): conferência SOMENTE LEITURA depois do deploy.
#  - as 2 migrations novas aplicadas (occurrence_kind e ícones);
#  - tipos "Local fechado" e "Endereço incorreto" com icon_name;
#  - modelos ocorrencia.* ativos por canal;
#  - tipos de ocorrência de parada existentes (Espera longa etc.) e se estão ativos.
# Uso: bash producao-promocao-898-confere.sh     Imprime só o caminho do arquivo de saída.
set -euo pipefail
command -v railway >/dev/null 2>&1 || { echo "railway nao encontrado" >&2; exit 1; }
railway whoami >/dev/null 2>&1 || { echo "railway deslogado" >&2; exit 1; }
BASE="${OUT_DIR:-/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas}"; mkdir -p "$BASE"
OUT="$BASE/producao-promocao-898-confere-$(date -u +%Y%m%dT%H%M%SZ).txt"
trap 'echo "$OUT"' EXIT
JS=$(cat <<'JSEOF'
const sql = new Bun.SQL(process.env.DATABASE_URL)
const out = {}
out.coluna_occurrence_kind = await sql`select column_name, column_default from information_schema.columns where table_name = 'occurrence_contractor_manual_notices' and column_name = 'occurrence_kind'`
out.tipos_icone = await sql`select name, icon_name, active from company_occurrence_types where lower(btrim(name)) in ('local fechado','endereço incorreto','espera longa') order by name`
out.modelos = await sql`select key, channel, locale, max(version) as versao_ativa from notification.templates where key like 'ocorrencia.%' and active group by key, channel, locale order by key, channel`
console.log("__RESULT__" + JSON.stringify(out, null, 1))
await sql.close()
JSEOF
)
ENC=$(printf '%s' "$JS" | base64 -w0)
timeout 180 railway ssh -s api -e production -- sh -c "echo $ENC | base64 -d > /tmp/m.mjs && bun /tmp/m.mjs; rm -f /tmp/m.mjs" 2>&1 | sed -n '/__RESULT__/,$p' | sed 's/__RESULT__//' > "$OUT" || true

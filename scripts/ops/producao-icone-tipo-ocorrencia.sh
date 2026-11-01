#!/usr/bin/env bash
# Define o ícone de um tipo de ocorrência (padrão: "Prorrogação do boleto" -> invoice). Sem --confirm só mostra o que mudaria.
# Uso: [ENV_NAME=staging|production] bash producao-icone-tipo-ocorrencia.sh [--confirm] [--nome "Prorrogação do boleto"] [--icone invoice]
# Ícones aceitos (CHECK do banco): alert camera clipboard-list clock document invoice message money package truck.
# Produção só com aprovação do Anderson. Só escreve `icon_name` e `updated_at`; não toca em nenhuma outra coluna.
set -euo pipefail
ENV_NAME="${ENV_NAME:-staging}"; NOME="Prorrogação do boleto"; ICONE="invoice"; CONFIRM=0
while [ $# -gt 0 ]; do
  case "$1" in
    --confirm) CONFIRM=1 ;;
    --nome) NOME="$2"; shift ;;
    --icone) ICONE="$2"; shift ;;
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
  shift
done
case "$ICONE" in alert|camera|clipboard-list|clock|document|invoice|message|money|package|truck) ;; *) echo "ícone inválido: $ICONE" >&2; exit 2 ;; esac
command -v railway >/dev/null || { echo "railway CLI ausente" >&2; exit 1; }
railway whoami >/dev/null || { echo "railway não está logado" >&2; exit 1; }

CODE=$(cat <<'TS'
import { SQL } from 'bun'
const sql = new SQL(process.env.DATABASE_URL!)
const nome = process.env.TIPO_NOME!, icone = process.env.TIPO_ICONE!, confirm = process.env.TIPO_CONFIRM === '1'
const rows = await sql`select id, company_id, name, icon_name, active from company_occurrence_types where name = ${nome}`
console.log(JSON.stringify(rows, null, 2))
if (rows.length === 0) { console.log('nenhum tipo com esse nome'); process.exit(1) }
if (!confirm) { console.log(`nada gravado. com --confirm: icon_name=${icone} em ${rows.length} tipo(s)`); process.exit(0) }
const done = await sql`update company_occurrence_types set icon_name = ${icone}, updated_at = now() where name = ${nome} returning id, icon_name`
console.log('gravado:', JSON.stringify(done))
await sql.close()
TS
)
B64=$(printf '%s' "$CODE" | base64 -w0)
railway ssh -s api -e "$ENV_NAME" -- sh -c "export TIPO_NOME='$NOME' TIPO_ICONE='$ICONE' TIPO_CONFIRM='$CONFIRM'; echo $B64 | base64 -d > /tmp/icone.ts && bun run /tmp/icone.ts; rm -f /tmp/icone.ts"

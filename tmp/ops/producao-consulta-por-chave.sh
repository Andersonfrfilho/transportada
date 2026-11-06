#!/usr/bin/env bash
# PRODUCAO, leitura: UMA consulta consChNFe (NFeDistribuicaoDFe, por chave) a SEFAZ, de dentro do container do worker.
# Imprime so cStat, xMotivo e schema. Nunca o XML, certificado ou senha. Gasta 1 das 20 consultas/hora do CNPJ.
# Uso: bash tmp/ops/producao-consulta-por-chave.sh <chave de 44 digitos>   (railway CLI logado; COMPANY_ID opcional)
set -euo pipefail
REPO="${REPO:-$(git rev-parse --show-toplevel)}"
HELPER="$REPO/tmp/ops/producao-consulta-por-chave.mjs"
[ -f "$REPO/.github/scripts/railway-deploy.sh" ] || { echo "REPO invalido (sem .github/scripts/railway-deploy.sh): $REPO" >&2; exit 1; }
[ -f "$HELPER" ] || { echo "helper ausente: $HELPER" >&2; exit 1; }

CHAVE="${1:-}"
if ! [[ "$CHAVE" =~ ^[0-9]{44}$ ]]; then
  echo "Uso: $0 <chave de acesso com exatamente 44 digitos>" >&2
  exit 1
fi
COMPANY="${COMPANY_ID:-}"
if [ -n "$COMPANY" ] && ! [[ "$COMPANY" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo "COMPANY_ID invalido: precisa ser um UUID" >&2
  exit 1
fi
[ -t 0 ] || { echo "Confirmacao exige terminal interativo (TTY); recusado." >&2; exit 1; }
command -v railway >/dev/null || { echo "railway CLI nao encontrado" >&2; exit 1; }

echo "ATENCAO: isto chama a SEFAZ de PRODUCAO (consChNFe) com o certificado de distribuicao."
echo "Conta 1 consulta no limite de 20/hora por CNPJ (cStat 656 bloqueia por 1 hora)."
echo "Chave: $CHAVE"
read -r -p 'Digite "sim" para continuar: ' ANSWER
[ "$ANSWER" = "sim" ] || { echo "Cancelado."; exit 1; }

ENCODED="$(base64 -w0 "$HELPER")"
RESULT="$(railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s worker -e production -- \
  sh -c "cd /app/apps/worker-transportada && CHAVE_NFE=$CHAVE COMPANY_ID='$COMPANY' bun -e \"\$(echo $ENCODED | base64 -d)\"" \
  2>&1 | grep '^__RESULT__' || true)"
if [ -z "$RESULT" ]; then
  echo "sem resultado — verifique manualmente (a consulta pode ter contado no limite)" >&2
  exit 1
fi
echo "$RESULT"

#!/usr/bin/env bash
# STAGING (spec 343): republica os modelos de "Cobrança no recebimento" (e-mail e WhatsApp) com o valor cobrado em negrito.
# Sem argumento é SIMULAÇÃO: só mostra o plano (create/same/differs), não grava nada.
# Com --confirm grava uma versão nova da chave `ocorrencia.cobranca-recebimento` (nunca UPDATE; a versão anterior fica).
# Uso: bash tmp/ops/staging-publica-modelo-cobranca-recebimento.sh [--confirm]   (railway CLI logado)
# Imprime só o caminho do arquivo de saída; o plano fica nele (chaves, versões e veredito, sem conteúdo de modelo).
set -euo pipefail
REPO="${REPO:-$(git rev-parse --show-toplevel)}"
OUT_DIR="$REPO/tmp/ops/saidas"
KEY="ocorrencia.cobranca-recebimento"
PROJECT="62de4c69-216a-4335-93a0-4942c6a95c54" # transportada
MODE="simulacao"
[ "${1:-}" = "--confirm" ] && MODE="confirmado"
command -v railway >/dev/null || { echo "railway CLI nao encontrado" >&2; exit 1; }
railway whoami >/dev/null 2>&1 || { echo "railway nao esta logado" >&2; exit 1; }

remote() { # $1 = argumentos do script publicado, dentro do container do api de staging
  railway ssh -p "$PROJECT" -s api -e staging -- sh -c '
    S=$(find / -name occurrence-mail-templates-publish.ts -path "*scripts*" -not -path "*/node_modules/*" 2>/dev/null | head -1)
    [ -n "$S" ] || { echo "script nao encontrado no container" >&2; exit 1; }
    cd "$(dirname "$S")/.." && bun run scripts/occurrence-mail-templates-publish.ts '"$1"'
  ' 2>&1 | tr -d '\r'
}

mapfile -t COMPANIES < <(remote --list-companies | grep -E '^[0-9a-f-]{36}$' || true)
[ "${#COMPANIES[@]}" -gt 0 ] || { echo "nenhuma empresa encontrada em staging" >&2; exit 1; }

mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/staging-publica-modelo-cobranca-recebimento-$MODE-$(date +%Y%m%d-%H%M%S).txt"
{
  echo "# Modelo $KEY em staging, modo $MODE, $(date -u +%FT%TZ)"
  for COMPANY in "${COMPANIES[@]}"; do
    echo "## empresa $COMPANY"
    if [ "$MODE" = "confirmado" ]; then
      remote "--company $COMPANY --confirm --overwrite $KEY"
    else
      remote "--company $COMPANY"
    fi
  done
} > "$FILE"
echo "$FILE"

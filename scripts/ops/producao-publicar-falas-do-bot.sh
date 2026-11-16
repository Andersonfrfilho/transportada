#!/usr/bin/env bash
# Spec 286 T8: republica o grafo raiz do WhatsApp (nós `fala_*` = falas do bot) pelo script da imagem da api.
# Sem --confirm só imprime o diff (nada é gravado). Com --confirm publica; falas já editadas no editor são preservadas
# e a versão anterior vai para o histórico antes de ser substituída.
# Uso: bash producao-publicar-falas-do-bot.sh [--confirm]
# Ambiente: ENV_NAME=staging|production (padrão staging). Produção só com aprovação do Anderson.
set -euo pipefail
ENV_NAME="${ENV_NAME:-staging}"
command -v railway >/dev/null || { echo "railway CLI ausente" >&2; exit 1; }
railway whoami >/dev/null || { echo "railway não está logado" >&2; exit 1; }
ARGS="${*:-}"
echo "Ambiente: $ENV_NAME · argumentos: ${ARGS:-(nenhum, só o diff)}"
railway ssh -s api -e "$ENV_NAME" -- sh -c '
  S=$(find / -name whatsapp-flow-publish.ts -path "*scripts*" -not -path "*/node_modules/*" 2>/dev/null | head -1)
  [ -n "$S" ] || { echo "script não encontrado no container (imagem sem o T8?)" >&2; exit 1; }
  cd "$(dirname "$S")/.." && bun run scripts/whatsapp-flow-publish.ts '"$ARGS"'
'

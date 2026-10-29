#!/usr/bin/env bash
# Spec 286 T6: publica no módulo de notificação o modelo `correcao-endereco.padrao` (e confere os de ocorrência).
# Sem --confirm só imprime o plano (create/same/differs). Com --confirm grava só `create`; `differs` pede --overwrite <chave>.
# Uso: bash producao-publicar-modelo-correcao-endereco.sh <uuid-da-empresa> [--confirm] [--overwrite <chave>]
# Ambiente: ENV_NAME=staging|production (padrão staging). Produção só com aprovação do Anderson.
set -euo pipefail
COMPANY="${1:-}"
[ -n "$COMPANY" ] || { echo "informe o uuid da empresa" >&2; exit 1; }
shift || true
ENV_NAME="${ENV_NAME:-staging}"
command -v railway >/dev/null || { echo "railway CLI ausente" >&2; exit 1; }
railway whoami >/dev/null || { echo "railway não está logado" >&2; exit 1; }
ARGS="--company $COMPANY $*"
railway ssh -s api -e "$ENV_NAME" -- sh -c '
  S=$(find / -name occurrence-mail-templates-publish.ts -path "*scripts*" -not -path "*/node_modules/*" 2>/dev/null | head -1)
  [ -n "$S" ] || { echo "script não encontrado no container" >&2; exit 1; }
  cd "$(dirname "$S")/.." && bun run scripts/occurrence-mail-templates-publish.ts '"$ARGS"'
'

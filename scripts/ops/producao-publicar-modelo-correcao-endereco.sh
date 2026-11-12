#!/usr/bin/env bash
# Spec 286 T6: publica no módulo de notificação o modelo `correcao-endereco.padrao` (e confere os de ocorrência).
# Sem --confirm só imprime o plano (create/same/differs). Com --confirm grava só `create`; `differs` pede --overwrite <chave>.
# Uso: bash producao-publicar-modelo-correcao-endereco.sh [--confirm] [--overwrite <chave>]
# A empresa é descoberta no próprio ambiente (se houver mais de uma, o script lista e pergunta).
# Ambiente: ENV_NAME=staging|production (padrão staging). Produção só com aprovação do Anderson.
set -euo pipefail
ENV_NAME="${ENV_NAME:-staging}"
command -v railway >/dev/null || { echo "railway CLI ausente" >&2; exit 1; }
railway whoami >/dev/null || { echo "railway não está logado" >&2; exit 1; }

remote() { # $1 = argumentos do script publicado
  railway ssh -s api -e "$ENV_NAME" -- sh -c '
    S=$(find / -name occurrence-mail-templates-publish.ts -path "*scripts*" -not -path "*/node_modules/*" 2>/dev/null | head -1)
    [ -n "$S" ] || { echo "script não encontrado no container" >&2; exit 1; }
    cd "$(dirname "$S")/.." && bun run scripts/occurrence-mail-templates-publish.ts '"$1"'
  '
}

mapfile -t COMPANIES < <(remote --list-companies | tr -d '\r' | grep -E '^[0-9a-f-]{36}$' || true)
[ "${#COMPANIES[@]}" -gt 0 ] || { echo "nenhuma empresa encontrada em $ENV_NAME" >&2; exit 1; }
if [ "${#COMPANIES[@]}" -eq 1 ]; then
  COMPANY="${COMPANIES[0]}"
else
  echo "Empresas em $ENV_NAME:"
  select COMPANY in "${COMPANIES[@]}"; do [ -n "${COMPANY:-}" ] && break; done </dev/tty
fi
echo "Ambiente: $ENV_NAME · empresa: $COMPANY"
remote "--company $COMPANY $*"

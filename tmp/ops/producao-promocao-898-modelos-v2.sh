#!/usr/bin/env bash
# PRODUÇÃO (promoção #898): publica no módulo de notificação os modelos de e-mail e WhatsApp novos das ocorrências:
#   ocorrencia.espera-longa, ocorrencia.cobranca-recebimento, ocorrencia.endereco-incorreto, ocorrencia.local-fechado
# Rodar SÓ depois do deploy da API da promoção (a imagem precisa conter os arquivos dos modelos).
# Sem argumento = SIMULAÇÃO (nada gravado). Com --confirm grava só os "create" (versão nova, nunca UPDATE).
# --overwrite-aviso-manual: também cria versão nova de ocorrencia.contratante-aviso-manual (e-mail), se estiver "differs".
# v2 (19/11/2026): a v1 parou com razão, porque o plano de produção também tinha "create" de ocorrencia.contratante-aviso-manual (e-mail e WhatsApp),
# ocorrencia.devolucao-total, correcao-endereco.padrao e contas.* (nunca publicados em produção). A lista permitida agora inclui essas chaves.
# Só cria versão nova (nunca UPDATE) e NUNCA sobrescreve: ocorrencia.prorrogacao-boleto (differs) fica como está.
# Trava de segurança: com --confirm, se o plano tiver "create" de chave fora da lista permitida, o script PARA sem gravar.
# Uso: bash producao-promocao-898-modelos.sh [--confirm] [--overwrite-aviso-manual]
# Imprime só o caminho do arquivo de saída.
set -euo pipefail
PROJECT="62de4c69-216a-4335-93a0-4942c6a95c54"
OUT_DIR="${OUT_DIR:-/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas}"
ENV_NAME="production"
ALLOWED='^(ocorrencia\.(espera-longa|cobranca-recebimento|endereco-incorreto|local-fechado|contratante-aviso-manual|devolucao-total)|correcao-endereco\.padrao|contas\.(aviso-vencimento|resumo-diario))$'
exec 3>&1 # o caminho da saída vai para o terminal mesmo quando o script sai de dentro do bloco redirecionado
CONFIRM=0; OVERWRITE_AVISO=0
for a in "$@"; do case "$a" in --confirm) CONFIRM=1;; --overwrite-aviso-manual) OVERWRITE_AVISO=1;; *) echo "argumento desconhecido: $a" >&2; exit 1;; esac; done
command -v railway >/dev/null || { echo "railway CLI nao encontrado" >&2; exit 1; }
railway whoami >/dev/null 2>&1 || { echo "railway nao esta logado" >&2; exit 1; }
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/producao-promocao-898-modelos-v2-$([ $CONFIRM = 1 ] && echo confirmado || echo simulacao)-$(date +%Y%m%d-%H%M%S).txt"
trap 'echo "$FILE" >&3' EXIT

remote() { # $1 = argumentos do publicador, dentro do container do api de produção
  timeout 180 railway ssh -p "$PROJECT" -s api -e "$ENV_NAME" -- sh -c '
    S=$(find / -name occurrence-mail-templates-publish.ts -path "*scripts*" -not -path "*/node_modules/*" 2>/dev/null | head -1)
    [ -n "$S" ] || { echo "script nao encontrado no container" >&2; exit 1; }
    cd "$(dirname "$S")/.." && bun run scripts/occurrence-mail-templates-publish.ts '"$1"'
  ' 2>&1 | tr -d '\r'
}

mapfile -t COMPANIES < <(remote --list-companies | grep -E '^[0-9a-f-]{36}$' || true)
{
  echo "# Modelos das ocorrencias em $ENV_NAME, $([ $CONFIRM = 1 ] && echo CONFIRMADO || echo SIMULACAO), $(date -u +%FT%TZ)"
  [ "${#COMPANIES[@]}" -gt 0 ] || { echo "ERRO: nenhuma empresa encontrada"; exit 1; }
  for COMPANY in "${COMPANIES[@]}"; do
    echo "## empresa $COMPANY"
    PLAN="$(remote "--company $COMPANY")"
    echo "$PLAN"
    if [ $CONFIRM = 1 ]; then
      BAD="$(echo "$PLAN" | awk '$3=="create"{print $1}' | grep -Ev "$ALLOWED" || true)"
      if [ -n "$BAD" ]; then echo "PAROU: o plano tem create fora do esperado:"; echo "$BAD"; exit 1; fi
      echo "$PLAN" | grep -q "invalido" && { echo "PAROU: modelo invalido"; exit 1; }
      OW=""; [ $OVERWRITE_AVISO = 1 ] && OW="--overwrite ocorrencia.contratante-aviso-manual"
      echo "--- gravando"
      remote "--company $COMPANY --confirm $OW"
    fi
  done
} > "$FILE"

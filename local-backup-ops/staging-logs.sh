#!/usr/bin/env bash
# Somente leitura: baixa os logs da STAGING (api, worker, cron) numa janela de tempo e separa o que
# interessa ao "enviando" do comprovante: /deliver, /proof, client-diagnostics, conversations, erros.
# Uso (Ubuntu/WSL, já logado no Railway):
#   bash staging-logs.sh                 # últimos 30 min
#   bash staging-logs.sh 2026-10-14T15:25 2026-10-14T15:40   # janela em UTC (início fim)
set -euo pipefail

export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.bun/bin:$PATH"
# Sem o node do nvm acima, o railway não roda: se a versão for outra, carrega o nvm.
if ! command -v railway >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi
command -v railway >/dev/null 2>&1 || { echo "railway não encontrado no PATH" >&2; exit 1; }

START="${1:-}"
END="${2:-}"
ENVIRONMENT="staging"
SERVICES=(api worker cron)

cd "$HOME/personal/transportada"
railway whoami >/dev/null 2>&1 || { echo "railway deslogado: rode 'railway login'" >&2; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
# Grava na pasta do Windows (C:\Users\ander\Documentos\personal) para a sessão do computador ler.
WIN_BASE="/mnt/c/Users/ander/Documentos/personal"
if [ -d "$WIN_BASE" ]; then BASE="$WIN_BASE/logs-staging"; else BASE="$HOME/personal/logs-staging"; fi
OUT_DIR="$BASE/$STAMP"
mkdir -p "$OUT_DIR"

for service in "${SERVICES[@]}"; do
  raw="$OUT_DIR/$service.raw.log"
  echo "baixando $service ($ENVIRONMENT)..."
  if [ -z "$START" ]; then
    railway logs -s "$service" -e "$ENVIRONMENT" --since 30m >"$raw" 2>"$OUT_DIR/$service.stderr" || true
  else
    railway logs -s "$service" -e "$ENVIRONMENT" --since "${START}:00Z" >"$raw" 2>"$OUT_DIR/$service.stderr" || true
  fi
  if [ -n "$END" ]; then
    # Corta o fim da janela quando a linha traz timestamp ISO (comparação lexical, UTC).
    awk -v end="$END" '{ if (match($0, /20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]/)) { if (substr($0, RSTART, 16) > end) next } print }' "$raw" >"$raw.tmp" && mv "$raw.tmp" "$raw"
  fi
done

FILTER='/deliver|/proof|client-diagnostics|driver_client_diagnostic|occurrence-uploads|conversations|attach|canhoto|ERROR|error|" ?(4[0-9][0-9]|5[0-9][0-9]) '
for service in "${SERVICES[@]}"; do
  grep -Ei "$FILTER" "$OUT_DIR/$service.raw.log" >"$OUT_DIR/$service.filtrado.log" || true
done

{
  echo "janela: ${START:-últimos 30 min} .. ${END:-agora} (UTC)  ambiente: $ENVIRONMENT"
  for service in "${SERVICES[@]}"; do
    printf '%s: %s linhas, %s filtradas\n' "$service" \
      "$(wc -l <"$OUT_DIR/$service.raw.log")" "$(wc -l <"$OUT_DIR/$service.filtrado.log")"
  done
} | tee "$OUT_DIR/resumo.txt"

echo
echo "Arquivos em: $OUT_DIR"
ls -1 "$OUT_DIR"

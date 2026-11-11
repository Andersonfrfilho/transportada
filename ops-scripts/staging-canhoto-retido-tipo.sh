#!/usr/bin/env bash
# Spec 321 T7 (STAGING): cadastra o tipo "Canhoto retido pelo cliente" na empresa de staging.
# Roda de dentro do container da api (script versionado em apps/api-transportada/scripts/canhoto-retido-type-publish.ts,
# presente só depois que o PR da T7 foi publicado em staging). Primeiro SIMULA (nada é gravado) e só grava depois do "sim".
# Uso: bash <caminho completo>/ops-scripts/staging-canhoto-retido-tipo.sh   (railway CLI logado; roda de qualquer pasta)
set -euo pipefail
if ! command -v railway >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi
command -v railway >/dev/null 2>&1 || { echo "railway não encontrado no PATH" >&2; exit 1; }
[ -t 0 ] || { echo "Confirmação exige terminal interativo (TTY); recusado." >&2; exit 1; }
REPO="${REPO:-$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)}"
cd "$REPO"
PROJECT="62de4c69-216a-4335-93a0-4942c6a95c54"
OUT_DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/staging-canhoto-retido-tipo-$(date +%Y%m%d-%H%M%S).txt"

run() { # $1 = "" (simulação) ou "--confirm"
  railway ssh -p "$PROJECT" -s api -e staging -- sh -c \
    "cd /app/apps/api-transportada && [ -f scripts/canhoto-retido-type-publish.ts ] || { echo 'script ausente na api de staging: o PR da T7 ainda nao foi publicado'; exit 3; }; \
     IDS=\$(bun scripts/canhoto-retido-type-publish.ts --list-companies); \
     [ \$(echo \"\$IDS\" | wc -l) -eq 1 ] || { echo \"esperava 1 empresa, achei: \$IDS\"; exit 4; }; \
     bun scripts/canhoto-retido-type-publish.ts --company \"\$IDS\" $1" 2>&1
}

{
  echo "== SIMULAÇÃO (nada é gravado) =="
  SIM="$(run "" || true)"
  echo "$SIM"
} | tee "$OUT"
if grep -q "seria criado" "$OUT"; then
  read -r -p 'Digite "sim" para criar o tipo em STAGING: ' ANSWER
  [ "$ANSWER" = "sim" ] || { echo "cancelado" >&2; exit 1; }
  { echo "== APLICANDO =="; run "--confirm" || true; } | tee -a "$OUT"
fi
echo "$OUT"

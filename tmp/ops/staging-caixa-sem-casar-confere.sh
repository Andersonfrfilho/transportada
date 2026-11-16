#!/usr/bin/env bash
# STAGING, somente leitura: por que produtos das notas ficaram "Sem caixa do catálogo" em "o que falta medir".
# Para cada produto das notas, diz se falta a caixa (backfill), se o emitente está sem CNPJ, se a caixa existe em outra unidade
# ou outro emitente, ou se o número da nota repete. Não imprime CNPJ, endereço nem credencial.
# Uso: bash tmp/ops/staging-caixa-sem-casar-confere.sh        (railway CLI logado; DOCUMENT_NUMBERS opcional, padrão 170634,170572)
set -euo pipefail
REPO="${REPO:-$(git rev-parse --show-toplevel)}"
ENTRY="$REPO/apps/api-transportada/scripts/staging-box-match-check.entry.ts"
OUT_DIR="$REPO/tmp/ops/saidas"
[ -f "$ENTRY" ] || { echo "entrada ausente: $ENTRY (faca git pull origin staging)" >&2; exit 1; }
command -v railway >/dev/null || { echo "railway CLI nao encontrado" >&2; exit 1; }
command -v bun >/dev/null || { echo "bun nao encontrado" >&2; exit 1; }
NUMBERS="${DOCUMENT_NUMBERS:-170634,170572}"
[[ "$NUMBERS" =~ ^[0-9,]+$ ]] || { echo "DOCUMENT_NUMBERS invalido" >&2; exit 1; }

PROJECT="62de4c69-216a-4335-93a0-4942c6a95c54" # transportada
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
bun build "$ENTRY" --target=bun --packages=external --minify --outfile="$WORK/check.mjs" >/dev/null
gzip -9c "$WORK/check.mjs" | base64 -w0 > "$WORK/check.b64"

railway ssh -p "$PROJECT" -s api -e staging -- sh -c 'rm -f /tmp/bc.b64' >/dev/null 2>&1
split -b 90000 -d "$WORK/check.b64" "$WORK/part."
for PART in "$WORK"/part.*; do
  railway ssh -p "$PROJECT" -s api -e staging -- sh -c "printf '%s' '$(cat "$PART")' >> /tmp/bc.b64" >/dev/null 2>&1
done
RESULT="$(railway ssh -p "$PROJECT" -s api -e staging -- sh -c \
  "cd /app/apps/api-transportada && base64 -d /tmp/bc.b64 | gunzip > /tmp/bc.mjs && DOCUMENT_NUMBERS=$NUMBERS bun /tmp/bc.mjs; rm -f /tmp/bc.b64 /tmp/bc.mjs" \
  2>&1 | grep '^__RESULT__' || true)"
[ -n "$RESULT" ] || { echo "sem resultado: confira o login do railway e o servico api de staging" >&2; exit 1; }

mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/staging-caixa-sem-casar-$(date +%Y%m%d-%H%M%S).txt"
{
  echo "# Conferencia: produtos sem caixa do catalogo, staging, $(date -u +%FT%TZ)"
  echo "# diagnostico: sem_caixa_cadastrada(backfill) | emitente_sem_cnpj | caixa_so_em_outra_unidade | caixa_so_de_outro_emitente | numero_de_nota_repetido(ambiguo) | caixa_existe(casaria)"
  echo "$RESULT"
} > "$FILE"
echo "$FILE"

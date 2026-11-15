#!/usr/bin/env bash
# STAGING, somente leitura (spec 342 T6): compara a estrada que a cotação por endereço mede com a que viagens recentes
# já congelaram (km e pedágio), de dentro do container do `api` de staging. Não imprime endereço, coordenada nem credencial.
# Uso: bash tmp/ops/staging-orcamento-confere.sh      (railway CLI logado; TRIP_LIMIT opcional, padrão 5, máximo 20)
set -euo pipefail
REPO="${REPO:-$(git rev-parse --show-toplevel)}"
ENTRY="$REPO/apps/api-transportada/scripts/staging-quote-check.entry.ts"
OUT_DIR="$REPO/tmp/ops/saidas"
[ -f "$ENTRY" ] || { echo "entrada ausente: $ENTRY" >&2; exit 1; }
command -v railway >/dev/null || { echo "railway CLI nao encontrado" >&2; exit 1; }
command -v bun >/dev/null || { echo "bun nao encontrado" >&2; exit 1; }
LIMIT="${TRIP_LIMIT:-5}"
[[ "$LIMIT" =~ ^[0-9]+$ ]] || { echo "TRIP_LIMIT invalido" >&2; exit 1; }

PROJECT="62de4c69-216a-4335-93a0-4942c6a95c54" # transportada
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
bun build "$ENTRY" --target=bun --packages=external --minify --outfile="$WORK/check.mjs" >/dev/null
gzip -9c "$WORK/check.mjs" | base64 -w0 > "$WORK/check.b64"

# O bundle passa de 128 KB em base64, o limite de um argumento: sobe em pedaços e monta no container.
railway ssh -p "$PROJECT" -s api -e staging -- sh -c 'rm -f /tmp/qc.b64' >/dev/null 2>&1
split -b 90000 -d "$WORK/check.b64" "$WORK/part."
for PART in "$WORK"/part.*; do
  railway ssh -p "$PROJECT" -s api -e staging -- sh -c "printf '%s' '$(cat "$PART")' >> /tmp/qc.b64" >/dev/null 2>&1
done
RESULT="$(railway ssh -p "$PROJECT" -s api -e staging -- sh -c \
  "cd /app/apps/api-transportada && base64 -d /tmp/qc.b64 | gunzip > /tmp/qc.mjs && TRIP_LIMIT=$LIMIT bun /tmp/qc.mjs; rm -f /tmp/qc.b64 /tmp/qc.mjs" \
  2>&1 | grep '^__RESULT__' || true)"
[ -n "$RESULT" ] || { echo "sem resultado: confira o login do railway e o servico api de staging" >&2; exit 1; }

mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/staging-orcamento-confere-$(date +%Y%m%d-%H%M%S).txt"
{
  echo "# Conferencia da cotacao por endereco (spec 342 T6), staging, $(date -u +%FT%TZ)"
  echo "# km_perna_viagem e a distancia entre as duas paradas congelada na viagem; km_cotacao e a medida pelo gateway da cotacao."
  echo "# pedagio_comparavel=false: a viagem tem trecho a mais (origem ou volta), entao so o km vale."
  echo "$RESULT"
} > "$FILE"
echo "$FILE"

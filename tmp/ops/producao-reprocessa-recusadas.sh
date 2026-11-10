#!/usr/bin/env bash
# PRODUCAO: recoloca na fila as importacoes de XML (e-mail/WhatsApp) cujos itens foram todos recusados
# com NFE_IMPORT_UNRELATED_CNPJ, para o worker reler com a regra "emitente contratante conta como da empresa".
# 1) SIMULA (somente leitura) e mostra as contagens; 2) so grava depois do seu "sim".
# Uso: bash tmp/ops/producao-reprocessa-recusadas.sh [horas]   (padrao 72; railway CLI logado)
set -euo pipefail
REPO="${REPO:-$(git rev-parse --show-toplevel)}"
HELPER="$REPO/tmp/ops/producao-reprocessa-recusadas.mjs"
OUT_DIR="$REPO/tmp/ops/saidas"
[ -f "$HELPER" ] || { echo "helper ausente: $HELPER" >&2; exit 1; }
HOURS="${1:-72}"
[[ "$HOURS" =~ ^[0-9]+$ ]] || { echo "horas invalidas: $HOURS" >&2; exit 1; }
[ -t 0 ] || { echo "Confirmacao exige terminal interativo (TTY); recusado." >&2; exit 1; }
command -v railway >/dev/null || { echo "railway CLI nao encontrado" >&2; exit 1; }
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/reprocessa-recusadas-$(date +%Y%m%d-%H%M%S).txt"
ENCODED="$(base64 -w0 "$HELPER")"

run() { # $1 = APPLY (0|1)
  railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s worker -e production -- \
    sh -c "cd /app/apps/worker-transportada && APPLY=$1 HOURS=$HOURS bun -e \"\$(echo $ENCODED | base64 -d)\"" \
    2>&1 | grep '^__RESULT__' || true
}

echo "== SIMULACAO (nada e gravado) =="
SIM="$(run 0)"
echo "$SIM" | tee "$OUT"
[ -n "$SIM" ] || { echo "sem resultado da simulacao" >&2; exit 1; }
echo "$SIM" | grep -q 'elegiveis=0' && { echo "Nada a reprocessar."; exit 0; }
echo
echo "ATENCAO: vai republicar o evento de importacao em PRODUCAO para as importacoes acima."
read -r -p 'Digite "sim" para gravar: ' ANSWER
[ "$ANSWER" = "sim" ] || { echo "Cancelado."; exit 1; }
echo "== APLICANDO =="
RES="$(run 1)"
echo "$RES" | tee -a "$OUT"
[ -n "$RES" ] || { echo "sem resultado ao aplicar — confira com notas-com-problema-xml.sh" >&2; exit 1; }
echo "Saida: $OUT"
echo "Depois de ~2 min rode: bash tmp/ops/notas-com-problema-xml.sh production 72"

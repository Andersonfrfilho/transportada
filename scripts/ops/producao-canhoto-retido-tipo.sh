#!/usr/bin/env bash
# PRODUÇÃO — cadastra o tipo "Canhoto retido pelo cliente" (spec 321 T7), usando o script que já está na imagem da API.
# Sem argumento é SIMULAÇÃO (só lê e diz se o tipo existe ou seria criado). Só grava com --confirm, e só depois do aval do Anderson.
# O script só cria: tipo que já existe nunca é reescrito. Saída completa em tmp/ops/saidas/; imprime só o caminho.
# Uso: bash /home/miyazaki/Documents/personal/transportada/tmp/ops/producao-canhoto-retido-tipo.sh [--confirm]
set -euo pipefail
CONFIRM=""; [ "${1:-}" = "--confirm" ] && CONFIRM="--confirm"
DIR="/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas"
mkdir -p "$DIR"
OUT="$DIR/producao-canhoto-retido-tipo-$(date +%Y-%m-%d-%H%M).txt"
command -v railway >/dev/null || { echo "railway CLI não encontrado" >&2; exit 1; }
echo "conectando ao api de produção (pode levar até 1 minuto)..." >&2
timeout 180 railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s api -e production -- sh -c '
cd /app/apps/api-transportada 2>/dev/null || cd apps/api-transportada 2>/dev/null || true
COMPANIES=$(bun run scripts/canhoto-retido-type-publish.ts --list-companies)
N=$(printf "%s\n" "$COMPANIES" | grep -c .)
echo "empresas: $N"
if [ "$N" != "1" ]; then echo "mais de uma empresa (ou nenhuma): escolha o id e rode o script do repositório com --company"; printf "%s\n" "$COMPANIES"; exit 0; fi
bun run scripts/canhoto-retido-type-publish.ts --company "$COMPANIES" '"$CONFIRM"'
' 2>&1 | grep --line-buffered -v -i "warning" | tee "$OUT" || true
echo "$OUT"

#!/usr/bin/env bash
# Copyright (c) 2026 Ada Technology. MIT License.
#
# Spec 162, RF09 — envia o JSONL da captura assistida (spec 161) para o serviço `api` via
# `railway ssh` e roda a CLI de importação (spec 162, RF08) já empacotada na imagem
# (dist/cli/import-package-box-catalog.js). Simulação por padrão; `--apply` grava e pede
# confirmação digitada.
#
# ⚠️ O arquivo real tem ~2.7 MB (~3.6 MB em base64) — grande demais para caber embutido no
# argumento de um `sh -c "echo <base64> | ..."` (o padrão de `export-pending-queue.sh`, que só
# embute um script curto). Aqui o base64 vai pelo **stdin** do `railway ssh`, nunca no argumento.
#
# Uso: scripts/box-catalog-harvest/import-to-production.sh <arquivo.jsonl> \
#        [--environment staging|production] [--apply]
set -euo pipefail

JSONL_PATH="${1:-}"
if [[ -z "$JSONL_PATH" || "$JSONL_PATH" == --* ]]; then
  echo "uso: $0 <arquivo.jsonl> [--environment staging|production] [--apply]" >&2
  exit 1
fi
if [[ ! -f "$JSONL_PATH" ]]; then
  echo "arquivo não encontrado: $JSONL_PATH" >&2
  exit 1
fi
shift

ENVIRONMENT="production"
APPLY=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment)
      ENVIRONMENT="${2:-}"
      shift 2
      ;;
    --apply)
      APPLY=true
      shift
      ;;
    *)
      echo "opção desconhecida: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
  echo "--environment deve ser staging ou production, recebi: $ENVIRONMENT" >&2
  exit 1
fi

CLI_FLAG=""
if $APPLY; then
  echo "Isto vai GRAVAR medidas de catálogo em '$ENVIRONMENT' (nunca sobrescreve medida humana," \
    "spec 162 P3). Digite IMPORTAR para confirmar:" >&2
  read -r CONFIRMATION
  if [[ "$CONFIRMATION" != "IMPORTAR" ]]; then
    echo "cancelado — nada foi enviado" >&2
    exit 1
  fi
  CLI_FLAG="--apply"
else
  echo "simulação (sem --apply): roda em transação com ROLLBACK, nada é gravado em '$ENVIRONMENT'" >&2
fi

echo "enviando $(wc -c < "$JSONL_PATH" | tr -d ' ') bytes para o serviço api ($ENVIRONMENT)…" >&2

base64 < "$JSONL_PATH" | railway ssh --service api --environment "$ENVIRONMENT" -- sh -c \
  "base64 -d | bun /app/apps/api-transportada/dist/cli/import-package-box-catalog.js $CLI_FLAG"

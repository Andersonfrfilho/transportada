#!/usr/bin/env bash
# Confere se a CSP servida pelo app do motorista libera o bucket em connect-src.
# Uso: scripts/diagnostics/driver-csp-check.sh [https://motorista.staging...] [https://<bucket>.t3.storageapi.dev]
set -euo pipefail
driver_url="${1:-https://motorista.staging.fernandes-transportadora.com.br}"
bucket_origin="${2:-https://transportada-staging-zjeaet.t3.storageapi.dev}"
headers="$(curl -sSI --max-time 15 "$driver_url/")"
echo "$headers" | head -1
csp="$(echo "$headers" | tr -d '\r' | awk 'tolower($1)=="content-security-policy:"{sub(/^[^:]*: */,"");print}')"
if [ -z "$csp" ]; then echo "SEM cabeçalho Content-Security-Policy (nada bloqueia)"; exit 0; fi
connect="$(echo "$csp" | tr ';' '\n' | sed 's/^ *//' | grep '^connect-src' || true)"
echo "connect-src: ${connect:-<ausente: cai no default-src>}"
if echo "$connect" | grep -qF "$bucket_origin"; then echo "OK: bucket liberado em connect-src"; else echo "FALHA: $bucket_origin NÃO está em connect-src — o PUT da foto é bloqueado pelo navegador"; exit 1; fi

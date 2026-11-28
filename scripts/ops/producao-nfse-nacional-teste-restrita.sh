#!/usr/bin/env bash
# PRODUCAO (so leitura do banco + certificado em memoria): emite UMA NFS-e de TESTE no Sistema Nacional,
# ambiente de PRODUCAO RESTRITA (sefin.producaorestrita.nfse.gov.br, tpAmb=2). NAO emite nota real.
# O certificado A1 do prestador (AFR FERNANDES, CNPJ 61.156.864/0001-91) e decifrado so na memoria do worker.
# Uso: bash producao-nfse-nacional-teste-restrita.sh        (railway CLI logado)
# Opcoes (env): DRY_RUN=1 (assina e nao envia) · SIG_ALGO=sha1 (padrao sha256) · VALOR=1.00 · COMPANY_ID=<uuid>
set -euo pipefail
BASE="${OPS_DIR:-/home/miyazaki/Documents/personal/transportada/tmp/ops}"
HELPER="$BASE/producao-nfse-nacional-helper.mjs"
SAIDAS="$BASE/saidas"
[ -f "$HELPER" ] || { echo "helper ausente: $HELPER" >&2; exit 1; }
command -v railway >/dev/null || { echo "railway CLI nao encontrado" >&2; exit 1; }
[ -t 0 ] || { echo "Confirmacao exige terminal interativo (TTY); recusado." >&2; exit 1; }
COMPANY="${COMPANY_ID:-}"
if [ -n "$COMPANY" ] && ! [[ "$COMPANY" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo "COMPANY_ID invalido: precisa ser um UUID" >&2; exit 1
fi
SIG="${SIG_ALGO:-sha256}"; [[ "$SIG" =~ ^(sha1|sha256)$ ]] || { echo "SIG_ALGO invalido" >&2; exit 1; }
VAL="${VALOR:-1.00}"; [[ "$VAL" =~ ^[0-9]+\.[0-9]{2}$ ]] || { echo "VALOR invalido (use 1.00)" >&2; exit 1; }
DRY="${DRY_RUN:-0}"; [[ "$DRY" =~ ^[01]$ ]] || { echo "DRY_RUN invalido" >&2; exit 1; }

echo "Teste de NFS-e no ambiente de PRODUCAO RESTRITA do Sistema Nacional (nao vale como nota real)."
echo "Usa o certificado A1 cadastrado no portal da transportadora, decifrado so em memoria no worker."
read -r -p 'Digite "sim" para continuar: ' ANSWER
[ "$ANSWER" = "sim" ] || { echo "Cancelado."; exit 1; }

mkdir -p "$SAIDAS"
# Baixa os XSDs oficiais da producao restrita para eu ler o leiaute certo (falha aqui nao impede o teste)
XSD_DIR="$SAIDAS/xsd-producao-restrita"
if [ ! -d "$XSD_DIR" ]; then
  mkdir -p "$XSD_DIR"
  if curl -fsSL -m 60 -o "$XSD_DIR/esquemas.zip" "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/esquemas-xsd-producao-restrita-20261124.zip"; then
    (cd "$XSD_DIR" && { unzip -oq esquemas.zip || bsdtar -xf esquemas.zip; } 2>/dev/null) || echo "aviso: nao consegui descompactar os XSDs (zip fica em $XSD_DIR/esquemas.zip)" >&2
  else
    echo "aviso: nao consegui baixar os XSDs" >&2
  fi
fi
OUT="$SAIDAS/nfse-nacional-teste-restrita-$(date +%Y%m%d-%H%M%S).txt"
ENCODED="$(sed 's/^export //' "$HELPER" | base64 -w0)"
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -s worker -e production -- \
  sh -c "cd /app/apps/worker-transportada && COMPANY_ID='$COMPANY' SIG_ALGO=$SIG VALOR=$VAL DRY_RUN=$DRY bun -e \"\$(echo $ENCODED | base64 -d)\"" \
  > "$OUT.raw" 2>&1 || true
grep '^__RESULT__' "$OUT.raw" > "$OUT" || true
if [ ! -s "$OUT" ]; then
  { echo "sem linhas __RESULT__; ultimas 40 linhas da saida bruta (sem a variavel de ambiente do script):"; tail -n 40 "$OUT.raw"; } > "$OUT"
fi
rm -f "$OUT.raw"
echo "$OUT"

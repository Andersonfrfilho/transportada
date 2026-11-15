#!/usr/bin/env bash
# STAGING: cria o widget do Cloudflare Turnstile do dominio de staging e grava a chave publica (Site Key) e o segredo
# (Secret Key) nas variaveis do Railway de staging. Produção NAO usa este widget: la se cria outro, com o dominio de
# produção (runbook § 5.39). Nunca imprime nem grava o segredo em arquivo; a saida (so ids e a Site Key) vai para
# tmp/ops/saidas/.
#
# Token da Cloudflare com permissao minima: dash.cloudflare.com > My Profile > API Tokens > Create Token > Custom token >
# "Account" > "Turnstile" > "Edit" (nada mais), restrito a conta que vai hospedar o widget.
#
# Uso: CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... bash tmp/ops/staging-turnstile-cria-widget.sh
#   Opcionais: DOMAINS="staging.fernandes-transportadora.com.br" (separados por virgula), RAILWAY_ENVIRONMENT=staging,
#              FORCE=1 (sobrescreve variaveis que ja existem; sem isto o script para se elas ja estiverem preenchidas).
# Requer: railway CLI logado no projeto, curl, python3 e terminal interativo.
set -euo pipefail
REPO="${REPO:-$(git rev-parse --show-toplevel)}"
[ -f "$REPO/.github/scripts/railway-deploy.sh" ] || { echo "REPO invalido: $REPO" >&2; exit 1; }
OUT_DIR="$REPO/tmp/ops/saidas"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/staging-turnstile-$(date -u +%Y%m%dT%H%M%SZ).txt"

: "${CLOUDFLARE_API_TOKEN:?defina CLOUDFLARE_API_TOKEN (permissao Account > Turnstile > Edit)}"
: "${CLOUDFLARE_ACCOUNT_ID:?defina CLOUDFLARE_ACCOUNT_ID (Cloudflare > conta > Overview > Account ID)}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT:-staging}"
DOMAINS="${DOMAINS:-staging.fernandes-transportadora.com.br}"
case "$ENVIRONMENT" in production|main) echo "Recusado: este script e so de staging (§ 5.39)." >&2; exit 1 ;; esac
if [ "$DOMAINS" = "fernandes-transportadora.com.br" ] || [[ ",$DOMAINS," == *",www.fernandes-transportadora.com.br,"* ]]; then
  echo "Recusado: dominio de producao em staging." >&2; exit 1
fi
[ -t 0 ] || { echo "Confirmacao exige terminal interativo (TTY); recusado." >&2; exit 1; }
for tool in railway curl python3; do command -v "$tool" >/dev/null || { echo "$tool nao encontrado" >&2; exit 1; }; done

log() { printf '%s\n' "$*" | tee -a "$OUT"; }
read_var() { # servico nome -> valor (vazio se ausente)
  railway variables -s "$1" -e "$ENVIRONMENT" --json 2>/dev/null |
    python3 -c 'import json,sys; print(json.load(sys.stdin).get(sys.argv[1],""))' "$2" || true
}

if [ "${FORCE:-0}" != "1" ]; then
  if [ -n "$(read_var api TURNSTILE_SECRET_KEY)" ] || [ -n "$(read_var landing VITE_TURNSTILE_SITE_KEY)" ]; then
    echo "Ja existe Turnstile configurado em $ENVIRONMENT (api TURNSTILE_SECRET_KEY ou landing VITE_TURNSTILE_SITE_KEY)." >&2
    echo "Trocar quebra o login ate o redeploy. Rode com FORCE=1 se for isso mesmo." >&2
    exit 1
  fi
fi

echo "Vai criar um widget Turnstile para: $DOMAINS"
echo "e gravar TURNSTILE_SECRET_KEY (servico api) e VITE_TURNSTILE_SITE_KEY (servico landing) em '$ENVIRONMENT'."
echo "Isto redeploya a api e a landing de staging."
read -r -p 'Digite "sim" para continuar: ' ANSWER
[ "$ANSWER" = "sim" ] || { echo "Cancelado."; exit 1; }

DOMAINS_JSON="$(python3 -c 'import json,sys; print(json.dumps([d.strip() for d in sys.argv[1].split(",") if d.strip()]))' "$DOMAINS")"
BODY="$(python3 -c 'import json,sys; print(json.dumps({"name":"transportada-staging","domains":json.loads(sys.argv[1]),"mode":"managed","region":"world"}))' "$DOMAINS_JSON")"

RESPONSE="$(curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/challenges/widgets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'Content-Type: application/json' --data "$BODY")"

# Le sitekey e secret sem imprimir o segredo.
SITE_KEY="$(printf '%s' "$RESPONSE" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["result"]["sitekey"] if d.get("success") else "")')"
SECRET="$(printf '%s' "$RESPONSE" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["result"]["secret"] if d.get("success") else "")')"
if [ -z "$SITE_KEY" ] || [ -z "$SECRET" ]; then
  echo "A Cloudflare recusou. Erros:" >&2
  printf '%s' "$RESPONSE" | python3 -c 'import json,sys; [print("-", e.get("code"), e.get("message")) for e in json.load(sys.stdin).get("errors",[])]' >&2
  exit 1
fi

railway variables -s api -e "$ENVIRONMENT" --set "TURNSTILE_SECRET_KEY=$SECRET" >/dev/null
railway variables -s landing -e "$ENVIRONMENT" --set "VITE_TURNSTILE_SITE_KEY=$SITE_KEY" >/dev/null
unset SECRET RESPONSE

log "Turnstile de staging criado em $(date -u +%FT%TZ)"
log "dominios: $DOMAINS"
log "site key: $SITE_KEY"
log "variaveis gravadas: api TURNSTILE_SECRET_KEY, landing VITE_TURNSTILE_SITE_KEY ($ENVIRONMENT)"
log "Aguarde o redeploy da api e da landing de staging e teste o formulario publico."

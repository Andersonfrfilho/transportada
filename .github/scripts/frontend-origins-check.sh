set -euo pipefail

# Toda app com login precisa que **três** lugares saibam da origem dela: os `redirectUris` do
# Keycloak, os `webOrigins` do Keycloak e o `FRONTEND_ORIGIN` da api. Os dois primeiros viraram
# código em `realm/spa-redirect-uris.json`; o terceiro é variável na Railway, e foi o que ficou para
# trás quando o portal do contratante subiu: o login passou e a primeira chamada morreu em CORS.
#
# Este passo **confere, não escreve**. Escrever a variável daqui obrigaria o deploy a ter permissão
# de mudar configuração da api, e a variável é o que decide quem pode falar com ela — o guarda não
# pode ser quem abre a porta. O que ele faz é reprovar o deploy nomeando a origem que falta.
#
# O arquivo é a fonte: acrescentar app nova ali e esquecer a Railway reprova aqui, com a origem
# escrita por extenso.

readonly ORIGINS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/realm/spa-redirect-uris.json"
readonly SPA_CLIENT=transportada-spa

: "${TARGET_ENVIRONMENT:?TARGET_ENVIRONMENT é obrigatório}"

declared="$(jq --arg env "$TARGET_ENVIRONMENT" --arg client "$SPA_CLIENT" \
  --raw-output '.[$env][$client].webOrigins[]' "$ORIGINS_FILE")"

if [ -z "$declared" ]; then
  echo "::error::$ORIGINS_FILE não declara webOrigins para $TARGET_ENVIRONMENT"
  exit 1
fi

configured="$(railway variables --service api --environment "$TARGET_ENVIRONMENT" --json \
  | jq --raw-output '.FRONTEND_ORIGIN // empty')"

if [ -z "$configured" ]; then
  echo "::error::a api do ambiente $TARGET_ENVIRONMENT está sem FRONTEND_ORIGIN"
  exit 1
fi

missing=''
while IFS= read -r origin; do
  # A comparação é por item entre vírgulas, não `case` sobre a string inteira: `https://app.x` é
  # prefixo de `https://app.x.y`, e um `*origem*` daria por presente uma origem que não está lá.
  if ! printf '%s' "$configured" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep --line-regexp --fixed-strings --quiet "$origin"; then
    missing="$missing $origin"
  fi
done <<EOF
$declared
EOF

if [ -n "$missing" ]; then
  echo "::error::FRONTEND_ORIGIN da api ($TARGET_ENVIRONMENT) não tem:$missing"
  echo "::error::Acrescente na variável FRONTEND_ORIGIN do serviço api, separando por vírgula."
  exit 1
fi

echo "api $TARGET_ENVIRONMENT: FRONTEND_ORIGIN cobre todas as origens declaradas"

set -euo pipefail

# `--import-realm` ignora realm já existente: nada do `realm.json` alcança um realm criado. Sem este
# passo a configuração de realm vira desejo — o arquivo passa em review, o deploy fica verde, e o
# realm segue como estava. Foi assim que o tema de login ficou fora do ar por quatro dias.
#
# Duas metades, e a segunda é a que importa: aplicar o que o arquivo declara, e **conferir no ar** que
# a página de login serve o nosso tema. Realm apontando para tema ausente da imagem cai no padrão do
# Keycloak sem erro nenhum — o cliente vê a tela errada e o pipeline, verde.

readonly REALM=transportada
readonly LOGIN_THEME=transportada
readonly SMOKE_CLIENT_ID=account-console
# O caminho sai da posição do próprio script, não do diretório de quem o chamou: caminho relativo
# funcionaria no runner (que roda da raiz) e falharia em qualquer outro lugar — inclusive no contrato
# que executa este arquivo de um diretório temporário.
readonly REDIRECT_URIS_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/realm/spa-redirect-uris.json"

: "${TARGET_ENVIRONMENT:?TARGET_ENVIRONMENT é obrigatório}"

variables="$(railway variables --service keycloak --environment "$TARGET_ENVIRONMENT" --json)"
base_url="$(printf '%s' "$variables" | jq -r '.KC_HOSTNAME // empty')"
# O segredo nunca é ecoado: entra em variável, sai no corpo do POST.
client_secret="$(printf '%s' "$variables" | jq -r '.KEYCLOAK_ADMIN_CLIENT_SECRET // empty')"

if [ -z "$base_url" ] || [ -z "$client_secret" ]; then
  echo "::error::keycloak do ambiente $TARGET_ENVIRONMENT sem KC_HOSTNAME ou credencial de admin"
  exit 1
fi

token="$(curl --silent --show-error --fail --max-time 30 \
  --request POST "$base_url/realms/$REALM/protocol/openid-connect/token" \
  --data grant_type=client_credentials \
  --data client_id=transportada-admin \
  --data-urlencode "client_secret=$client_secret" \
  | jq -r '.access_token // empty')"

if [ -z "$token" ]; then
  echo "::error::o service account transportada-admin não obteve token no realm $REALM"
  exit 1
fi

current_theme="$(curl --silent --show-error --fail --max-time 30 \
  --header "Authorization: Bearer $token" \
  "$base_url/admin/realms/$REALM" \
  | jq -r '.loginTheme // empty')"

if [ "$current_theme" = "$LOGIN_THEME" ]; then
  echo "realm $REALM: loginTheme já é $LOGIN_THEME"
else
  echo "realm $REALM: loginTheme '$current_theme' → '$LOGIN_THEME'"
  curl --silent --show-error --fail --max-time 30 \
    --request PUT "$base_url/admin/realms/$REALM" \
    --header "Authorization: Bearer $token" \
    --header 'content-type: application/json' \
    --data "$(jq --null-input --arg theme "$LOGIN_THEME" '{loginTheme: $theme}')"
fi

# `--import-realm` ignora realm que já subiu, então a opção só alcança ambiente existente por aqui.
# Ela precisa estar ligada porque a edição de login do painel a exige: com ela desligada — o padrão
# do Keycloak — o Admin API recusa a troca com 400, e o operador só descobre ao salvar.
current_edit_username="$(curl --silent --show-error --fail --max-time 30 \
  --header "Authorization: Bearer $token" \
  "$base_url/admin/realms/$REALM" \
  | jq -r '.editUsernameAllowed // false')"

if [ "$current_edit_username" = "true" ]; then
  echo "realm $REALM: editUsernameAllowed já está ligado"
else
  echo "realm $REALM: editUsernameAllowed '$current_edit_username' → 'true'"
  curl --silent --show-error --fail --max-time 30 \
    --request PUT "$base_url/admin/realms/$REALM" \
    --header "Authorization: Bearer $token" \
    --header 'content-type: application/json' \
    --data '{"editUsernameAllowed": true}'
fi

# `redirectUris` não era gerenciado por lugar nenhum: o `realm.json` versionado só tem localhost, e
# staging e produção foram configurados à mão. O portal do contratante nasceu sem login por causa
# disso — o Keycloak recusou com `Invalid parameter: redirect_uri`, e nada no repositório dizia que
# faltava. É o mesmo padrão que deixou o tema de login fora do ar por quatro dias.
#
# ⚠️ **Acrescenta, nunca remove.** O arquivo declara o que precisa existir; o que já está no client e
# não está no arquivo é listado e mantido. Enforcar o conjunto exato seria mais "declarativo" e
# derrubaria o login de produção no primeiro deploy em que o arquivo esquecesse um callback que só
# existe no painel — e quem descobre isso é o cliente, na tela de entrar. Remover é decisão de quem
# olha os dois lados, não efeito colateral de um deploy.
declared="$(jq --arg env "$TARGET_ENVIRONMENT" '.[$env] // {}' "$REDIRECT_URIS_FILE")"

if [ "$(printf '%s' "$declared" | jq 'length')" -eq 0 ]; then
  echo "::error::$REDIRECT_URIS_FILE não declara nada para o ambiente $TARGET_ENVIRONMENT"
  exit 1
fi

for client_id in $(printf '%s' "$declared" | jq -r 'keys[]'); do
  client="$(curl --silent --show-error --fail --max-time 30 \
    --header "Authorization: Bearer $token" \
    --get "$base_url/admin/realms/$REALM/clients" \
    --data-urlencode "clientId=$client_id" \
    | jq '.[0] // empty')"

  if [ -z "$client" ]; then
    echo "::error::o client $client_id não existe no realm $REALM"
    exit 1
  fi

  uuid="$(printf '%s' "$client" | jq -r '.id')"
  wanted="$(printf '%s' "$declared" | jq --arg id "$client_id" '.[$id]')"

  # A união é calculada pelo `jq` e ordenada: sem isso, o mesmo conjunto em ordem diferente pareceria
  # mudança e o script escreveria a cada deploy.
  merged="$(jq --null-input --argjson current "$client" --argjson wanted "$wanted" '{
    redirectUris: (($current.redirectUris // []) + $wanted.redirectUris | unique),
    webOrigins: (($current.webOrigins // []) + $wanted.webOrigins | unique)
  }')"

  added="$(jq --null-input --argjson current "$client" --argjson merged "$merged" '
    ($merged.redirectUris - ($current.redirectUris // [])) + ($merged.webOrigins - ($current.webOrigins // []))
    | join(", ")' --raw-output)"

  if [ -z "$added" ]; then
    echo "client $client_id: os callbacks declarados já estão cadastrados"
  else
    echo "client $client_id: acrescentando $added"
    curl --silent --show-error --fail --max-time 30 \
      --request PUT "$base_url/admin/realms/$REALM/clients/$uuid" \
      --header "Authorization: Bearer $token" \
      --header 'content-type: application/json' \
      --data "$merged"
  fi

  # Confere no ar, não na resposta do PUT: 204 diz que o corpo foi aceito, não que ele valeu.
  missing="$(curl --silent --show-error --fail --max-time 30 \
    --header "Authorization: Bearer $token" \
    --get "$base_url/admin/realms/$REALM/clients" \
    --data-urlencode "clientId=$client_id" \
    | jq --argjson wanted "$wanted" --raw-output \
      '$wanted.redirectUris - (.[0].redirectUris // []) | join(", ")')"

  if [ -n "$missing" ]; then
    echo "::error::o client $client_id continua sem os callbacks: $missing"
    exit 1
  fi
done

# A conferência é na página que o cliente abre, não no que o realm diz: o tema precisa estar na
# imagem, e o único jeito de saber é ver o CSS que a tela referencia.
#
# O `code_challenge` não é decoração: o `account-console` exige PKCE, e sem ele o Keycloak responde
# 302 para a página de erro em vez de renderizar a tela — o smoke leria "tema ausente" em todo deploy.
# O desafio é descartável; ninguém troca o código por token aqui.
login_page="$(curl --silent --show-error --fail --max-time 30 \
  --get "$base_url/realms/$REALM/protocol/openid-connect/auth" \
  --data-urlencode "client_id=$SMOKE_CLIENT_ID" \
  --data-urlencode 'response_type=code' \
  --data-urlencode 'scope=openid' \
  --data-urlencode 'code_challenge_method=S256' \
  --data-urlencode "code_challenge=$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=')" \
  --data-urlencode "redirect_uri=$base_url/realms/$REALM/account/")"

served_theme="$(printf '%s' "$login_page" \
  | grep --only-matching --extended-regexp '/login/[A-Za-z0-9._-]+/' \
  | head -1 \
  | cut -d/ -f3 || true)"

if [ "$served_theme" != "$LOGIN_THEME" ]; then
  echo "::error::a tela de login serve o tema '${served_theme:-nenhum}', não '$LOGIN_THEME'."
  echo "::error::O tema provavelmente não está na imagem: confira deploy/keycloak/Dockerfile."
  exit 1
fi

echo "realm $REALM: a tela de login serve o tema $LOGIN_THEME"

# Spec 190 — Trocar de usuário na tela de senha

## Relato (2026-09-25)

Quem digita na identificação um usuário que existe mas não é o seu cai na tela de senha do Keycloak
sem jeito de voltar. Pedido: um botão **"Trocar de usuário"**.

## Causa medida (Keycloak local 26.5.2, realm `transportada-local`)

- A tela de senha é o `login.ftl` com `login_hint`. Ela já tinha um link **"Não é você?"**
  (`data-identity-restart`), que nasce `hidden` e só é revelado pelo `password-reset-link.js` quando
  ele acha a origem do app no `redirect_uri` da URL.
- **Na chegada** o link aparecia, com `href=http://localhost:53000/`.
- **Depois de uma senha recusada**, que é justamente quando a pessoa percebe que errou de usuário, a
  URL vira `login-actions/authenticate?execution=…&client_id=…&tab_id=…&client_data=…`, sem
  `redirect_uri`. O link continuava `hidden` com `href="#"`, e o "Esqueci minha senha" do app sumia
  junto. O compose local não declara `KEYCLOAK_FRONTEND_ORIGIN`, então não havia origem de reserva.
- O `#reset-login` do `template.ftl` (`url.loginRestartFlowUrl`) **não renderiza** nessa tela:
  `auth.showUsername()` sai falso no `UsernamePasswordForm`.
- O `url.loginRestartFlowUrl` também não serve de destino. Chamado depois do erro, ele devolveu a
  mesma tela de senha com "Entrando como local-user": o restart guarda o `login_hint`.
- O tema em uso **não** estava desatualizado: o diretório montado no container é idêntico ao de
  `origin/staging`.

## Decisão

- ~~O link vira botão `action action-quiet` com seta.~~ Revisto a pedido do usuário: é **link de
  texto** na linha do usuário — "`<usuário>` Não é você? **Trocar de usuário**" —, só a ação em cobre,
  sem borda nem fundo, sublinhada no hover e no foco, com 44px de toque e sem ícone.
- O destino continua sendo a identificação do app (a origem do `redirect_uri`, e não o restart do
  Keycloak). O script passa a ler o `ru` do `client_data` (base64url) quando o `redirect_uri` falta.
- Sem origem nenhuma (nem `redirect_uri`, nem `client_data`, nem variável do deploy), o botão segue
  escondido. É melhor ausente do que apontando para `#` ou para a mesma tela.
- ~~A identificação volta com o campo vazio.~~ Revisto no mesmo dia, a pedido do usuário: o campo
  volta **preenchido e selecionado** com o que foi digitado, guardado no `sessionStorage` da aba e
  apagado assim que a sessão nasce. Nunca vai para a URL nem para o `localStorage` (dado pessoal).

## Continuar conectado (pedido do usuário, 2026-09-25)

- O `login.ftl` já renderizava a caixa "Continuar conectado" com `realm.rememberMe`, mas o realm vinha
  com `"rememberMe": false`. Ligado nos dois `realm.json`, com prazos próprios: 7 dias de
  inatividade e 30 dias no máximo. Zerados, o Keycloak usaria os da sessão comum (30 minutos).
- Marcada, a caixa torna persistentes os cookies da sessão do Keycloak. O boot do app já faz
  `check-sso`, então com o navegador reaberto a pessoa entra direto, sem identificação e sem senha.
- Ambiente existente recebe os três campos pelo `keycloak-reconcile.sh`, que lê os valores do
  `deploy/keycloak/realm.json`: `--import-realm` ignora realm que já existe.
- É opt-in por login: sem a caixa marcada, fechar o navegador encerra a sessão como antes.

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

- O link vira botão **"Trocar de usuário"** (`action action-quiet`, com a seta de voltar), logo abaixo
  de "Entrando como <usuário>", na mesma moldura dos botões secundários do tema.
- O destino continua sendo a identificação do app (a origem do `redirect_uri`, e não o restart do
  Keycloak). O script passa a ler o `ru` do `client_data` (base64url) quando o `redirect_uri` falta.
- Sem origem nenhuma (nem `redirect_uri`, nem `client_data`, nem variável do deploy), o botão segue
  escondido. É melhor ausente do que apontando para `#` ou para a mesma tela.
- A identificação volta com o campo vazio. O usuário digitado já aparece na tela de senha, ao lado do
  botão, e não vai para a URL (dado pessoal em query string é proibido).

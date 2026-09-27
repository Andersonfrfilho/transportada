# Spec 191 — Primeiro acesso é a porta do login

## Problema e resultado

A spec 188 levou o convite à tela `/ativar` e deixou de fora o link "Tenho um código de ativação"
na tela de login (`specs/188-o-convite-leva-a-ativacao/spec.md:26`). Hoje o convidado que perdeu o
e-mail ou deixou o código expirar não tem saída sem o administrador. O reenvio só existe em
`POST /company-users/:id/invitation`, que exige `users.manage` (`resend-company-user-code.use-case.ts`).
Na tela de senha do Keycloak, ele vê só "Usuário ou senha inválidos" e o link "Esqueci minha senha",
que o leva a uma armadilha.

Medido no código em 25/09/2026:

1. **Convidado ainda não ativado.** No Keycloak, `enabled=false` e sem senha. No banco,
   `identity_users` ativo, membership ativa e o `user_invitations` mais recente em `pending`
   (`invite-company-user.use-case.ts:76-120`, `drizzle-company-user.repository.ts:183-224`,
   `user-invitation.schema.ts:32`). O suspenso também tem `enabled=false`, mas com membership
   `disabled`.
2. **A armadilha do "Esqueci minha senha".** `findActiveTargets`
   (`drizzle-password-reset.repository.ts:73-96`) aceita o convidado, porque a identidade e a
   membership dele estão ativas. `confirm-password-reset.use-case.ts:75` chama `setPassword` e nunca
   `setEnabled` (ADR-0030 §5). A senha fica definida, a conta continua desabilitada, e o convidado vê
   "Esta conta está desativada" (`messages_pt_BR.properties:30`) sem entender por quê.
3. **O bug da suspensão.** A ativação chama `setEnabled(true)` (`activate-invitation.use-case.ts:79`)
   sem conferir a membership. Suspender não mexe no convite
   (`change-company-user-status.use-case.ts:90-108`), então quem foi suspenso com um código ainda
   válido reabre a própria conta no Keycloak. Na tela de Usuários, o suspenso com convite `pending`
   aparece como "convidado", porque `deriveCompanyUserStatus` (`company-user.policy.ts:85-91`) olha o
   convite antes da membership. O reenvio administrativo também reemite para membership `disabled`.
4. **Remover o vínculo de quem já foi convidado provavelmente falha.** `removeMembership`
   (`drizzle-company-user.repository.ts:519-531`) apaga a membership. Mas `user_invitations_membership_fk`
   (`user-invitation.schema.ts:74-80`) e `password_reset_requests_membership_fk`
   (`password-reset.schema.ts:62-68`) são `ON DELETE RESTRICT`. Nenhum teste de integração cobre esse
   caminho, então a hipótese **é medida antes de corrigir** (T0.2).
5. **As rotas anônimas de identidade não têm limite efetivo.** `login-hints`, `user-activation`,
   `password-resets` e `password-resets/confirm` não declaram `rateLimit` (`login-hint.routes.ts:27`,
   `user-activation.routes.ts:21`, `password-reset.routes.ts:29,40`). O único limitador anônimo fica em
   memória e vale por réplica (`router.service.ts:214-220,358-373`). O IP vem do **primeiro** endereço
   de `x-forwarded-for` (`client-ip.service.ts:11-22`), que o próprio cliente escolhe
   (`docs/SECURITY.md:304-326`). Nenhum dos dois `realm.json` declara `bruteForceProtected`.
6. **A ativação não tem limite de tentativas na prática.** `findByCodeHash` procura pelo hash do
   código **chutado** (`drizzle-invitation.repository.ts:148-152`). Um chute errado não encontra
   convite, então nada é contado. O "5 tentativas por convite" (`invitation.constant.ts`) só vale
   para um hash que já bate. A recuperação de senha segue o mesmo desenho. O que protege essas duas
   rotas hoje é a entropia do código: 64 bits, de `randomBytes(8)`, em `invitation.policy.ts:68-73`.
7. **O link do tema manda o portal e o motorista para uma tela que não existe.**
   `password-reset-link.js` monta `<origem do redirect_uri>/recuperar-senha`. Mas `/recuperar-senha`
   e `/ativar` só existem no painel (`apps/frontend-transportada/src/main.tsx:954,966`). Nem
   `apps/frontend-client` nem `apps/frontend-driver` têm rota pública. O script ainda revela só o
   **primeiro** elemento de cada seletor (`querySelector`, em `password-reset-link.js:50`).

**Resultado:**

- O login ganha a porta **"Ativar minha conta"** nas três apps e no tema do Keycloak. Ela leva a uma
  tela com duas saídas:
  - **"Tenho o código"**: a ativação que já existe;
  - **"Reenviar código"**: uma rota pública nova, que responde sempre igual e só entrega ao contato
    já cadastrado.
- O reenvio entrega **o mesmo código** enquanto ele for válido.
- As cinco rotas anônimas de identidade passam a ter limite compartilhado por IP, com o IP lido do
  salto conhecido. O reenvio e a recuperação também ganham limite por alvo.
- O realm ganha a proteção contra força bruta.
- A armadilha e o bug da suspensão são fechados.
- Um desafio invisível (Turnstile) fica pronto e **desligado**, para ser ligado só se houver abuso.

## Decisões (usuário e orquestrador, 25/09/2026)

Detalhe e alternativas na **ADR-0076**.

1. **O link de ativação é separado.** Ele fica ao lado de "Esqueci minha senha", na identificação das
   três apps e no tema do Keycloak. No tema, aparece também junto do erro de credencial: é ali que
   percebe o erro quem digitou o código como senha, o caso da spec 188.
   - O rótulo é **"Ativar minha conta"**, não "Primeiro acesso?". O painel já tem `/primeiro-acesso`
     (`FirstAccess.page.tsx`), que é o assistente do primeiro administrador. Usar o mesmo nome
     confundiria as duas telas, e esta spec não toca naquela.
2. **A resposta do reenvio é sempre neutra.** O texto é "Se houver um convite pendente para esse
   contato, enviamos o código para o contato cadastrado."
   - Para qualquer entrada válida, a resposta tem o mesmo status (204), corpo vazio e os mesmos
     cabeçalhos, exceto `x-correlation-id` e `Date`.
   - O piso de tempo vale nos dois caminhos, inclusive quando o trabalho termina em erro.
   - O código vai só ao contato já cadastrado, pelo canal da empresa, nunca a um endereço digitado.
3. **O reenvio entrega o mesmo código enquanto ele for válido.** O `sealed_code` existe para o worker
   reentregar (`user-invitation.schema.ts:49-55`).
   - Código novo só sai quando o anterior expirou, quando esgotou as tentativas ou quando não tem
     `sealed_code` (convite antigo).
   - Isso vale para o reenvio administrativo e para o público.
   - Reenviar deixa de invalidar o código de ninguém. Sobra um intervalo curto contra spam de e-mail
     e um teto diário.
4. **Anti-robô só se houver abuso.** O Turnstile fica pronto e desligado por variável de ambiente, com
   a CSP condicionada à chave pública. Há log sem PII do volume por rota e um critério escrito para
   decidir quando ligar.
5. **A segurança da tela é obrigatória.**
   - Limite em dois estágios: memória por réplica, depois Postgres.
   - Chave por IP em todas as rotas. Chave por alvo (HMAC do identificador normalizado) no reenvio e
     na recuperação.
   - O desafio roda antes do consumo por alvo.
   - Força bruta ligada no realm, com mensagem neutra.
   - Nenhum identificador em log, e piso de tempo nas respostas.
6. **Suspender não revoga o convite.** O status derivado prioriza a membership `disabled`. A ativação
   exige membership e identidade ativas, e o reenvio administrativo recusa suspenso com 409.
   - O status `revoked` continua sem uso nesta spec. Isso é intencional e está registrado na ADR.
7. **As telas públicas são copiadas por valor nas três apps.** O tema continua apontando para a origem
   de quem pediu o login, não sempre para o painel (ADR-0076 §5).

## Dependências

- **Spec 189**, a app do motorista: as tasks de produção T6.8–T6.10 precisam estar fechadas antes da
  T7.6 desta spec. A T5.3 confere o `apps/frontend-driver/src/main.tsx` contra o estado da 189 antes de
  editar.
- **Spec 190**: esta spec só lê o `loginIdentifierMemory` e o botão "Trocar de usuário", sem
  alterá-los.

## Fora do escopo

- **Link do e-mail do convite por papel** (motorista para `motorista.*`, contratante para o portal).
  O e-mail continua levando a `${APP_BASE_URL}/ativar` no painel, que funciona para qualquer papel.
- **Convite por WhatsApp com link.** Seria outro template da Meta, a mesma razão da spec 188.
- **Ligar** o Turnstile.
- **O oráculo de valor do `POST /login-hints`.** A rota devolve o `username` canônico quando acha o
  identificador e o texto digitado quando não acha (`login-identifier.policy.ts:83-93`).
  - Esta spec o **mitiga** com limite por IP e o **registra** no `docs/SECURITY.md`.
  - Não há limite por alvo no `login-hints`: um terceiro poderia trancar a primeira etapa do login da
    vítima (ADR-0076 §3).
  - Fechar o oráculo exige o Keycloak resolver o identificador sozinho, e fica para uma spec própria.
- **Contador de tentativas por convite e por pedido de recuperação** (item 6 do problema). A entrada
  de 2026-08-13 do `docs/SECURITY.md` continua aberta. Esta spec só acrescenta o limite por IP.
- **Uso do status `revoked`.**

## Histórias priorizadas

### P1 — Convidado que perdeu o código pede outro sozinho

**Given** um convidado com membership ativa e convite `pending` **When** ele toca "Ativar minha conta"
na identificação, escolhe "Reenviar código" e digita o e-mail, o CPF, o telefone ou o usuário **Then**:

- vê a mensagem neutra;
- se o código ainda vale, o **mesmo** código chega de novo pelo canal da empresa;
- se expirou ou esgotou, sai um código novo e o anterior vira `superseded`;
- o link do e-mail abre `/ativar` com o código preenchido.

### P1 — Quem não tem convite recebe a mesma resposta

**Given** um identificador inexistente, ambíguo, de usuário já ativado, de suspenso ou de vínculo
removido **When** ele pede o reenvio **Then** recebe a mesma resposta (mesmo status, corpo vazio,
mesmos cabeçalhos exceto `x-correlation-id` e `Date`), dentro do mesmo piso de tempo, e nada é
enviado.

### P1 — Suspenso não reabre a conta

**Given** um convidado com código válido **When** o administrador o suspende **Then**:

- a tela de Usuários mostra "suspenso";
- ativar com o código dá a mesma recusa genérica, sem `setEnabled`;
- o reenvio administrativo responde 409, com a mensagem mapeada no painel;
- o reenvio público não entrega nada.

### P1 — O "Esqueci minha senha" do convidado vira reenvio do convite

**Given** um convidado não ativado **When** ele pede recuperação de senha **Then**:

- recebe a mesma resposta de sempre (204);
- **nenhum** pedido de redefinição é criado;
- o convite é reentregue em silêncio, respeitando o intervalo e o teto do autoatendimento.

### P2 — Robô que martela a tela recebe 429

**Given** um mesmo IP, ou um mesmo identificador no reenvio ou na recuperação, acima do teto **When**
ele chama a rota **Then**:

- recebe 429 com `Retry-After`;
- o teto vale somado entre réplicas;
- forjar `x-forwarded-for` não abre balde novo;
- a tela mostra "Muitas tentativas. Tente de novo em N min."

### P2 — Força bruta de senha bloqueia temporariamente

**Given** um login do realm **When** alguém erra a senha além do `failureFactor` **Then** o Keycloak
bloqueia a conta temporariamente, e a tela mostra "Usuário ou senha inválidos.", nunca "bloqueada".

### P2 — Portal e motorista têm a própria porta

**Given** alguém no `apps/frontend-client` ou no `apps/frontend-driver` **When** toca "Esqueci minha
senha" ou "Ativar minha conta", na identificação da app ou no tema do Keycloak **Then** abre
`/recuperar-senha` ou `/ativar` **na mesma origem**, e o "voltar ao login" volta à mesma app.

### P3 — Recuperar senha aceita o que a pessoa lembra

**Given** a tela de recuperação **When** a pessoa digita e-mail, CPF, telefone ou usuário **Then** o
pedido resolve o login pelo mesmo resolvedor da identificação. O `{ username }` continua aceito.

## Requisitos funcionais

- **RF1 — Tela de ativação em `/ativar`, nas três apps.**
  - Sem fragmento, mostra a escolha "Tenho o código" / "Reenviar código". Com `#codigo=`, vai direto
    ao formulário, como na spec 188.
  - "Reenviar código" pede o identificador (até 254 caracteres) e chama `POST /invitation-resends`.
  - Depois, mostra a mensagem neutra com "Já tenho o código" e "Voltar ao login".
  - O 429 mostra "Muitas tentativas. Tente de novo em N min.", com N vindo do `Retry-After`. Qualquer
    outra falha mostra o aviso genérico.
  - O campo nasce preenchido com o identificador lembrado na aba (spec 190), onde a app o guarda.
    Nunca vem da URL.
  - Chaves de texto: `activation.choice.*`.
- **RF2 — `/recuperar-senha` nas três apps.**
  - No portal e no motorista, a tela é cópia por valor do `PasswordReset.page.tsx` do painel.
  - Nas três apps, o campo passa a ser "e-mail, CPF, telefone ou usuário", enviado como `{ identifier }`
    (RF11), com o mesmo tratamento de 429.
- **RF3 — Links na identificação das três apps.** "Esqueci minha senha" leva a `/recuperar-senha` e
  "Ativar minha conta" leva a `/ativar`, ambos na própria origem.
- **RF4 — Links no tema do Keycloak.**
  - Um link `data-first-access`, com destino `/ativar`, fica ao lado de `data-password-reset`
    (`login.ftl:96`).
  - Com erro de credencial (`login.ftl:77-81`), um segundo `data-first-access` aparece logo abaixo do
    erro.
  - `password-reset-link.js:50` troca `querySelector` por `querySelectorAll(...).forEach`, para que os
    dois links sejam revelados.
  - Sem origem resolvida, os links ficam escondidos (regra da spec 190).
- **RF5 — `POST /invitation-resends`, rota anônima.**
  - Corpo: `{ identifier, challengeToken? }`, com `identifier` de até 254 caracteres.
  - Resolução: o mesmo caminho do `login-hints` (`parseLoginIdentifier` → `findByIdentifier`). O que
    não parecer nenhum dos tipos vale como `username`. Identificador de duas pessoas não resolve.
  - Alvo: cada empresa em que a pessoa tem `identity_users` ativo, membership ativa e convite mais
    recente `pending`.
  - Para cada alvo:
    - **código ainda válido** (não expirou, não esgotou as tentativas e tem `sealed_code`): grava só
      uma linha nova de outbox para o **mesmo** convite, e o worker reentrega. O worker entrega
      qualquer convite `pending` com `sealed_code` (`worker drizzle-invitation.repository.ts:40-80`);
    - **código inválido**: reemite pelo núcleo do reenvio administrativo (código novo, anterior
      `superseded`).
  - A linha de outbox leva `actor_user_id = userId`.
  - Trilha em `audit_logs`: `invitation.self-resend.requested`, com ator = alvo = o próprio usuário e
    `metadata { trigger: 'anonymous', source: 'invitation-resend' | 'password-reset', ipAddress, reissued }`.
    O identificador não entra.
  - A resposta é **sempre** 204 sem corpo.
- **RF5a — Intervalo mínimo contra spam de e-mail.** Se já houve linha de outbox desse convite nos
  últimos `INVITATION_SELF_RESEND_MIN_INTERVAL_SECONDS` (padrão 120), não entrega nada. A resposta
  não muda.
- **RF5b — Teto diário do autoatendimento.** Se a membership já teve
  `INVITATION_SELF_RESEND_DAILY_CAP` (padrão 5) entregas **pedidas pelo próprio usuário** nas últimas
  24 h, não entrega nada. A resposta não muda.
  - Pedido pelo próprio usuário é a linha de outbox com `actor_user_id = user_id`.
  - Convites e reenvios do administrador **não** contam para esse teto, e o teto não os barra.
- **RF6 — A ativação exige vínculo vivo.** `activate-invitation` recusa, com a mesma recusa genérica,
  convite cuja membership não está `active` ou cujo `identity_users` não está ativo. Só depois dessa
  checagem chama `setEnabled(true)`.
- **RF7 — O status derivado prioriza a suspensão.** `deriveCompanyUserStatus` passa a devolver
  `suspended` para membership `disabled` antes de olhar o convite pendente.
- **RF8 — Remover vínculo de quem foi convidado funciona.** Medido primeiro (T0.2). Se o `23503` se
  confirmar em uma ou nas duas tabelas:
  - na mesma transação do `DELETE`, a remoção apaga **todos** os `user_invitations` (`pending`,
    `accepted`, `superseded`) e os `password_reset_requests` daquela membership;
  - roles e outbox saem por cascata;
  - antes, grava em `audit_logs` `company-user.membership-removed`, com
    `metadata { invitationAcceptedAt, invitationsDeleted, passwordResetsDeleted }`. O `accepted_at` da
    ativação por código só existe nessa linha, porque a ativação por código não grava trilha.
  - As linhas apagadas guardam apenas hashes e códigos selados, então apagá-las também reduz
    superfície.
  - Alternativa rejeitada: traduzir o `23503` em 409 ("vínculo com histórico: suspenda"). Isso
    tornaria impossível remover qualquer pessoa que já foi convidada, ou seja, quase todas.
- **RF9 — Reenvio administrativo.**
  - Recusa suspenso: `resend-company-user-code` lança o erro novo de `identity/domain/invitation.error.ts`
    (409), no molde de `InvitationAlreadyAcceptedError`, e o painel mapeia essa mensagem.
  - Passa a seguir a regra "mesmo código enquanto válido" (Decisão 3).
- **RF10 — Recuperação de convidado vira reenvio.**
  - `request-password-reset`: alvo com convite `pending` não gera `password_reset_requests`. Vai para o
    serviço do RF5, com RF5a e RF5b, e `source: 'password-reset'`.
  - `confirm-password-reset` recusa, com a recusa genérica, alvo que ainda tem convite `pending`.
    Isso é defesa em profundidade para pedidos antigos.
- **RF11 — `POST /password-resets` aceita `{ identifier }`** pelo mesmo resolvedor do RF5.
  - `{ username }` continua aceito. Os dois juntos dão 400.
  - O limite por alvo é o mesmo balde para as duas formas: HMAC do texto normalizado, até 254
    caracteres.
- **RF12 — Limite compartilhado nas cinco rotas anônimas.**
  - Dois estágios. Primeiro, um balde em memória por réplica, com o mesmo `maxRequests`, recusa sem
    tocar no banco. Só o que passa consome o `postgres` (`rate_limit_windows`).
  - Cada rota declara `scope` e `store` literais. Só o teto e a janela vêm do env.

  | Rota                            | Por IP      | Por alvo (HMAC)                   |
  | ------------------------------- | ----------- | --------------------------------- |
  | `POST /login-hints`             | 60 / 10 min | — (ADR-0076 §3)                   |
  | `POST /invitation-resends`      | 10 / 15 min | 3 / 60 min                        |
  | `POST /password-resets`         | 10 / 15 min | 3 / 60 min                        |
  | `POST /user-activation`         | 20 / 15 min | — (entropia de 64 bits do código) |
  | `POST /password-resets/confirm` | 20 / 15 min | — (idem)                          |
  - Por que não há alvo nas rotas que consomem código: uma chave pelo hash do chute não protege nada,
    porque cada chute tem um hash diferente. E o contador por convite não conta chute errado (problema,
    item 6).
  - Com 20 chutes a cada 15 min por IP, contra 2⁶⁴ códigos possíveis, a varredura é inviável.

- **RF13 — O IP vem do salto conhecido.**
  - `resolveClientIp` passa a ler só o cabeçalho que o proxy conhecido escreve: `CLIENT_IP_SOURCE`,
    com padrão `x-real-ip` (topologia medida em 14/09).
  - O resolvedor configurado é injetado nos **oito** pontos de chamada:
    - `router.service.ts:217`;
    - `trip.routes.ts:1254`;
    - `trip-field-office-trip.routes.ts:136,187,244`;
    - `trip-field-office-occurrence.routes.ts:126`;
    - `trip-field-office-document.routes.ts:105`;
    - `fleet/presentation/aggregate-account.routes.ts:63`.
  - O desenho retoma o branch nunca mesclado `fix/client-ip-trusted-proxy` (`51cd186c6`). Toda menção
    a "ADR-0065" no código portado vira "ADR-0076 §6".
- **RF14 — Força bruta no realm.**
  - `bruteForceProtected: true`, `permanentLockout: false` e espera progressiva, nos dois `realm.json`.
  - O `keycloak-reconcile.sh` aplica os campos ao realm existente, no molde do `rememberMe`
    (`.github/scripts/keycloak-reconcile.sh:80-99`). O `BRUTE_FORCE_FIELDS` só lista campos que o
    `realm.json` declara.
  - Toda mensagem de bloqueio no tema diz "Usuário ou senha inválidos.".
- **RF15 — Desafio invisível, desligado.**
  - Variável `SELF_SERVICE_CHALLENGE_ENABLED`, com padrão `false`. Ligada sem `TURNSTILE_SECRET_KEY`,
    o boot falha.
  - Ligada, `invitation-resends` e `password-resets` exigem `challengeToken` válido
    (`verifyTurnstileToken`, `turnstile.service.ts:13-32`).
  - O desafio roda **depois do limite por IP e antes do consumo por alvo**: token inválido não conta
    no balde do alvo.
  - Falha dá 400 `SELF_SERVICE_CHALLENGE_FAILED`, que não depende do alvo.
  - Nos fronts, o widget e a origem `https://challenges.cloudflare.com` em `script-src`, `frame-src`
    e `connect-src` só existem com a chave pública configurada.
  - A chave do widget no Cloudflare precisa listar os hostnames das três apps.
  - No motorista, a chave pública entra como literal `VITE_*` no build. Ligar o Turnstile ali exige
    commit, não só variável.
- **RF16 — Observabilidade sem PII.**
  - Evento `self_service_request` com `route`, `outcome` (`accepted`, `rate_limited_ip`,
    `rate_limited_target` ou `challenge_failed`), `matchedTargets` (número), `delivery` (`same_code`,
    `new_code` ou ausente), `skipped` (`interval`, `daily_cap` ou ausente) e `correlationId`.
  - O evento **nunca** leva identificador, hash do identificador, IP, `username`, `userId` ou código.

## Requisitos não funcionais

- **Anti-enumeração.**
  - O reenvio e a recuperação respondem com status, corpo e cabeçalhos idênticos para qualquer
    entrada válida, exceto `x-correlation-id` e `Date`.
  - O piso de tempo (`SELF_SERVICE_RESPONSE_FLOOR_MS`, mais 0 a 50 ms de variação aleatória) vale nos
    dois caminhos e também quando o trabalho termina em erro.
  - O piso é fixado **acima do p99 do caminho que reemite**. O p99 é medido em teste de integração
    local, com os tetos sobrescritos por env para não estourar o limite, e a margem é de pelo menos
    30%. O valor inicial é 500 ms, revisto pela medição.
  - Em staging, a checagem é qualitativa, com 20 convidados distintos.
- **O 429 não revela nada.**
  - A chave por alvo é o HMAC do texto **digitado e normalizado**, não do usuário resolvido.
  - A chave por IP também é HMAC, para que `rate_limit_windows` não guarde IP em claro.
  - Identificador inexistente e existente estouram o limite do mesmo jeito.
- **Chave HMAC nova:** `RATE_LIMIT_SUBJECT_HMAC_KEY`, em `cryptographic-configuration.schema.ts`.
  - Tem de ser distinta das outras chaves; a regra de chaves repetidas está em `:45-49`.
  - Separação de domínio: `transportada:rate-limit:v1:<scope>`.
  - É obrigatória: sem ela, a API não sobe.
- **O store `postgres` falha fechado.** Com o banco fora, a resposta é 500, nunca passagem livre.
  - A guarda de boot (`router.service.ts:424-434`) passa a olhar também as rotas anônimas.
- **Nenhuma app importa código de outra.**
  - Portal e motorista recebem cópias por valor, com contrato próprio.
  - O `PublicRouteFrame` do portal e o do motorista também são cópias.
- **O PWA do motorista abre `/ativar` e `/recuperar-senha` antes do `runDriverBoot`**, sem sondar o
  Keycloak.

## Casos extremos e falhas

- **Identificador de duas pessoas** (telefone compartilhado): nada é entregue, e a resposta é neutra.
- **Convite `pending` em duas empresas:** cada empresa entrega pelo próprio canal. O intervalo e o
  teto valem por membership.
- **Convite `accepted`, sem convite ou membership `disabled`:** nada acontece.
- **Convite antigo sem `sealed_code`:** recebe um código novo.
- **Corrida entre dois reenvios que emitem código novo:** o índice único parcial de `pending`
  (`user-invitation.schema.ts:86-88`) garante um só `pending`. A requisição perdedora vira "nada a
  fazer", sem 500.
- **Corrida entre suspensão e ativação:** a ativação lê a membership `active` e, antes do
  `setEnabled(true)`, o administrador suspende. A conta pode ficar habilitada com membership
  `disabled`.
  - A suspensão chama o provedor **antes** do banco (`change-company-user-status.use-case.ts:56-66`).
    Então, se a suspensão termina depois, ela desabilita de novo.
  - A janela restante é a ativação terminar o `setEnabled(true)` depois do `setEnabled(false)` da
    suspensão. Essa janela é de milissegundos e a ação depende de um administrador.
  - O risco é aceito e registrado.
  - A reconciliação de usuários (`reconcile-company-users.use-case.ts:106`) lê o `enabled` do realm,
    então a divergência aparece ali. A T2.3 confere se ela a corrige ou só a expõe e anota o
    resultado.
- **Store do limitador fora do ar:** 500 genérico, nunca passagem livre.
- **Turnstile ligado com a Cloudflare fora:** 400 `SELF_SERVICE_CHALLENGE_FAILED` (falha fechada,
  como na landing).
- **Terceiro que provoca o bloqueio temporário do Keycloak** (negação de serviço no login da vítima):
  - a espera é curta e progressiva, com teto de 15 min, e não há bloqueio permanente;
  - o risco é aceito e registrado.

## Critérios de aceite

- [ ] CA1 — Contrato: `POST /invitation-resends` responde 204 com corpo vazio e os mesmos cabeçalhos
      (exceto `x-correlation-id` e `Date`) para os 8 casos: inexistente, ambíguo, ativado, suspenso,
      removido, pendente válido, pendente expirado e pendente dentro do intervalo.
- [ ] CA2 — Integração (banco): - código válido reentregue sem `superseded`; - código expirado reemitido com `superseded`; - outbox com referência; - intervalo e teto respeitados, sem contar o administrador; - corrida entre dois reenvios deixa um único `pending`.
- [ ] CA3 — Suspenso: - status derivado `suspended`; - ativar com o código antigo recusa sem `setEnabled`; - reenvio administrativo dá 409; - reenvio público não entrega.
- [ ] CA4 — Integração: remover o vínculo de um convidado funciona, depois de visto vermelho, e grava
      a trilha com as contagens.
- [ ] CA5 — Contrato da recuperação: - para convidado, não cria `password_reset_requests` e reentrega o convite; - a confirmação recusa alvo com convite `pending`; - `{ identifier }` e `{ username }` caem no mesmo balde.
- [ ] CA6 — Limite: - `test/rate-limited-routes.contract.test.ts` declara as cinco rotas, com `store: 'postgres'`,
      o `scope` e o alvo onde houver; - acima do teto em memória, `consume` do store não é chamado; - a integração prova o 429 somado entre dois roteadores sobre o mesmo banco.
- [ ] CA7 — Contrato do IP: uma cadeia `x-forwarded-for` forjada não muda o balde, nos oito pontos de
      chamada.
- [ ] CA8 — Realm, nos contratos estático e de reconciliação executada: - força bruta declarada; - a reconciliação aplica, não reescreve à toa e regrava o que divergiu; - o tema mascara as mensagens de bloqueio; - com `redirect_uri`, dois `data-first-access` são revelados.
- [ ] CA9 — Fronts: - `/ativar` e `/recuperar-senha` abrem sem sessão nas três apps; - os links existem; - o 429 é tratado; - a CSP tem ou não tem o Turnstile conforme a chave.
- [ ] CA10 — Flag do desafio: - ligada sem segredo, derruba o boot; - ligada, exige o token; - token inválido não incrementa o balde do alvo; - desligada, ignora o campo.
- [ ] CA11 — Nenhum log das rotas novas ou alteradas contém identificador, IP, `username` ou código.
      Verificado por contrato sobre o logger capturado.
- [ ] CA12 — Staging: - um convidado real pede reenvio pela tela do motorista e pela do painel, recebe no Mailpit e
      ativa; - o 11º pedido do mesmo IP dá 429; - a força bruta aparece pela Admin API; - prints em 375 e 768.

## Dúvidas

Nenhuma bloqueante. Tetos, janelas, intervalo e piso são padrões configuráveis por env, decididos
aqui.

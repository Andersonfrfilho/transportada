# Plano técnico — Spec 191

## Contexto e premissas

- Specs lidas e conferidas contra o código:
  - 026 (administração e convite);
  - 033 e ADR-0030 (recuperação: 204 sempre; "redefinir não reabilita");
  - 188 (`/ativar` no painel, link no e-mail; o item adiado é este);
  - 189 e ADR-0075 (app do motorista);
  - 190 (botão "Trocar de usuário", identificador lembrado na aba, `rememberMe` pela reconciliação).
- Esta spec constrói por cima da 190 e não mexe no botão "Trocar de usuário" nem no
  `loginIdentifierMemory`, só os lê. Também não toca em `/primeiro-acesso` nem em
  `FirstAccess.page.tsx`.
- **Depende da 189.** A T5.3 confere o `apps/frontend-driver/src/main.tsx` contra a 189 antes de
  editar, e a T7.6 só roda com as tasks T6.8–T6.10 da 189 fechadas.
- Achados de segurança pré-existentes tratados aqui (`docs/SECURITY.md`):

  | Achado                                                   | Resultado                                                                                                      |
  | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
  | L4 (`:463-478`), rotas anônimas só com limite em memória | **Parcialmente fechado (identidade)**. As outras rotas anônimas seguem como estão.                             |
  | 2026-09-18 (`:304-326`), IP forjável                     | Fechado.                                                                                                       |
  | 2026-08-13 (`:1273-1291`), recuperação sem limite        | **Continua aberto.** Ganha limite por IP, mas o contador por pedido não conta chute errado (spec, problema 6). |

- **Sem migration.** `rate_limit_windows`, `user_invitations`, `invitation_delivery_outbox`
  (`actor_user_id`, `created_at`) e `audit_logs` já existem. Se o executor concluir que precisa de
  coluna ou índice, **para e pergunta**.

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`)

**IP do cliente**

- Arquivos: `src/http/client-ip.service.ts`, `src/shared/client-ip.constant.ts` (novo),
  `src/config/environment.schema.ts` (`CLIENT_IP_SOURCE`, `TRUSTED_PROXY_HOPS`),
  `src/shared/api.types.ts` e `src/main.ts`.
- O desenho vem de `51cd186c6` (`git show 51cd186c6`). Toda menção a "ADR-0065" vira "ADR-0076 §6".
- O resolvedor configurado é injetado nos oito pontos de chamada:
  - `router.service.ts:217`;
  - `trips/presentation/trip.routes.ts:1254`;
  - `trips/presentation/trip-field-office-trip.routes.ts:136,187,244`;
  - `trips/presentation/trip-field-office-occurrence.routes.ts:126`;
  - `trips/presentation/trip-field-office-document.routes.ts:105`;
  - `fleet/presentation/aggregate-account.routes.ts:63`.
- `test/client-ip.contract.test.ts` entra no `package.json`.

**Limitador anônimo em dois estágios**

- Arquivos:
  - `src/http/router.service.ts`: ramo anônimo `:214-220`, tipo `:108-118`, `execute` `:343-350`,
    guarda de boot `:424-434`;
  - `src/http/rate-limiter.service.ts`: `Map` com teto, vindo de `51cd186c6`, e o tipo
    `AnonymousRateLimitPolicy`;
  - `src/http/rate-limit-subject.service.ts` (novo): HMAC do IP e do alvo;
  - `src/config/cryptographic-configuration.schema.ts`.
- Ordem na rota anônima:
  1. IP, primeiro em memória e depois no Postgres, antes do `parse`;
  2. `parse`;
  3. desafio, se a flag estiver ligada;
  4. alvo, primeiro em memória e depois no Postgres;
  5. `handle`.

**Rotas com limite**

- `login-hint.routes.ts` (só IP), `user-activation.routes.ts` (só IP), `password-reset.routes.ts` (as
  duas; alvo só no pedido) e `invitation-resend.routes.ts` (novo).
- `scope` e `store` são literais na rota. Teto e janela vêm do env, com padrões em
  `src/identity/shared/identity-rate-limit.constant.ts` (novo).

**Reenvio**

- Novos em `application/`:
  - `invitation-delivery.service.ts`: núcleo partilhado pelo reenvio administrativo, pelo público e
    pela recuperação. Decide entre reentregar o mesmo código e reemitir;
  - `request-invitation-self-resend.use-case.ts`;
  - `resolve-login-targets.service.ts`: identificador → `username[]`, reaproveitando
    `parseLoginIdentifier` e `LoginIdentifierRepositoryPort.findByIdentifier`.
- `domain/invitation.policy.ts` ganha:
  - `decideInvitationDelivery`: `same_code` ou `new_code`;
  - `planInvitationSelfResend`: intervalo e teto.
- Também mudam `domain/invitation.constant.ts` e `presentation/invitation-resend.schema.ts` (novo).
- `resend-company-user-code.use-case.ts` passa a usar o núcleo e recusa suspenso.

**Piso de tempo**

- `src/http/response-floor.service.ts` (novo): `respondAfterFloor({ floorMs, jitterMs, work })`, com
  relógio e sono injetáveis.
- Aguarda o piso também quando `work` rejeita, e só então relança o erro.

**Correções de domínio**

- `domain/company-user.policy.ts:85-91`: `deriveCompanyUserStatus` prioriza `disabled`.
- `activate-invitation.use-case.ts` e `DrizzleInvitationRepository.findByCodeHash`: a busca traz
  `membershipStatus` e `identityStatus`.
- `removeMembership`: T2.2.
- `request-password-reset.use-case.ts` e `drizzle-password-reset.repository.ts`: `findActiveTargets`
  devolve `hasPendingInvitation`.
- `confirm-password-reset.use-case.ts`.

**Desafio**

- `application/self-service-challenge.service.ts` (novo), sobre `verifyTurnstileToken`.
- `environment.schema.ts`: `SELF_SERVICE_CHALLENGE_ENABLED`, no padrão das `:207-210`.

**Log e composição**

- Evento `self_service_request` pelo `safe-logger.service.ts`.
- `src/main.ts`: `:1393-1398`, `:1539` e `:1562-1594`.
- `src/shared/api.constant.ts`: `API_INVITATION_RESENDS_PATH = '/invitation-resends'`.

**Configuração da chave nova (`RATE_LIMIT_SUBJECT_HMAC_KEY`)**

- `Makefile:71`: `grep -q` da chave no `make config`.
- `.railway/railway.ts:106,161`: `preserve()` nos dois ambientes.
- `docs/spec/railway.md:281`: lista das chaves.
- `test/fixtures/cryptographic-environment.fixture.ts`.
- `.env.example`: valor canônico **válido e distinto** das outras chaves, porque o `ci.yml:114` o
  copia para `.env`.
- `.env.test.example`.
- `.env` e `.env.test` reais são links simbólicos. O executor **não** os edita: devolve ao
  orquestrador os nomes das variáveis, e o orquestrador aplica. Não existe `envs/` neste repositório.

### Fronts

**Painel (`apps/frontend-transportada`)**

- `modules/identity/pages/UserActivation.page.tsx` vira a tela da escolha.
- Novos:
  - `components/InvitationResendForm.component.tsx`;
  - `shared/invitationResendClient.service.ts`;
  - `hooks/useInvitationResend.hook.ts`.
- `pages/PasswordReset.page.tsx` troca o campo e o payload para `{ identifier }`.
- `pages/LoginIdentifier.page.tsx` ganha os links.
- `locales/identity*.locale.json` ganha as chaves `activation.choice.*`.
- `contentSecurityPolicy.service.ts` ganha a origem do Turnstile, condicionada à chave.
- `FirstAccess.page.tsx` e `/primeiro-acesso` não mudam.

**Portal (`apps/frontend-client`)**

- Cópias por valor: `UserActivation`, `PasswordReset`, clientes, hooks e o `PublicRouteFrame`.
- `src/main.tsx` registra as rotas públicas antes do `initializeKeycloakAuth()` (`:116`).
- `LoginIdentifier.page.tsx` ganha os links.
- Os textos ficam no TSX (`:42-61`).

**Motorista (`apps/frontend-driver`)**

- Mesmas cópias, incluindo a moldura, em `modules/identity/`.
- `src/main.tsx` registra as rotas públicas **antes** do `runDriverBoot` (`~:317-340`), sem sondar o
  Keycloak.
- `LoginIdentifier.page.tsx` ganha os links, e os `locales/identity*.locale.json`, os textos.
- O service worker serve o `index.html` nas duas rotas.
- A chave pública do Turnstile entra como literal `VITE_*`: ligar exige commit.

**Widget**

- `TurnstileWidget.component.tsx` é copiado por valor de `apps/frontend-landing` para as três apps.
- Só é montado com a chave pública.
- A chave no Cloudflare lista os hostnames das três apps.

### Keycloak

- `deploy/keycloak/realm.json` e `realm/transportada-local-realm.json`: campos de força bruta.
- `.github/scripts/keycloak-reconcile.sh`: bloco `BRUTE_FORCE_FIELDS` no molde de `:80-99`, só com os
  campos que o `realm.json` declara.
- `deploy/keycloak/theme/login/login.ftl`:
  - `data-first-access` ao lado de `:96`;
  - um segundo, abaixo do erro, em `:77-81`.
- `resources/js/password-reset-link.js`:
  - entrada `{ selector: '[data-first-access]', path: '/ativar' }`;
  - `:50` passa a usar `querySelectorAll(...).forEach`.
- `messages_pt_BR.properties` e `messages_en.properties`:
  - `transportadaFirstAccess=Ativar minha conta`;
  - máscara em toda variante de bloqueio do Keycloak 26.
- `docs/frontend/login-theme.md`.

## Contratos/API/eventos

```http
POST /invitation-resends            (anônima)
content-type: application/json
{ "identifier": "ana@empresa.test", "challengeToken": "…" }   # challengeToken só com a flag ligada

204 No Content                      # sempre, para qualquer entrada válida
400 { "error": { "code": "INVALID_REQUEST" } }                 # corpo malformado ou identificador fora do limite
400 { "error": { "code": "SELF_SERVICE_CHALLENGE_FAILED" } }   # só com a flag ligada
429 Retry-After: <s>                                           # teto por IP ou por alvo
```

- **`POST /password-resets`:** aceita `{ identifier }` **ou** `{ username }`, ambos com até 254
  caracteres e no mesmo balde por alvo. Os dois juntos dão 400.
- **`POST /company-users/:id/invitation`:** passa a responder 409 para suspenso, e o painel mapeia
  esse código.
- **Outbox:** o mesmo evento `transportada.identity.invitation.code.requested` v1, com payload
  `{ invitationId, userId }`.
  - Reentrega é uma linha nova para o **mesmo** `invitationId`.
  - `actor_user_id` é o `userId` do alvo no autoatendimento e o do administrador no reenvio dele.
  - O worker não muda: ele entrega qualquer convite `pending` com `sealed_code`
    (`apps/worker-transportada/src/identity/infrastructure/drizzle-invitation.repository.ts:40-80`).
- **Trilhas:**
  - `invitation.self-resend.requested`, com
    `metadata { trigger: 'anonymous', source, ipAddress, reissued }`;
  - `company-user.membership-removed`, com as contagens do RF8.
- **Log:** `self_service_request { route, outcome, matchedTargets, delivery?, skipped?, correlationId }`.
- **Documentação:** a rota nova vai para o OpenAPI e para o Scalar, se a API gerar a documentação a
  partir das rotas. Se não gerar, vai para a seção de identidade do `apps/api-transportada/CLAUDE.md`.

## Dados, migration e rollback

- **Nenhuma tabela ou coluna nova.**
- **Escritas novas:**
  - linhas de outbox de reentrega;
  - `superseded` quando o código é reemitido;
  - na remoção (se a T0.2 confirmar): `DELETE` de `user_invitations` e `password_reset_requests` da
    membership, com cascata para roles e outbox (`user-invitation.schema.ts:150-156,192-198`);
  - `rate_limit_windows`, com escopos novos.
- **Intervalo e teto do autoatendimento** são contados em `invitation_delivery_outbox`:
  - intervalo: última linha do convite;
  - teto: linhas com `actor_user_id = user_id` nas últimas 24 h, na membership.
  - A T3.1 confere que nenhum job apaga linhas publicadas com menos de 24 h. Se algum apagar, a
    contagem passa para `audit_logs` (`invitation.self-resend.requested`).
- **Chaves de `rate_limit_windows.subject_key`** (`varchar(120)`): `ip:<hmac base64url>` e
  `target:<hmac base64url>`, com 43 caracteres de HMAC.
- **Limpeza:** o `rate-limit.window.purge` do worker (janela máxima de 86 400 s) já cobre as janelas
  novas.
- **`status = 'revoked'`** continua sem uso nesta spec.
- **Rollback:** reverter o commit.
  - Convites e pedidos já apagados na remoção não voltam. A trilha guarda as contagens e o
    `accepted_at`.

## Segurança e tenant

- **Empresa:** a rota anônima não tem `companyId` no contexto, e a empresa sai do servidor (ADR-0030
  §7). Toda escrita leva o `companyId` do alvo resolvido.
- **Isolamento:** contrato em `test/*-schema/tenant-safety.contract.ts`. Reenvio e remoção numa
  empresa não tocam dados de outra.
- **PII:** o IP e o alvo só entram em `rate_limit_windows` como HMAC, e nenhum log carrega PII (CA11).
- **Suspensão:** a ordem de escrita não muda (provedor antes do banco).
- **Ativação:** a checagem de vínculo vivo acontece antes do `setEnabled(true)`.

## Idempotência e concorrência

- **Dois reenvios com código novo ao mesmo tempo** esbarram em
  `user_invitations_company_id_user_id_pending_unique`. O perdedor recebe `23505`, e o serviço trata
  como "nada a fazer". É catch local de convergência, permitido pelo code-standart §7.
- **Duas reentregas do mesmo código** geram, no pior caso, dois e-mails com o mesmo código. É
  inofensivo, e o intervalo de 2 min limita.
- **A janela do limitador** é um `INSERT … ON CONFLICT DO UPDATE` atômico
  (`drizzle-rate-limiter.repository.ts:31-66`).
- **Corrida entre suspensão e ativação:** risco aceito (spec, casos extremos).

## Observabilidade

- **Volume por rota:** `http_request_completed` (`request-handler.service.ts:176-203`) e
  `self_service_request`.
- **Buckets distintos:** contar `subject_key` distintos em `rate_limit_windows` por escopo e janela.
  O HMAC permite contar sem saber quem é.
- **Critério para ligar o Turnstile** (vai para o `docs/SECURITY.md`). Qualquer um destes, em 24 h,
  leva a decisão ao usuário:
  - mais de 50 respostas `rate_limited_ip`, vindas de 10 ou mais `subject_key` distintos;
  - entregas aceitas acima de 3× a média dos 7 dias anteriores;
  - `matchedTargets = 0` acima de 90%, com mais de 200 pedidos.
- **Como ligar:** uma variável na Railway e a chave pública nos builds. No motorista, isso é um commit,
  porque a chave vira literal `VITE_*`.

## Estratégia de testes

- **Contrato primeiro, visto vermelho**, em toda task de comportamento.
- **Diretórios de teste da API** (reais):
  - `test/login-identifier/`;
  - `test/password-reset/`;
  - `test/user-activation/`;
  - `test/rate-limit/`;
  - `test/client-ip/` (novo, portado);
  - `test/user-administration-application/`;
  - `test/integration/`.
  - Arquivo novo entra no entrypoint `*.contract.test.ts` da área, na lista do `package.json` e no
    registro de `test/test-registry/declaration.contract.ts`.
- **Integração:** `bun --env-file=../../.env.test run test:integration`. O teste novo entra na lista
  explícita do `package.json`.
- **Realm:** `test/keycloak-realm.contract.test.ts` (estático) e
  `apps/api-transportada/test/deploy/keycloak-realm.contract.ts` (reconciliação executada).
- **Fronts:** contratos de rota pública, cliente, página, links, 429 e CSP com e sem chave, nas três
  apps.
- **Tempo:**
  - o p99 do caminho que reemite é medido em integração local, com os tetos sobrescritos por env, e
    vai para o `evidence.md`;
  - o piso é fixado acima dele, com margem de pelo menos 30%;
  - em staging, a checagem é qualitativa (20 convidados distintos);
  - nada disso é gate de CI.

## Riscos

| Risco                                                                                     | Mitigação                                                                                                                   |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Escritório atrás de um NAT só estoura o limite por IP do `login-hints` no começo do turno | 60/10 min, configurável por env. Medir com `subject_key` distintos antes de apertar.                                        |
| Oráculo de valor do `login-hints` segue aberto                                            | Limite por IP. Achado registrado. Sem limite por alvo, para não dar a um terceiro o poder de trancar o login (ADR-0076 §3). |
| Terceiro provoca o bloqueio temporário do Keycloak                                        | Espera progressiva com teto de 15 min, sem bloqueio permanente. Risco aceito.                                               |
| O piso de tempo não cobre um pico do caminho que reemite                                  | Piso acima do p99 medido, com margem, mais variação aleatória. Vale também no erro.                                         |
| O Railway mudar o comportamento do `x-real-ip`                                            | `CLIENT_IP_SOURCE` configurável e nova medição em staging (T7.4).                                                           |
| As cópias divergirem entre as apps                                                        | Contrato em cada app. A revisão de design compara as três lado a lado.                                                      |
| O service worker do motorista servir a app autenticada em `/ativar`                       | Contrato de `dist` e prova no navegador com o SW ativo (T5.3).                                                              |
| Remoção apagar histórico                                                                  | Trilha `company-user.membership-removed` com `accepted_at` e contagens. Só é aplicado se a medição provar o `23503`.        |
| Deploy antes da chave existir derruba a API                                               | T7.3 👤 cria a chave em staging **e** produção antes de qualquer push, e o prompt proíbe o push antes disso.                |
| Corrida entre suspensão e ativação                                                        | Janela de milissegundos, depende de ação do administrador. Registrada. A reconciliação expõe a divergência.                 |
| Colisão de numeração da ADR ou da spec                                                    | `git log --all -- 'docs/adr/0076*' 'specs/191*'` antes do push.                                                             |

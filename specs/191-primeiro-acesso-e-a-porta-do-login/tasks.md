# Tasks — Spec 191

**👤 = ação humana.** O executor para, descreve o passo exato, espera o "feito" e confere o efeito.
**🧠 = task que sobe para `opus`** dentro de uma fase mais barata.

Toda task de comportamento começa pelo contrato ou teste, **visto vermelho**, e fecha com:

- `bun run typecheck`, `bun run lint` e os testes da app tocada;
- na API, os **dois** comandos, de dentro de `apps/api-transportada`:
  - `bun --env-file=../../.env.test test --timeout 120000`;
  - `bun --env-file=../../.env.test run test:integration`, se a task tocou `test/integration/**` ou
    uma query;
- arquivo de teste novo registrado no entrypoint da área, na lista do `package.json` da app e, na API,
  em `test/test-registry/declaration.contract.ts`;
- evidência no `evidence.md`;
- commit isolado, com `--no-verify` e caminhos explícitos, porque o hook de pre-commit varre a árvore.

**Sem migration nesta spec.** Se parecer necessária, pare e pergunte. Se o usuário aprovar, ela nasce
com `rollback.sql` e fecha com `make migration-test`.

**Nenhum push para staging antes da T7.3 confirmada.** A chave nova é obrigatória no boot.

## Fase 0 — Medição e ADR

> 🤖 Modelo: `opus`

- [x] **T0.1** Conferir a ADR-0076 (`Status: proposta`) contra o código e passá-la a `aceita` sem
      mudar decisão. Se algo divergir, pare e pergunte.
      Conferir também que 191 e 0076 seguem livres: `git fetch && git log --all --oneline -- 'specs/191*' 'docs/adr/0076*'`.
- [x] **T0.2** **Medir a remoção de vínculo com histórico.**
      Criar `test/integration/company-user-removal.integration.ts` com dois casos: - (a) convidado → remover; - (b) ativado, com um pedido de recuperação → remover.

      Anotar no `evidence.md` o SQLSTATE e a constraint de cada caso. O esperado é `23503` em
      `user_invitations_membership_fk` e em `password_reset_requests_membership_fk`
      (`password-reset.schema.ts:62-68`), virando 500. O teste fica vermelho, e é a T2.2 que o põe
      verde. Se não der `23503`, anote que a hipótese caiu: nesse caso a T2.2 só grava a trilha.

## Fase 1 — IP do salto conhecido e limitador anônimo compartilhado

> 🤖 Modelo: `opus` (segurança de borda: o IP e a chave do limitador são o que o atacante controla)

- [x] **T1.1** 🧠 **IP do salto conhecido.** Portar o desenho de `51cd186c6` (`git show 51cd186c6`,
      branch `fix/client-ip-trusted-proxy`, nunca mesclado) sobre o código atual, sem cherry-pick
      cego.
      O que vem do branch: - `CLIENT_IP_SOURCE`: `x-real-ip` (padrão), `cf-connecting-ip` ou `x-forwarded-for` com
      `TRUSTED_PROXY_HOPS`; - valor que não é IP vira `unknown`; - `Map` em memória com teto.

      Injetar o resolvedor configurado nos **oito** pontos de chamada:
      - `http/router.service.ts:217`;
      - `trips/presentation/trip.routes.ts:1254`;
      - `trips/presentation/trip-field-office-trip.routes.ts:136`, `:187` e `:244`;
      - `trips/presentation/trip-field-office-occurrence.routes.ts:126`;
      - `trips/presentation/trip-field-office-document.routes.ts:105`;
      - `fleet/presentation/aggregate-account.routes.ts:63`.

      Renomear toda menção a "ADR-0065" no código portado para "ADR-0076 §6".
      `test/client-ip.contract.test.ts` e `test/client-ip/{resolver,environment,rate-limiter}.contract.ts`
      entram no `package.json` e no test-registry.
      Aceite:
      - uma cadeia `x-forwarded-for: 203.0.113.1, <ip real>` cai no balde do `x-real-ip`, nos oito
        pontos;
      - `rg 'resolveClientIp\(' src` só mostra chamadas com o resolvedor injetado;
      - a entrada 2026-09-18 do `docs/SECURITY.md` (`:304-326`) fica "fechado", com data.

- [x] **T1.2** 🧠 **Limitador anônimo em dois estágios, por IP e por alvo.**
      Contrato primeiro, em `test/rate-limit/anonymous-rate-limit.contract.ts`: - rota anônima com `rateLimit: { store: 'postgres', scope, maxRequests, windowSeconds }`
      consome o IP **antes** do `parse`: primeiro o balde em memória da réplica, com o mesmo
      `maxRequests`, depois o Postgres; - **acima do teto em memória, `consume` do store não é chamado**; - com `target: { scope, maxRequests, windowSeconds, key(input) }`, o alvo é consumido
      **depois** do `parse` e do desafio (T4.1) e antes do `handle`, também em dois estágios; - 429 com `Retry-After`; - o boot falha se uma rota anônima declara `postgres` sem store (estender `:424-434`); - store fora do ar dá 500.

      HMAC em `src/http/rate-limit-subject.service.ts`: HMAC-SHA256 com domínio
      `transportada:rate-limit:v1:<scope>`, saída base64url, aplicado ao IP (`ip:`) e ao alvo
      (`target:`).
      Chave `RATE_LIMIT_SUBJECT_HMAC_KEY`, obrigatória, em `cryptographic-configuration.schema.ts`,
      recusada se repetir outra chave (`:45-49`). Onde ela entra:
      - `Makefile:71` (`grep -q`);
      - `.railway/railway.ts:106` e `:161` (`preserve()`);
      - `docs/spec/railway.md:281`;
      - `test/fixtures/cryptographic-environment.fixture.ts`;
      - `.env.example`, com valor canônico válido e distinto das outras chaves, porque o `ci.yml:114`
        o copia para `.env`;
      - `.env.test.example`.

      `.env` e `.env.test` reais são links simbólicos: **não os edite**. Devolva ao orquestrador os
      nomes das variáveis, e ele aplica. Não existe `envs/`.
      Aceite:
      - contrato verde;
      - o `subject_key` recebido pelo store falso não contém IP nem identificador em claro;
      - `make config` passa com a chave e falha sem ela.

- [ ] **T1.3** 🧠 **Declarar nas quatro rotas existentes.**
      `scope` e `store` literais na rota; teto e janela vêm do env, com padrões em
      `src/identity/shared/identity-rate-limit.constant.ts`, no molde de `RATE_LIMIT_CONTRACTOR_MAIL_*`
      (`environment.schema.ts:122-128`).

      | Rota                          | Limite          |
      | ----------------------------- | --------------- |
      | `login-hints`                 | **Só IP**       |
      | `user-activation`             | Só IP           |
      | `password-resets`             | IP e alvo       |
      | `password-resets/confirm`     | Só IP           |

      Normalização do alvo: `parseLoginIdentifier` (e-mail em minúsculas; CPF e telefone só com
      dígitos); o resto, aparado e em minúsculas.
      Em `test/rate-limited-routes.contract.test.ts`: um `test()` por rota anônima, e os arquivos
      entram na lista `:291-313`.
      Integração `test/integration/anonymous-rate-limit.integration.ts`:
      - dois `createRouter` sobre o mesmo banco somam o teto;
      - o 11º pedido do mesmo IP dá 429.

      Tirar o "a API não tem limitador" de `login-hint.routes.ts:22-23`.

## Fase 2 — Correções de domínio (convite × suspensão × recuperação × remoção)

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** **O status derivado prioriza a suspensão.**
      Contrato primeiro: `deriveCompanyUserStatus` (`company-user.policy.ts:85-91`) devolve
      `suspended` para membership `disabled` com convite `pending`.
      Contrato da linha "suspenso" na listagem: `test/user-administration-*` e a integração
      `company-user-listing.integration.ts`.
      **Não** revogar convite ao suspender. O status `revoked` segue sem uso: anotar no `evidence.md`.

- [ ] **T2.2** **Remover vínculo com histórico funciona.** Põe verde o teste da T0.2.
      Se o `23503` se confirmou, `removeMembership` faz, na mesma transação do `DELETE`: - apaga **todos** os `user_invitations` (`pending`, `accepted` e `superseded`) e os
      `password_reset_requests` da membership, com cascata para roles e outbox; - antes disso, grava em `audit_logs` `company-user.membership-removed` com
      `metadata { invitationAcceptedAt, invitationsDeleted, passwordResetsDeleted }`.

      Aceite:
      - integração verde;
      - contrato de isolamento: convites e pedidos do mesmo usuário em outra empresa ficam intactos.

- [ ] **T2.3** **A ativação exige vínculo vivo, e o reenvio do administrador recusa suspenso.**
      Mudanças: - `InvitationSnapshot` ganha `membershipStatus` e `identityStatus`, por join em
      `findByCodeHash`; - `decideInvitationActivation` recusa, com a mesma recusa genérica, se algum dos dois não
      estiver `active`; - `resend-company-user-code` lança o erro novo de `invitation.error.ts` (409) para membership
      `disabled`; - o painel mapeia o código na tela de Usuários, com contrato do mapeamento.

      Contrato primeiro:
      - suspenso com código válido é recusado **e** `setEnabled` nunca é chamado;
      - a recusa continua sem campo de motivo (`invitation.policy.ts:34-40`).

      Conferir se `reconcile-company-users.use-case.ts` corrige ou só expõe `enabled` divergente, e
      anotar (corrida entre suspensão e ativação, spec § casos extremos).

- [ ] **T2.4** **Convidado no "Esqueci minha senha".** **Depende da T3.1.** - `findActiveTargets` passa a devolver `hasPendingInvitation`. - Para esses alvos, `request-password-reset` não cria `password_reset_requests` e chama o
      serviço da T3.1 com `source: 'password-reset'`. - `confirm-password-reset` recusa, com a recusa genérica, alvo com convite `pending`. - Contrato primeiro, em `test/password-reset/`. A resposta continua 204.

## Fase 3 — Reenvio: mesmo código enquanto válido, rota pública

> 🤖 Modelo: `opus` (anti-enumeração: forma, tempo e log da resposta são o contrato)

- [ ] **T3.1** 🧠 **Núcleo de entrega e serviço de autoatendimento.**
      Contrato primeiro, em `test/user-activation/invitation-delivery.contract.ts` e
      `invitation-self-resend.contract.ts`.

      **`decideInvitationDelivery`:**
      - `same_code` quando o convite não expirou, não esgotou as tentativas e tem `sealed_code`: grava
        só a linha de outbox;
      - `new_code` nos outros casos: código novo e o anterior vira `superseded`.
      - O reenvio administrativo passa a usar o mesmo núcleo, extraído de
        `resend-company-user-code.use-case.ts:48-83`. A resposta dele só troca `expiresAt` pela
        validade do código entregue.

      **Autoatendimento:**
      - resolve o identificador pelo mesmo caminho do `login-hints`; identificador ambíguo não
        resolve;
      - alvo: identidade ativa, membership ativa e convite mais recente `pending`;
      - intervalo de 120 s por convite;
      - teto de 5 por dia por membership, contando só as linhas de outbox com
        `actor_user_id = user_id`. O administrador não conta nem é barrado;
      - relógio falso nos testes;
      - outbox com `actor_user_id = userId`;
      - trilha `invitation.self-resend.requested` com
        `metadata { trigger: 'anonymous', source, ipAddress, reissued }`;
      - corrida `23505` vira "nada a fazer";
      - evento `self_service_request` sem PII, verificado com o logger capturado.

      Conferir que nenhum job apaga linhas de `invitation_delivery_outbox` com menos de 24 h. Se
      algum apagar, contar em `audit_logs`.

- [ ] **T3.2** 🧠 **`POST /invitation-resends` e piso de tempo.**
      Contrato primeiro, em `test/user-activation/invitation-resend-route.contract.ts`: - os 8 casos do CA1: 204, corpo vazio, cabeçalhos iguais exceto `x-correlation-id` e `Date`; - 400 para corpo malformado e para mais de 254 caracteres; - os dois caminhos, e o caminho em que o trabalho rejeita, aguardam o mesmo piso. Usar
      `respondAfterFloor` com sono falso: o contrato conta as chamadas ao sono; - a rota declara IP e alvo (RF12), e o alvo é consumido depois do desafio.

      O piso também vale em `POST /password-resets`.
      Composição: `main.ts` e `API_INVITATION_RESENDS_PATH`. A rota entra no
      `rate-limited-routes.contract.test.ts`.

- [ ] **T3.3** **Integração do reenvio no banco** (`test/integration/invitation-self-resend.integration.ts`): - código válido: mesmo `invitationId`, sem `superseded`, uma linha de outbox a mais; - código expirado: `superseded` e código novo; - dentro do intervalo e acima do teto, nada é gravado; convites do administrador não contam; - suspenso, removido e ativado: nada; - duas empresas: duas entregas, cada uma no seu `companyId`; - dois pedidos concorrentes (`Promise.all`) que emitem código novo: um único `pending`; - **medição de tempo:** p99 de 50 chamadas do caminho que reemite, com os tetos sobrescritos por
      env. Vai para o `evidence.md`, e o `SELF_SERVICE_RESPONSE_FLOOR_MS` padrão fica acima dele com
      pelo menos 30% de margem.

- [ ] **T3.4** **`POST /password-resets` aceita `{ identifier }`** (RF11), com o schema como união
      estrita (`password-reset.schema.ts`).
      Contrato em `test/password-reset/`: - `{ username }` segue igual; - `{ identifier }` com e-mail, CPF ou telefone chega ao mesmo alvo; - `{ username }` e `{ identifier }` com o mesmo texto caem no mesmo balde; - os dois campos juntos dão 400; - mais de 254 caracteres dá 400.

## Fase 4 — Desafio invisível, desligado

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** **Flag na API.**
      `SELF_SERVICE_CHALLENGE_ENABLED` aceita `'true'` ou `'false'`, com padrão `false`, no padrão de
      `environment.schema.ts:207-210`. Ligada sem `TURNSTILE_SECRET_KEY`, o boot falha.
      Com a flag ligada, `invitation-resends` e `password-resets` exigem `challengeToken`: - a verificação usa `verifyTurnstileToken` com o `remoteIp` do salto conhecido; - ela roda **depois** do limite por IP e **antes** do consumo por alvo; - falha dá 400 `SELF_SERVICE_CHALLENGE_FAILED`.

      Contrato dos três estados:
      - desligada, ignora o campo;
      - ligada sem segredo, não sobe;
      - ligada, exige o token, e **token inválido não incrementa o balde do alvo**.

- [ ] **T4.2** **Widget e CSP nos três fronts.** - `TurnstileWidget.component.tsx` é copiado por valor da `frontend-landing` e só é montado com a
      chave pública. - A CSP de cada app ganha `https://challenges.cloudflare.com` em `script-src`, `frame-src` e
      `connect-src` **só** com a chave. - Contrato de CSP nos dois ramos, em cada app. Sem a chave, a CSP fica byte a byte igual à de
      hoje.

- [ ] **T4.3** **Critério e procedimento para ligar.**
      Entrada nova no `docs/SECURITY.md` com o evento `self_service_request`, os três gatilhos do
      plano e o passo a passo: - variável na Railway; - chave pública nos builds; **no motorista, isso exige commit**, porque o `VITE_*` é literal; - hostnames das três apps na chave do widget no Cloudflare.

      Atualizar a linha "⚠️ Sem rate limit" de `apps/api-transportada/CLAUDE.md:127`. A `:130` é a
      rota administrativa e não muda.

## Fase 5 — Telas públicas nas três apps

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** **Painel.** Não tocar em `/primeiro-acesso` nem em `FirstAccess.page.tsx`. - `/ativar`: sem fragmento, mostra a escolha; com `#codigo=`, vai direto ao formulário. Os
      contratos da 188 continuam verdes. - `InvitationResendForm`: - mostra a mensagem neutra, "Já tenho o código" e "Voltar ao login"; - no 429, mostra "Muitas tentativas. Tente de novo em N min."; - o campo nasce preenchido pelo `loginIdentifierMemory`, nunca pela URL. - `PasswordReset.page.tsx`: o campo passa a ser "e-mail, CPF, telefone ou usuário" e envia
      `{ identifier }`, com o mesmo tratamento de 429. - `LoginIdentifier.page.tsx`: links "Esqueci minha senha" e **"Ativar minha conta"**. O rótulo
      não é "Primeiro acesso?", para não colidir com o assistente do primeiro administrador; anotar
      no `evidence.md`. - Chaves `activation.choice.*` nos dois locales. - Contratos em `test/identity/`, agregados em `test/identity.contract.test.ts`.

- [ ] **T5.2** **Portal (`apps/frontend-client`).** - Cópias por valor de `/ativar` (com a escolha), `/recuperar-senha` (com `{ identifier }`) e
      `PublicRouteFrame`, registradas em `main.tsx` antes do `initializeKeycloakAuth()` (`:116`). - O "voltar ao login" leva à origem do portal. - Links na `LoginIdentifier.page.tsx`. Os textos ficam no TSX. - Cada cópia leva o cabeçalho "Cópia por valor de apps/frontend-transportada/…". - Contratos na lista do `package.json:14`.

- [ ] **T5.3** **Motorista (`apps/frontend-driver`).**
      Antes de editar, conferir o `src/main.tsx` contra o estado da spec 189: `tasks.md` e
      `evidence.md` da 189, e o `git log` do arquivo. - Mesmas cópias, incluindo a moldura, registradas **antes** do `runDriverBoot` (`~:317-340`),
      sem sondar o Keycloak. - Links na `LoginIdentifier.page.tsx`, com textos nos locales próprios. - Contrato de `dist` (`test/dist.contract.test.ts`): o service worker serve o `index.html` em
      `/ativar` e `/recuperar-senha`. - Prova no navegador com o SW ativo: recarregar `/ativar` abre a tela pública.

## Fase 6 — Keycloak: força bruta e o link no tema

> 🤖 Modelo: `sonnet`

- [ ] **T6.1** **Força bruta no realm.**
      Contratos primeiro: - estático (`test/keycloak-realm.contract.test.ts`); - reconciliação executada (`apps/api-transportada/test/deploy/keycloak-realm.contract.ts`, no
      molde do `rememberMe`, `:555-609`): aplica, não reescreve à toa, regrava o que divergiu.

      Valores:
      - `bruteForceProtected: true` e `permanentLockout: false`;
      - `failureFactor: 10`;
      - `waitIncrementSeconds: 60` e `maxFailureWaitSeconds: 900`;
      - `maxDeltaTimeSeconds: 43200`;
      - `quickLoginCheckMilliSeconds: 1000` e `minimumQuickLoginWaitSeconds: 60`.

      Conferir no Keycloak 26.5.2 se `bruteForceStrategy` e `maxTemporaryLockouts` existem. Se
      existirem, declarar `MULTIPLE` e `0` nos dois `realm.json`.
      `BRUTE_FORCE_FIELDS` no `keycloak-reconcile.sh` lista **só** campos que o `realm.json` declara e
      os lê de lá.
      Prova local: **recriar** o container do Keycloak (`--import-realm` ignora realm existente) com o
      realm novo e errar 11 vezes. A tela mostra "Usuário ou senha inválidos.", e a senha certa dentro
      da espera é recusada da mesma forma.

- [ ] **T6.2** **Links no tema.** - `login.ftl`: `<a data-first-access hidden>` ao lado de `:96`, e um segundo abaixo do erro
      (`:77-81`). - `password-reset-link.js`: - entrada `/ativar` em `LINKS`; - **`:50` troca `querySelector` por `querySelectorAll(entry.selector).forEach`**. - `messages_*.properties`: - `transportadaFirstAccess=Ativar minha conta`; - máscara em toda variante de bloqueio do Keycloak 26, conferida no jar.

      Contrato do tema (`login-theme-password-only.contract.ts` e
      `test/keycloak-realm.contract.test.ts:437-467`):
      - com `redirect_uri` e com `client_data`, **dois** `data-first-access` são revelados;
      - sem origem, ficam escondidos.

      Atualizar `docs/frontend/login-theme.md`.

## Fase 7 — Chave, revisão, publicação e documentação

> 🤖 Modelo: `sonnet` (T7.2 → `opus`) · 👤 onde marcado

- [ ] **T7.1** **Revisão de design e usabilidade** (`web.md` §15), com o agente `designer`.
      Prints em **375 e 768** de: - a identificação das três apps, com os dois links; - `/ativar` nos quatro estados: escolha, "Tenho o código", "Reenviar" com a mensagem neutra, e
      429; - `/recuperar-senha` nas três apps; - o tema sem erro e com erro; - o widget do Turnstile com a chave pública de teste da Cloudflare, só para o print.

      Comparar as três cópias lado a lado. Os achados são corrigidos antes de fechar.

- [ ] **T7.2** 🧠 **Revisão de segurança** (`security-reviewer`, `model=opus`), sobre o diff inteiro,
      com o `docs/SECURITY.md`.
      Pontos a revisar: - enumeração: corpo, cabeçalhos, tempo e 429; - PII em log e em `rate_limit_windows`; - chave HMAC; - IP forjado nos oito pontos; - falha fechada do store e do desafio; - ordem entre desafio e alvo; - isolamento; - CSP.

      Resultado no `docs/SECURITY.md`:
      - L4: "parcialmente fechado (identidade)";
      - 2026-09-18: "fechado";
      - 2026-08-13: **continua aberto**, com a nota do contador que não conta chute errado;
      - achados novos: o oráculo de valor do `login-hints` e o risco da corrida entre suspensão e
        ativação.

- [x] **T7.3** 👤 **Chave em staging E em produção, antes de qualquer push.**
      O usuário cria `RATE_LIMIT_SUBJECT_HMAC_KEY` no serviço da API na Railway, **nos dois
      ambientes**: 32 bytes aleatórios, distinta das outras chaves HMAC e de um ambiente para o
      outro. Depois responde "feito".
      A chave é inerte sem o código, então criá-la agora não muda nada em produção.
      O executor confere que o nome existe (`railway variables --service <api> --environment <env>`,
      filtrando só o **nome**) e **nunca** imprime o valor.
      `SELF_SERVICE_CHALLENGE_ENABLED` fica ausente, portanto `false`.

- [ ] **T7.4** **Gates e staging.** Só depois da T7.3. - `make check`, os dois comandos da API e prettier nos `.md`. - Publicação, tudo encadeado com `&&`: `git fetch && git rebase origin/staging && bun install --frozen-lockfile && make check && git push origin HEAD:staging`. - Em staging: - convidado real pede reenvio pela tela do motorista e pela do painel, recebe no Mailpit o
      **mesmo** código e ativa; - o 11º pedido do mesmo IP dá 429; - checagem qualitativa de tempo com 20 convidados distintos; - a Admin API mostra `bruteForceProtected: true` depois do passo "Reconciliar realm"; - `x-real-ip` e `x-forwarded-for` forjados não mudam o balde (a medição de 14/09 repetida).

- [ ] **T7.5** **Documentação viva.** - `apps/api-transportada/CLAUDE.md`: seção de identidade com a rota nova, o limite e o piso. - `docs/ai-context/<app>.md` das apps tocadas, se existirem.

- [ ] **T7.6** 👤 **Produção.**
      Pré-requisito: T6.8–T6.10 da spec 189 fechadas. - O executor confere que `RATE_LIMIT_SUBJECT_HMAC_KEY` **existe** em produção (só o nome). - Monta o PR por branch própria sobre `main` e confere a lista de commits. - O usuário aprova. - Depois do deploy, conferir o passo "Reconciliar realm" e a força bruta pela Admin API.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/191-primeiro-acesso-e-a-porta-do-login/ (leia
spec.md, plan.md, tasks.md e docs/adr/0076-primeiro-acesso-sem-oraculo.md antes de começar). Uma
task por vez, na ordem do tasks.md, numa branch na própria árvore (git switch -c work/spec-191 a
partir de origin/staging) — nunca `make worktree`. T2.4 vem depois de T3.1.
Modelos: Fase 0 → opus · Fase 1 → executor model=opus (T1.1–T1.3 🧠) · Fase 2 → executor
model=sonnet · Fase 3 → executor model=opus (T3.1, T3.2 🧠; T3.3 e T3.4 → sonnet) · Fase 4 →
executor model=sonnet · Fase 5 → executor model=sonnet · Fase 6 → executor model=sonnet · T7.1 →
designer model=sonnet · T7.2 → security-reviewer model=opus · T7.4/T7.5 → executor model=sonnet ·
revisão final → code-reviewer model=opus.
Cada task fecha com typecheck + lint + testes + commit isolado (--no-verify, caminhos explícitos),
evidência em evidence.md. Na API, os DOIS comandos (contrato e `bun --env-file=../../.env.test run
test:integration`, de dentro de apps/api-transportada). Teste novo entra no package.json e no
test-registry. Contrato visto vermelho antes da implementação. Prettier nos .md antes de cada push.
Nunca imprima o .env nem valor de chave; .env/.env.test são links — devolva nomes de variáveis ao
orquestrador em vez de editá-los.
Sem migration nesta spec: se parecer necessária, pare e pergunte.
Nenhum push para staging antes da T7.3 confirmada.
Tasks 👤 (T7.3, T7.6): pare, descreva o passo exato e espere "feito".
Pare e pergunte antes de: deploy em produção, qualquer mudança de variável na Railway, migration,
ligar SELF_SERVICE_CHALLENGE_ENABLED, qualquer [NEEDS CLARIFICATION].
Staging: publicar com gates verdes (fetch → rebase origin/staging → install → gates → push).
```

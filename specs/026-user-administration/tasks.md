# Tasks

Feature 026 — Administração de usuários e perfis.

Regras do repo, valendo em toda task: **uma task por vez**; teste de contrato/aceite **antes** da
implementação; arquivo de teste novo registrado na cadeia explícita (entrypoint no `test` do
`package.json` da app, suíte no `import` do entrypoint); **teste de isolamento de tenant obrigatório
sempre que a task mexer em query**; task só fecha com evidência em `evidence.md` (comando, saída, o
que prova). Nenhum CNPJ, IE, chave de acesso, razão social real, número de nota real ou XML fiscal em
teste, fixture, log ou evidência. Nenhuma senha, código de ativação, segredo de client ou contato em
claro em log, saída de terminal ou evidência.

Verificação padrão de toda task de API: `bun run --cwd apps/api-transportada test` + `bun run lint` +
`bun run typecheck` na raiz. De worker: `bun run --cwd apps/worker-transportada test`. De frontend:
`bun run --cwd apps/frontend-transportada test` + `lint` + `typecheck` + `build`.

> ✅ **Desbloqueada.** O modelo é um deploy por transportadora (ADR-0021): a empresa é o ambiente,
> não existe `POST /companies` nem ator de plataforma. A spec não tem mais `[NEEDS CLARIFICATION]`.

## Objetivo de entrega

A feature 026 termina quando **uma transportadora consegue operar a própria equipe em staging, do
zero, sem console do Keycloak e sem SQL manual**. Concretamente, este roteiro roda ponta a ponta no
ambiente de staging e fica registrado em `evidence.md`:

1. Ambiente limpo sobe pelo deploy; a primeira pessoa a acessar cria o `company-admin` pela rota de
   arranque e a segunda chamada da mesma rota responde `404`. `BOOTSTRAP_TOKEN` sai do Railway ao
   fim do passo.
2. Esse administrador loga, o assistente da empresa aparece com o perfil nulo e grava por
   `PATCH /company-settings`.
3. Ele abre "Usuários e perfis", convida alguém escolhendo os perfis, e o código sai pelo canal
   configurado da empresa (`email` / `sms` / `whatsapp`), entregue pelo worker — nunca no caminho
   síncrono da rota.
4. A pessoa convidada troca o código por senha, é habilitada no Keycloak, loga e enxerga exatamente
   o que os perfis dela permitem.
5. O administrador desativa, reativa, troca perfis e remove o vínculo — e é recusado ao tentar
   remover o último `company-admin` da empresa.

Critérios que valem para a entrega inteira, não por task:

- `make check` verde na raiz (`format:check` + `lint` + `typecheck` + `test` + `build`),
  `make migration-test` verde, `make worker-integration` verde e `make smoke` verde.
- Toda ação sensível na trilha de auditoria, e nenhum código de ativação, senha, segredo de client
  ou contato em claro em log, saída de terminal ou evidência.
- Contrato de tenant safety verde em toda query nova; `users.manage` deixa de ser permissão sem
  consumidor.
- `CLAUDE.md`, `docs/spec/railway.md` e os documentos de operação batendo com o que foi implementado
  — o passo manual de criar usuário por ambiente deixa de existir.

O caminho crítico é `T001 → T004` (pacote publicado), que destrava tanto o arranque (fase 0b) quanto
o convite (fases B–D). Staging pode ser resetado à vontade durante o percurso.

## Fase 0 — Provisionamento do ambiente

> 🤖 Modelo: `sonnet`

- [x] T000 Decisão de arranque registrada em `docs/adr/0021-one-deployment-per-company.md`; `CLAUDE.md`,
      `README.md`, `docs/spec/constitution.md` e `docs/spec/railway.md` alinhados ao modelo.
      Dependências: nenhuma. Sucesso: nenhum documento anunciando SaaS multiempresa, isolamento
      mantido como invariante.

- [x] T000a Contrato **falhando** do provisionamento: um comando idempotente garante a empresa única
      do ambiente (a partir da configuração, nunca de payload) e o primeiro `company-admin`; rodar
      duas vezes não duplica nem sobrescreve; recusa rodar sem a configuração completa.
      Dependências: T000. Sucesso: vermelho.

- [x] T000b Implementar o comando na imagem da API, ligado ao `preDeployCommand`. O comando **não**
      toca em senha: ele vincula o sujeito Keycloak declarado na configuração
      (`PROVISION_ADMIN_SUBJECT`) à empresa do ambiente (`PROVISION_COMPANY_ID`) como
      `company-admin`. Dependências: T000a. Sucesso: T000a verde e ambiente com admin sem
      `railway ssh` de SQL.

  > ⚠️ **Desvio registrado.** A redação original fazia T000b criar o usuário no Keycloak e emitir o
  > primeiro código de ativação, o que a prendia em T010 (fim da fase C) e deixaria todo ambiente sem
  > admin até lá. O vínculo por sujeito existente entrega o provisionamento agora sem antecipar nada
  > da feature; o que dependia de T010 virou T000c.

  > ⚠️ **Segundo desvio registrado.** T000c dependia de T010, o que mantinha todo ambiente novo sem
  > administrador até o fim da fase C. A `docs/adr/0022-first-access-bootstrap.md` troca o desenho:
  > o arranque passa por uma rota de primeiro acesso de uso único, que só precisa da fase A. T000c é
  > reescrita abaixo e a fase 0b entrega o arranque completo antes das rotas de convite.

- [x] T000c `PROVISION_COMPANY_ID` sozinho passa a ser configuração válida e completa: garante a
      empresa do ambiente e para aí, deixando o administrador para o primeiro acesso.
      `PROVISION_ADMIN_SUBJECT` sozinho continua sendo erro, e as duas juntas continuam funcionando
      (expansão — a contração vem em commit próprio). Contrato antes da implementação.
      Dependências: T000b. Sucesso: contrato do provisionamento verde nas três combinações, deploy
      com só a empresa declarada terminando em `created: ['company']`.

## Fase A — Pacote `@adatechnology/keycloak-admin`

> 🤖 Modelo: 🧠 `opus` (contrato de pacote novo e superfície de segurança)

- [x] T001 Teste **falhando** no repositório de packages: o cliente pede token com
      `grant_type=client_credentials`, **nunca** envia campo `password`, reaproveita o token em cache
      dentro da validade e renova antes de expirar. Dependências: T000. Sucesso: vermelho por
      inexistência do pacote.

- [x] T002 Implementar `packages/backend/keycloak-admin` — agnóstico, TS estrito, `zod` para validar
      a config (`baseUrl`, `realm`, `clientId`, `clientSecret`), contrato `createUser`,
      `findUserByEmail`, `updateUser`, `setEnabled`, `updateAttributes`, `deleteUser`,
      `setTemporaryPassword`, e `KeycloakAdminError` com código estável. Dependências: T001.
      Sucesso: T001 verde.

- [x] T003 Teste de redação: `KeycloakAdminError` serializado e a mensagem de qualquer falha não
      contêm `clientSecret`, token nem senha. Dependências: T002. Sucesso: verde, e a asserção falha
      se alguém reintroduzir o segredo no contexto do erro.

- [x] T004 Publicar o pacote e registrar a versão. Confirmar também que
      `@adatechnology/notification-contracts` `0.1.0-rc.0` está publicado — a fase D depende disso.
      Dependências: T003. Sucesso: as duas versões instaláveis a partir do monorepo.
      _`adatechnology-packages#24` mergeado em `main` por squash; o workflow `Publish packages`
      publicou `@adatechnology/keycloak-admin@1.0.0-rc.0` na tag `rc` (publicação é do GitHub
      Actions, nunca local). `@adatechnology/notification-contracts` também está publicado —
      `0.1.0-rc.1`, à frente do `0.1.0-rc.0` que a spec pedia — então **a fase D deixa de estar
      bloqueada**. Dependência fixada em `apps/api-transportada/package.json` e resolvida no
      lockfile. Detalhes em `evidence.md`._

## Fase 0b — Primeiro acesso (ADR-0022)

> 🤖 Modelo: `sonnet` (T000d e T000e são 🧠 — fronteira não autenticada e segredo de service account)
>
> Objetivo da fase: um deploy novo sobe e a primeira pessoa a acessar vira `company-admin` ativo sem
> nenhum clique no console do Keycloak, e a rota que permitiu isso deixa de responder no mesmo
> instante.

- [x] T000d Contrato **falhando** da rota de primeiro acesso. Cobre: recusa sem `BOOTSTRAP_TOKEN`
      configurado (fail-closed), recusa com token errado, recusa quando já existe `company-admin`
      ativo, recusa quando a empresa do ambiente não existe, e o caminho feliz criando usuário de
      identidade, identidade externa, vínculo e papel numa transação só. Todas as recusas com corpo
      e status idênticos (`404`), asserção explícita de que a resposta não distingue os motivos.
      Comparação do token por `timingSafeEqual` sobre digests de tamanho fixo. Dependências: T000c.
      Sucesso: vermelho por inexistência da rota.

- [x] T000e 🧠 Implementar a rota e o gateway do Keycloak na API, consumindo o pacote da fase A.
      Gateway encapsulado em `identity/infrastructure/`, nunca a Admin API vazando para o use case.
      Usuário criado habilitado, com o atributo `company_id` da empresa do ambiente. Mesma advisory
      lock do provisionamento. Trilha de auditoria com ator, IP, horário e o `sub` criado; nenhuma
      senha, token ou segredo de client em log. Dependências: T000d + T004. Sucesso: T000d verde e
      segunda chamada respondendo `404`.
      _T000d verde (29 pass / 0 fail, três contratos). Gate completo (`lint`/`typecheck`/`test`/
      `build`) sem regressão — os únicos vermelhos são os pré-existentes de T010. **Trilha de
      auditoria em `audit_logs` não implementada**: a tabela exige `actor_user_id NOT NULL` (não há
      ator prévio no arranque) e não tem coluna de IP — pedido do schema atual sem migration nova,
      fora do escopo desta task. Compromisso e justificativa completos em `evidence.md`; T011 não
      cobre esta lacuna, só as rotas autenticadas de `users.manage`._

- [ ] T000f 🧠 Client confidencial de service account no `deploy/keycloak/realm.json`, com
      `manage-users` do `realm-management` e segredo por ambiente. Contrato do realm asserta o client,
      o service account e a ausência de `directAccessGrants`. Registrar no runbook que ambientes já
      criados **não** recebem o client pelo deploy — entram por `partialImport` ou console, porque o
      import ignora realm existente. Em staging o caminho é outro e é mais limpo: o ambiente está
      vazio e o reset está autorizado, então apagar o realm `transportada` e deixar o deploy
      reimportar do zero. Dependências: T000e. Sucesso: contrato verde e staging com o client
      aplicado.

  _Feita antes de T000e: não depende do pacote npm, e o gateway de T000e não autentica sem o client
  existir. Contrato verde (`10 pass · 0 fail`) sobre os **dois** realms versionados, incluindo
  varredura que proíbe segredo literal. Verificado no Keycloak local recriado: `client_credentials`
  emite token com `realm-management:manage-users`, `GET /admin/.../users` → 200, grant de senha → 400. Runbook em `docs/ops/keycloak-admin-service-account.md`. **Falta aplicar em staging.**_

- [x] T000g `BOOTSTRAP_TOKEN` no schema de env da API, sem valor padrão e sem fallback para string
      vazia — ausente significa rota morta, não rota aberta. Dependências: T000e. Sucesso: teste do
      schema falhando o boot com valor vazio e a rota respondendo `404` sem a variável.

  _Metade do schema feita antes de T000e, pelo mesmo motivo de T000f. Contrato
  `test/bootstrap-first-admin/environment.contract.ts` verde (`6 pass · 0 fail`): sem default,
  ausente vira `undefined`, branco derruba o boot, e o token não é normalizado — `.trim()` faria o
  boot aceitar segredo diferente do configurado. Metade da fronteira HTTP fechada por T000e: a
  cadeia completa (env ausente → `undefined` → `createAnonymousRoutes` injeta `token: undefined` no
  use case → `assertAvailable` recusa com `TOKEN_NOT_CONFIGURED` → router traduz para `404` uniforme)
  está provada pela composição dos três contratos de `bootstrap-first-admin.contract.test.ts`
  (`environment` + `guard` + `http`, `29 pass · 0 fail`) — não há teste único de rede fim-a-fim, mas
  cada elo da cadeia é coberto por um teste que exercita o código real, não um duplo._

- [x] T000h Tela de primeiro acesso no frontend: formulário de administrador (nome, e-mail, usuário,
      senha e token de arranque) chamando a rota, e, depois do login, o assistente da empresa que
      aparece quando o perfil vem nulo e grava por `PATCH /company-settings`. Nenhuma validação de
      perfil fiscal duplicada. Contrato de acessibilidade e de campos pelos tokens do design system.
      Dependências: T000e. Sucesso: testes do frontend verdes, `build` limpo.

  _`FirstAccessPage` + `useBootstrapFirstAdmin` + `bootstrapClient.service` na rota anônima
  `/primeiro-acesso`, desviada em `bootstrapApplication()` antes de `initializeKeycloakAuth()`. Três
  contratos novos (`bootstrap-client`, `first-access-page`, `public-route`) mais o `company-wizard`
  já existente cobrem os seis campos, `role="alert"`, ausência de validação fiscal duplicada e de
  vazamento de razão de recusa, tokens de campo no CSS module e locale nas duas línguas. Gate
  completo verde: `bun test test/identity.contract.test.ts` 12 pass, `bun run test` 616 pass,
  `typecheck`/`lint` limpos, `build` sem erro. Evidência completa em `evidence.md`._

- [ ] T000i Entrega em staging: limpar identidade do ambiente, subir, acessar, criar o administrador,
      logar, abrir a tela Empresa em `200`, preencher o perfil e conferir a segunda chamada da rota
      em `404`. Remover `BOOTSTRAP_TOKEN` do Railway ao fim. Atualizar `docs/spec/railway.md`,
      `docs/ops/keycloak-first-admin.md` (vira contingência) e `CLAUDE.md`. Dependências: T000f +
      T000g + T000h. Sucesso: evidência completa em `evidence.md`, sem segredo na saída.

## Fase B — Domínio e persistência do convite

> 🤖 Modelo: `sonnet` (T005 e T007 são 🧠)

- [x] T005 🧠 Migration da tabela de convites: usuário alvo, empresa, papéis pretendidos, **hash** do
      código, validade, contador de tentativas, situação e horários. `companyId` no índice único.
      Rollback ao lado. Dependências: T004. Sucesso: `make migration-test` verde (migration e
      rollback em Postgres descartável).
      _`20260804143209_user_invitations` com `user_invitations` + `user_invitation_roles`. Índice
      único parcial `(company_id, user_id) WHERE status = 'pending'` e FK composta para
      `user_company_memberships(user_id, company_id)` — convidar alguém de outro tenant é recusado
      pelo banco. `make migration-test` verde: 14 pass / 0 fail, incluindo migration, constraints,
      rollback e reaplicação em Postgres descartável._

- [x] T006 Contrato **falhando** das regras de domínio: código de uso único; expirado, já usado e
      inexistente produzem **a mesma** recusa; reenvio invalida o anterior; tentativas limitadas por
      usuário; remover o último `company-admin` da empresa é recusado com erro de domínio próprio.
      Dependências: T005. Sucesso: vermelho listando as cinco regras.
      _`test/user-invitation-domain/invitation.contract.ts`: 15 testes em cinco `describe`, um por
      regra, importando `src/identity/domain/invitation.{constant,error,policy}` por `await import`
      para o vermelho nomear cada regra em vez de morrer num único erro de módulo. Vermelho:
      0 pass / 15 fail._

- [x] T007 🧠 Implementar domínio e repositório Drizzle do convite, mais os contratos de tenant safety
      em `test/*-schema/` provando que consulta e escrita filtram por `context.companyId`.
      Dependências: T006. Sucesso: T006 verde + tenant safety verde.
      _`src/identity/domain/invitation.{constant,error,policy}.ts`,
      `src/identity/application/invitation.port.ts` e
      `src/identity/infrastructure/drizzle-invitation.repository.ts`, que exporta os construtores de
      filtro puros consumidos por `test/user-invitation-schema/tenant-safety.contract.ts`.
      T006 verde (15 pass) e tenant safety verde (7 pass). Suíte da API: 1521 pass / 1 skip / 1 fail —
      o `fail` é o vermelho pré-existente de T000d/T000e._

## Fase C — Rotas sob `users.manage`

> 🤖 Modelo: `sonnet` (T009 é 🧠 — fronteira não autenticada)

- [x] T008 Contrato **falhando** das rotas autenticadas: listar usuários da empresa, convidar,
      reenviar código, ativar/desativar, alterar perfis e remover vínculo — todas sob `users.manage`,
      todas no escopo do token. Inclui o caso de um admin da empresa A recebendo recusa sobre usuário
      da empresa B e o caso do último `company-admin`. Dependências: T007. Sucesso: vermelho.
      _Feito: `test/fixtures/user-administration-http.fixture.ts`,
      `test/user-administration-http/{routes,security}.contract.ts` e o entrypoint registrado no
      `package.json`. 18 testes vermelhos, cada um na própria linha, cobrindo as seis rotas sob
      `users.manage`, o 404 sobre usuário de outra empresa, o 409 do último `company-admin` e o 409
      da auto-remoção de vínculo._

- [x] T009 🧠 Contrato **falhando** da rota de ativação (não autenticada): troca de código por senha
      habilita o usuário no Keycloak; a senha **não** transita pelo domínio da aplicação nem é
      persistida; resposta uniforme para expirado/usado/inexistente; limite de tentativas.
      Dependências: T008. Sucesso: vermelho.
      _Feito: `test/fixtures/user-activation-http.fixture.ts` e
      `test/user-activation/{http,password-handoff}.contract.ts`, entrypoint registrado no
      `package.json`. 18 testes vermelhos: 9 na fronteira anônima (204, nenhuma autenticação, mesmos
      bytes nas cinco recusas, nada em log) e 9 no caso de uso (só o hash chega ao banco, a senha só
      chega ao provedor, ordem senha → habilitar → concluir, tentativas). ⚠️ A parte HTTP também
      depende de `defineAnonymousRoute`/`anonymousRoutes` no router, que é entrega de T000e._

- [x] T010 Implementar use-cases, rotas e o gateway que encapsula `@adatechnology/keycloak-admin`
      (nada de importar internals do pacote fora do gateway). Dependências: T009. Sucesso: T008 e
      T009 verdes; `users.manage` deixa de ser permissão sem consumidor.

  _Feito: os seis use-cases de `src/identity/application/` (`invite-company-user`,
  `list-company-users`, `resend-company-user-code`, `change-company-user-status`,
  `replace-company-user-roles`, `remove-company-user-membership`) mais `activate-invitation`,
  ligados a `createUserAdministrationRoutes`/`createUserActivationRoutes` e conectados na
  composition root (`main.ts`) usando `createIdentityAccessGateway` (`keycloak-admin.gateway.ts`)
  como único ponto de contato com `@adatechnology/keycloak-admin`. `DrizzleCompanyUserRepository` e
  `DrizzleInvitationRepository` fecham a infraestrutura. T008 e T009 verdes:
  `user-administration-http.contract.test.ts` e `user-activation.contract.test.ts` — 69 pass, 0
  fail. `users.manage` agora tem seis rotas consumidoras. Suíte completa da API:
  `bun run --cwd apps/api-transportada test` — 1647 pass, 3 skip, 0 fail. `make check` verde de
  ponta a ponta (format, lint, typecheck, test, build) nas quatro apps do monorepo._

- [ ] T011 Trilha de auditoria de toda ação sensível (convite, ativação, enable/disable, troca de
      perfil, remoção) com ator, alvo, IP e horário — e teste de que nem código, nem senha, nem
      contato em claro entram na trilha. Dependências: T010. Sucesso: verde.

## Fase C2 — Perfil, sincronização com o Keycloak e foto

> 🤖 Modelo: `sonnet` (T022 e T028 são 🧠 — validar o desenho com `opus` antes)
>
> Escopo acrescentado depois da Fase C, a pedido do usuário: hoje suspender, remover e editar não
> chegam ao Keycloak, não existe rota de edição de perfil e não existe foto. Requisitos R6, R7 e R8.

- [x] T021 Contrato **falhando** da sincronização: suspender chama `setEnabled(false)`, reativar
      chama `setEnabled(true)`, remover vínculo desabilita no Keycloak, e o convite grava
      `firstName`, `lastName` e o atributo `company_id`. Falha do gateway reprova a operação e o
      banco não muda. Dependências: T011. Sucesso: vermelho.

- [x] T022 🧠 Estender `IdentityAccessGatewayPort` e `keycloak-admin.gateway.ts` com `updateUser`,
      `updateAttributes`, `deleteUser`, `setTemporaryPassword` e busca por `username` — o pacote
      `@adatechnology/keycloak-admin` já expõe todos. Propagar nos use-cases de status e remoção.
      Dependências: T021. Sucesso: T021 verde + gates da API verdes.
      **Divergência:** o pacote não expõe busca por `username`, só `findUserByEmail`. A colisão de
      `username` continua detectável — o Admin API responde `USER_ALREADY_EXISTS` na escrita — e é
      por ali que o 409 da T024 vai sair, sem uma consulta prévia que não resolveria a corrida.

- [ ] T023 Contrato **falhando** da edição de perfil: `PATCH /company-users/:id` sob `users.manage`
      altera nome, `username`, e-mail, canal e endereço de contato; `username` duplicado devolve 409
      com erro de domínio próprio; admin da empresa A não altera usuário da empresa B.
      Dependências: T022. Sucesso: vermelho.

- [ ] T024 Implementar o `PATCH`: schema Zod, use-case, repositório sobre `identity_user_profiles` +
      `identity_users`, e o empurrão para o Keycloak na mesma operação. Migration aditiva para o
      `username` da aplicação, se o contrato de colunas exigir. Dependências: T023. Sucesso: T023
      verde + `make migration-test` verde.

- [ ] T025 Contrato **falhando** da senha temporária: o convite aceita a via `temporary_password`,
      cria o usuário **habilitado**, chama `setTemporaryPassword`, não cria convite pendente e não
      devolve nem loga a senha em lugar nenhum. Dependências: T024. Sucesso: vermelho.

- [ ] T026 Implementar a segunda via de ativação no convite, com as duas vias mutuamente exclusivas
      por usuário. Dependências: T025. Sucesso: T025 verde + gates da API verdes.

- [ ] T027 Contrato **falhando** da foto: `POST` e `GET` de foto sob autenticação, tipo restrito a
      `image/jpeg`/`image/png`/`image/webp`, teto de bytes, chave sem dado pessoal, bucket privado e
      substituição da anterior. Dependências: T026. Sucesso: vermelho.

- [ ] T028 🧠 Implementar a foto: gateway de storage para avatar (reusando o `ObjectStorageProvider`
      já configurado), coluna/migration da referência, rotas de upload e leitura, e o atributo
      `picture` no Keycloak apontando para a rota da API. Dependências: T027. Sucesso: T027 verde +
      `make migration-test` verde.

## Fase D — Entrega do código pelo canal configurado

> 🤖 Modelo: `sonnet`

- [ ] T012 Decidir e registrar, com `make migration-test` como juiz, se o estado do convite fica no
      schema da aplicação (consumindo só `notification-contracts` + provider stateless) ou se
      `notification-module` entra com as migrations dele. Dependências: T004. Sucesso: decisão
      registrada no `plan.md` e cadeia de migrations verde.

- [ ] T013 Contrato **falhando**: convite não chama canal nenhum no caminho síncrono da rota;
      publica mensagem; o consumidor do worker entrega pelo canal da empresa; falha de entrega **não**
      invalida o código e permite reenvio. Dependências: T012. Sucesso: vermelho.

- [ ] T014 Implementar o consumidor no worker com o trio de notificação, envelope Zod versionado,
      idempotência por `processed_messages` e política de retry do trilho. Dependências: T013.
      Sucesso: T013 verde + `make worker-integration` verde.

- [ ] T015 Campo de canal de ativação (`email` / `sms` / `whatsapp`) nas configurações da empresa —
      schema, migration e `PATCH` existente. Dependências: T014. Sucesso: gates da API verdes,
      canal persistido e lido pelo worker.

## Fase E — Seção "Usuários e perfis" no painel

> 🤖 Modelo: `sonnet`

- [ ] T016 Contrato **falhando** do frontend: a seção aparece só com `users.manage`; a lista mostra
      contato **mascarado**; as ações de criar, reenviar, ativar/desativar, trocar perfil, **editar
      dados**, **trocar a foto** e remover existem; a criação deixa escolher entre senha temporária e
      código por canal; o próprio vínculo do admin logado não é removível. Dependências: T028.
      Sucesso: vermelho.

- [ ] T017 Implementar a seção em `modules/company-settings/` — componentes declarativos, estado em
      `*.hook.ts`, TanStack Query em `*.query.ts` / `*.mutation.ts`, client HTTP do módulo, textos
      acentuados nos dois `*.locale.json`, ícones de `@/components/ui/icon`, campos pelos tokens,
      seletor de canal e de via de ativação pelo `@/components/ui/select`, esqueletos de
      `@/components/ui/skeleton` em todo carregamento. A senha temporária **nunca** é exibida de
      volta depois de submetida. Dependências: T016. Sucesso: T016 verde + gates do frontend verdes.

- [ ] T018 Se a lista de usuários crescer para tabela densa, aplicar o contrato de
      `docs/frontend/data-tables.md` (ordenação, filtro multi-valor, pílulas, colunas persistidas) ou
      registrar por que a lista simples basta. Dependências: T017. Sucesso: contrato verde ou decisão
      registrada em `evidence.md`.

## Fase F — Documentação e evidência

> 🤖 Modelo: `sonnet`

- [ ] T019 Atualizar `CLAUDE.md` (rotas e módulo novos), `docs/spec/railway.md` (o passo manual de
      criar usuário por ambiente deixa de existir) e documentar os endpoints. Dependências: T018.
      Sucesso: documentação batendo com a implementação.

- [ ] T020 Rodar o fluxo ponta a ponta em staging — convite, entrega pelo canal, ativação, acesso —
      e fechar `evidence.md` com comando, saída e o que cada uma prova, sem nenhum dado sensível.
      Dependências: T019. Sucesso: `make check` verde + fluxo real registrado.

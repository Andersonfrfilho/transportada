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

- [ ] T000c O comando deixa de exigir um sujeito já criado à mão: cria o usuário desabilitado no
      Keycloak pelo gateway da fase C e emite o primeiro código de ativação, o mesmo caminho da
      feature (R2). `PROVISION_ADMIN_SUBJECT` passa a ser opcional, substituído pelo contato do
      primeiro admin. Dependências: T000b + T010. Sucesso: ambiente novo com admin ativável sem
      nenhum passo manual no console do Keycloak.

## Fase A — Pacote `@adatechnology/keycloak-admin`

> 🤖 Modelo: 🧠 `opus` (contrato de pacote novo e superfície de segurança)

- [ ] T001 Teste **falhando** no repositório de packages: o cliente pede token com
      `grant_type=client_credentials`, **nunca** envia campo `password`, reaproveita o token em cache
      dentro da validade e renova antes de expirar. Dependências: T000. Sucesso: vermelho por
      inexistência do pacote.

- [ ] T002 Implementar `packages/backend/keycloak-admin` — agnóstico, TS estrito, `zod` para validar
      a config (`baseUrl`, `realm`, `clientId`, `clientSecret`), contrato `createUser`,
      `findUserByEmail`, `updateUser`, `setEnabled`, `updateAttributes`, `deleteUser`,
      `setTemporaryPassword`, e `KeycloakAdminError` com código estável. Dependências: T001.
      Sucesso: T001 verde.

- [ ] T003 Teste de redação: `KeycloakAdminError` serializado e a mensagem de qualquer falha não
      contêm `clientSecret`, token nem senha. Dependências: T002. Sucesso: verde, e a asserção falha
      se alguém reintroduzir o segredo no contexto do erro.

- [ ] T004 Publicar o pacote e registrar a versão. Confirmar também que
      `@adatechnology/notification-contracts` `0.1.0-rc.0` está publicado — a fase D depende disso.
      Dependências: T003. Sucesso: as duas versões instaláveis a partir do monorepo.

## Fase B — Domínio e persistência do convite

> 🤖 Modelo: `sonnet` (T005 e T007 são 🧠)

- [ ] T005 🧠 Migration da tabela de convites: usuário alvo, empresa, papéis pretendidos, **hash** do
      código, validade, contador de tentativas, situação e horários. `companyId` no índice único.
      Rollback ao lado. Dependências: T004. Sucesso: `make migration-test` verde (migration e
      rollback em Postgres descartável).

- [ ] T006 Contrato **falhando** das regras de domínio: código de uso único; expirado, já usado e
      inexistente produzem **a mesma** recusa; reenvio invalida o anterior; tentativas limitadas por
      usuário; remover o último `company-admin` da empresa é recusado com erro de domínio próprio.
      Dependências: T005. Sucesso: vermelho listando as cinco regras.

- [ ] T007 🧠 Implementar domínio e repositório Drizzle do convite, mais os contratos de tenant safety
      em `test/*-schema/` provando que consulta e escrita filtram por `context.companyId`.
      Dependências: T006. Sucesso: T006 verde + tenant safety verde.

## Fase C — Rotas sob `users.manage`

> 🤖 Modelo: `sonnet` (T009 é 🧠 — fronteira não autenticada)

- [ ] T008 Contrato **falhando** das rotas autenticadas: listar usuários da empresa, convidar,
      reenviar código, ativar/desativar, alterar perfis e remover vínculo — todas sob `users.manage`,
      todas no escopo do token. Inclui o caso de um admin da empresa A recebendo recusa sobre usuário
      da empresa B e o caso do último `company-admin`. Dependências: T007. Sucesso: vermelho.

- [ ] T009 🧠 Contrato **falhando** da rota de ativação (não autenticada): troca de código por senha
      habilita o usuário no Keycloak; a senha **não** transita pelo domínio da aplicação nem é
      persistida; resposta uniforme para expirado/usado/inexistente; limite de tentativas.
      Dependências: T008. Sucesso: vermelho.

- [ ] T010 Implementar use-cases, rotas e o gateway que encapsula `@adatechnology/keycloak-admin`
      (nada de importar internals do pacote fora do gateway). Dependências: T009. Sucesso: T008 e
      T009 verdes; `users.manage` deixa de ser permissão sem consumidor.

- [ ] T011 Trilha de auditoria de toda ação sensível (convite, ativação, enable/disable, troca de
      perfil, remoção) com ator, alvo, IP e horário — e teste de que nem código, nem senha, nem
      contato em claro entram na trilha. Dependências: T010. Sucesso: verde.

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
      contato **mascarado**; as ações de convidar, reenviar, ativar/desativar, trocar perfil e
      remover existem; o próprio vínculo do admin logado não é removível. Dependências: T011.
      Sucesso: vermelho.

- [ ] T017 Implementar a seção em `modules/company-settings/` — componentes declarativos, estado em
      `*.hook.ts`, TanStack Query em `*.query.ts` / `*.mutation.ts`, client HTTP do módulo, textos
      acentuados nos dois `*.locale.json`, ícones de `@/components/ui/icon`, campos pelos tokens,
      seletor de canal pelo `@/components/ui/select`. Dependências: T016. Sucesso: T016 verde +
      gates do frontend verdes.

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

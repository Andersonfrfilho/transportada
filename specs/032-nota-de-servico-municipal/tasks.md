# 032 — Tasks

Uma task por vez. Teste de contrato **antes** da implementação. Evidência em `evidence.md`.

## Fase A — decisão registrada

> 🤖 Modelo: `opus` 🧠 — é a decisão que amarra provedor e versão de API

- [x] **T001** `spec.md` e `plan.md` da feature.
- [x] **T002** 🧠 `docs/adr/0029-nfse-municipal-via-nota-rp-v2.md`: v2 em vez de v3, cliente atrás de
      porta, autorização por consulta e não por postback. Atualizar `docs/spec/fiscal-integration.md`
      (hoje diz "NFS-e permanece fora do MVP fiscal").
      Verificação: leitura; nenhum comando.
- [ ] **T003** Confirmar com o token real, contra a Nota RP: `GET /dados-cadastrais` (CNAEs,
      atividades, operações permitidas, numeração de RPS) e `GET /api/v3/empresa/listar` (RP já
      migrou?). Token só no `.env`, nunca em log, chat ou commit.
      Verificação: saída sanitizada em `evidence.md` — **sem token, sem CNPJ de terceiro**.

## Fase B — banco

> 🤖 Modelo: `sonnet` (T005 é 🧠 — índice parcial e checks são o que sustenta a regra)

- [x] **T004** Contrato: `test/nfse-schema/tenant-safety.contract.ts` no molde de
      `test/billing-schema/tenant-safety.contract.ts` — FK composta `(company_id, id)`, `restrict`/
      `cascade`, timestamps UTC, ausência das colunas proibidas (`token`, `xml`, `storage_key`).
      Entrada nova em `apps/api-transportada/package.json`.
      Verificação: `bun run --cwd apps/api-transportada test` vermelho pelo motivo certo.
- [x] **T005** 🧠 `src/database/nfse.schema.ts` com as onze tabelas, exportado no barrel; `'nfse_document'`
      em `STORAGE_OBJECT_PURPOSES` e no `check` de `storage.schema.ts`.
      Verificação: `bun run --cwd apps/api-transportada test` verde.
- [x] **T006** `db:generate --name nfse_service_invoices`, `rollback.sql` à mão, bloco novo em
      `test/database-migration/static-migration.contract.ts` (diretório na lista literal + asserts de
      aditividade e de rollback guardado).
      Verificação: `bun run --cwd apps/api-transportada db:check` e `make migration-test`.
- [x] **T007** Cópias por valor no worker: `src/database/nfse-issuance-execution.schema.ts` e as
      linhas de `nfse_processed_messages`/`nfse_issuance_outbox` em `processing.schema.ts`.
      Verificação: `bun run --cwd apps/worker-transportada typecheck`.

## Fase C — domínio: valor, seleção e descrição

> 🤖 Modelo: `sonnet` (T009 é 🧠 — o valor tem de bater com o do CT-e)

- [x] **T008** Contrato `test/nfse-domain/description.contract.ts`: variáveis resolvidas, variável
      desconhecida recusada, truncagem na fronteira da lista terminando em `… e mais N notas`.
- [x] **T009** 🧠 Contrato `test/nfse-domain/selection.contract.ts`: agrupamento por tomador conforme
      `profile.taker`, bloqueio recíproco com lote de CT-e ativo, e **paridade de valor** — a mesma
      seleção com a mesma regra dá o mesmo total que a projeção de CT-e.
- [x] **T010** Implementar em `nfse-invoices/domain/`: `nfse-description.service.ts`,
      `nfse-selection.policy.ts`, `nfse-invoice-state.policy.ts` e `nfse-issuance.error.ts`, reusando
      `composeCharge` e `roundChargeToFiscalScale` de
      `cte-profiles/domain/charge-composition.service.ts`.
      Verificação: `bun run --cwd apps/api-transportada test`.
- [x] **T011** Razão de bloqueio recíproca em `cte-batches/domain/cte-batch-eligibility.policy.ts` e
      na consulta de candidatos, com o contrato de CT-e existente estendido.
- [x] **T010a** `{{periodo}}` e `{{municipio}}` no vocabulário da descrição — a última nota real da
      prefeitura descreve o serviço por janela de datas e cidade, não por lista de NF-e, e o motor
      não sabia escrever esse texto. Serviço novo `nfse-period.service.ts` (dia lido em
      `America/Sao_Paulo`), coluna `municipality_name` no perfil de emissão e migration **empilhada**
      — a da feature deixou de ser a ponta da fila (ver `evidence.md`).
      Verificação: `test`, `typecheck`, `lint`, `db:check` e `make migration-test`.

## Fase D — API HTTP

> 🤖 Modelo: `sonnet` (T013 é 🧠 — segredo em repouso)

- [x] **T012** Permissões `nfse.*` em `identity/domain/authorization.policy.ts` e na distribuição por
      papel; ajustar o contrato de RBAC e a allowlist do frontend na mesma task (o guarda é estrito).
- [x] **T013** 🧠 `nfse-profiles/`: perfil e credencial, com token em `secret_envelope` e resposta
      sem segredo (`apiTokenConfigured`/`callbackTokenConfigured`, sem máscara — ver `evidence.md`).
      Contrato provando que nenhuma rota devolve o token.
- [x] **T014** `nfse-invoices/` prévia e criação: use-case numa transação (vínculos + encargos +
      payload congelado + evento + outbox), `idempotency-key` obrigatório, schemas Zod `.strict()`.
      Contrato de rota + contrato de query tenant-safe no molde de
      `test/billing-schema/eligible-query-tenant-safety.contract.ts`.
- [x] **T015** Listagem, detalhe, cancelamento (libera os vínculos na mesma transação) e downloads
      assinados de XML e PDF.
- [x] **T016** Fiação em `src/main.ts`.
      Verificação: `bun run --cwd apps/api-transportada test` e `typecheck`.
- [x] **T016a** Status `cancellation_requested` — a prefeitura confirma o cancelamento depois, igual
      à autorização, e sem o estado a nota ficava `authorized` na tela. Tabela de transições nova
      (`confirmCancellation`) já guardando o write-back da Fase E, check próprio no schema e a
      migration da feature regerada (ainda não rastreada — ver `evidence.md`).
      Verificação: `test`, `typecheck` (api e worker), `db:check` e `make migration-test`.

## Fase E — trilho `nfse-issuance.v1`

> 🤖 Modelo: `opus` 🧠 — trilho fiscal, idempotência e cliente externo

- [x] **T017** Contratos de topologia e envelope no molde de
      `test/mdfe-issuance-topology.contract.test.ts`, incluindo o assert de que o trilho não
      compartilha fila com os outros. O envelope carrega só referência: o motivo do cancelamento
      fica na nota e é recusado no payload (`security.md` §6 — ver `evidence.md`).
      Verificação: `bun run --cwd apps/worker-transportada test` vermelho pelo motivo certo
      (módulo de produção ausente), 317 pré-existentes verdes.
- [x] **T018** `messaging/nfse-rabbitmq-topology.ts` e `messaging/nfse-processing-envelope.schema.ts`.
- [x] **T019** 🧠 Contrato `test/nota-rp-v2-client.contract.test.ts` com `fetch` falso: emissão,
      consulta, cancelamento, download, e **HTTP 200 com `success:false` tratado como falha**.
      A documentação real da v2 não existe no repositório: o vocabulário de fio é inferido e fica
      isolado em `test/nota-rp-v2/fixture.ts` — ver `evidence.md`.
- [x] **T020** 🧠 `nfse-issuance/infrastructure/{nfse-fiscal-gateway.ts,nota-rp-v2.client.ts}` —
      nenhuma exceção escapa do gateway; token lido do envelope e zerado depois do uso.
      Um terceiro arquivo entrou junto: `application/nfse-credential-secret.service.ts`, cópia por
      valor do serviço da API — as apps não importam código uma da outra (ver `evidence.md`).
- [x] **T021** Outbox: repositório, relay e publisher reusando `OutboxRelayLoop` sem alterá-lo.
      Contrato no molde de `test/mdfe-outbox-relay.contract.test.ts`. O envelope é montado das
      colunas tipadas — a coluna `payload jsonb` da linha não é transporte (ver `evidence.md`).
- [x] **T022** Consumidor: `runtime/nfse-issuance-consumer.service.ts`, handler com ordem
      `hasProcessed → effect → markProcessed`, política de retry própria em
      `company_fiscal_profiles`, e write-back guardado por status.
- [x] **T023** Fiação do trilho NFS-e em `worker/src/main.ts` (topology → publisher → starter →
      `consumers`/`closeables`/`catch`) e endereço da Nota RP por instalação (`NFSE_PROVIDER_*`, as
      duas bases juntas ou nenhuma, causa `provider_not_configured` sem abrir o segredo).
      O storage do XML e do **PDF** saiu daqui: o worker só pede a emissão, e o documento só existe
      na consulta — ele sobe no T024, com o único consumidor que o chama.
      Verificação: `bun run --cwd apps/worker-transportada test` e `make worker-integration`.

## Fase F — reconciliação

> 🤖 Modelo: `sonnet` (T025 é 🧠 — rota pública)

- [x] **T024** Job `nfse.status.pull` no cron: consulta as pendentes, arquiva XML e PDF na
      autorização, grava rejeição com código e mensagem. Contrato de elegibilidade e de idempotência.
      Traz também o gateway de storage do documento fiscal NFS-e (`application/pdf` é caminho novo) —
      herdado do T023, porque o consumidor dele é este job — e a dependência
      `@adatechnology/object-storage-provider` no `apps/cron-transportada/package.json`, que hoje não
      tem provedor de objeto nenhum.
      O registro de jobs saiu de `nfe-distribution-pull/` para `src/job-registry.ts`: já não pertence
      a um trilho só. O bloco de config de NFS-e só é resolvido quando `CRON_JOB` é este job — o
      deploy da busca de notas continua subindo sem chaveiro nem bucket.
      Verificação: `bun run --cwd apps/cron-transportada test` (123 pass), `lint`, `typecheck`,
      `build`.
- [x] **T025** 🧠 Rota anônima `POST /public/nfse-callbacks/:token` (`defineAnonymousRoute`), token
      opaco comparado por `timingSafeEqual`, 204 invariável, sem efeito de negócio além de antecipar
      a consulta. Env `NFSE_CALLBACK_BASE_URL` no schema + `.env.example` + `make config`.
      Verificação: `bun run --cwd apps/api-transportada test` (2264 pass, 4 falhas alheias),
      `typecheck`, `bun run lint`, `make config`.

## Fase G — frontend

> 🤖 Modelo: `sonnet`

- [x] **T026** Módulo `modules/nfse-invoice/` com client HTTP próprio, validação por type guard e
      locales acentuados; navegação em `main.tsx`.
      Verificação: `bun run --cwd apps/frontend-transportada test` (888 pass, 0 fail), `typecheck`,
      `bun run lint`, `bunx prettier --check apps/frontend-transportada`, `build`.
- [x] **T027** Ação em massa e diálogo na tela Notas, com prévia por tomador e descrição editável.
- [x] **T028** Tela de listagem seguindo `docs/frontend/data-tables.md` e painel de perfil/credencial
      em `company-settings`.
      Verificação: `bun run --cwd apps/frontend-transportada test` (988 pass, 0 fail), `typecheck`,
      `bun run lint`, `bunx prettier --check`; API sem regressão (2291 pass, 0 fail).
- [x] **T028a** `GET /nfse-emission-profiles/options` — o diálogo de emissão lia a listagem inteira,
      que pede `settings.manage`; o papel fiscal recebia 403 e a emissão morria sem perfil para
      escolher. Rota só-leitura atrás de `nfse.issue`, servindo três campos (`id`, `name`,
      `descriptionTemplate`) apenas de perfil `active` — alíquota, CNAE e tomador continuam atrás de
      `settings.manage`. A projeção é estreita nas quatro camadas (seam de query própria, tipo de
      porta, `select` e serializador à mão) e o guarda do frontend recusa campo a mais.
      Verificação: `test` da API (2291 pass) e do frontend (952 pass), `typecheck` e `lint` na raiz
      (ver `evidence.md`).

- [x] **T028b** Ações por linha na tela de NFS-e: ver o detalhe, baixar XML e PDF, e cancelar. As três
      rotas já existem (`GET /:id`, `GET /:id/documents`, `GET /:id/xml`, `GET /:id/pdf`,
      `POST /:id/cancel`) e o cliente e o controlador do frontend já as expõem — o que falta é quem
      as aciona: a tabela renderiza checkbox e colunas, sem coluna de ação. Coluna de ações com
      botões só de ícone (`aria-label` obrigatório), diálogo de detalhe (encargos, descrição, notas
      vinculadas, motivo de rejeição) e diálogo de cancelamento com justificativa validada contra o
      mesmo teto da API (5 a 255 caracteres). O que cada linha oferece sai de serviço puro espelhando
      `nfse-invoice-state.policy.ts`: cancelar só em `authorized`; baixar só onde o documento fiscal
      existe (`authorized`, `cancellation_requested`, `cancelled`).
      Verificação: `test/nfse-invoice/row-actions.contract.ts` vermelho antes da implementação;
      depois `bun run --cwd apps/frontend-transportada test`, `typecheck`, `lint` e `prettier`.

- [x] **T028c** Chegar até as ações. Com a T028b no ar o operador continuou sem conseguir agir: a
      tabela tem nove colunas de conteúdo largo dentro de um `overflow-x` com `white-space: nowrap`,
      e a coluna de ações fica além da borda direita — quem não rola horizontalmente não a vê. A
      coluna de ações passa a ser fixa na borda direita (`position: sticky`, fundo opaco para o
      conteúdo não atravessar), e a linha inteira abre o detalhe ao clique, exceto onde já existe
      controle próprio (a célula do checkbox e a das ações). O teclado continua servido pelo botão
      de detalhe, que já é focável — a linha não vira `role="button"` para não destruir a semântica
      da tabela.
      Verificação: contrato novo `test/nfse-invoice/row-navigation.contract.ts` vermelho antes;
      depois `test` do frontend, `typecheck`, `lint` e `prettier`.

- [x] **T028d** Cancelar em massa. A barra de seleção só informa contagem e total: selecionar não
      habilita ação nenhuma. Entra o cancelamento do lote sobre a rota que já existe
      (`POST /:id/cancel`, uma chamada por nota, `idempotency-key` própria por nota), com uma
      justificativa única validada pelo mesmo serviço puro da T028b. Só as `authorized` entram; as
      demais aparecem no diálogo com o motivo de ficarem de fora, e o resultado por nota é relatado
      no fim (quantas cancelaram, quais falharam).
      Verificação: contrato novo `test/nfse-invoice/bulk-cancel.contract.ts` vermelho antes;
      depois `test` do frontend, `typecheck`, `lint` e `prettier`.

- [x] **T028e** Baixar XML e PDF em massa. Uma aba por documento assinado não é caminho — o
      navegador bloqueia a partir da segunda. O repositório já resolveu isso para o CT-e:
      `POST /cte-items/export` monta um ZIP em stream (`createCteArchiveGateway`, modo `store`, um
      objeto por vez para não materializar a coleção em memória). Rota espelho
      `POST /nfse-service-invoices/export` atrás de `nfse.read`, com formato `xml` · `pdf` · `both`,
      teto de documentos por requisição e seleção tenant-safe por `(company_id, id)`; só nota com
      documento fiscal arquivado entra. No frontend, os dois botões na barra de seleção salvam o
      blob pelo mesmo `saveCteArchive` — âncora temporária, sem popup.
      Verificação: contratos novos na API (`nfse-export`, incluindo tenant-safety da seleção) e no
      frontend, vermelhos antes; depois `test` das duas apps, `typecheck`, `lint` e `prettier`.

## Fase H — fechamento

> 🤖 Modelo: `sonnet`

- [x] **T029** Ponta a ponta local (`make dev`): seleção → prévia → emissão → outbox publicado → fila
      → `pending_authorization` → reconciliação → `authorized` com XML e PDF em `stored_objects`;
      depois cancelamento liberando as notas.
- [x] **T029a** Serviço `cron-nfse` no pipeline: `deploy/cron-nfse/railway.json` (`*/5 * * * *`,
      `restartPolicyType: NEVER`, mesmo Dockerfile do `cron`), passo `Deploy cron-nfse` em
      `deploy.yml` depois da API, e `docs/spec/railway.md` declarando qual `CRON_JOB` cada serviço
      roda. Sem ele a NFS-e emitida em produção ficaria em `pending_authorization` para sempre.
      Contrato: `apps/cron-transportada/test/deploy/cron-services.contract.ts`.
- [ ] **T030** Emissão real de **uma** NFS-e de valor mínimo com a credencial de produção, e medida
      do teto real da `Discriminacao`.
- [ ] **T031** `make check` verde, `CLAUDE.md` atualizado com o módulo novo, evidência completa, PR.

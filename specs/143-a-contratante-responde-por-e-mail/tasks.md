# Tasks

Toda task fecha com typecheck (`bun run typecheck`), os testes da app (`bun run --cwd apps/<app>
test`), um commit isolado e a evidência em `evidence.md`. Teste novo entra na lista explícita do
`package.json`.

## Fase 0 — Decisões

> 🤖 Modelo: `opus`. As duas tasks são 🧠.

- [x] **T001** 🧠 Responder, com a documentação do Postmark, o que o spike perguntava. Feito em
      2026-09-13: o resultado de DKIM vem em `X-Spam-Tests`, não há HMAC, há Basic Auth, `403`
      interrompe a retentativa, e o `PUT /server` usa o token do servidor. A captura com e-mail real
      passou a ser a T012, feita pela própria página. Evidência: `plan.md`, seção "O que a
      documentação do Postmark responde".
- [x] **T002** 🧠 Registrar no `docs/SECURITY.md` três achados datados: o webhook sem HMAC, o limite
      de 12 MiB da rota e a retenção sem prazo. **Pare e peça ao usuário** para aceitar a ADR-0063
      antes de mudar o estado dela para `aceita`. Evidência: o diff dos dois documentos.

## Fase 1 — A página de configuração (P0)

> 🤖 Modelo: `sonnet` (T004, T008 e T010 são 🧠 — validar com `architect` em `opus` antes de
> fechar)

- [ ] **T003** Migration `20260913120000_contractor_mail`: todas as tabelas do `plan.md`
      (configuração, contatos, conversas, mensagens e os dois outboxes), a coluna em
      `delivery_charge_events` com o CHECK refeito, `emails_contractor` e o seed dos contatos, mais
      `rollback.sql`. Arquivos: `apps/api-transportada/drizzle/`,
      `src/database/contractor-mail.schema.ts` e `database.schema.ts`. Evidência:
      `make migration-test` verde.
- [ ] **T004** 🧠 Limite de corpo por rota em `http/request-handler.service.ts` (12 MiB só para o
      webhook) e o `maxRequestBodySize` de `server.service.ts`. Evidência: contrato que manda 2 MiB
      para uma rota comum (413) e para o webhook (aceito).
- [ ] **T005** Contrato de tenant, **vermelho primeiro**:
      `test/contractor-mail-schema/tenant-safety.contract.ts`, cobrindo configuração, contatos,
      conversas e mensagens. Evidência: vermelho antes da T008, verde depois.
- [ ] **T006** O serviço que sela o token (API) e a cópia dele no worker, com o mesmo AAD; o
      contrato de paridade compara os dois. Evidência: teste de ida e volta, e a abertura com AAD de
      outra empresa falhando.
- [ ] **T007** `postmark-server.gateway.ts` (`GET /server` e `PUT /server`) e
      `mx-lookup.gateway.ts`, com `fetch` e o resolvedor injetados. Evidência: contratos com fakes
      (token recusado, timeout, MX ausente, MX errado).
- [ ] **T008** 🧠 As rotas de `/contractor-mail-settings` (`GET`, `PUT`, `POST webhook`,
      `GET checks`), todas `settings.manage` e `no-store`, com o token nunca devolvido. O
      `POST webhook` gera a senha, guarda o hash e aplica no Postmark. Evidência: contratos de rota,
      mais o contrato por texto de fonte de que o token não aparece em nenhuma serialização nem em
      log.
- [ ] **T009** O trilho `contractor-mail-outbound.v1` no worker (relay, consumidor e envio pelo
      Postmark via `fetch`, com `Reply-To`, `In-Reply-To` e `References`) e o
      `POST /contractor-mail-settings/test-email`, que abre a conversa `setup_test`. Evidência:
      contrato do gateway com o fake e integração com o outbox.
- [ ] **T010** 🧠 O webhook `POST /public/inbound-emails/:webhookId`: Basic Auth por empresa,
      allowlist de IP, 401 fail-closed, gravação do bruto no bucket com a linha e o outbox numa só
      transação, e 200 para token desconhecido sem gravar corpo. O trilho `contractor-mail-inbound.v1`
      já trata `setup_test`: grava a resposta e se ela trouxe `DKIM_VALID_AU`. Evidência: contratos
      dos caminhos, mais o contrato de que nenhum log leva PII.
- [ ] **T011** O painel "E-mail com contratantes": entrada em `SETTINGS_PANEL_PLACEMENT` (confirmar
      o módulo onde as contratantes são cadastradas), formulário, lista de verificação com
      `CopyButton` para o MX, e os três botões. Locales acentuados. Evidência: contrato do registro de
      abas, contrato do serviço puro da lista de verificação e `make check`.
- [ ] **T012** ⛔ **Pare e peça ao usuário:** ele configura o Postmark pela página (conta, DNS e
      token ficam com ele; o token é digitado na página e ninguém mais o vê) e responde ao e-mail de
      teste pelo Gmail e pelo Outlook. Com os dois payloads recebidos, anonimizar e gravar em
      `apps/worker-transportada/test/fixtures/postmark-inbound.fixture.ts`. **Se nenhum trouxer
      `DKIM_VALID_AU`, pare de novo:** o P2 não decide para esses provedores, e seguir é decisão do
      usuário. Evidência: a fixture e os itens da lista de verificação marcados `ok`.

## Fase 2 — Contatos e envio (P1)

> 🤖 Modelo: `sonnet`

- [ ] **T013** CRUD de `contractor_contacts` dentro de `/contractors/:id`, com `settings.manage`.
      Evidência: contratos de rota, mais a T005 verde.
- [ ] **T014** `reply-token.policy.ts`: 128 bits, base32 minúsculo, hash SHA-256 e o endereço
      montado com o `reply_domain` da configuração. Evidência: teste da política.
- [ ] **T015** `send-occurrence-mail.use-case.ts` e `reply-to-thread.use-case.ts`, com o outbox na
      mesma transação. O corpo reaproveita o texto de `renderEmail` da 079. Evidência: teste de caso
      de uso.
- [ ] **T016** Rotas `POST /trip-stop-occurrences/:id/mail`, `POST /mail-threads/:id/messages` e
      `GET /mail-threads`, com `trip.manage`, mais a linha em `test/separator-role.contract.test.ts`
      (o separador **não** alcança). Evidência: contratos de rota.
- [ ] **T017** Contatos no formulário da contratante (frontend). Evidência: contrato de validação.
- [ ] **T018** O painel "Conversa com a contratante" na ocorrência, com o botão "Enviar à
      contratante", esqueleto de carregamento e invalidação por `mutationInvalidation.service.ts`.
      Evidência: contratos de serviço puro e smoke Playwright do envio.

## Fase 3 — A resposta decide (P2)

> 🤖 Modelo: `sonnet` (T020 é 🧠 — validar com `architect` em `opus` antes de fechar)

- [ ] **T019** `inbound-reply.policy.ts` e `auto-reply.policy.ts`, puros e dirigidos por tabela,
      cobrindo todas as saídas do RF5 e todos os casos do RF8, com os payloads da T012. Evidência: a
      suíte da política.
- [ ] **T020** 🧠 A decisão no trilho de entrada: `FOR UPDATE` na taxa, a transição, o evento com
      `decided_by_message_id`, ou `late`. Evidência: integração no worker, incluindo a corrida
      contra o lote (duas decisões, uma vence).
- [ ] **T021** `submit-charge-by-mail.use-case.ts` e `POST /delivery-charges/:id/mail-submission`.
      Evidência: teste de caso de uso e contrato de rota.
- [ ] **T022** A ação "Enviar para aprovação por e-mail" e a conversa da taxa, com a marca
      "decidiu" e o motivo do rebaixamento traduzido. Evidência: contrato de estado→ação (a ação só
      aparece com a taxa `recorded` e um contato com `can_decide`).

## Fase 4 — A decisão se espalha (P3)

> 🤖 Modelo: `sonnet`

- [ ] **T023** Os templates `CONTRACTOR_CHARGE_DECIDED_DRIVER` e `_DISPATCHER`, mais o envio depois
      da transição, com `dedupeKey` da mensagem. Evidência: integração com dois avisos na inbox.
- [ ] **T024** O feed de ocorrências da viagem mostra a decisão com a origem "e-mail". Evidência:
      contrato da query.

## Fase 5 — Envio automático (P4)

> 🤖 Modelo: `haiku`

- [ ] **T025** `emails_contractor` no tipo de ocorrência (API e tela), e o registro da ocorrência
      chama o envio quando o campo está ligado. Evidência: teste de caso de uso.

## Fase 6 — Fechamento

> 🤖 Modelo: `opus` para a revisão; `haiku` para a documentação

- [ ] **T026** Revisão final com `code-reviewer` e `security-reviewer` em `opus`, mais a auditoria do
      §15 (N+1 na listagem de conversas, PII em log, 500 sem stack trace).
- [ ] **T027** Atualizar `apps/api-transportada/CLAUDE.md` e `docs/ai-context/`, com a seção "A
      contratante conversa por e-mail", e o `docs/SECURITY.md`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/143-a-contratante-responde-por-e-mail/ (leia
spec.md, plan.md, tasks.md e docs/adr/0063-a-resposta-por-e-mail-decide-a-taxa.md antes de começar).
Uma task por vez, na ordem do tasks.md, no worktree work/spec-143.
Modelos: Fase 0 → opus · Fases 1–4 → executor model=sonnet · T004, T008, T010, T020 🧠 → validar com
architect model=opus antes de fechar · Fase 5 → executor model=haiku · revisão final →
code-reviewer + security-reviewer model=opus.
Cada task fecha com typecheck + testes da app + commit isolado, evidência em evidence.md; teste
novo entra na lista do package.json.
Pare e pergunte antes de: aceitar a ADR-0063 (T002), T012 (o usuário configura o Postmark pela
página), deploy, qualquer segredo, migration destrutiva, e se nenhuma resposta de teste trouxer
DKIM_VALID_AU.
```

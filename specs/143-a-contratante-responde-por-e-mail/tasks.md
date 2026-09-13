# Tasks

Toda task fecha com typecheck (`bun run typecheck`), os testes da app (`bun run --cwd apps/<app>
test`), um commit isolado e a evidência em `evidence.md`. Teste novo entra na lista explícita do
`package.json`.

## Fase 0 — Spike e decisões

> 🤖 Modelo: `opus`. As duas tasks são 🧠 e decidem o que a Fase 3 pode prometer.

- [ ] **T001** 🧠 Spike com o Postmark: conta de teste, subdomínio de resposta e MX. Enviar um e-mail
      pela API HTTP e responder dele pelo Gmail e pelo Outlook. Capturar os dois payloads de
      entrada. Responder por escrito em `plan.md`:
      (a) o resultado de DKIM/SPF vem no payload, e em que cabeçalho;
      (b) o `Message-ID` de saída é controlável ou é o do Postmark;
      (c) como o `StrippedTextReply` trata a assinatura do celular.
      Evidência: os dois payloads anonimizados em
      `apps/worker-transportada/test/fixtures/postmark-inbound.fixture.ts`.
- [ ] **T002** 🧠 Registrar o limite de 12 MiB da rota do webhook e a allowlist por
      `X-Forwarded-For` como achado datado em `docs/SECURITY.md`, e mudar a ADR-0063 para
      `aceita`. Evidência: o diff dos dois documentos.

## Fase 1 — Dados e contatos

> 🤖 Modelo: `sonnet`

- [ ] **T003** Migration `20260913120000_contractor_mail` com as cinco tabelas, a coluna em
      `delivery_charge_events` com o CHECK refeito, `emails_contractor` e o seed dos contatos,
      mais `rollback.sql`. Arquivos: `apps/api-transportada/drizzle/`, `src/database/contractor-mail.schema.ts`
      e `database.schema.ts`. Evidência: `make migration-test` verde.
- [ ] **T004** 🧠 Limite de corpo por rota em `http/request-handler.service.ts` (12 MiB só para a
      rota do webhook) e `maxRequestBodySize` do `server.service.ts`. Evidência: contrato que manda
      2 MiB para uma rota comum (413) e para o webhook (aceito).
- [ ] **T005** Contrato de tenant, **vermelho primeiro**:
      `test/contractor-mail-schema/tenant-safety.contract.ts`. Evidência: vermelho antes de T006,
      verde depois.
- [ ] **T006** CRUD de `contractor_contacts` dentro de `/contractors/:id`, com `settings.manage`.
      Arquivos: `delivery-clients/`, rotas, schema Zod e repositório. Evidência: contratos de rota,
      mais T005 verde.

## Fase 2 — Envio (P1)

> 🤖 Modelo: `sonnet`

- [ ] **T007** `reply-token.policy.ts` com teste: 128 bits, base32 minúsculo, hash SHA-256 e o
      endereço montado a partir de `INBOUND_REPLY_DOMAIN` (env validado, fail-closed).
- [ ] **T008** `send-occurrence-mail.use-case.ts` e `reply-to-thread.use-case.ts`, com o outbox na
      mesma transação. O corpo reaproveita o texto de `renderEmail` da 079. Evidência: teste de caso
      de uso com o repositório falso.
- [ ] **T009** Trilho `contractor-mail-outbound.v1` no worker: relay, consumidor e gateway Postmark
      por `fetch` injetado, com os cabeçalhos `Reply-To`, `In-Reply-To` e `References`. Evidência:
      contrato do gateway com o fake e integração com o outbox.
- [ ] **T010** Rotas `POST /trip-stop-occurrences/:id/mail`, `POST /mail-threads/:id/messages` e
      `GET /mail-threads`, com `trip.manage` e escopo `company`, mais a linha em
      `test/separator-role.contract.test.ts` (o separador **não** alcança). Evidência: contratos de
      rota.

## Fase 3 — Recebimento e decisão (P2)

> 🤖 Modelo: `sonnet` (T011 e T013 são 🧠 — revisar com `architect` em `opus` antes de fechar)

- [ ] **T011** 🧠 Webhook `POST /public/inbound-emails`: Basic Auth com `timingSafeEqual`,
      allowlist de IP, fail-closed sem env, gravação do bruto no bucket, a linha e o outbox numa
      transação, e 200 para token desconhecido sem gravar corpo. Evidência: contratos dos quatro
      caminhos, mais o contrato por texto de fonte de que nenhum log leva PII.
- [ ] **T012** `inbound-reply.policy.ts` e `auto-reply.policy.ts`, puros, dirigidos por tabela: todas
      as saídas do RF5 e todos os casos do RF8. Evidência: a suíte da política.
- [ ] **T013** 🧠 Trilho `contractor-mail-inbound.v1`: baixa o bruto, aplica a política, faz
      `FOR UPDATE` na taxa, grava a transição e o evento com `decided_by_message_id`, ou `late`.
      Evidência: integração no worker com os payloads do T001, incluindo a corrida contra o lote
      (duas decisões, uma vence).
- [ ] **T014** `submit-charge-by-mail.use-case.ts` e `POST /delivery-charges/:id/mail-submission`:
      o `submit` e o envio na mesma transação. Evidência: teste de caso de uso e contrato de rota.

## Fase 4 — A decisão se espalha (P3)

> 🤖 Modelo: `sonnet`

- [ ] **T015** Templates `CONTRACTOR_CHARGE_DECIDED_DRIVER` e `_DISPATCHER` em
      `notification-catalog.constant.ts` e no seed, mais o envio pelo worker depois da transição, com
      `dedupeKey` da mensagem. Evidência: integração com dois avisos na inbox.
- [ ] **T016** O feed de ocorrências da viagem (`trip-occurrence-feed.query.ts`) mostra a decisão da
      taxa com a origem "e-mail". Evidência: contrato da query.

## Fase 5 — Telas

> 🤖 Modelo: `sonnet`

- [ ] **T017** Contatos da contratante no formulário (`delivery-clients`), com os locales acentuados.
      Evidência: contrato de validação e `make check`.
- [ ] **T018** Painel "Conversa com a contratante" na ocorrência e na taxa: lista de mensagens com
      esqueleto, marca "decidiu", motivo de rebaixamento traduzido e caixa de resposta. Invalidação
      por `mutationInvalidation.service.ts`. Evidência: contratos de serviço puro e smoke Playwright
      do envio.
- [ ] **T019** Ação "Enviar para aprovação por e-mail" na tela de taxas, e o botão "Enviar à
      contratante" na ocorrência. Evidência: contrato de estado→ação (a ação só aparece com a taxa
      `recorded` e contato com `can_decide`).

## Fase 6 — Envio automático (P4)

> 🤖 Modelo: `haiku`

- [ ] **T020** `emails_contractor` no cadastro de tipo de ocorrência (API e tela), e o
      `register-trip-occurrence` chama o envio quando o campo está ligado. Evidência: teste de caso
      de uso.

## Fase 7 — Fechamento

> 🤖 Modelo: `opus` para a revisão; `haiku` para a documentação

- [ ] **T021** Revisão final com `code-reviewer` e `security-reviewer` em `opus`, mais a auditoria do
      §15 (N+1 na listagem de conversas, PII em log, 500 sem stack).
- [ ] **T022** `CLAUDE.md` (seção nova "A contratante conversa por e-mail") e `docs/SECURITY.md`
      atualizados.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/143-a-contratante-responde-por-e-mail/ (leia
spec.md, plan.md, tasks.md e docs/adr/0063-a-resposta-por-e-mail-decide-a-taxa.md antes de começar).
Uma task por vez, na ordem do tasks.md, num worktree próprio (make worktree NAME=spec-143).
Modelos: Fase 0 → opus (T001 exige conta Postmark e DNS: PARE e peça ao usuário) ·
Fases 1–5 → executor model=sonnet · T004, T011, T013 🧠 → validar com architect model=opus antes de
fechar · Fase 6 → executor model=haiku · revisão final → code-reviewer + security-reviewer model=opus.
Cada task fecha com typecheck + testes da app + commit isolado, evidência em evidence.md; teste
novo entra na lista do package.json.
Pare e pergunte antes de: deploy, configurar DNS/MX ou conta no Postmark, qualquer segredo,
migration destrutiva, e se o T001 mostrar que o Postmark não entrega o resultado de DKIM/SPF (o P2
fica desligado, e isso é decisão do usuário).
```

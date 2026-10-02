# Tasks — Feature 193

Uma task por vez, na ordem abaixo. Toda task fecha com quatro coisas:

- typecheck (`bun run typecheck` na raiz);
- os testes da app, pelo **entrypoint** indicado na task e conferido na lista explícita do
  `package.json`;
- um commit isolado com caminhos explícitos;
- a evidência em `evidence.md`.

O teste de aceite ou de contrato vem **antes** da implementação. Uma task de teste fecha quando os
testes novos **rodam e falham** pelo motivo certo, com a saída registrada.

**Regra de tela do usuário.** Toda task que muda tela roda primeiro no preview local:

- `motorista-local` na porta 53200, com `VITE_API_URL=http://localhost:53901`;
- `motorista-api-demo`, a API de demonstração em
  `/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada--claude-worktrees-pensive-borg-f59971/bb453e02-a58a-48b5-833a-3401376ec42e/scratchpad/driver-preview-api.ts`,
  que fica fora do repositório (o que mudar nela vai para `evidence.md`);
- `painel-local` na porta 53000.

Push de tela só depois do ok do usuário nos prints de 375 e 768 px.

**Três releases para produção** (plan.md), cada uma por PR `staging → main` com aprovação humana:

- **R1:** T3.1;
- **R2:** Fases 2 e 3, mais T6.1/T6.2;
- **R3:** telas.

A **R2 não sai** sem a R1 em produção.

**Entrypoints de teste:**

- API contrato: `bun --env-file=../../.env.test test --timeout 120000`. A integração é
  `bun --env-file=../../.env.test run test:integration`, sem a flag ela pula. Os dois rodam de
  dentro de `apps/api-transportada`.
- `make migration-test` para migration.
- Motorista: `bun run --cwd apps/frontend-driver check`.
- Painel: `bun run --cwd apps/frontend-transportada test` e `test:hooks`.

**Fora desta spec:**

- O item 3 do pedido (três botões iguais do canhoto, `6aef92ab6`) já foi entregue.
- **P0 — "o attach nunca descarta"** é task própria, criada pelo orquestrador, e é pré-requisito
  da Fase 4.

## Fase 1 — A fila tem lugar fixo no cabeçalho (só UI do motorista)

> 🤖 Modelo: `sonnet`

- [ ] **T1.1** Testes antes (CA13) em `test/driver-trip/queue-header.contract.ts`, importado em
      `test/driver-trip.contract.test.ts`. Casos:
  - `selectPendingTotal` soma o `total` e ignora item de outra conta;
  - `formatQueueBadge` devolve `''`, `'7'` e `'99+'`;
  - por texto de fonte, o botão vem antes de `NotificationBell` e chama
    `navigateToDriverSection('queue')`;
  - a classe nova está no `touch-target.contract.ts`.

  Aceite: os casos rodam e falham.

- [ ] **T1.2** Implementar conforme o plano, Fase 1, com locale pt-BR e en. Aceite: T1.1 verde e o
      `check` do motorista verde.

- [ ] **T1.3** Preview e smoke.
  - `PREVIEW_HOLD_QUEUE=1` na API de demonstração.
  - Três toques presos na fila.
  - `read_page` confirma "Fila de envio, 3 pendentes" em viagem, `/fotos`, `/fila` e `/perfil`, e
    que o toque abre `/fila`.
  - Caso novo no `driver-app.smoke.spec.ts`.

  Aceite: `bun run --cwd apps/frontend-driver smoke` verde, prints em `prints/` e o ok do usuário
  em `evidence.md`.

## Fase 2 — O banco guarda quem recebeu

> 🤖 Modelo: `sonnet` (T2.2 🧠 `opus`)

- [ ] **T2.1** Testes antes, em `test/trip-schema/received-by.contract.ts` (entrypoint
      `test/trip-schema.contract.test.ts`). Casos:
  - `RECEIVED_BY_OPTIONS` tem os dez códigos na ordem da D1;
  - `RECEIVED_BY_OPTIONS_REQUIRING_DETAIL` tem os dois códigos;
  - as colunas e os três CHECKs estão declarados;
  - o `receiver_check` exige `kind <> 'cargo'`;
  - `received_by` existe nas duas tabelas de configuração.

  Os dois contratos de tenant-safety do schema são atualizados. Aceite: os casos rodam e falham.

- [ ] **T2.2** 🧠 Migration conforme o plano, Fase 2:
  - verificação prévia de `cargo`, `office` e nome;
  - `rollback.sql` escrito à mão, que aborta com dado;
  - `static-migration.contract.ts` atualizado;
  - `db:generate` repetido dá `no_changes`.

  Aceite: T2.1 verde e `make migration-test` verde. O `make check` não cobre migration.

- [ ] **T2.3** Criar `test/database-migration/delivery-proof-received-by.assertion.ts`, ligado em
      `database-migration.integration.ts` (molde: `delivery-proof-cargo.assertion.ts`), para CA08 e
      CA14. Casos:
  - o CHECK recusa `cargo` com relação ou com nome;
  - a foto do motorista com nome passa;
  - a verificação prévia aborta;
  - o rollback aborta com dado.

  Aceite: `make migration-test` com as asserções novas listadas na saída.

## Fase 3 — A API recebe, aplica a configuração e devolve

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** **R1 — o painel tolera.**
  - `isDeliveryProof` aceita os campos novos, presentes ou ausentes.
  - `deliveryProofsFromApi` descarta só o item inválido.
  - `isDeliveryProofFieldSettings` lê `receivedBy` ausente como `optional`.

  Testes em `test/trip/delivery-proof.contract.ts` (entrypoint `test/trip.contract.test.ts`), com
  os dois formatos e um item inválido no meio da lista. Aceite: testes do painel verdes. Esta task
  vai para produção sozinha, como R1, com aprovação.

- [ ] **T3.2** Testes antes (CA01, CA02, CA04, CA05, CA06, CA19) em
      `test/trip-delivery-proof/received-by.contract.ts` (entrypoint
      `test/trip-delivery-proof.contract.test.ts`). Casos:
  - `normalizeReceivedBy`: nunca lança e cobre cada caso de forma;
  - `parseReceivedByStrict`: 400 com `details` em cada caso;
  - `applyReceivedBySettings`: nos canais × modos;
  - schema de configuração com o campo ausente;
  - o default é `optional`.

  O `delivery-proof-settings-tenant-safety.contract.ts` cobre a coluna nova. Aceite: os casos rodam
  e falham.

- [ ] **T3.3** Configuração: tipo, schema, repositório (ausente preserva, também por `taxId`),
      snapshot com o modo e `recipientDisplayName`. Aceite:
  - a parte de configuração da T3.2 verde;
  - integração em `me-trip.integration.ts` e `canhoto-ocr-flag.integration.ts` verde;
  - o `PUT` de exceção sem o campo preserva o valor.

- [ ] **T3.4** Escrita: forma, configuração, `carriesReceiverName`, lista fechada do escritório e
      erro novo. Integração para CA03, CA04 (o motorista com forma inválida recebe 201 e a linha
      `photo` fica gravada), CA05 e CA07, em `me-trip.integration.ts` e
      `trip-field-office.integration.ts`. Aceite: os dois comandos da API verdes.

- [ ] **T3.5** `PATCH .../proof/receiver` (CA06). Primeiro os testes: contrato do schema e
      integração com 200, `Idempotency-Key` repetida, 404 sem comprovante e linha `office`/`cargo`
      intocada. Depois a rota, o use case e o rate limit. Aceite: os dois comandos da API verdes e
      `rate-limited-routes.contract.test.ts` verde.

- [ ] **T3.6** Leitura e contratos negativos (CA09, CA10, CA11):
  - `DeliveryProofView` com os campos novos;
  - portal sem campo novo;
  - log;
  - auditoria do escritório sem o detalhe.

  Aceite: os dois comandos da API verdes.

## Fase 4 — O motorista diz quem recebeu, sem nunca perder a foto

> 🤖 Modelo: `sonnet`

- [ ] **T4.0** **Conferir os pré-requisitos.** O **P0** ("o attach nunca descarta", criado pelo
      orquestrador) e a **194 fases 1–3** precisam estar em `origin/staging`. Conferir com
      `git log origin/staging -- …DriverStopCard.component.tsx`. As decisões de tela já estão
      tomadas: select compacto (R1) e `required` como pendência não bloqueante (R2). Aceite: os
      hashes registrados em `evidence.md`. Se o P0 não estiver lá, **pare e avise**: sem ele, o campo
      novo descarta a foto.

- [ ] **T4.1** Testes antes (RF2, RF3, CA12, CA16) em `proof-fields.contract.ts`,
      `offline-attachments.contract.ts`, `offline-queue.contract.ts` e `catalog-parity.contract.ts`
      (entrypoint `test/driver-trip.contract.test.ts`). Casos:
  - `toDeliveryProof` com fallback por campo;
  - `listPendingReceiverFields` nunca bloqueia;
  - por texto de fonte, `blockedByFields` não recebe `receivedBy`;
  - `applyRecipientShortcut` para PF e PJ;
  - `receiverFields()`: trim, remoção de `\p{Cc}` e detalhe sem relação omitido;
  - `applyAttachmentReceiver`;
  - o kind `proofReceiver` faz o PATCH;
  - a comparação no `sent` enfileira `proofReceiver`;
  - item antigo drena;
  - as opções batem com as da API.

  Aceite: os casos rodam e falham.

- [ ] **T4.2** Implementar conforme o plano, Fase 4 (captura primeiro, bloco abaixo e o select compacto
      de R1), com locale pt-BR e en. Aceite: T4.1 verde e `check` do motorista verde.

- [ ] **T4.3** Preview e smoke. A API de demonstração ganha o modo `required`,
      `recipientDisplayName` PF/PJ e o PATCH. O smoke cobre:
  - a foto com o campo vazio entra na fila;
  - escolher "Vizinho(a)" depois, com o item na fila, atualiza o item;
  - o botão rápido.

  Aceite: smoke verde, prints e o ok do usuário.

## Fase 5 — O painel configura e mostra

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** Testes antes em `delivery-proof-settings-panel.contract.ts`,
      `delivery-proof.contract.ts`, `delivery-proof-panel.contract.ts`,
      `field-delivery-review.contract.ts` e `field-delivery-error-mapping.contract.ts` (entrypoint
      `test/trip.contract.test.ts`). Casos:
  - o quinto `Select` e o aviso de que a exceção vence;
  - relação, nome e detalhe tirados **da mesma linha**;
  - "não informado" em `required`;
  - o assistente renderiza sempre;
  - 400 e 422 no campo.

  Aceite: os casos rodam e falham.

- [ ] **T5.2** Implementar conforme o plano, Fase 5. Aceite: `test`, `test:hooks` e os contratos de
      design system (select, locale-accents) verdes.

- [ ] **T5.3** Preview no `painel-local`. Aceite: prints e o ok do usuário.

## Fase 6 — O motorista fala com o cliente

> 🤖 Modelo: `sonnet` (T6.5 🧠 `opus`)

- [ ] **T6.0** **Registrar o risco aceito.** O usuário decidiu Ligar + WhatsApp (R3) e "Ver contato"
      com auditoria (R4), e as decisões já estão na ADR-0079, Parte B, §4 e §5. O
      `docs/SECURITY.md` ganha a entrada datada: "número pessoal do motorista exposto ao cliente;
      número e e-mail do cliente retidos no aparelho do motorista, sem prazo — risco aceito pelo
      usuário em 2026-09-25". Aceite: a entrada no `SECURITY.md` e o `format:check` verde.

- [ ] **T6.1** Testes antes (CA17, CA19, CA11) em `test/driver-trip/recipient-contact.contract.ts`
      (entrypoint `test/driver-trip.contract.test.ts` da API). Casos:
  - `resolveDriverRecipientContact` devolve `null` com a nota fechada, com a viagem fechada ou sem
    contato;
  - `toE164Brazil` com 10, 11, 12/13 com 55 e lixo;
  - o e-mail inválido sai `null`;
  - o snapshot de outro motorista não traz contato (integração `me-trip.integration.ts`);
  - `trip-schema/tenant-safety.contract.ts` e `nfe-schema/tenant-safety.contract.ts` cobrem a
    consulta;
  - log;
  - `POST .../contact-reveals`: grava em `audit_logs` sem o contato, a `Idempotency-Key` repetida
    não duplica, e nota de outra viagem responde 404.

  Aceite: os casos rodam e falham.

- [ ] **T6.2** API conforme o plano (snapshot e `contact-reveals`). Aceite: os dois comandos da API verdes.

- [ ] **T6.3** Testes antes (CA18) no motorista, entrypoint `test/driver-trip.contract.test.ts`.
      Casos:
  - `buildRecipientContactLinks`: `tel:` só com E.164, `wa.me` só com celular de 11 dígitos e sem `?text=`,
    `mailto:` codificado;
  - a validação trata o campo ausente como `null`;
  - CSP: `https://wa.me` em `NON_FETCH_ORIGIN`;
  - o contato fica oculto até "Ver contato", e o toque enfileira `contactReveal`;
  - log.

  Aceite: os casos rodam e falham.

- [ ] **T6.4** `DriverStopContact.component.tsx`, locales `stopContact.*`, o botão "Ver contato" e a API de
      demonstração, que responde ao `contact-reveals` e manda com celular, fixo, `null` e nota entregue. O smoke cobre o card com contato.
      Aceite: `check` e smoke verdes, prints e o ok do usuário.

- [ ] **T6.5** 🧠 E-mail do destinatário (CA20). Pode ficar aberta com motivo.
  1. Merge e publicação do `adatechnology-packages#105`, **com pergunta ao usuário antes de
     publicar**.
  2. Bump na API e no worker (`0.3.0-rc.7` → `0.3.0`: ler o changelog).
  3. `nfe_participants.email` com migration aditiva, `rollback.sql` à mão e a cópia do schema do
     worker.
  4. Gravação em `drizzle-nfe-import-consumer.repository.ts`.
  5. `emailByParticipantId` em `nfe-party-contact-backfill.service.ts`.
  6. `resolveDeliveryContact` com o e-mail.
  7. E-mail no card e no `TripStopList`.

  Aceite: `make migration-test`, `make worker-integration`, os dois comandos da API e o `check` dos
  dois frontends verdes.

## Fase 7 — Revisão de design, documentação viva e gates

> 🤖 Modelo: `sonnet`

- [ ] **T7.1** Revisão de design (`web.md` §15) contra a própria página, nos dois apps. Itens:
  - a captura acima da dobra em 375 px;
  - o bloco "Quem recebeu" comparado com o nome e o documento;
  - o botão rápido comparado com os três botões do canhoto;
  - o contato comparado com o endereço;
  - o ícone da fila comparado com o sino;
  - o contraste nos dois estados.

  Aceite: os prints finais e o ok do usuário.

- [ ] **T7.2** Documentação viva:
  - o `CLAUDE.md` das apps tocadas;
  - o `docs/SECURITY.md`: detalhe livre, contato no aparelho, retenção pelos links e número do
    motorista;
  - a `079/tasks.md` com a T022 fechada;
  - a ADR-0079 "aceita";
  - prettier nos `.md`.

  Aceite: `bun run format:check` verde.

- [ ] **T7.3** Gates:
  - `make check`;
  - `make migration-test`;
  - os dois comandos da API;
  - `make worker-integration`, se a T6.5 tiver fechado.

  Push para staging só com rebase limpo, e as releases R1 → R2 → R3 para produção, cada uma com
  aprovação. Aceite: os gates registrados em `evidence.md`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/193-o-comprovante-diz-quem-recebeu/ (leia spec.md,
plan.md, tasks.md e docs/adr/0079-quem-recebeu-e-o-contato-do-destinatario.md antes de começar).
Uma task por vez, na ordem do tasks.md. O item 3 (três botões do canhoto) já foi entregue: não o refaça.
Modelos: Fase 1 → executor model=sonnet · Fase 2 → executor model=sonnet, T2.2 🧠 → opus ·
Fase 3 → executor model=sonnet · Fase 4 → executor model=sonnet · Fase 5 → executor model=sonnet ·
Fase 6 → executor model=sonnet, T6.5 🧠 → opus · Fase 7 → executor model=sonnet ·
revisão final → code-reviewer model=opus.
Cada task fecha com typecheck + o entrypoint de teste indicado na task + commit isolado com caminhos
explícitos, evidência em evidence.md. Migration fecha com `make migration-test`; integração da API
com `bun --env-file=../../.env.test run test:integration` (sem a flag, pula).
Decisões de tela já tomadas: select compacto abaixo da captura; "obrigatório" no motorista é
pendência que nunca trava (422 só no escritório); contato atrás de "Ver contato" com auditoria pela
fila; Ligar + WhatsApp, com o risco aceito pelo usuário.
Na T4.0, confira que o P0 "o attach nunca descarta" e a 194 fases 1–3 estão em origin/staging.
Se não estiverem, PARE e avise.
Toda task de tela roda primeiro no preview local (motorista-local na 53200 + motorista-api-demo;
painel-local na 53000) e só sobe depois de o usuário ver os prints de 375/768.
Produção em três releases (R1: T3.1 · R2: migration + API · R3: telas), cada uma por PR com aprovação;
a R2 não sai sem a R1 em produção.
Antes das Fases 1, 4 e 6, confira git log em DriverStopCard.component.tsx e useDriverTrip.hook.ts
(specs 192 e 194 mexem nos mesmos arquivos).
Pare e pergunte também antes de: deploy em produção, migration destrutiva, rollback em banco com
dado, publicação de pacote, qualquer [NEEDS CLARIFICATION], e todo push de tela sem o ok do usuário.
```

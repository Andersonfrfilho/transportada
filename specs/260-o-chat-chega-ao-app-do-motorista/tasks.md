# Tasks — 260 O chat chega ao app do motorista

> Cada task responde: **Mecânica?** (tudo descrito) · **Aceite por comando?** (tsc/teste/`make check`).
> Duas respostas "sim" → `haiku`. Gate de toda task: `tsc --noEmit` + testes da app + commit isolado.
> Escalada: gate falhou 2× → sobe um nível e registra em `evidence.md`. Teste novo entra na lista
> explícita do `package.json` da app.

## Fase 0 — Conferir o SDK antes de escrever (ADR-0072 T101: conferir, parar se faltar)

> 🤖 Modelo: `sonnet` (T0.3 é 🧠)

- [x] **T0.1** `sonnet` — Conferir no `adatechnology-packages` o que a versão publicada oferece para o
      participante: `ConversationsApi`, `ConversationsProvider`, `MessageBubble`, composer, `StatusTicks`,
      canal `app` em `getChannelCapabilities`. Saída: tabela "tem / falta" em `evidence.md`. **Falta algo →
      vira task da Fase 1, nunca contorno no produto.**
- [x] **T0.2** `sonnet` — Medir o bundle: o export `/participant` não pode puxar `@xyflow/react` nem o
      workspace de operador. Aceite: `tsup` + análise de tamanho no `evidence.md`.
- [x] **T0.3** 🧠 `opus` — Desenho da API pública da visão do participante (`ParticipantConversations`
      props, `ParticipantConversationSummary`, métodos novos de `ConversationsApi`, `subjectGroups`). **É
      contrato que três apps herdam** — validar com `architect` antes de T1.x. **Feita:** contrato em [`contract.md`](contract.md).

## Fase 1 — A visão do participante no SDK (repo `adatechnology-packages`)

> 🤖 Modelo: `sonnet` (T1.0a, T1.1 e T1.7 → `haiku`; T1.8 é 🧠). **Implementa contra [`contract.md`](contract.md).**
> ⚠️ O `adatechnology-packages` está com árvore suja de outras sessões (`pnpm-lock.yaml`, pacotes novos não
> rastreados): trabalhar em **worktree próprio** dali, nunca na árvore principal.

- [x] **T1.0a** `haiku` — `ConversationChannel` da UI deriva do contracts (`Core | 'messenger' | 'instagram'`) +
      entradas de exibição de `app`/`portal` em `CHANNEL_CAPABILITIES` + teste: `channelCapabilityFor('app')` dá
      25 MB, grava áudio, sem janela; `portal` dá `records: false`; canal novo no contracts sem entrada na UI
      reprova no `tsc`.
- [x] **T1.0b** `sonnet` — `MessagePayload.status?: MessageDeliveryStatus`; `StatusTicks` ganha `queued`
      (relógio), `bounced` vira `failed`, cores Tailwind viram `.cv-status-ticks--*`; `MessageText` →
      `.cv-message-text`. Teste de renderização sem Tailwind (classe presente, utilitária ausente).
- [x] **T1.0c** `haiku` — (achado da T1.0b) o span "Copiado!" do `MessageText` ainda era Tailwind: virou `.cv-message-text__copied`.
- [x] **T1.1** `haiku` — `conversation-contracts/src/participant.ts`: `ParticipantSubjectRef`,
      `ParticipantConversationSummary`, `ParticipantConversationPage`, `ParticipantMessage`,
      `ParticipantAttachment` + schemas zod + `SUBJECT_TYPE_PATTERN`. Testes: padrão, `lastMessageAt: null`,
      `status` fora do vocabulário (recusa). Changeset minor (0.4.0).
- [x] **T1.2** `sonnet` — Teste **antes** de `participantGrouping`: precedência encerrada › espera › grupo ›
      "Outros"; ordem do array; data decrescente com `null` por último; desempate por `subjectLabel`;
      contagem de não lidas por filtro; nenhuma conversa em duas seções. Vermelho primeiro; depois implementar.
- [x] **T1.3** `sonnet` — `useParticipantInbox` e `useParticipantThread`: paginação `before`; fusão servidor ∪
      `pendingMessages` ∪ memória por `clientMessageId` (pura, testada); `markRead` só com foco e
      `visibilityState === 'visible'`; revalidação em `focus`/`online` sem `subscribe`.
- [x] **T1.4** `sonnet` — `ParticipantInbox`, `ParticipantThread`, **`ParticipantMessageBubble` e
      `ParticipantComposer` novos em `.cv-p-*`** (nada de `MessageBubble`, `MessageComposer`, `ConversationPane`;
      reaproveitar só funções puras, `MessageText`, `StatusTicks`). Testes: `isMine = direction === 'inbound'`,
      `aria-live`, alvo ≥ 44 px, slot ausente = nada desenhado. **Sem microfone na v1.**
- [x] **T1.5** `sonnet` — `src/participant/index.ts`, `exports["./participant"]`, entrada no `tsup` no `build` **e
      no `build:watch`**; `buildOutput.test.ts` afirma sem `xyflow`, sem `ConversationsWorkspace`, ≤ 250 KB;
      teste de que renderiza **sem** `ConversationsProvider`; README: "monte uma vez acima das duas rotas".
- [x] **T1.6** `sonnet` — Rascunho por assunto (chave `subjectType:subjectId`); chips preenchem e não enviam;
      teto de anexo de `channelCapabilityFor(channel).attachments` + `resolveMaxAttachmentSizeBytes`; recusa
      antes do envio **sem esvaziar o rascunho**; reenvio repete o mesmo `clientMessageId`.
- [x] **T1.7** `haiku` — Changeset **minor, sem pre mode** (contracts 0.4.0, UI 0.5.0); README com exemplo de
      adapter REST e aviso de `ConversationChannel` ampliado para quem tem `switch` exaustivo.
- [x] **T1.8a** `sonnet` — (passe opus: **REPROVADO**, ver `evidence.md`) **Envio, fila e rascunho:** limpar o campo ao
      enviar (a bolha é a dona do conteúdo; texto+`File[]` vão para a pendente local); falha → bolha `failed` com
      reenviar (mesmo `clientMessageId`), "descartar" e "editar" (devolve ao rascunho); `localPending`/`sentRecords`
      sobem para `ParticipantConversations`, por assunto; `queued` mantém a pendente local até o host/servidor a
      refletirem; `resolveAttachmentUrl` com `this` preservado; `reset` da conversa sem depender da identidade de
      `api`; `markRead` reage a `visibilitychange` (com `subscribe` também) e revalida em `online`; reenviar só
      quando houver como (falha do servidor e host sem `onRetryPending` = só "Falhou"). Atualizar o teste da T1.6.
- [x] **T1.8b** `sonnet` — **Estados e navegação:** rolar até a última mensagem ao abrir/ao chegar (se já estava
      perto do fundo) e preservar a posição ao carregar antigas; estados `loading`/`error` com "tentar de novo"
      na inbox e na conversa (`aria-busy`); paginação da inbox (`loadMore`, `loaded` sem descartar páginas
      anexadas); `isSending` e `newMessagesCount` ligados e **obrigatórios** no `ParticipantThread` interno;
      `MessageText` com `copyOnClick?`/`copiedLabel?` (visão do participante não copia ao tocar) e sem
      `user-select: all`; README e contrato: eco de `clientMessageId` obrigatório, `api` estável, adapter com
      `schema.parse` + `encodeURIComponent`, changeset avisando que `styles.css` é requisito.
- [x] **T1.8c** `sonnet` — **Operacional:** `npm pack` dos dois pacotes, `file:` nos três apps em worktree
      descartável, `make check` e smoke do painel e do portal.
- [x] **T1.8d** 🧠 `opus` — **Re-passe de revisão** dos achados ALTO/bloqueantes corrigidos; só então PR → `main` →
      `publish.yml` (**parar e pedir aprovação** antes do merge em `main`: publica pacote público no npm). **Re-passe: APROVADO COM RESSALVAS** — corrigidas em T1.8e; falta o aceite do usuário para o merge.
- [x] **T1.8e** `sonnet` — (ressalvas do re-passe) contagem de "novas" sem histórico, `sent` até o eco, `aria-live`
      sempre na árvore, allowlist de URL de anexo, docs do host e changeset. Commit `a26f10a`.
- [x] **T1.8** 🧠 `opus` — **Passe de revisão obrigatório** antes de qualquer versão sair. Antes do merge: `npm
pack` dos dois pacotes, `file:` nos três apps em worktree descartável, `make check` e smoke do painel e do
      portal. Só então PR → `main` → `publish.yml`; conferir no npm pelo tarball.

- [x] **T1.9** `sonnet` — **Protocolo no SDK (D8, RF14):** `protocol?: string` (1..32, `[A-Za-z0-9-]`) em
      `ParticipantConversationSummary` + schema; `ParticipantInbox` mostra o protocolo na linha (mono, discreto) e
      `ParticipantThread` no cabeçalho, com botão de copiar (≥ 44px, `aria-live` "protocolo copiado", label por
      prop `labels.copyProtocol`/`protocolCopied`); filtro de busca por protocolo na lista (função pura
      `matchesProtocolQuery`: sem traço, sem caixa, parcial); ausente = nada desenhado. Changesets minor
      (contracts 0.5.0, UI 0.6.0). **Novo ciclo de publicação:** passe de revisão `opus` (diff pequeno) e
      aprovação do usuário antes do merge.
- [x] **T1.9b** `sonnet` — **Canais e ícone do assunto no SDK (D9, RF15), no MESMO branch/release da T1.9:** `channels?` e
      `iconName?` em `ParticipantConversationSummary` + schema; selos de canal (lucide, ícone + texto sr-only,
      `labels.channelApp/Whatsapp/Email/Portal/Webchat`) na linha e no cabeçalho; prop `renderSubjectIcon?` na tela
      composta (ausente = ícone do grupo); testes SSR; README; mesmo changeset. Passe `opus` do delta.
- [x] **T1.10** `sonnet` — Subir os 3 apps para a versão nova do `conversations-ui` (alinhar) e ligar o protocolo.

## Fase 1b — Plugar nos apps (alinhar versões)

> 🤖 Modelo: `sonnet` (T1b.1 → `haiku`)

- [x] **T1b.1** `haiku` — Dois commits: (a) `frontend-transportada` e `frontend-client` saem de 0.3.1 para 0.5.0,
      com `make check` e smoke **antes** de qualquer tela nova; (b) `frontend-driver` declara `conversations-ui@0.5.0`
      e `conversation-contracts@0.4.0`, e `frontend-client` ganha `conversation-contracts@0.4.0`. Limpar
      `node_modules` aninhado se o export novo não aparecer.
- [x] **T1b.2** `sonnet` — Fiação no `frontend-driver`: `driverConversationsApi.service` sobre as rotas `/me` da
      183 (`subjectType: 'occurrence'`, `subjectId` = id da ocorrência), validando a resposta com os schemas do
      contracts; **fallback tolerante e temporário** de `subjectLabel` e `awaitingParticipant` (última mensagem
      `outbound` posterior à última `inbound`) até a API trazer os campos; `DriverConversations.page` (≤ ~150
      linhas) monta `<ParticipantConversations>` **uma vez** para `/conversas` e
      `/conversas/:subjectType/:subjectId`; `driverSubjectGroups.constant`; locales `pt-BR`/`en`; aba com selo;
      o sino só navega.
- [x] **T1b.3** `sonnet` — Offline (D5): `conversationOutbox.service` usa o `clientMessageId` como
      `Idempotency-Key`; offline, `sendMessage` devolve `{ outcome: 'queued' }`; hook lê a fila e alimenta
      `pendingMessages`; esvaziar a fila emite `conversation-changed`; liga `onRetryPending`. Teste: mesma chave
      duas vezes = uma bolha.
- [x] **T1b.8** `sonnet` — (achado no navegador) com a conversa aberta o app NUNCA mostrava a resposta do escritório:
      `subscribe` só emitia eventos do outbox e o pacote desliga a revalidação de janela quando `subscribe` existe.
      Ticker de revalidação (15 s, só visível, ciclo imediato em `online`/`focus`/`visibilitychange`, backoff,
      um timer para todos os assinantes) + `diffConversationSnapshots`. Commit `1b7bc9b08`. Gancho
      `requestConversationRefresh()` pronto para o sino (hoje o app não usa SSE de notificação).
- [x] **T1b.9** `sonnet` — (achado no navegador) o campo de resposta ficava abaixo da janela (y=771 em 766) e a barra
      inferior fixa cobria o fim; o toque no campo caía na aba "Conversas". A conversa agora ocupa a altura visível
      acima da barra (`--driver-bottom-bar-height`). Commit `2244f20a5`.
- [x] **T1b.10** `sonnet` — **Protocolo no app e na demo (D8):** adapter mapeia `protocol` da API; API de demonstração
      devolve protocolos `AAMMDD-XXXX`; conferir no navegador (cabeçalho, lista, copiar, busca). Até a API
      (T2.4) servir o campo, o adapter **não inventa** protocolo: sem campo, nada aparece.
- [x] **T1b.11** `sonnet` — **Canais e ícone no app (D9):** adapter mapeia `channels` e `iconName`; `renderSubjectIcon` usa o
      `<Icon name>` do app (catálogo da 255); labels pt-BR dos canais; API de demonstração devolve `channels`
      (`app`, `whatsapp`) e `iconName` por conversa; conferir no navegador.
- [ ] **T1b.7** `sonnet` — (achado da T1b.3) o outbox de mensagens fica no aparelho depois de "Sair" com pendência; o
      escopo por `subHash` impede o próximo motorista de ver/enviar, mas o dado (texto e fotos) permanece. Decidir e
      implementar o descarte/aviso no logout (requisito LGPD/segurança §1 e §5).
- [ ] **T1b.4** `sonnet` — **Prova de "plugar em outro app" (RF13):** o portal da contratante usa
      `<ParticipantConversations channel="portal">` (o microfone some sozinho) com um `ParticipantConversationsApi`
      próprio e um `subjectGroups`. Precisar mudar o pacote reprova a task.
- [ ] **T1b.5** `sonnet` — Smoke Playwright do `frontend-driver`: abrir pelo sino, responder, responder offline
      (porta sintética 53112; ver CLAUDE.md raiz).
- [ ] **T1b.6** `sonnet` — **Gate e primeira publicação em staging**: `make check`; o interruptor
      `VITE_DRIVER_APP_URL` segue como está. Evidência em `evidence.md`.

## Fase 2 — Assunto, protocolo, canais e ícone na API ([ADR-0101](../../docs/adr/0101-a-conversa-tem-assunto-e-protocolo.md))

> 🤖 Modelo: `sonnet` (T2.0 e T2.7 → `haiku`; T2.1 foi 🧠 e está **feita**). **Regra do dono: tudo aditivo — as rotas e o
> comportamento atuais da conversa de ocorrência (app, portal da contratante, WhatsApp, e-mail 143) ficam idênticos.**
> A API **não tem OpenAPI** (`apps/api-transportada/CLAUDE.md:71`): em vez dele, contrato sobre a tabela de rotas e
> documentação em `docs/ai-context/api-transportada.md`.

- [x] **T2.1** 🧠 `opus` — Modelo de dados e contrato: [ADR-0101](../../docs/adr/0101-a-conversa-tem-assunto-e-protocolo.md)
      (assunto em `occurrence_conversations` por colunas aditivas + CHECK de forma; protocolo gerado pelo banco por
      trigger; `channels`/`iconName`/`awaitingDriver`/`subjectLabel` derivados na leitura; `client_message_id` nas
      mensagens; rotas novas, antigas intactas). Saída do arquiteto `opus`; conferida contra o código.
- [x] **T2.0** `haiku` — `frontend-driver`: `notificationDestination.service` aceita também `trip.subject-conversation-message`
      (+ teste). **Publicar o app ANTES da API** (ADR-0081 §9: app tolerante → API → telas).
- [ ] **T2.2** `sonnet` — **Contratos antes** (vermelho primeiro): BOLA (nota/viagem alheia → `404 CONVERSATION_NOT_FOUND`, mesmo
      código para empresa errada, inexistente e viagem alheia); encerrada → `409 CONVERSATION_CLOSED` (nota liberada, viagem
      cancelada/concluída, `closed`); `open` idempotente (201 e depois 200); **rota antiga intacta** (resposta exata da lista e
      das mensagens antes e depois); mutação de A5 (os casos de uso novos não importam nada de `trip_occurrence_cases`, taxa
      ou acerto); alfabeto do TS = alfabeto do CHECK; teste de que toda rota nova está na tabela de rotas com política e limite.
- [x] **T2.3a** `sonnet` — **Migration `conversation_subject`** (aditiva): `subject_type` (padrão `occurrence`, CHECK por `inList`),
      `trip_id`/`trip_document_id` (FK compostas com `company_id`), `occurrence_kind`/`occurrence_id` nuláveis, CHECK de forma,
      únicos parciais de nota e viagem, índices de leitura, `client_message_id` (CHECK + único parcial) e `conversation_id`
      nos envios de arquivo; schema Drizzle; estreitamento de tipo (`string | null`) com o `tsc` como checklist; filtro
      `subject_type = 'occurrence'` em `listMyConversations` e em `applyDriverStatus(occurrenceId = null)`; `insertMessage`
      grava a `idempotencyKey`; `rollback.sql` (recusa se houver conversa de nota/viagem ou envio por `conversation_id`);
      `make migration-test`.
- [x] **T2.3b** `sonnet` — **Migration `conversation_protocol`**: coluna `protocol` (padrão `''` como sentinela), funções PL/pgSQL, backfill por
      `created_at`, CHECK de formato, `UNIQUE (company_id, protocol)`, triggers `BEFORE INSERT` (sorteio com até 5
      tentativas) e `BEFORE UPDATE` (imutável) **criados por último**; teste de colisão forçada com `setseed`, de
      esgotamento (23505) e de imutabilidade; medir `count(*)` de `occurrence_conversations` em produção antes (relatar);
      `rollback.sql` (perda declarada dos protocolos); `make migration-test` aplica e reverte as duas migrations.
- [x] **T2.4** `sonnet` — **Rotas do motorista** `/me/trips/current/conversations` (lista paginada por cursor), `.../open`,
      `.../:subjectType/:subjectId/messages|messages/read|uploads`; `findMySubject` (BOLA + `retarget`); consulta em lote
      (`driver-conversation-subject.query.ts`) com `subjectLabel`, `protocol`, `channels`, `iconName`, `awaitingDriver`,
      `status` efetivo, `lastMessagePreview`; eco de `clientMessageId` relendo a mensagem na repetição; política pura de
      rótulo (`conversation-subject-label.policy.ts`); erros `CONVERSATION_NOT_FOUND` e `CONVERSATION_CLOSED`; limites
      compartilhados com as rotas antigas; **rotas antigas intactas**.
- [x] **T2.4b** `sonnet` — **Rotas do escritório** `/trips/:tripId/conversations/**` (`open`, mensagens, envio de arquivo, `close`), leitura por
      `POST /occurrence-conversations/:id/read`, escrita em nota/viagem com `trip.manage`, `retarget` no envio.
- [x] **T2.5** `sonnet` — **Aviso do sino**: `trip.conversation-message` ganha campos extras no `payload` (`subjectType`,
      `subjectId`, `subjectLabel`, `protocol`) sem mudar template nem `dedupeKey`; **chave nova**
      `trip.subject-conversation-message` (nota e viagem) no catálogo e no preview; `noticeLabel` sem nome de pessoa.
- [ ] **T2.5b** `sonnet` — (**depende de decisão do dono**) texto do D7 para o aviso da ocorrência, por `UPDATE` só onde o texto ainda é o
      do seed original. Fora do caminho crítico.
- [x] **T2.6** `sonnet` — **Integração**: `bun --env-file=../../.env.test run test:integration` nos arquivos tocados (migration, lista,
      `open`, `retarget`, colisão, envio de arquivo por `conversation_id`, limpeza de teste frente às FKs restrict).
      Contrato verde **não** basta; banco indisponível = parar e relatar, nunca publicar.
- [ ] **T2.7** `haiku` — O adapter do app passa às rotas novas e remove os remendos de `awaitingParticipant` e do eco
      (T1b.2) — **só depois da API em produção**.

## Fase 3 — O escritório abre e vê

> 🤖 Modelo: `sonnet`

- [x] **T3.1** `sonnet` — Botão "Falar com o motorista" na nota (detalhe da viagem) e na viagem; abre/
      reabre a conversa (`open` idempotente).
- [x] **T3.2** `sonnet` — A conversa do assunto na aba do motorista do painel (mesma `Thread`), com o
      botão de encerrar.
- [x] **T3.3** `sonnet` — Motorista abre conversa de nota/viagem pelo app ("Falar com o escritório" no
      cartão da nota e no topo da viagem) com o rate limit de `open`.

## Fase 4 — Revisão de design e usabilidade (obrigatória, termina a spec)

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** `sonnet` — Print do app real (celular 375 px, tema escuro, lista e conversa) **lado a lado
      com `preview.html`** (web.md §15); divergências viram ajuste, não nota.
- [ ] **T4.2** `sonnet` — Passe de usabilidade: alvo ≥ 44 px, leitor de tela na lista e na bolha, contraste,
      motorista com uma mão, 30 conversas sem rolar demais; resultado em `evidence.md`.
- [ ] **T4.3** `sonnet` — Medida em staging: abrir pelo sino, enviar, enviar offline; atualizar
      `docs/ai-context/frontend-driver.md` e `docs/ai-context/api-transportada.md` (CLAUDE.md §14 do
      code-standart) e o CLAUDE.md da app com o núcleo normativo.

## Fase 5 — Mensagens prontas do motorista (D11)

> 🤖 Modelo: `sonnet`. Regra do dono: tudo aditivo; o cadastro e o uso atuais das respostas rápidas do escritório ficam idênticos.

- [ ] **T5.1** `sonnet` — **API:** migration aditiva (`CHECK` de `company_quick_replies.audience` aceita `driver_reply`, com `rollback.sql` que recusa se
      houver linha dele); `COMPANY_QUICK_REPLY_AUDIENCES` ganha o valor sem mexer em `OccurrenceConversationParticipant`; as rotas
      `/company-settings/quick-replies` aceitam o público novo (zod); rota `GET /me/trips/current/quick-replies` (`trip.read`, `no-store`,
      só ativas, ordem do cadastro); contrato (as rotas e respostas antigas idênticas — golden), tabela de rotas, integração com banco, `make migration-test`.
- [ ] **T5.2** `sonnet` — (**A feita**; B pendente: diálogo com `ConversationThread`) **Painel:** seção "Respostas do motorista" nas configurações (mesmo cadastro: criar, editar, ativar/desativar, ordenar) +
      chips das respostas do público `driver` no compositor da conversa do escritório por assunto (T3.1/T3.2); sem mudar a conversa de ocorrência.
- [x] **T5.3** `sonnet` — **App do motorista:** adapter + query com cache da última lista (offline), `quickReplies` passado ao pacote, rota na API de
      demonstração, locales, testes e smoke (chips visíveis, tocar preenche e NÃO envia, offline usa a lista guardada).

- [x] **T5.4** `sonnet` — **Estados de entrega (ticks) da mensagem do motorista:** API deriva `delivered`/`read` nas rotas novas
      (`api-contract.md` § "Estados de entrega"), app repassa e mostra relógio/✓/✓✓ cinza/✓✓ azul/reenviar, demo API com `office-read`;
      contrato, integração com banco e smoke "ticks" + "falha" provados por mutação (`evidence.md` § T5.4).
- [x] **T5.5** `sonnet` — **✓✓ azul com a conversa aberta:** o resumo da lista e do `/open` ganham `officeReadAt` (em lote, sem N+1); o snapshot do
      refresh de 15 s o compara e dispara `conversation-changed`; demo API o devolve; contrato, integração, app e smoke "ticks sem recarregar"
      provados por mutação (`evidence.md` § T5.5).

**Fora das tasks (aprovação humana):** produção (PR staging→main) e remover a tela antiga do painel
(Fase 10 da 189).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/260-o-chat-chega-ao-app-do-motorista/ (leia spec.md,
plan.md e tasks.md antes de começar; leia também specs/183-*, 189-* e 248-*). Crie o próprio worktree
(make worktree NAME=spec-260); a Fase 1 roda no repo ~/Documents/personal/adatechnology-packages, em
branch própria e PR próprio, e NÃO publica versão sem o passe opus. Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet (T0.3 🧠 → opus, validar com architect) · Fase 1 → executor
model=sonnet (T1.1/T1.7 haiku; T1.8 🧠 → opus) · Fase 1b → sonnet (T1b.1 haiku) ·
T2.1 🧠 → opus (validar com architect antes de implementar) · Fase 2 → executor model=sonnet
(T2.7 haiku) · Fases 3 e 4 → executor model=sonnet · revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com tsc --noEmit + testes da app (script `test` do package.json, nunca `bun test` cru)
+ commit isolado, evidência em evidence.md. Task de API que toque integração só fecha com
`bun --env-file=../../.env.test run test:integration`. Lote com migration roda make migration-test.
Antes de publicar: git fetch, rebase em origin/staging, bun install --frozen-lockfile, gates,
prettier nos .md; conferir numeração de spec/ADR/migration contra origin/staging.
Pare e pergunte antes de: deploy em produção, migration destrutiva, remover a tela antiga do painel,
qualquer [NEEDS CLARIFICATION].
```

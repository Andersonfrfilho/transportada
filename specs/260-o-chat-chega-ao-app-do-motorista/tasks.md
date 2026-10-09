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
- [ ] **T1.8** 🧠 `opus` — **Passe de revisão obrigatório** antes de qualquer versão sair. Antes do merge: `npm
pack` dos dois pacotes, `file:` nos três apps em worktree descartável, `make check` e smoke do painel e do
      portal. Só então PR → `main` → `publish.yml`; conferir no npm pelo tarball.

## Fase 1b — Plugar nos apps (alinhar versões)

> 🤖 Modelo: `sonnet` (T1b.1 → `haiku`)

- [ ] **T1b.1** `haiku` — Dois commits: (a) `frontend-transportada` e `frontend-client` saem de 0.3.1 para 0.5.0,
      com `make check` e smoke **antes** de qualquer tela nova; (b) `frontend-driver` declara `conversations-ui@0.5.0`
      e `conversation-contracts@0.4.0`, e `frontend-client` ganha `conversation-contracts@0.4.0`. Limpar
      `node_modules` aninhado se o export novo não aparecer.
- [ ] **T1b.2** `sonnet` — Fiação no `frontend-driver`: `driverConversationsApi.service` sobre as rotas `/me` da
      183 (`subjectType: 'occurrence'`, `subjectId` = id da ocorrência), validando a resposta com os schemas do
      contracts; **fallback tolerante e temporário** de `subjectLabel` e `awaitingParticipant` (última mensagem
      `outbound` posterior à última `inbound`) até a API trazer os campos; `DriverConversations.page` (≤ ~150
      linhas) monta `<ParticipantConversations>` **uma vez** para `/conversas` e
      `/conversas/:subjectType/:subjectId`; `driverSubjectGroups.constant`; locales `pt-BR`/`en`; aba com selo;
      o sino só navega.
- [ ] **T1b.3** `sonnet` — Offline (D5): `conversationOutbox.service` usa o `clientMessageId` como
      `Idempotency-Key`; offline, `sendMessage` devolve `{ outcome: 'queued' }`; hook lê a fila e alimenta
      `pendingMessages`; esvaziar a fila emite `conversation-changed`; liga `onRetryPending`. Teste: mesma chave
      duas vezes = uma bolha.
- [ ] **T1b.4** `sonnet` — **Prova de "plugar em outro app" (RF13):** o portal da contratante usa
      `<ParticipantConversations channel="portal">` (o microfone some sozinho) com um `ParticipantConversationsApi`
      próprio e um `subjectGroups`. Precisar mudar o pacote reprova a task.
- [ ] **T1b.5** `sonnet` — Smoke Playwright do `frontend-driver`: abrir pelo sino, responder, responder offline
      (porta sintética 53112; ver CLAUDE.md raiz).
- [ ] **T1b.6** `sonnet` — **Gate e primeira publicação em staging**: `make check`; o interruptor
      `VITE_DRIVER_APP_URL` segue como está. Evidência em `evidence.md`.

## Fase 2 — Assunto na conversa (API)

> 🤖 Modelo: `sonnet` (T2.1 é 🧠 — validar com `opus`/`architect` antes de implementar)

- [ ] **T2.1** 🧠 `opus` — Desenho final do modelo de dados (D2): colunas/checks/índice único, decisão de
      manter `occurrence_conversations` vs tabela de assunto, política de `retarget` e de nota liberada.
      Saída: ADR curto (`docs/adr/0101-…`) — confirmar o número em `origin/staging` antes. **Decisão que as
      demais herdam.**
- [ ] **T2.2** `sonnet` — Contratos negativos antes: BOLA (nota/viagem alheia → 404), encerrada → 409,
      `open` idempotente, a conversa não decide (mutação).
- [ ] **T2.3** `sonnet` — Migration aditiva + backfill + `rollback.sql` + `make migration-test`.
- [ ] **T2.4** `sonnet` — Rotas `/me/trips/current/conversations/**` e `findMySubject`; rotas antigas
      intactas; OpenAPI gerado; teste de que toda rota aparece no documento.
- [ ] **T2.5** `sonnet` — Aviso do sino com assunto (D7); `awaitingDriver` e `subjectLabel` no servidor.
- [ ] **T2.6** `sonnet` — Integração: `bun --env-file=../../.env.test run test:integration` nos arquivos
      tocados (contrato verde **não** basta). Banco indisponível = parar e relatar, nunca publicar.
- [ ] **T2.7** `haiku` — O adapter do app passa a ler `subjectType/subjectLabel/awaitingDriver` da lista nova e remove os fallbacks da T1b.2 (tolerante → API → telas,
      ADR-0081 §9); remover o fallback só depois da API em produção.

## Fase 3 — O escritório abre e vê

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** `sonnet` — Botão "Falar com o motorista" na nota (detalhe da viagem) e na viagem; abre/
      reabre a conversa (`open` idempotente).
- [ ] **T3.2** `sonnet` — A conversa do assunto na aba do motorista do painel (mesma `Thread`), com o
      botão de encerrar.
- [ ] **T3.3** `sonnet` — Motorista abre conversa de nota/viagem pelo app ("Falar com o escritório" no
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

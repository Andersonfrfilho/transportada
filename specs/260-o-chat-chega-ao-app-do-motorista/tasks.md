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
- [ ] **T0.3** 🧠 `opus` — Desenho da API pública da visão do participante (`ParticipantConversations`
      props, `ParticipantConversationSummary`, métodos novos de `ConversationsApi`, `subjectGroups`). **É
      contrato que três apps herdam** — validar com `architect` antes de T1.x.

## Fase 1 — A visão do participante no SDK (repo `adatechnology-packages`)

> 🤖 Modelo: `sonnet` (T1.1 e T1.7 → `haiku`; T1.8 é 🧠)
> ⚠️ O `adatechnology-packages` está com árvore suja de outras sessões (`pnpm-lock.yaml`, pacotes
> novos não rastreados): trabalhar em **worktree próprio** dali, nunca na árvore principal.

- [ ] **T1.0a** `haiku` — (achado da T0.1) `ConversationChannel` da UI (`conversationChannel.ts:15-22`) não
      tem `app` nem `portal`, e `channelCapabilityFor('app')` cai na regra do WhatsApp. Acrescentar os dois
      canais, derivando a capacidade de `getChannelCapabilities` do `conversation-contracts`. Teste antes.
- [ ] **T1.0b** `sonnet` — (achado da T0.1) `MessagePayload.status` (`types.ts:75`) e `StatusTicks` não têm
      `queued`. Acrescentar o estado e o selo "na fila", sem quebrar os consumidores atuais (união ampliada).
- [ ] **T1.1** `haiku` — Tipos do contrato em `conversation-contracts` (`ParticipantConversationSummary`,
      vocabulário de `subjectType` opaco) + export + teste de vocabulário. Aceite: `bun test` + `check`.
- [ ] **T1.2** `sonnet` — Teste **antes**: `participantGrouping` (agrupa por `subjectType`, ordem de
      `subjectGroups`, "Espera sua resposta", encerradas, desempate por data). Vermelho primeiro.
- [ ] **T1.3** `sonnet` — Implementar `participantGrouping` + `useParticipantInbox` até verde.
- [ ] **T1.4** `sonnet` — `ParticipantInbox` e `ParticipantThread` (mobile-first, `.cv-*`, sem Tailwind,
      `aria-live`, alvo ≥ 44 px, slots por ausência de prop) com testes de renderização.
- [ ] **T1.5** `sonnet` — `ParticipantConversations` (tela composta) + export `/participant` + `labels`
      default + build `bun run build` (não `bunx tsup`).
- [ ] **T1.6** `sonnet` — Rascunho por conversa em memória + chips de resposta rápida + anexo (limites do
      canal `app` vindos de `getChannelCapabilities`, não de constante nova).
- [ ] **T1.7** `haiku` — Changeset (pre-mode, tag `rc`) + README do export com exemplo de plugar em um app.
- [ ] **T1.8** 🧠 `opus` — **Passe de revisão obrigatório** (rule §5 do pacote) antes de qualquer versão
      sair; publicar via PR → `main` → CI → `publish.yml`; conferir no npm pelo tarball.

## Fase 1b — Plugar nos apps (alinhar versões)

> 🤖 Modelo: `sonnet` (T1b.1 → `haiku`)

- [ ] **T1b.1** `haiku` — Subir `conversations-ui` para a versão publicada nos **três** consumidores
      (`frontend-driver` entra, `frontend-transportada` e `frontend-client` saem de 0.3.1);
      `bun install --frozen-lockfile`; limpar `node_modules` aninhado se o export novo não aparecer.
      Aceite: `make check` verde e smoke do painel e do portal sem regressão.
- [ ] **T1b.2** `sonnet` — Fiação no `frontend-driver`: `DriverConversations.page` (≤ ~150 linhas),
      `driverConversationsApi.service` (sobre as rotas `/me` da 183, **ocorrência apenas** nesta fase),
      `driverSubjectGroups.constant`, locales `pt-BR`/`en`, rota `/conversas`, aba com selo, sino → conversa.
- [ ] **T1b.3** `sonnet` — Offline (D5): `conversationOutbox.service` liga a fila existente; estados
      `na fila/enviada/entregue/lida/falhou`; teste: mesma chave duas vezes = uma bolha.
- [ ] **T1b.4** `sonnet` — **Prova de que "plugar em outro app está pronto" (RF13):** o portal da
      contratante (`frontend-client`) renderiza `ParticipantConversations` com um `ConversationsApi`
      próprio, sem alterar o pacote. Se precisar alterar o pacote, a Fase 1 não terminou.
- [ ] **T1b.5** `sonnet` — Smoke Playwright do `frontend-driver`: abrir pelo sino, responder, responder
      offline (porta sintética 53112; ver CLAUDE.md raiz).
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
- [ ] **T2.7** `haiku` — O `ConversationsApi` do app passa a ler `subjectType/subjectLabel` da lista nova (tolerante → API → telas,
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

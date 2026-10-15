# Tasks — 266 O motorista acompanha as ocorrências da rota

> Cada task responde: **Mecânica?** (tudo descrito) · **Aceite por comando?** (tsc/teste/`make check`).
> Duas respostas "sim" → `haiku`. Gate de toda task: `tsc --noEmit` + testes da app (script `test` do `package.json`,
> nunca `bun test` cru) + commit isolado. Escalada: gate falhou 2× → sobe um nível e registra em `evidence.md`.
> Teste novo entra no agregador e na lista explícita do `package.json` da app.
> Worktree: `../transportada-wt/spec-266` (branch `work/spec-266`). Nada é feito fora dela.

## Fase 0 — Contrato antes do código

> 🤖 Modelo: `sonnet` (T0.2 é 🧠)

- [x] **T0.1** `sonnet` — Conferir contra `origin/staging` os números de linha citados em `plan.md` § Contexto e o
      levantamento de `evidence.md`. Divergência vira nota no `evidence.md` antes de seguir.
- [x] **T0.2** 🧠 `opus` — Validar com `architect` a ADR-0105 e os contratos de `plan.md`. Pontos a validar:
      tabela, CHECKs, regra de quem recebe `trip.occurrence-reopened`, tradução de `case.transition` para o motorista
      e lock da corrida. Ajuste aprovado entra no `plan.md`, e a ADR passa a "aceita". **Outras tasks herdam este
      contrato.**

## Fase 1 — Painel tolerante (vai a produção ANTES da API)

> 🤖 Modelo: `haiku`

- [ ] **T1.1** `haiku` — Teste antes: o feed com `case.status: 'resolved_xyz'` carrega a página e o item mostra
      "—". Depois, o guarda de `tripOccurrenceFeedClient.service.ts` aceita status desconhecido como `unknown`.
- [ ] **T1.2** `haiku` — Teste antes: a linha do tempo com `kind: 'resolution.resolved'` desconhecido carrega os
      demais eventos. Depois, `tripOccurrenceTimeline.validation.ts` descarta o item desconhecido em vez de reprovar
      a resposta.
- [ ] **T1.3** `sonnet` — Publicar a Fase 1 (PR → staging → main) **com aprovação humana**. Registrar o commit em
      produção no `evidence.md`. **A Fase 2 não vai a `main` antes disto.**

## Fase 2 — API

> 🤖 Modelo: `sonnet` (T2.10 → `haiku`)

- [x] **T2.1** `sonnet` — Migration da tabela `trip_occurrence_resolution_events` (plan § Dados), schema Drizzle e
      códigos de erro. Aceite: `make migration-test` e `db:generate` com `no_changes` depois.
- [x] **T2.2** `sonnet` — Teste antes da política pura `occurrence-resolution.policy.ts` (4 casos do plano), depois
      a implementação.
- [ ] **T2.3** `sonnet` — Repositório (inserir; último evento em lote, sem N+1) + `resolve-occurrence.use-case.ts` +
      `POST /trip-occurrences/:kind/:id/resolution`. Contratos: 201, 404 de outra empresa, 409 já resolvida e 409
      cancelada. Integração na mesma task.
- [ ] **T2.4** `sonnet` — Em `applyTransition` (`drizzle-occurrence-case.repository.ts`), a transição terminal
      (`closed`, `returned_to_warehouse`, `cancelled`; `decided` não) trava a ocorrência, não duplica se já resolvida e
      grava `resolved` (`system`, frase fixa, `case_event_id`) na mesma transação. **Auditar o caminho do cancelamento
      da 167** contra a ordem de lock tratativa → ocorrência. Teste de integração dos três terminais. **Medir em staging** quantas
      tratativas já encerradas ficariam "em aberto" e registrar no `evidence.md` para a decisão de backfill.
- [ ] **T2.5** `sonnet` — `GET /me/trips/current/route-occurrences` e `GET .../:kind/:id` (sem links assinados), só com
      viagem não finalizada (finalizada → 404). Contrato negativo: outro motorista e outra empresa dão 404. Contrato de
      rotas: nenhum par com o mesmo método casa o mesmo caminho. Integração com nota, parada, cancelada, resolvida e
      reaberta.
- [ ] **T2.6** `sonnet` — Documentos do detalhe: fotos e assinatura do motorista, anexos da conversa da ocorrência e
      `GET /me/trips/current/route-occurrences/:kind/:id/attachments/:objectId/url` (5 min), que confere o dono e a
      viagem não finalizada antes de assinar. Contrato negativo do objeto
      de outra ocorrência.
- [ ] **T2.7** `sonnet` — Flag `reopen?: true` na resposta **existente** do motorista (os dois use cases:
      `reply-my-subject-conversation` e `driver-conversation`). Dentro de `replayOrRun.run`: trava a ocorrência;
      cancelada → 409 `OCCURRENCE_CANCELLED`; `reopen` e resolvida → evento `reopened` com a mensagem; `reopen` e não
      resolvida → 409 `OCCURRENCE_NOT_RESOLVED`; `reopen` entra na impressão digital da idempotência. Sem rota nova.
      Integração: corrida, repetição, cancelada, resposta sem `reopen` não reabre. Registrar as emendas nas specs 183
      (D4) e 263 (D4: "só cria conversa respondendo") com link para a ADR-0105.
- [ ] **T2.8** `sonnet` — Notificações `trip.occurrence-resolved` (equipe inteira; **não** se a viagem terminou) e
      `trip.occurrence-reopened` (regra do destinatário do plan; sem `occurrences.resolve` não notifica e loga `info`
      sem texto). Catálogo, seed e disparo. Teste: o payload não tem nota nem texto.
- [ ] **T2.9** `sonnet` — Linha do tempo (`resolution.*`) e feed (`resolution` + filtro `resolutionStateIn`).
      Contrato do feed e da linha do tempo.
- [ ] **T2.10** `haiku` — Documentação viva: OpenAPI das rotas novas, `apps/api-transportada/CLAUDE.md` (núcleo) e
      `docs/ai-context/api-transportada.md`.

## Fase 3 — Painel resolve e mostra a reabertura

> 🤖 Modelo: `sonnet` (T3.2 e T3.3 → `haiku`)

- [ ] **T3.1** `sonnet` — `OccurrenceResolutionPanel` no detalhe e na linha expandida da tabela, para nota **e**
      parada. "Resolver com observação" com nota obrigatória, permissão `occurrences.resolve` e o aviso no formulário
      "o motorista vai ler esta observação". A mutation invalida
      feed, linha do tempo e conversas. Teste de renderização e do 409.
- [ ] **T3.2** `haiku` — Selo "Reaberta pelo motorista" e "Resolvida" no feed, filtro por andamento, locales pt-BR/en.
- [ ] **T3.3** `haiku` — `describeOccurrenceTimelineEvent` para `resolution.resolved` e `resolution.reopened`, com
      teste.

## Fase 4 — App do motorista

> 🤖 Modelo: `sonnet` (T4.1, T4.9 e T4.10 → `haiku`; T4.8 é 🧠)

- [x] **T4.1** `haiku` — Ícones `share`, `paperclip` e `arrow-left` em `components/ui/icon.tsx`, com o traço do
      painel, e `icon-catalog` atualizado.
- [ ] **T4.2** `sonnet` — Tipos, validação, cliente e query das duas rotas de leitura. Retrato no IndexedDB (store
      `trip-occurrences`, versão 5, com migração do v4) e leitura offline. Testes de validação e do retrato.
- [ ] **T4.3** `sonnet` — Teste antes de `routeOccurrenceView.service.ts` (pura): junta o servidor com a fila
      (`queued`/`rejected`, sem duplicar quando a ocorrência já subiu), contagem do alerta, grupos, filtros e
      ocorrências por parada **agrupadas por nota** (N por nota, mesmo tipo repetido, ocorrência de parada sem nota,
      corte "+N" acima de 4). Depois, a implementação.
- [ ] **T4.4** `sonnet` — `DriverOccurrenceAlertButton` no `DriverShellHeader` (zero → não renderiza),
      `DriverOccurrenceBadgeIcon` e a fileira na `DriverStopCard`: ícone de estado da entrega e barra de progresso em
      alerta. Ícones agrupados por nota (NF + ícones) e grupo das de parada. Atualizar o golden. Testes com 0, 1, N
      na mesma nota (inclusive do mesmo tipo) e o "+N".
- [ ] **T4.5** `sonnet` — Rotas `/ocorrencias` e `/ocorrencias/:kind/:id` (`driverRoute.service.ts` + contrato) e
      a página da lista: grupos, filtros por ícone com contagem, linha → chat ou detalhe, botão de compartilhar.
- [ ] **T4.6** `sonnet` — Página de detalhe: estado, quadro de resolução ou recusa, botão do chat, documentos (ver e
      compartilhar, "Compartilhar os N"), linha do tempo, outras da mesma nota e depois da parada, "Ver a nota na
      parada".
- [ ] **T4.7** `sonnet` — `driverFileShare.service.ts`: busca pelo link assinado, `navigator.canShare({ files })` →
      `share`, senão `saveDriverFile`; o PDF abre em aba nova (CSP `frame-src 'none'`). Teste com e sem suporte.
- [ ] **T4.8** 🧠 `opus` → `sonnet` — Composer travado na ocorrência resolvida, botão "Reabrir" e a primeira
      mensagem com `reopen: true` pelo envio do `@adatechnology/conversations-ui/participant`. Conferir se o pacote
      suporta travar o composer e passar o flag no envio. **Se não suportar**, a mudança vai no pacote
      (`adatechnology-packages`, worktree e changeset próprios), nunca por cópia no app. Depois, `sonnet` implementa o
      fluxo, o botão sem conversa no detalhe (cria a conversa ao enviar; tocar em Reabrir e não enviar não grava nada) e
      a fila offline com idempotência. Viagem finalizada: "Viagem encerrada" no link antigo.
- [ ] **T4.9** `haiku` — `notificationDestination.service.ts`: `trip.occurrence-resolved` → detalhe. Teste em
      `notification-destination.contract.ts`.
- [ ] **T4.10** `haiku` — Locales pt-BR/en (`driverTrip`) de todas as telas novas. Os rótulos acessíveis dos ícones
      vêm do locale.

## Fase 5 — Fechamento

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** `sonnet` — Smoke Playwright do `frontend-driver` (lista, detalhe, reabrir) e prints da spec no
      `evidence.md`.
- [ ] **T5.2** `sonnet` — Revisão (`code-reviewer`) e revisão de segurança (`security-reviewer`: BOLA, link
      assinado, PII em log). Achados corrigidos ou registrados.
- [ ] **T5.3** `sonnet` — Auditoria §15 (N+1, `Promise.all` vs `allSettled` na montagem do detalhe, sem PII). Gates
      completos: `make check`, integração da API, `make migration-test`.
- [ ] **T5.4** `sonnet` — Publicação em etapas, **cada uma com aprovação humana**: API (staging → medir → main) →
      painel Fase 3 + app do motorista. Contexto de I.A. atualizado no `CLAUDE.md` da raiz.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/266-o-motorista-acompanha-as-ocorrencias-da-rota/ (leia spec.md,
plan.md, tasks.md, evidence.md e a ADR docs/adr/0105-a-ocorrencia-tem-um-andamento-com-o-motorista.md antes de
começar; leia também specs/183-*, 263-*, 167-* e 248-*). Árvore única: ../transportada-wt/spec-266 (branch
work/spec-266); nada fora dela. Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet (T0.2 🧠 → opus, validar com architect antes de qualquer código) ·
Fase 1 → executor model=haiku (T1.3 sonnet) · Fase 2 → executor model=sonnet (T2.10 haiku) ·
Fase 3 → executor model=sonnet (T3.2/T3.3 haiku) · Fase 4 → executor model=sonnet (T4.1/T4.9/T4.10 haiku;
T4.8 🧠 → opus confere o conversations-ui antes; se faltar porta, a mudança vai no adatechnology-packages com
worktree e changeset próprios) · Fase 5 → sonnet · revisão final → code-reviewer model=sonnet e
security-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Teste antes da implementação. Cada task fecha com tsc --noEmit + testes da app (script `test` do package.json, nunca
`bun test` cru) + commit isolado, evidência em evidence.md. Task que toca test/integration/** só fecha com
`bun --env-file=../../.env.test run test:integration` (de apps/api-transportada). Lote com migration roda
make migration-test e db:generate esperando no_changes.
Antes de publicar: git fetch, rebase em origin/staging, bun install --frozen-lockfile, gates, prettier nos .md;
conferir numeração de spec/ADR/migration contra origin/staging.
Pare e pergunte antes de: qualquer deploy ou merge em staging/main (T1.3 e T5.4 — o painel tolerante vai a produção
ANTES da API), backfill de tratativas antigas (T2.4), publicar versão do pacote conversations-ui (T4.8), e qualquer
[NEEDS CLARIFICATION] que surgir.
```

# Tasks — 269 O e-mail da ocorrência usa o modelo selecionado

> Cada task responde: **Mecânica?** (tudo descrito) · **Aceite por comando?** (tsc/teste/`grep`/`make check`).
> Duas respostas "sim" → `haiku`. Gate de toda task: `tsc --noEmit` (`bun run typecheck`) + testes da app (script `test`
> do `package.json`, nunca `bun test` cru) + commit isolado. Task que toca `test/integration/**` só fecha com
> `bun --env-file=../../.env.test run test:integration` (de `apps/api-transportada`). Task com migration fecha com
> `make migration-test` (ou aplicar, reverter e reaplicar num Postgres descartável) e `db:generate` com `no_changes`.
> Escalada: gate falhou 2× → sobe um nível e registra em `evidence.md`. Teste novo entra no agregador e na lista
> explícita do `package.json` da app; teste removido sai dos dois.
> Worktree: `../transportada-wt/spec-269` (branch `work/spec-269`). Nada é feito fora dela.
> **Rebase sobre a 268** antes da Fase 2 (`plan.md` § Ordem com a 268).

## Fase 0 — Contrato antes do código

> 🤖 Modelo: `sonnet` (T0.2 é 🧠)

- [x] **T0.1** `sonnet` — Conferir contra `origin/staging` os números de linha de `plan.md` (§ Inventário) e de
      `evidence.md`. Mapear **todos** os guardas do painel que veem as mudanças (catálogo e lista de modelos, tipo de
      ocorrência, exceção por contratante, resposta do registro, feed/detalhe, prévia do diálogo) e dizer se cada um reprova chave ou valor
      desconhecido. Conferir se os códigos `CONTRACTOR_MAIL_TEMPLATE_NOT_FOUND`/`_ARCHIVED` existem. Conferir se a 268
      já entrou em `staging`; se não, registrar o plano de rebase. Divergência vira nota no `evidence.md`. **Feito:** 268 já em `staging`; remapeamento por símbolo.
- [x] **T0.2** 🧠 `opus` — Validar com `architect` a ADR-0106 e as decisões D1–D9 do `plan.md`: nomes das variáveis
      (D6), composição do corpo e assinatura (D5), modelo efetivo exceção ?? tipo (D2), trava gravar × arquivar com tipo e
      exceção (D3), bloqueio do envio manual (D4), modelo resolvido no servidor no envio manual (D7), flag calculada (D8), aceitar e ignorar as chaves antigas até a etapa B (D9), migrations A e B e seus rollbacks. Ajuste
      aprovado entra no `plan.md`, e a ADR passa a "aceita". **Outras tasks herdam este contrato.** **Veredito: aprovado com mudanças** (`plan.md` § Revisão de arquitetura).

## Fase 1 — Painel tolerante (vai a produção ANTES da API)

> 🤖 Modelo: `haiku` (T1.4 → `sonnet`)

- [x] **T1.1** `haiku` — Teste antes: catálogo e lista de modelos com uma entrada `mailType: 'occurrence'` carregam e
      mostram só as conhecidas. Depois, `contractorMailTemplatesResponse.validation.ts` descarta a entrada desconhecida
      em vez de lançar.
- [x] **T1.2** `haiku` — Teste antes: tipo de ocorrência sem `emailSubject`/`emailBody`/`emailItemLineTemplate` e com
      `contractorMailTemplateId` e `missingNotificationTemplate` passa no guarda; exceção por contratante com `contractorMailTemplateId`
      passa. Depois, `tripResponse.validation.ts` (e o guarda da exceção) torna os três opcionais e permite as chaves
      novas.
- [x] **T1.3** `haiku` — Teste antes: resposta do registro sem `email` passa; feed, detalhe e prévia do diálogo com
      `missingNotificationTemplate`/`templateId` passam. Depois, os guardas toleram, e o painel **para de ler** `email`
      do registro (remove o "e-mail pronto": `TripOccurrences.component.tsx`, `useTripWorkspace.hook.ts`, locale
      `occurrence.emailReady`).
- [ ] **T1.4** `sonnet` — Publicar a Fase 1 (PR → staging → main) **com aprovação humana**. Registrar o commit em
      produção no `evidence.md`. **A Fase 2 não vai a `main` antes disto.**

## Fase 2 — API: modelo `occurrence` e o tipo aponta para ele

> 🤖 Modelo: `sonnet` (T2.8 → `haiku`)

- [x] **T2.1** `sonnet` — Migration A (plan § Dados) + schema Drizzle (coluna, FK composta e índice parcial no tipo **e
      na exceção por contratante**, CHECK pela constante) + `occurrence` em `CONTRACTOR_MAIL_TEMPLATE_TYPES` + códigos de erro. `rollback.sql` com a CHECK
      `NOT VALID`. Aceite: migration-test e `db:generate` `no_changes`.
- [x] **T2.2** `sonnet` — Teste antes do catálogo `occurrence` (variáveis do plan, validação: `{codigo_item}` no assunto
      é erro, `{itens}` não) e da política pura `occurrence-mail-body.policy.ts` (D5; sem itens; `item_text` vazio;
      201 itens; HTML escapado). Depois, a implementação e o renderizador de prévia `occurrence` com valores de exemplo.
- [x] **T2.3** `sonnet` — Teste antes (tabela espelhada dos valores de hoje): `occurrence-mail-values.policy.ts` produz
      as chaves `{snake_case}` a partir do que `readOccurrenceTemplateValues` lê hoje. Depois, mover/renomear
      `buildOccurrenceItemValues`, `buildOccurrenceTemplateLines` e os tipos (inventário) **sem** apagar a máquina
      antiga ainda (ela sai na Fase 3).
- [x] **T2.4** `sonnet` — `contractorMailTemplateId` no `PUT /company-settings/occurrence-types` (opcional, nulo limpa), na
      gravação (`FOR KEY SHARE` no modelo; empresa, tipo `occurrence`, ativo) e na resposta. As chaves antigas seguem
      aceitas (D9). Contratos: 200, 404 de outra empresa, 400 tipo de e-mail errado, 409 arquivado. Integração.
- [x] **T2.4b** `sonnet` — Mesmo campo na exceção por contratante: `contractorMailTemplateId` (nulo herda) no
      `PUT .../attachment-overrides`, na lista e no repositório, com a mesma conferência. Teste antes da política pura
      `occurrence-mail-template.policy.ts` (exceção vence tipo, exceção nula herda, os dois nulos → nulo; usa
      `resolveWithOverrides`). Contratos e integração.
- [x] **T2.5** `sonnet` — Arquivar modelo em uso → 409 `CONTRACTOR_MAIL_TEMPLATE_IN_USE` com `occurrenceTypeNames`
      (tipo ativo ou inativo) e `contractorExceptions` (pares tipo/contratante), `FOR UPDATE` no modelo. Integração da corrida gravar × arquivar.
- [x] **T2.6** `sonnet` — Envio pelo modelo efetivo (exceção da contratante da nota ?? tipo):
      `createOccurrenceSuggestedMailReader` devolve `{ subject, bodyText, templateId }` ou `null`; automático com
      `no_template_selected`; envio manual resolve o modelo no servidor, sem modelo → 409
      `OCCURRENCE_MAIL_TEMPLATE_MISSING` (D4), e grava `template_id` (D7); `recordMail` grava `template_id`; a varredura
      do worker exige modelo efetivo.
      **268 já em `staging`** (código dela é a base). O reenvio da 248 (`contractorReplyResend`) fica isento do bloqueio e grava o `template_id` da mensagem original (ou nulo), com teste; assunto colapsado e truncado, corpo truncado com "e mais N itens"; um 409 `OCCURRENCE_MAIL_TEMPLATE_MISSING` do envio (corrida) vira `skipped`/`no_template_selected`. Ponto único no `executeSend` (§ Convivência com a 267). Integração: modelo do tipo, modelo da exceção vencendo,
      exceção herdando, sem modelo (automático pula; manual 409), e o contrato da varredura do worker.
- [x] **T2.7** `sonnet` — `missingNotificationTemplate` (D8) no item do feed, no detalhe e na prévia do diálogo (+
      `templateId` na prévia). Contratos do feed e da prévia.
- [x] **T2.8** `haiku` — Documentação viva: OpenAPI das rotas alteradas, `apps/api-transportada/CLAUDE.md` e
      `docs/ai-context/api-transportada.md` (o e-mail de ocorrência sai do modelo; a ADR-0106 emenda a 183).

## Fase 3 — API: etapa A, o código morto sai

> 🤖 Modelo: `sonnet` (T3.2 e T3.3 → `haiku`)

- [x] **T3.1** `sonnet` — Remover, conforme `plan.md` § Inventário: `renderEmail` e `email` na resposta do registro
      (e as ligações do `main.ts`), a prévia do tipo (política, rota, schema, ligação no `main.ts`),
      `occurrence-template.policy.ts` (o que sobrou), `occurrence-template-fields.schema.ts`,
      `src/shared/occurrence-template.constant.ts`, as constantes de tamanho de assunto e corpo, e toda leitura e escrita
      das três colunas no `delivery-proof-read.support.ts` e no `save-occurrence-type*`. A resposta do tipo deixa de
      trazer as três chaves (o painel tolerante já está em produção — T1.4). O `PUT` continua aceitando e ignorando
      (D9). Testes do código removido saem; os mistos são editados. Inventário extra: locale `trip.locale.json` ~1384-1386, `shard-weights.json`; testes mistos `occurrence-declared-amount.integration.ts`, `occurrence-configuration-decides.integration.ts`, `occurrence-type-declared-amount-write.integration.ts`, `configuration-decides`, `declared-amount-type-write`, `product-selection`; no painel `occurrence-type-update` e `tripResponse.validation.contract.test.ts`. **Ficam** as `{{camelCase}}` das notificações (`notification-catalog`, `notification.constant` do worker, `occurrenceNoticePreview` do motorista) e `occurrence-amount.policy.ts`; os `grep` usam `-rnwE`.
- [x] **T3.2** `haiku` — Seed (`local-occurrence-type-seed.service.ts`), cenários (`scripts/contractor-reply-scenarios`)
      e fixtures sem as chaves. Reescrever `occurrence-template-values.integration.ts` para o modelo.
- [x] **T3.3** `haiku` — Gate de limpeza: o `grep` do aceite da etapa A (`plan.md` § Inventário) só acha o schema
      Drizzle das colunas e o `PUT` que ignora; nenhum arquivo removido continua na lista de testes do `package.json`.
      Saída no `evidence.md`.

## Fase 4 — Telas

> 🤖 Modelo: `sonnet` (T4.2, T4.5 e T4.6 → `haiku`)

- [ ] **T4.1** `sonnet` — Editor do tipo: `OccurrenceTypeMailTemplateSelect` (modelos `occurrence` ativos + "Nenhum",
      prévia renderizada, "Gerenciar modelos", aviso "Tipo sem modelo de notificação" com `emailsContractor` ligado e
      nada escolhido). O interruptor `emailsContractor` fica. Remover os campos de assunto, corpo e linha, a ajuda de
      marcadores, o rascunho, a prévia antiga e o cliente `previewOccurrenceTypeEmail` (inventário). Testes de
      renderização e do salvar.
- [ ] **T4.1b** `sonnet` — Editor da exceção por contratante (`OccurrenceExceptionForm`): o mesmo seletor, com "Herdar
      do tipo" (nulo). Teste de renderização e do salvar.
- [ ] **T4.2** `haiku` — "Modelos": `occurrence` em `CONTRACTOR_MAIL_TEMPLATE_TYPES` do painel, rótulo e locales; o 409
      `CONTRACTOR_MAIL_TEMPLATE_IN_USE` mostra os tipos e as contratantes. Teste.
- [ ] **T4.3** `sonnet` — Diálogo "Enviar à contratante": com `missingNotificationTemplate`, o envio fica
      **desabilitado** com o aviso "Tipo sem modelo de notificação" e o link para o editor do tipo/exceção; trata o 409
      `OCCURRENCE_MAIL_TEMPLATE_MISSING` (corrida) mostrando o mesmo aviso. Teste.
- [ ] **T4.4** `sonnet` — Feed e detalhe: selo "Tipo sem modelo de notificação" com link para o editor do tipo/exceção.
      Teste.
- [ ] **T4.5** `haiku` — Locales pt-BR/en de tudo o que é novo; remover as chaves mortas (`occurrenceTypeCatalog.mail.*`
      exceto `title` e `switch`).
- [ ] **T4.6** `haiku` — App do motorista: tirar a tolerância a `emailItemLineTemplate` (`driverTrip.types.ts`) e o caso
      do teste do guarda.

## Fase 5 — Fechamento e publicação da etapa A

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** `sonnet` — Conferir no navegador local (por texto, `read_page`) o editor do tipo, "Modelos", o diálogo e
      o editor da exceção, o diálogo desabilitado e o aviso; um e-mail automático no Mailpit (com a 268). Um print só no fim, no `evidence.md`.
- [ ] **T5.2** `sonnet` — Revisão (`code-reviewer`) e revisão de segurança (`security-reviewer`: tenant do modelo,
      injeção de cabeçalho no assunto, HTML escapado, PII em log). Achados corrigidos ou registrados.
- [ ] **T5.3** `sonnet` — Auditoria §15 (N+1 no feed com a flag, `Promise.all` vs `allSettled` na prévia) e gates
      completos das três apps + worker: typecheck, lint, script `test`, contrato da API
      (`bun --env-file=../../.env.test test --timeout 120000`), integração, migration-test, `bunx prettier --check .`
      na raiz.
- [ ] **T5.4** `sonnet` — **Medir em staging e produção** (só contagem, sem conteúdo): tipos com `emails_contractor`
      por empresa (ficam sem e-mail no deploy) e tipos com `email_subject` não vazio (texto que a etapa B descarta) e tipos com `contractor_reply_mode <> 'off'` (o retorno da contratante só abre no envio automático: sem modelo, não abre).
      Registrar no `evidence.md` e **mostrar ao dono antes de `main`**.
- [ ] **T5.5** `sonnet` — Publicação em etapas, **cada uma com aprovação humana**: rebase em `origin/staging` (sobre a
      268), `bun install --frozen-lockfile`, gates; API + worker + telas para staging → conferir → `main`. Contexto de
      I.A. atualizado no `CLAUDE.md` da raiz.

## Fase 6 — Etapa B: as colunas saem (DESTRUTIVA — pare e pergunte)

> 🤖 Modelo: `sonnet` (T6.2 é 🧠). **Só começa depois da etapa A em produção e com aprovação humana explícita.**

- [ ] **T6.1** `sonnet` — Conferir que a etapa A está em produção (commit em `main`, deploy verde) e que nenhum código
      lê as colunas (`grep` da T3.3). Repetir a contagem da T5.4 em produção e registrar. **Pare e pergunte** ao dono
      antes de seguir.
- [ ] **T6.2** 🧠 `opus` → `sonnet` — Migration B (plan § Dados) com `rollback.sql` escrito (recria as colunas
      `text NOT NULL DEFAULT ''` e a CHECK; o dado não volta). Tirar as colunas do schema Drizzle, as três chaves
      aceitas-e-ignoradas do `PUT` (D9) e `OCCURRENCE_ITEM_LINE_TEMPLATE_MAX_LENGTH`. O `opus` confere a ordem com o
      painel (o painel publicado não manda mais as chaves desde a Fase 4). Aceite: migration aplicada, revertida e
      reaplicada num banco descartável; `db:generate` `no_changes`; gates.
- [ ] **T6.3** `sonnet` — Publicação da etapa B (staging → conferir → `main`) **com aprovação humana**, nunca
      automática. Registrar no `evidence.md`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/269-o-email-da-ocorrencia-usa-modelo-selecionado/ (leia spec.md,
plan.md, tasks.md, evidence.md e a ADR docs/adr/0106-o-email-da-ocorrencia-usa-modelo-do-cadastro.md antes de começar;
leia também specs/150-*, 183-* (evidence.md:529-532, a decisão emendada), 218-*, 246-*, 247-*, 248-* e a 268 em work/spec-268).
Árvore única: ../transportada-wt/spec-269 (branch work/spec-269); nada fora dela. Uma task por vez, na ordem do tasks.md.
Antes da Fase 2: rebase sobre a 268 (ou sobre origin/staging, se a 268 já entrou) — o envio (T2.6) conflita com ela.
Modelos: Fase 0 → executor model=sonnet (T0.2 🧠 → opus, validar com architect antes de qualquer código) ·
Fase 1 → executor model=haiku (T1.4 sonnet) · Fase 2 → executor model=sonnet, incluindo T2.4b (T2.8 haiku) ·
Fase 3 → executor model=sonnet (T3.2/T3.3 haiku) · Fase 4 → executor model=sonnet, incluindo T4.1b
(T4.2/T4.5/T4.6 haiku) ·
Fase 5 → sonnet · Fase 6 → sonnet (T6.2 🧠 → opus confere antes) · revisão final → code-reviewer model=sonnet e
security-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Teste antes da implementação. Cada task fecha com tsc --noEmit + testes da app (script `test` do package.json, nunca
`bun test` cru) + commit isolado, evidência em evidence.md. Task que toca test/integration/** só fecha com
`bun --env-file=../../.env.test run test:integration` (de apps/api-transportada). Lote com migration roda
make migration-test (ou aplica, reverte e reaplica num Postgres descartável) e db:generate esperando no_changes.
Antes de publicar: git fetch, rebase em origin/staging, bun install --frozen-lockfile, gates, `bunx prettier --check .`
na raiz; conferir numeração de spec/ADR/migration contra origin/staging.
Pare e pergunte antes de: qualquer merge em staging ou main (T1.4, T5.5, T6.3 — o painel tolerante vai a produção ANTES
da API), qualquer mudança de dados em staging ou produção, mostrar ao dono a medição da T5.4 antes de main, TODA a
Fase 6 (migration destrutiva que remove email_subject, email_body e email_item_line_template — só depois da etapa A em
produção e com aprovação humana explícita), e qualquer [NEEDS CLARIFICATION] que surgir. Decisões do dono já fechadas (evidence.md): sem modelo efetivo
não há envio nem à mão (409 OCCURRENCE_MAIL_TEMPLATE_MISSING); modelo efetivo = exceção da contratante ?? tipo (sem
exceção por destinatário); arquivar modelo usado por tipo ou exceção → 409.
```

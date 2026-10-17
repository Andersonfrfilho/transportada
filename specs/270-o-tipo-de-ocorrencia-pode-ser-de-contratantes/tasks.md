# Tasks — 270 O tipo de ocorrência pode ser de contratantes

> Cada task responde: **Mecânica?** (tudo descrito) · **Aceite por comando?** (tsc/teste/`make check`).
> Duas respostas "sim" → `haiku`. Gate de toda task: `tsc --noEmit` + testes da app (script `test` do `package.json`,
> nunca `bun test` cru) + commit isolado. Escalada: gate falhou 2× → sobe um nível e registra em `evidence.md`.
> Teste novo entra no agregador e na lista explícita do `package.json` da app.
> Task que toca `test/integration/**` só fecha com `bun --env-file=../../.env.test run test:integration` (de
> `apps/api-transportada`) **sem nenhum skip**.
> Worktree: `../transportada-wt/spec-270` (branch `work/spec-270`). Nada é feito fora dela.
> ⚠️ **Executa depois da 269** (`work/spec-269`): rebase antes da Fase 1 (T0.3).

## Fase 0 — Contrato antes do código

> 🤖 Modelo: `sonnet` (T0.2 é 🧠)

- [x] **T0.1** `sonnet` — Conferir contra `origin/staging` (e a 269, se já entrou) os números de linha de `plan.md` §
      Contexto e o levantamento do `evidence.md`. Listar **todo** caso de uso que registra ocorrência com nota (inclusive
      o fluxo do operador pelo WhatsApp em `main.ts` e o recebimento de carga) e a origem da contratante em cada um.
      Conferir se `CONTRACTOR_NOT_FOUND` existe e como os momentos se aplicam aos tipos de etapa `receiving`.
      Divergência vira nota no `evidence.md` antes de seguir.
- [x] **T0.2** 🧠 `opus` — Validar com `architect` a ADR-0107 e as decisões D1–D8 do `plan.md`: invariante
      `listed`/lista na transação, regra da parada (D3), interseção no lote (D5), onde fica a lista por nota da
      separação (rota nova ou parâmetro), ordem das guardas (momento → escopo → exigência da 246). Ajuste aprovado entra
      no `plan.md`, e a ADR passa a "aceita". **Outras tasks herdam este contrato.**
- [x] **T0.3** `sonnet` — Rebase sobre a 269: se a 269 já está em `origin/staging`, `git rebase origin/staging`; se não,
      `git rebase work/spec-269`. `bun install --frozen-lockfile`, `bun run typecheck`. Registrar no `evidence.md` a base
      usada e o carimbo da última migration (a da 270 nasce depois dele).

## Fase 1 — Painel tolerante (vai a produção ANTES da API)

> 🤖 Modelo: `haiku` (T1.2 → `sonnet`)

- [x] **T1.1** `haiku` — Teste antes: a lista de tipos com `contractorScope: 'listed'` e `contractors: [...]` passa por
      `occurrenceTypesFromApi`, e com `contractorScope: 'qualquer'` também (tratado como `all`). Depois, as duas chaves
      entram opcionais em `allowed` de `isOccurrenceType` (`tripResponse.validation.ts:1947-1990`). Conferir que o guarda
      de tipos de campo (`isFieldOccurrenceType`, :1563-1573) não recebe chave nova (a API não a manda lá).
- [ ] **T1.2** `sonnet` — Publicar a Fase 1 (PR → staging → main) **com aprovação humana**, depois da Fase 1 da 269.
      Registrar o commit em produção no `evidence.md`. **A Fase 2 não vai a `main` antes disto.**

## Fase 2 — API

> 🤖 Modelo: `sonnet` (T2.8 → `haiku`)

- [x] **T2.1** `sonnet` — Migration (plan § Dados), schema Drizzle (coluna + CHECK da constante + tabela nova),
      constantes e erros. Aceite: `make migration-test` (ou aplica, reverte e reaplica num Postgres descartável) e
      `db:generate` com `no_changes` depois.
- [x] **T2.2** `sonnet` — Teste antes da política pura `occurrence-type-contractor-scope.policy.ts`: `all` com e sem
      contratante; `listed` com contratante dentro, fora e nula; validação (lista vazia, `all` com lista, só `stop`,
      `stop` + `document`, que a 246 já recusa; `stop` + `office` válido), todos os erros de uma vez. Depois a implementação.
- [x] **T2.3** `sonnet` — Gravação e leitura do escopo no `PUT`/`GET /company-settings/occurrence-types` (D7): par
      incompleto 400, lista vazia 400, só parada 400, contratante de outra empresa 404, ausente não altera, `all` apaga
      a lista; leitura sem N+1. Integração na mesma task (cria `listed`, regrava sem as chaves e segue, troca para `all`
      e a tabela fica vazia, contratante de outra empresa).
- [x] **T2.4** `sonnet` — Listas filtradas (D4/D5): retrato do motorista (`documents[].occurrenceTypes`),
      `GET /me/trips/current/occurrence-types` (sem parâmetro novo: momento `document` → só `all`; parada sem filtro), `GET /trips/occurrence-types/field` com
      `documentIds` (interseção), lista da separação por nota (`GET /trips/:tripId/documents/:documentId/occurrence-types`, `trip.manage`, momento
      `separation`; nota da viagem e da empresa, senão 404; teste de roteador com `createRouter`+`allowedMethods`). O WhatsApp
      (motorista e operador) filtra a lista pela contratante da nota do contexto do fluxo (mesma política, uma leitura);
      no 422 responde "Este tipo não vale para a contratante desta nota" e volta à lista de tipos, sem relançar e sem
      ficar em `photoEntry`. O recebimento de carga está fora (R2). Contrato negativo: `contractorId` da query apontando para a contratante listada numa
      nota de outra não libera o tipo; `documentId` de outra empresa → 404. Integração.
- [x] **T2.5** `sonnet` — Guarda D6 em todo caso de uso da lista da T0.1, antes de qualquer escrita: 422
      `OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR`. Ordem das guardas: tipo existe/ativo → momento → nota alcançável/da empresa (404) → escopo (422) → exigência da 246 →
      qualquer escrita ou upload. Lote: `findReachableDocumentIds` devolve `{id, contractorId}` na mesma consulta e o escopo
      é conferido antes de `persistBatchAttachment`; galpão lê a contratante por `findDocumentOccurrenceSubject`. Integração por caminho (motorista, escritório, lote com uma nota fora
      → nada gravado, galpão, WhatsApp do motorista e do operador) e o caso nota sem contratante + tipo `listed`. O log da
      recusa só tem ids.
- [x] **T2.6** `sonnet` — Registro já gravado continua legível (RF8): integração que registra, troca o tipo para
      `listed` sem a contratante e confere feed, detalhe, linha do tempo, rota do motorista (266) e correção de itens.
- [x] **T2.7** `sonnet` — Parada intacta (RF5): integração de ocorrência de parada com tipo `stop` + `office`
      `listed` numa parada sem nota da contratante listada → grava normalmente.
- [x] **T2.8** `haiku` — Documentação viva: OpenAPI das rotas alteradas, `apps/api-transportada/CLAUDE.md` (núcleo, uma
      linha sob ocorrência) e `docs/ai-context/api-transportada.md`.

## Fase 3 — Painel

> 🤖 Modelo: `sonnet` (T3.2 e T3.3 → `haiku`)

- [x] **T3.1** `sonnet` — Teste antes; depois `OccurrenceTypeContractorScope.component.tsx` no editor e na criação:
      "Vale para" + `MultiSelect` existente com as contratantes ("Nome · CNPJ", busca por nome e CNPJ, inativa marcada,
      aviso de lista truncada), travado no tipo só de parada com a frase do RF5, frase "na parada vale para todas" no tipo
      com `stop` + nota. Erros 400/404 do `PUT` mostrados no bloco.
- [x] **T3.2** `haiku` — Chip "Só: …" no `OccurrenceTypeSummary` (até 2 nomes + "e mais N", título completo). Teste de
      renderização com 1, 2 e 4 contratantes e com `all` (sem chip).
- [ ] **T3.3** `haiku` — Aviso na exceção por contratante fora da lista (RF9). Teste.
- [ ] **T3.4** `sonnet` — Separação e lote do escritório usam a lista do servidor por nota (T2.4); a separação deixa de
      filtrar tipos no cliente; o lote manda `documentIds` e mostra o 422 com as notas recusadas. Teste dos dois.
- [ ] **T3.5** `haiku` — Locales pt-BR/en das telas novas e do código de erro.

## Fase 4 — App do motorista

> 🤖 Modelo: `haiku`

- [ ] **T4.1** `haiku` — Teste antes; depois rótulo de `OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR` em
      `rejectionCauseLabel.service.ts` + locales, e `DriverOccurrenceDetail.page.tsx:118` usando o rótulo.
- [ ] **T4.2** `haiku` — Teste de contrato: retrato com tipo ausente na nota de outra contratante → o registro daquela
      nota não o oferece, e o fallback (`occurrenceRegistration.service.ts:45-54`) também não.

## Fase 5 — Verificação e publicação

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** `sonnet` — Gates completos das três apps: `bun run typecheck`, lint por app (cwd na app) e o script
      `test` de `apps/api-transportada`, `apps/frontend-transportada` e `apps/frontend-driver`; contrato da API
      `bun --env-file=../../.env.test test --timeout 120000`; integração
      `bun --env-file=../../.env.test run test:integration` sem skip; `bunx prettier --check .` na raiz; auditoria §15
      (N+1, `Promise.all` × `allSettled`, PII em log).
- [ ] **T5.2** `sonnet` — `code-reviewer` e `security-reviewer` em paralelo sobre `origin/staging...HEAD` (BOLA na lista
      de contratantes e no `documentId`, confiança no `contractorId` da query, recusa sem vazar a lista). Corrigir e
      reverificar.
- [ ] **T5.3** `sonnet` — Smoke: criar tipo `listed` no painel local, abrir a viagem no app do motorista e conferir por
      texto (`read_page`) que o tipo aparece só na nota da contratante; um screenshot só no fim. Evidência.
- [ ] **T5.4** `sonnet` — Publicação **com aprovação humana em cada passo**, depois da 269: rebase em `origin/staging`,
      `bun install --frozen-lockfile`, gates, conferir numeração de spec/ADR/migration; PR para `staging`; conferir
      deploy; PR `staging` → `main`. Atualizar o `CLAUDE.md` da raiz (contexto de I.A.).

## Fase 6 — Passo de dados: todos os tipos para a Spani (STOP-AND-ASK)

> 🤖 Modelo: `sonnet` (T6.2 e T6.3 só com o dono)

- [ ] **T6.1** `sonnet` — Teste antes (integração): zero, uma e duas contratantes casando `%spani%`; tipo só de parada
      ignorado; tipo já `listed` = [Spani] intacto; tipo `listed` com outra contratante relatado e intacto; segunda
      execução não muda nada; sem `--confirm` não grava. Depois `scripts/occurrence-type-contractor-scope-assign.ts` +
      serviço (plan § Passo de dados), chamando `replaceOccurrenceTypeContractorScope` (o mesmo do `PUT`; não `saveOccurrenceType`, para não tocar em
      `contractor_mail_template_selected_at` da 269). Casamento por padrão parametrizado com `%` e `_` escapados; só
      inativa casando → para. "Tipo de nota" = momentos ∩ {separation, document, office} ≠ ∅; o dry-run mostra os momentos de
      cada tipo `[stop, office]`. O script é escrito e testado aqui, mas **nunca rodado** em staging/produção por esta
      execução (Fase 6 é do dono). Saída sem CNPJ completo e sem segredo.
- [ ] **T6.2** ⛔ `sonnet` — **Staging.** Pare e pergunte: mostrar ao dono o comando e pedir a confirmação do ambiente.
      Rodar o dry-run por `railway ssh -e staging -s api -- bun run scripts/... --company <uuid> --contractor-name spani`
      e colar a listagem no `evidence.md`. Esperado hoje: **Spani não existe em staging** (só RIBER PET e COMERCIAL
      ZARAGOZA) → registrar e parar, sem criar a contratante. Se existir exatamente uma, mostrar a contratante encontrada
      e as contagens de notas que ficam sem tipo, e só rodar `--confirm` com o "sim" do dono; colar o antes/depois.
- [ ] **T6.3** ⛔ `sonnet` — **Produção.** Mesmo roteiro da T6.2 em `production`, só depois da T6.2 fechada e da
      feature em `main`. Dry-run → dono confirma ambiente, contratante e consequências → `--confirm` → listagem depois e
      segunda execução sem mudança, tudo no `evidence.md`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/270-o-tipo-de-ocorrencia-pode-ser-de-contratantes/ (leia spec.md,
plan.md, tasks.md, evidence.md e a ADR docs/adr/0107-o-tipo-de-ocorrencia-tem-escopo-de-contratantes.md antes de
começar; leia também specs/157-*, 218-*, 219-*, 246-*, 266-* e a 269 em work/spec-269 com a ADR-0106).
Árvore única: ../transportada-wt/spec-270 (branch work/spec-270); nada fora dela. Uma task por vez, na ordem do tasks.md.
RODA DEPOIS DA 269: T0.3 rebaseia sobre origin/staging (se a 269 já entrou) ou sobre work/spec-269; a migration da 270
nasce com carimbo posterior ao da 269, e cada publicação da 270 vai depois da etapa equivalente da 269.
Modelos: Fase 0 → executor model=sonnet (T0.2 🧠 → opus, validar com architect antes de qualquer código) ·
Fase 1 → executor model=haiku (T1.2 sonnet) · Fase 2 → executor model=sonnet (T2.8 haiku) ·
Fase 3 → executor model=sonnet (T3.2/T3.3/T3.5 haiku) · Fase 4 → executor model=haiku · Fase 5 → sonnet ·
Fase 6 → sonnet, só com o dono · revisão final → code-reviewer model=sonnet e security-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Teste antes da implementação. Cada task fecha com tsc --noEmit + testes da app (script `test` do package.json, nunca
`bun test` cru) + commit isolado (`git commit --only <paths>`), evidência em evidence.md. Task que toca
test/integration/** só fecha com `bun --env-file=../../.env.test run test:integration` (de apps/api-transportada), sem
skip. Lote com migration: make migration-test (ou aplica, reverte e reaplica num Postgres descartável) e db:generate
esperando no_changes. Antes de publicar: git fetch, rebase em origin/staging, bun install --frozen-lockfile, gates,
`bunx prettier --check .` na raiz; conferir numeração de spec/ADR/migration contra origin/staging.
Pare e pergunte antes de: qualquer merge em staging ou main (T1.2 e T5.4 — o painel tolerante vai a produção ANTES da
API), qualquer mudança de dados em staging ou produção (TODA a Fase 6: T6.2 e T6.3 só rodam --confirm depois de o dono
ver o dry-run e confirmar ambiente e contratante; Spani ausente ou ambígua → registrar e parar, nunca criar), e qualquer
[NEEDS CLARIFICATION] que surgir. Decisões já tomadas (evidence.md): escopo explícito all|listed; a parada ignora o
escopo e tipo só de parada não pode ser listed; nota sem contratante e lista sem nota só recebem tipos all; o servidor
recusa com 422 OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR; ocorrência já registrada continua visível; a exceção por
contratante não muda.
```

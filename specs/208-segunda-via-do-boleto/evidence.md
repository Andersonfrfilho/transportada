# Evidências — spec 208

## Decisão: catálogo de bootstrap, não `TRIP_OCCURRENCE_TYPES`

Confirmado antes de escrever código: `TRIP_OCCURRENCE_TYPES` (`shared/trip-occurrence.constant.ts`)
é o `type` de `trip_document_occurrences`, com CHECK fixo na migration
`drizzle/20260902170000_trip_document_occurrences/migration.sql`, cópia por valor no
`frontend-transportada` (contrato de paridade `test/trip-occurrence/catalog.contract.ts`), e a
`stage` de cada tipo decide **permissão** via `resolveOccurrenceStage`/`occurrence.policy.ts`.
Acrescentar ali pediria migration nova, atualização da cópia do frontend e risco de autorização —
nada disso foi pedido.

`company_occurrence_types` (o catálogo real, editável pela tela) não tem esse acoplamento: `name`
é texto livre, e `attachmentMode`/`leavesDocumentBehind` têm default de coluna (`'off'`/`false`,
`database/trip.schema.ts:2006-2017`). `insertOccurrenceTypes`
(`database/occurrence-type-catalog-seed.repository.ts:36-40`) só grava
`{companyId, name, stage}` — os defaults de coluna já entregam os dois requisitos do pedido (sem
foto, nota não sai da viagem) sem campo novo no tipo do catálogo.

O tipo novo entrou só em `OCCURRENCE_TYPE_CATALOG`
(`src/shared/occurrence-type-catalog.constant.ts`), como entrada literal ao lado da lista derivada
de `TRIP_OCCURRENCE_TYPES`. Nenhuma migration, nenhum CHECK novo, nenhuma mudança de permissão.

## T1 — Contrato: o catálogo contém o tipo novo

Arquivo: `test/trip-occurrence/catalog-seed.contract.ts`.

Red (antes do código):

```
bun --env-file=../../.env.test test ./test/trip-occurrence.contract.test.ts -t "segunda via"
```

→ `expect(received).toBeDefined() — Received: undefined` (1 fail).

Green (depois de acrescentar a entrada em `OCCURRENCE_TYPE_CATALOG`):

```
bun --env-file=../../.env.test test ./test/trip-occurrence.contract.test.ts
```

→ **241 pass, 0 fail**, 435 expect() calls.

## T2 — Integração: a linha semeada tem os defaults certos

Arquivo: `test/integration/occurrence-type-catalog-seed.integration.ts` — asserção nova: depois do
seed, a linha da empresa vazia para "Cliente pediu segunda via do boleto" tem `stage = 'delivery'`,
`attachment_mode = 'off'` e `leaves_document_behind = false`.

Red provado sem alterar o histórico compartilhado do worktree: revertida a implementação por
`Edit` (não `git stash` — o worktree compartilha a stash com outras sessões), rodando:

```
bun --env-file=../../.env.test test ./test/integration/occurrence-type-catalog-seed.integration.ts
```

→ `expect(received).toBeDefined() — Received: undefined` (1 fail) — a linha não existe sem a
entrada no catálogo.

Reaplicada a implementação (`diff` contra o backup confirmou o arquivo idêntico ao estado
implementado), rodando de novo:

```
bun --env-file=../../.env.test test ./test/integration/occurrence-type-catalog-seed.integration.ts
```

→ **1 pass, 0 fail**, 10 expect() calls.

## Gates (dentro de `apps/api-transportada`)

- **Contrato completo**: `bun --env-file=../../.env.test test --timeout 120000` → **7429 pass, 23
  skip, 0 fail**, 24758 expect() calls.
- **Typecheck**: `bun run typecheck` (`tsc --noEmit`) → sem saída, sem erro.
- **Lint**: `bun run lint` (`eslint src test drizzle.config.ts eslint.config.js
  --max-warnings=0`) → sem saída, sem erro.
- **Integração do arquivo tocado, isolada**:
  `bun --env-file=../../.env.test test ./test/integration/occurrence-type-catalog-seed.integration.ts`
  → **1 pass, 0 fail**, 10 expect() calls (T2 acima).

### Integração completa — não é evidência de verde

`bun --env-file=../../.env.test run test:integration` rodou até o fim (1090s) e voltou **605
pass, 7 skip, 19 fail**. As 19 falhas são **todas timeout de 5000ms** em arquivos totalmente
alheios a esta mudança: `trip-field-office` (M4 da spec 158), `trip-timeline`,
`extra-charge-batch`, `company-energy-repository`, `address-components-source`, `driver-score`,
`occurrence-settlement-charge-bridge`, `trip-occurrence-settlement`, `extra-charge-batch-statement`.
`grep -c "occurrence-type-catalog\|boleto"` no log da corrida completa devolveu **0** — nenhuma
falha toca o arquivo ou o tipo desta spec.

`ps aux` durante a corrida mostrou um **segundo processo** de outra sessão, `bun test
./test/integration/server.in...` (PID 28091), rodando desde 21:48 contra o mesmo banco de teste —
o padrão que a memória do projeto já registra
(`executor-trava-esperando-monitor.md`: "mandar rodar teste em primeiro plano; suítes concorrentes
no mesmo banco não são evidência"). Os 19 timeouts de 5s espalhados por domínios sem relação entre
si (endereço, cobrança, motorista, timeline, energia) e sem nenhuma menção a esta mudança são
consistentes com contenção de lock por outra sessão, não com regressão do código desta spec.

**Esta corrida não prova a suíte de integração verde.** Por decisão explícita (aceitar a evidência
já reunida em vez de esperar a outra sessão liberar o banco), o número acima fica registrado como
está — **605 pass / 19 fail, causa de concorrência, não de código** — e a suíte de integração
completa precisa ser repetida, sem outra sessão no mesmo banco, antes de qualquer publicação
(staging ou produção) que dependa deste commit.

## Commit

Por índice privado (`GIT_INDEX_FILE`), fora do índice principal do worktree, com os arquivos desta
spec.

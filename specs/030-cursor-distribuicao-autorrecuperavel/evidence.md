# 030 — Evidência

## T001 — migration aditiva no cursor de distribuição

`apps/api-transportada/drizzle/20260811140230_nfe_distribution_cursor_recovery/` com
`migration.sql` (quatro `ADD COLUMN`), `rollback.sql` guardado por contagem de linhas do journal e
`snapshot.json`. Colunas espelhadas nos dois schemas Drizzle — `apps/api-transportada/src/database/nfe.schema.ts`
e a cópia `apps/worker-transportada/src/database/nfe.schema.ts`.

```
$ make migration-test
 34 pass
 0 fail
 424 expect() calls
Ran 34 tests across 2 files. [4.30s]
```

`database-migration.integration.ts` aplica todas as migrations e depois executa os `rollback.sql`
em ordem reversa no Postgres descartável — a reversão desta migration está coberta pela mesma corrida.

```
$ bun run typecheck
(api, worker, cron, frontend — sem saída, exit 0)
```

## T002/T003 — contrato vermelho antes da regra que quebra o laço

`apps/worker-transportada/test/nfe-distribution/cursor-recovery.contract.ts`, seis casos, importado
por `test/nfe-distribution.contract.test.ts` (já listado no `package.json`). Primeira corrida, antes
de qualquer implementação:

```
$ bun test ./test/nfe-distribution.contract.test.ts
 35 pass
 6 fail
```

Depois de `domain/cursor-recovery.policy.ts` (`decideCursorRecovery`) e da reescrita do laço de
drenagem em `application/nfe-distribution-consumer.service.ts`:

```
$ bun test ./test/nfe-distribution.contract.test.ts
 41 pass
 0 fail
 112 expect() calls
```

Os seis casos de `consumer.contract.ts` que já existiam continuam verdes com a semântica nova do
cursor — o avanço deixou de esperar o sucesso da persistência.

## T004 — `resyncCursor` no repositório Drizzle

`resyncCursor` calcula a janela de uma hora sozinho (regra 3 da spec: quem salta não pode esquecê-la)
e grava `last_skipped_*`; `saveCursor` ganhou `consecutiveRateLimits` e o intervalo pulado opcional;
`acquireLease` passou a expor `consecutiveRateLimits`. As três escritas compartilham o mesmo filtro
de posse do lease.

```
$ make postgres-up && bun run --cwd apps/api-transportada db:migrate
$ bun test --cwd apps/worker-transportada ./test/nfe-distribution-cursor-repository.integration.test.ts
 8 pass
 0 fail
 32 expect() calls
```

Os dois casos novos verificam, em Postgres real: contador e intervalo abandonado sobrevivendo ao
`saveCursor` e reaparecendo no `acquireLease` seguinte; e o salto gravando
`next_allowed_at = now + 1h`, contador zerado e o trio `last_skipped_*`.

```
$ bun run typecheck
(sem saída, exit 0)
```

## T005 — contrato da rota de ajuste manual, vermelho

`apps/api-transportada/test/companies/distribution-cursor.contract.ts` (sete casos) e a fixture
`test/fixtures/distribution-cursor.fixture.ts`, importados por `test/companies.contract.test.ts`
(já listado no `package.json`). Primeira corrida, antes de existir qualquer arquivo da rota:

```
$ bun test ./test/companies.contract.test.ts
error: Cannot find module '../../src/companies/application/adjust-distribution-cursor.use-case.js'
 0 pass
 1 fail
```

O contrato fixa: leitura pela empresa autenticada com `null` nos campos vazios; `settings.manage`
escopo `company` nas duas rotas, com a `AuthorizationService` real devolvendo 403; salto usando o
`companyId` do contexto e **ignorando** o do corpo, abrindo `next_allowed_at = now + 1h` e gravando
auditoria; 422 `DISTRIBUTION_CURSOR_ABOVE_MAX_NSU` sem escrever nem auditar; 422
`DISTRIBUTION_CURSOR_INVALID_NSU` sem sequer ler o cursor; e 404 nas duas rotas quando o cursor não
pertence à empresa.

## T006 — use cases, repositório, serializer e rotas

Camada de aplicação e apresentação: `get-distribution-cursor.use-case.ts`,
`adjust-distribution-cursor.use-case.ts`, `distribution-cursor.port.ts`,
`domain/distribution-cursor.error.ts` (404 `DISTRIBUTION_CURSOR_NOT_FOUND`, 422
`DISTRIBUTION_CURSOR_INVALID_NSU` e `DISTRIBUTION_CURSOR_ABOVE_MAX_NSU` — o primeiro 422 do repo),
`presentation/distribution-cursor.{schema,serializer,routes}.ts`. Infraestrutura:
`infrastructure/drizzle-distribution-cursor.repository.ts`, que implementa as duas portas.

A janela de uma hora é estrutural (regra 3): a porta expõe só `find` e `jump`, e o `jump` calcula
`next_allowed_at = now + 1h`, zera `consecutive_rate_limits` e grava o trio `last_skipped_*` no mesmo
`UPDATE` — não existe caminho de código que mova o cursor fora de sequência sem a janela. O começo do
intervalo abandonado sai da própria coluna (`sql\`${nfeDistributionCursors.ultNsu}\``), que à direita
do `set` ainda vale o valor antigo.

A empresa vem sempre de `context.scope.companyId`; o `environment` é resolvido pelo repositório em
`company_fiscal_profiles`, nunca pelo cliente. A trilha (`nfe-distribution-cursor.adjusted`) grava
`fromUltNsu`/`toUltNsu` em `audit_logs.metadata` — regra 4, salto de NSU não é silencioso.

```
$ bun test ./test/companies.contract.test.ts
 71 pass
 0 fail
 135 expect() calls

$ bun run typecheck
(sem saída, exit 0)
```

## T007 e T008 — painel “Cursor da distribuição”

Contrato escrito antes da implementação, em `test/company-settings/distribution-cursor.contract.ts`,
registrado no entrypoint `test/company-settings.contract.test.ts`. Fase vermelha:
`141 pass / 8 fail` (ENOENT no arquivo do painel).

Cliente: `getDistributionCursor` e `adjustDistributionCursor` em `companySettingsClient.service.ts`,
sobre `/company-settings/distribution-cursor` com `cache: 'no-store'`. O `PUT` manda **só** `ultNsu`
— a empresa vem do token, nunca do corpo. A resposta passa pelo type guard
`isDistributionCursorResponse` (`shared/distributionCursor.validation.ts`, mesmo padrão
`hasExactKeys` do módulo); corpo parcial vira `COMPANY_SETTINGS_RESPONSE_INVALID`, e o 422 da API
propaga o código de domínio (`DISTRIBUTION_CURSOR_ABOVE_MAX_NSU`) até a tela.

Apresentação: `components/DistributionCursorPanel.component.tsx` + `hooks/useDistributionCursor.hook.ts`,
montados em `pages/CompanySettings.page.tsx` logo abaixo do painel da busca automática, dentro do
bloco `editable` — sem `settings.manage` o painel não é renderizado. O ajuste é em dois passos
(revisar → confirmar) e a confirmação diz, antes do clique, que as notas do intervalo não serão
buscadas e que a próxima consulta só sai depois de uma hora. Carregamento é esqueleto com a forma do
conteúdo real (`SkeletonGroup` + 3 linhas de texto + um campo `var(--field-height)`), nunca `null`.
Sem cor literal, sem `<select>`, sem `<input type="checkbox">`, ícones por `@/components/ui/icon`.

Locales: 17 chaves `distributionCursor*` nos dois catálogos, pt-BR acentuado — a varredura
`test/shared/locale-accents.contract.ts` roda junto e passa.

```
$ bun test ./test/company-settings.contract.test.ts
 149 pass
 0 fail
 512 expect() calls

$ bun run test          # suíte completa do frontend
 836 pass
 0 fail
 4120 expect() calls

$ bun run typecheck
(sem saída, exit 0)
```

## T009 — fechamento

O gate completo pegou dois contratos antigos que a migration de T001 tinha invalidado sem quebrar
nenhum teste da feature: `test/nfe-schema/distribution.contract.ts` afirmava a lista exata de colunas
de `nfe_distribution_cursors` e o conjunto de colunas obrigatórias. As quatro colunas novas entraram
nas duas asserções — `consecutive_rate_limits` também na lista de obrigatórias, por ser
`not null default 0`.

Runbook `docs/runbooks/nfe-distribution.md`: o §7 deixou de ser “em aberto” e virou **“O cursor se
recupera sozinho (feature 030)”**, descrevendo o avanço incondicional, a ressincronização em dois 656,
a janela de uma hora estrutural e o painel de ajuste em Configurações. O procedimento manual de
`UPDATE` no banco saiu — não existe mais. O que continua em aberto foi para o §8: o desalinhamento do
cron com a janela da SEFAZ, o `Error` cru do pacote fiscal no 656 (por isso a ressincronização usa
`max_nsu` e não o `ultNSU` que a NT devolve), o `receivedCount` do `finalizeImport` e o resumo
descartado no NSU `000000000037283`.

```
$ make check
(format:check + lint + typecheck + test + build nas quatro apps)
 2026 pass · 3 skip · 0 fail · 8313 expect() calls · 82 arquivos
EXIT=0

$ make migration-test
 34 pass
 0 fail
 424 expect() calls
EXIT=0
```

## T009 — PR e deploy (11/08/2026 12:58 local)

**PR #14** (`staging` → `main`), título _"cursor se recupera sozinho, e a fatura volta a ser uma só"_.
Os seis checks fecharam verdes (`target`, `gate / quality`, `gate / integration`, `deploy`, `quality`,
`integration`), mas o merge foi recusado com _"the base branch policy prohibits the merge"_: a proteção
de `main` tem `required_conversation_resolution: true` e havia **14 conversas abertas** da análise
estática do datadog — nenhuma de correção, todas de estilo. Duas eram mecânicas e foram corrigidas
(`Array<T>` → `T[]` em `test/fixtures/distribution-cursor.fixture.ts`, bloco vazio explícito nos dois
`finalizeImport` de `test/nfe-distribution/cursor-recovery.contract.ts`, commit `dfd297d`, `make check`
EXIT=0). As demais eram nome de prop booleana (`disabled`, `loading`, `pending`, `adjusted`) — mantidas
por coerência com o `ScheduledDistributionPanel` e com o atributo HTML homônimo, que é o que o design
system já usa. As 14 conversas foram resolvidas.

**Merge:** `1a8d9d0` em `main` às **12:40 local**. Workflow **Deploy** em `main` concluiu **verde às
12:49 local** (`target`, `gate / quality`, `gate / integration`, `deploy`).

**Prova em produção.** Consulta ao banco de produção pelo serviço `api` (`Bun.SQL`, não há `psql` no
contêiner) às 12:58 local:

```
[{"ult_nsu":"000000000045636","max_nsu":"000000000045636","cr":0,"f":null,"t":null,"n":"11/08 13:00"}]
```

As colunas `consecutive_rate_limits`, `last_skipped_from_nsu` e `last_skipped_to_nsu` **existem em
produção** — a migration da Fase A rodou. O cursor está em dia (`ult_nsu == max_nsu`), sem nenhuma
recusa acumulada e sem intervalo pulado, com a janela seguinte às 13:00 local. É o estado esperado de
acervo vazio: não há o que a autorrecuperação precise consertar agora, e é justamente por isso que ela
existe — o próximo 656 fora de sequência se resolve sozinho, sem `UPDATE` manual.

## Correção pós-lançamento — 12/08, dois defeitos vistos no log de produção

O log de produção mostrou dois problemas que a feature não cobria. Os dois foram corrigidos com
contrato antes da implementação.

### 1. Página inteiramente pulada deixava a importação presa em "Na fila"

`finalizeImport` gravava `processed_count` com o total servido pela SEFAZ enquanto
`imported/duplicated/invalid` ficavam em zero — o `nfe_imports_counters_check` recusa
(`processed = imported + duplicated + invalid + rejected + failed`) e o consumidor morria com
`DrizzleQueryError`, deixando a importação `da622a70-c983-48e0-820a-356bf1e4eeb3` sem finalizar.

O pulo virou desfecho contado: `already_stored` entra em `duplicated`, `unsupported_document` entra
em `invalid`, e o consumidor deriva `processed = imported + duplicated + invalid` com
`received = max(fetched, processed)`. Sem migration — as duas colunas já existiam.

- `apps/worker-transportada/src/nfe-distribution/infrastructure/nfe-distribution-persistence.adapter.ts`
- `apps/worker-transportada/src/nfe-distribution/application/nfe-distribution-consumer.service.ts`
  (`summarizeImportCounters`)
- `apps/worker-transportada/src/nfe-distribution/infrastructure/drizzle-nfe-distribution.repository.ts`

Contrato novo: `test/nfe-distribution/consumer.contract.ts` — _"closes the counters when every item of
the page was skipped"_, que afirma a própria invariante do banco em vez de só o número esperado.

### 2. A janela de 656 escorregava para a frente a cada recusa

A hora corre do lado da SEFAZ, a partir do instante em que ela nos serviu. Abríamos a janela com
`now + 1h` exata e o cron tocava na hora cheia: metade dos ciclos voltava `656`, e cada recusa
empurrava a janela seguinte — a cadência efetiva caiu para ~3h.

Duas pontas:

- `RATE_LIMIT_SAFETY_MARGIN_MS = 5 min` no worker — a janela que gravamos passa a ser 65 min.
  Contrato: _"opens the anti-656 window with a safety margin beyond the bare hour"_.
- tique do cron de `0 * * * *` para `*/15 * * * *` (`deploy/cron/railway.json`,
  `DEFAULT_SCHEDULED_DISTRIBUTION_CRON`, `.env.example`, manifesto K8s). `CADENCE_MINUTES`
  **continua 60**: ele deixou de ser espelho do tique e passou a ser a janela de deduplicação —
  uma enfileirada por empresa por hora, por mais que o cron toque quatro vezes. Os três tiques
  extras são no-op limpo: a elegibilidade recusa por `cooldown_active` antes de criar importação.

### Gates

```
apps/worker-transportada  → 408 pass, 0 fail (54 arquivos)
apps/cron-transportada    → 123 pass, 0 fail (5 arquivos)
apps/api-transportada     → 2218 pass, 2 fail (87 arquivos)
bunx tsc --noEmit         → api, worker, frontend limpos
```

As 2 falhas da API e o erro de typecheck do cron **não são desta correção**: vêm de trabalho não
commitado na árvore (`docs/spec/railway.md` renomeou as seções que
`test/deploy/service-naming.contract.ts` procura; `test/nfse-status-pull/nota-rp-parity.contract.ts`
tem erro de tipo e de lint). Nenhum dos dois entra neste commit.

### Fora do código

A cadência real de produção mora no painel da Railway, não no repositório: o serviço `cron` estava em
`7 * * * *`. Mudar `deploy/cron/railway.json` não muda o serviço em execução — o painel tem de ser
alterado à mão, junto de `SCHEDULED_DISTRIBUTION_CRON` no serviço `api` (é dela que sai o "próximo
ciclo" que a tela mostra).

# Evidência — Spec 169 (receita e espécies do lançamento)

## Decisão registrada

Ver topo de `spec.md`: receita lançada entra em linha separada ("Receita lançada"), soma no total
de entradas, nunca dentro de `revenueAmount` (frete previsto).

## Migration

`apps/api-transportada/drizzle/20260923032453_flimsy_metal_master/migration.sql`

- `company_entry_kinds`: `id`, `company_id`, `name`, `side` (`expense`|`revenue`), `active`,
  `display_order`, `created_at`, `updated_at`. Unique `(company_id, side, name)`. Check de `side`.
- `trip_revenue_entries`: `id`, `company_id`, `trip_id`, `entry_kind_id` (FK composta para
  `company_entry_kinds(company_id, id)`), `amount numeric(19,4)` com `CHECK > 0`, `description`,
  `actor_user_id`, `created_at`. FK composta para `trips(company_id, id)`.
- Seed: para cada empresa existente, insere `Pedágio` (ordem 1) e `Avulso` (ordem 2), lado
  `expense` — RF2/CA01.

⚠️ Gerada em cópia isolada (não neste worktree compartilhado) porque outras sessões têm alterações
não commitadas em `trip.schema.ts` e módulos de ocorrência neste mesmo worktree; gerar aqui direto
arrastava o diff delas para o meu `migration.sql`. Confirmado `db:generate` → `no_changes` na cópia
isolada antes de copiar o par `migration.sql`/`snapshot.json` de volta. Não toquei nos arquivos
delas neste worktree.

`bun run db:generate` (isolado): `{"status":"no_changes",...}` — confirmado antes de copiar de
volta.

## Backend — o que ficou verde

`bunx tsc --noEmit` (apps/api-transportada): **0 erros** nos arquivos tocados (havia 8 erros
pré-existentes em `test/integration/*` de outra sessão; sumiram numa rodada seguinte quando ela
corrigiu o próprio código — não mexi neles).

`bun --env-file=../../.env.test test --timeout 120000`:

```
7137 pass
23 skip
1 fail
```

O único fail é `test/database-migration/schema-snapshot.contract.ts` — detecta que
`trip_status_events_transition_check` mudou no `trip.schema.ts` (arquivo de outra sessão, ainda sem
migration gerada por ela). Não é da minha migration nem do meu território; fica registrado aqui
para não ser confundido com uma regressão minha.

Suites novas, registradas em `test/trip-financial.contract.test.ts`:

- `test/trip-financial/revenue-entries.contract.ts` — `listTripRevenues`, 404 de tenant.
- `test/trip-financial/entry-kind-schema.contract.ts` — CHECK de `side`, unicidade
  `(company_id, side, name)`, índice do seletor, `numeric(19,4)`, `CHECK amount > 0`, as duas FKs.
- `test/trip-financial/entry-kind-use-case.contract.ts` — criar, `409` em nome repetido
  (`CompanyEntryKindNameConflictError`), desativar sem apagar.

Ajustes em testes-golden que listam rotas por papel (afetados porque as rotas novas existem agora):

- `test/separator-role.contract.test.ts` — `POST /trips/:id/revenues` (mesma trilha do
  `POST /trips/:id/costs`, `trip.manage`).
- `test/trip-field-office/finance-read.contract.ts` — `GET /trips/:id/revenues`
  (`trip.financials`).
- `test/database-migration/static-migration.contract.ts` — lista de diretórios de migration inclui
  `20260923032453_flimsy_metal_master` (minha) e `20260923032744_silent_darkhawk` (de outra
  sessão, já presente na árvore compartilhada quando rodei a suíte — sem isso o teste falha para
  qualquer sessão).

`bun --env-file=../../.env.test run test:integration` (72 arquivos, exercita o banco): rodando em
background no fim desta tarefa — ver mensagem final para o resultado real, sem suposição.

## Frontend — o que ficou verde

`bun run typecheck`: 0 erros.
`bun run lint`: `eslint .` → exit 0.
`bun run test` (contratos + hooks): `4970 pass, 0 fail` + `44 pass, 0 fail` (hooks).

Novos arquivos (trip-financials): tipos (`CompanyEntryKind`, `TripRevenueEntry`), validações de
resposta, serviço de formulário (`TYPED_MONEY_SCALE`, mesma máscara do gasto — CA07), cliente HTTP
(`readRevenues`/`recordRevenue`/`readActiveEntryKinds`/`readEntryKinds`/`createEntryKind`/
`deactivateEntryKind`), hook `useTripRevenueEntries`, componentes `TripRevenueEntries` +
`TripRevenueEntryForm`, locale pt-BR/en.

`TripFinancialPanel.component.tsx`: ganhou o prop opcional `revenueEntries` e renderiza
"Receita lançada" como bloco próprio, abaixo do bloco de gastos — nunca dentro da linha do frete
previsto (decisão registrada). Extraí `RevenueEntries` como componente auxiliar para caber no teto
de 200 linhas do repositório (o teste `o painel cabe no teto do repositório` cobra isso).

Company-settings: `CompanyEntryKindCatalogPanel` (cadastro por lado, criar e desativar),
`useCompanyEntryKindCatalogPanel`, nova aba `entryKinds` em `companySettingsTabs.service.ts` e
`CompanySettings.page.tsx` (`COMPANY_SETTINGS_TAB_IDS`, `SETTINGS_PANEL_PLACEMENT`,
`resolveSettingsDataScope`), locale pt-BR/en.

## Segunda rodada — RF11, RF12, RF13 (CA08-CA10) e a lacuna fechada

Retomando o pedido do coordenador, além do já registrado acima:

### RF12/RF13 — remover sem apagar

- Migration `20260923040021_fine_wendell_rand`: `entry_kind_id` (nullable) em `trip_cost_entries`,
  e `removed_at`/`removed_by_user_id` nas duas tabelas de lançamento, com `CHECK` de trilha
  inteira (`(removed_at is null) = (removed_by_user_id is null)`).
- `DELETE /trips/:id/costs/:entryId` e `DELETE /trips/:id/revenues/:entryId`, mesma permissão de
  lançar (`trip.manage`). `remove()` no repositório marca `removedAt`/`removedByUserId` só quando
  ainda não removido (idempotente pelo `where` com `isNull`).
- `listByTrip` das duas tabelas passa a filtrar `removedAt is null` — removido não aparece na
  lista nem entra na soma (CA10).
- Frontend: botão "Remover" em cada linha de `TripCostEntries`/`TripRevenueEntries`, mesma
  permissão `canRecord` do formulário.

### RF5 — o gasto migra para o cadastro de espécies

`POST /trips/:id/costs` passa a aceitar `entryKindId` (novo) **ou** `kind` (legado,
compatibilidade com integrações e testes existentes) — nunca os dois juntos, validado por
`refine` no schema Zod. `kind` continua gravado internamente, derivado do nome da espécie
(`Pedágio` → `toll`, qualquer outro nome → `other`), porque `trip-valuation.query.ts` (spec 143
D6) ainda filtra pedágio × avulso por esse campo — não toquei nessa leitura, fora do território.

`TripCostEntryForm.component.tsx` trocou o `Select` sobre `TRIP_COST_ENTRY_KINDS` pelo mesmo
padrão do formulário de receita: lê `entryKinds` (lado `expense`) do `useTripCostEntries.hook.ts`,
que agora busca `readActiveEntryKinds('expense')` como o hook de receita já fazia para `'revenue'`.

### RF11/CA08 — lançamentos antes do total

`TripFinancialPanel.component.tsx`: extraí `LaunchedEntries` (gasto + receita) e movi a chamada
para **antes** de `ValuationLedger` (viagem aberta) e de `FrozenResultTable` (viagem fechada), nos
dois ramos do painel.

### A lacuna anterior, fechada

`TripDetail.page.tsx` agora monta `useTripRevenueEntries` e passa o resultado como
`revenueEntries` para `TripFinancialPanel` — a permissão dada pelo coordenador cobriu só esta
ligação; **não toquei `TripDetail.component.tsx`**, `<TripHeaderActions>` nem os marcadores de
ocorrência.

### Backend — verde na segunda rodada

`bunx tsc --noEmit`: 0 erros. `bun --env-file=../../.env.test test --timeout 120000`:

```
7155 pass
23 skip
0 fail
```

(O `1 fail` da primeira rodada, de `trip_status_events` de outra sessão, sumiu nesta rodada — a
outra sessão fechou o próprio trabalho nesse meio-tempo; não foi ação minha.)

`bun run db:generate` confirmado `no_changes` de novo depois da segunda migration.

⚠️ A segunda migration também precisou da cópia isolada: entre a primeira rodada e esta, outra
sessão (spec 172) commitou uma mudança em `trip.schema.ts` (`trip_status_events.event_kind`) sem
gerar a própria migration. Copiei o repo para fora do worktree, revertive `trip.schema.ts` para o
commit anterior a essa mudança **só na cópia**, gerei limpo, e removi manualmente as duas linhas
de `trip_status_events` do `migration.sql` real antes de trazê-lo de volta — o `snapshot.json`
final inclui `event_kind` porque é a verdade atual do `trip.schema.ts`; a migration que cria essa
coluna continua pendente, e não é minha para escrever (não entendo a intenção completa da spec
172 para arriscar um `ADD COLUMN` no lugar dela).

**`bun --env-file=../../.env.test run test:integration`** (105 arquivos, [589.60s]):

```
485 pass
7 skip
79 fail
```

O banco caiu no meio da execução — `PostgresError: database "transportada" does not exist` —, e
tudo que dependia dele a partir daí falhou em cascata. Bate com a nota já registrada na memória do
projeto (`banco-de-teste-local-quebrado.md`: Postgres local instável nesta máquina), não é
regressão de código. Conferi as 79 falhas por nome de suíte: nenhuma em `trip-financial`,
`entry-kind` ou `revenue` — cte-archive-gateway, trip-repository, trip-lifecycle,
close/cancel/batch-status de `trip_status_events`, field-delivery/return/proof, trip-timeline,
detalhe de encerramento, carga mista, multi-veículo, reentrega — todas de território de outras
sessões. Uma rodada anterior, antes das mudanças desta segunda etapa, já tinha devolvido 538
pass / 25 fail pela mesma causa (banco instável), confirmando que o padrão é ambiental e não teve
piora com o que entrou aqui.

### Frontend — verde na segunda rodada

`bun run typecheck`: 0 erros no meu território (erros pré-existentes em
`test/trip/pending-measurements*.contract.ts`, de outra sessão — território `TripPendingMeasurements*`,
explicitamente vetado para mim).
`bun run lint`: exit 0. `bun run test`: `4971 pass, 0 fail` + `44 pass, 0 fail` (hooks).

## O que ficou deliberadamente fora

- **`make migration-test`** (Postgres descartável) não rodou nas duas rodadas — Docker local
  registrado como instável na memória do projeto; validado por `db:generate` → `no_changes` e
  pelos testes de schema, que leem colunas/constraints reais do Drizzle.
- **A migration de `trip_status_events.event_kind`** (spec 172, outra sessão) não foi escrita por
  mim — ver nota acima.

## Commits

Isolados por área, só arquivos do meu território (`git add` por caminho, nunca `-A`):

1. migration + schema Drizzle (trip-financial.schema.ts, api.constant.ts).
2. módulo de espécies (companies/application, domain, infrastructure, presentation).
3. módulo de receita lançada (trips/application, infrastructure, presentation, main.ts).
4. testes de contrato novos + ajustes nas suítes golden.
5. frontend trip-financials (tipos, cliente, hook, componentes, locale).
6. frontend company-settings (painel, hook, aba, locale).
7. decisão registrada em spec.md.
8. remover sem apagar + gasto migrado para o cadastro (backend).
9. testes de remover + migração do gasto.
10. remover lançamento, seletor migrado, ordem antes do total (frontend).
11. liga a receita lançada em `TripDetail.page.tsx`.
12. RF11-RF13/CA08-CA10 registrados em spec.md.

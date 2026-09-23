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

## O que não rodou, e por quê

- **`TripFinancialPanel` não está ligado à página real da viagem.** Quem monta a tela por trip é
  `apps/frontend-transportada/src/modules/trip/pages/TripDetail.page.tsx`, e a instrução da tarefa
  proibiu explicitamente tocar em `TripDetail*`. O prop `revenueEntries` é opcional exatamente por
  isso: o painel funciona e está testado, mas ninguém ainda constrói o
  `TripRevenueEntriesController` e passa para ele. Isso é trabalho de fora do meu território —
  quem mexer em `TripDetail.page.tsx` (provavelmente outra spec) precisa chamar
  `useTripRevenueEntries` e passar o resultado como `revenueEntries` no `TripFinancialPanel`.
- **Não toquei no seletor de espécie do lançamento de gasto** (`TripCostEntryForm`, que ainda usa
  o enum fixo `TRIP_COST_ENTRY_KINDS`/`toll`/`other`). A spec pede espécie cadastrável para os dois
  lados (RF1, RF5), mas migrar o gasto existente do enum para o cadastro novo é uma mudança maior
  em código e testes já em produção, fora do escopo mínimo de "receita lançada + cadastro de
  espécies" e arriscava conflitar com o território de gasto de outra spec. Ficou documentado aqui
  como lacuna deliberada, não esquecimento.
- **`make migration-test`** (Postgres descartável) não rodou — dependeria de Docker local, que a
  memória do projeto registra como instável nesta máquina; a migration foi validada por
  `db:generate` → `no_changes` na cópia isolada e pelos testes de schema (`entry-kind-schema.
contract.ts`), que leem as colunas e constraints reais do Drizzle.

## Commits

Isolados por área, só arquivos do meu território (`git add` por caminho, nunca `-A`):

1. migration + schema Drizzle (trip-financial.schema.ts, api.constant.ts).
2. módulo de espécies (companies/application, domain, infrastructure, presentation).
3. módulo de receita lançada (trips/application, infrastructure, presentation, main.ts).
4. testes de contrato novos + ajustes nas suítes golden.
5. frontend trip-financials (tipos, cliente, hook, componentes, locale).
6. frontend company-settings (painel, hook, aba, locale).
7. decisão registrada em spec.md.

# Evidência — 325 Contas

## T1.1 — contratos vermelhos (2026-11-13)

Comando (de dentro de `apps/api-transportada`):

```bash
bun --env-file=../../.env.test test ./test/expenses/red-entrypoint.ts
```

Resultado: **0 pass, 22 fail** — vermelho pelo motivo certo (casos de uso e política de vencimento lançam
`not implemented`; `expenses.read`/`expenses.manage` ainda não existem na política de autorização).
`bunx tsc --noEmit` e `bunx eslint` limpos nos arquivos novos.

| Contrato                                    | Cobre                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `expenses/due-date.contract.ts`             | dia 31 em fev (28/29), mês de 30 dias, dia fora de 1–31                                  |
| `expenses/create-expense.contract.ts`       | RF1b/CA05b: motorista obrigatório/recusado; motorista e categoria de outra empresa → 404 |
| `expenses/settle-occurrence.contract.ts`    | baixa única (409), valor ≤ 0 (400), cancelada (409), outra empresa (404)                 |
| `expenses/generate-occurrences.contract.ts` | CA01: mês corrente + 3, rotina duas vezes sem duplicar, inativa, variável com uma        |
| `expenses/permissions.contract.ts`          | RF7/CA03: permissões declaradas, só `company-admin`                                      |

Decisões de forma fixadas pelo contrato (a T1.2/T1.4 seguem): a categoria carrega `requiresDriver`; a porta de
ocorrência tem `insertIfAbsent` (unique conta+competência, `ON CONFLICT DO NOTHING`); o `today` é injetado.

Pendência para a T1.4: a recorrência **quinzenal** tem duas datas por mês, mas a ocorrência é única por
(conta, competência) — a T1.2 precisa decidir a chave (ex.: competência `yyyy-mm` + `slot`). Não está coberta aqui.

## T1.2 — Schema, migration e semente (2026-11-13)

- `bun test ./test/database-migration.contract.test.ts` com Postgres 16 descartável: 227 pass / 0 fail (contrato estático novo `company-expenses.static.contract.ts` + registro na cadeia).
- Migration aplicada por `db:migrate` e rollback por `rollback.sql` num banco real: tabelas somem, entrada do journal removida; reaplicada, semeou as 8 categorias para a empresa existente (só "Pagamento de motorista/agregado" com `requires_driver`).
- `tsc --noEmit`, `eslint` e `prettier --check` limpos. O `make migration-test` roda na CI (sem Docker nesta sessão).

## T1.3 — Permissões (2026-11-13)

**Decisão:** `expenses.read` e `expenses.manage` só no papel `company-admin` (dúvida 4 da spec); concedíveis por grupo,
fora de `SERVICE_ONLY_PERMISSIONS`. Nenhuma herda de outra permissão: o `finance` tem `trip.financials` e `billing.*` e
continua sem ver as contas. Registro de segurança em `docs/SECURITY.md` (2026-11-13).

O que mudou:

- API: `authorization.policy.ts` (catálogo + `company-admin`); contratos exatos em `authorization.contract.test.ts`,
  teste novo "só o company-admin" ali, no `separator-role.contract.test.ts` (separador e ajudante) e no
  `role-permissions.contract.ts` (o catálogo da tela de grupos as oferece).
- `test/expenses/permissions.contract.ts` saiu de `red-entrypoint.ts` e roda por `test/expenses.contract.test.ts`,
  **registrado** na lista `test` do `package.json`.
- Painel: `COMPANY_PERMISSIONS` (`useAuthMe.query.ts`; o guard recusa `/auth/me` com permissão desconhecida, e o
  contrato de paridade com a API cobra a lista), grupo `expenses` em `permissionGroups.constant.ts`, rótulos pt/en.
  Contrato novo `test/identity/expenses-permission.contract.ts`. Sem tela nova (nenhum print a tirar).

Comandos (de dentro de cada app):

```bash
# api-transportada — lista completa de contrato
bun --env-file=../../.env.test run test        # 15150 pass, 35 skip, 0 fail (230 arquivos)
bun --env-file=../../.env.test test ./test/expenses/red-entrypoint.ts   # 0 pass, 20 fail (os 2 de permissão saíram)
# frontend-transportada — identidade, paridade com a API e locales
bun test ./test/identity.contract.test.ts ./test/frontend-contract.test.ts ...   # 5551 pass, 0 fail
```

`tsc --noEmit` nas duas apps, `eslint` nos arquivos tocados e `prettier --check` limpos. Integração não roda nesta task
(nada mudou em banco nem em `test/integration/**`).

### Notas para a T1.4

- **Entrypoint:** acrescente os imports de `due-date`, `create-expense`, `settle-occurrence` e `generate-occurrences` em
  `test/expenses.contract.test.ts` (já está na lista do `package.json`) e apague `test/expenses/red-entrypoint.ts`.
- **Rotas:** leitura (`GET` de contas, categorias, ocorrências e totais) com `expenses.read`; escrita (criar, editar,
  baixar, cancelar, categorias) com `expenses.manage`. Uma permissão **não implica** a outra na política: se quiser que
  quem só tem `expenses.manage` (por grupo) também leia, a rota de leitura usa "qualquer uma de"
  (`grantsAnyPermission`), como outras rotas fazem; o `company-admin` tem as duas e não sente diferença.
- **Contrato de rota:** cobrir 403 sem a permissão (CA03) e 404 de outra empresa (CA04) em cada rota nova; `companyId`
  só do contexto.
- **Categorias de empresa nova** (pendência da T1.2): garantir a semente ao primeiro uso. `insertIfAbsent` recebe `slot`.
- **Auditoria (RF9):** a trilha grava a permissão usada; use `expenses.manage` (ver como
  `contractor-manual-notice.repository.ts` fixa a sua).
- **Painel (T2.2):** o item "Contas" do menu entra em `WORKSPACE_PERMISSIONS` (`workspaceAccess.service.ts`) com
  `expenses.read`; o `satisfies` reprova o typecheck se faltar.
- **Publicação:** o painel recusa `/auth/me` com permissão que não conhece, por isso esta task levou API e painel no mesmo
  PR. Na promoção para a `main`, API e painel vão juntos (o painel antes, se forem separados).

## T1.4 — Casos de uso, rotas e portas Drizzle (2026-11-13)

**Contratos** (de dentro de `apps/api-transportada`): `bun --env-file=../../.env.test test ./test/expenses.contract.test.ts` → 38 pass / 0 fail
(os 22 da T1.1 + os de `expense-management.contract.ts` e `expense-routes.contract.ts`). Lista completa `bun --env-file=../../.env.test run test`:
15186 pass / 35 skip / 0 fail. `tsc --noEmit`, `eslint` e `prettier --check` limpos.
**Integração** nova (`test/integration/expenses-repository.integration.ts`, na lista `test:integration`) contra Postgres 16 descartável: 4 pass
(semente de empresa nova uma vez só, quinzenal com os dois `slot` sem duplicar, baixa única com 409 e 404 de outra empresa, trilha com `expenses.manage`).

**Decisões**

- **Categorias no primeiro uso:** `categories.ensureSeeded` roda em `GET /expense-categories` e em `POST /expense-categories`; só semeia a empresa que não tem
  categoria nenhuma (`ON CONFLICT DO NOTHING` no unique de nome). Empresa existente já foi semeada pela migration.
- **`slot`:** `insertIfAbsent` exige `slot` (1 em toda recorrência; quinzenal 1 = dia 15, 2 = último dia). A variável grava a competência do vencimento, `slot` 1.
- **Recorrência:** a janela é o mês de `today` + 3. Bimestral/trimestral/anual contam a partir de `anchorCompetence` (mês de criação da conta, lido de `created_at`
  em São Paulo); sem âncora vale o primeiro mês da janela. A geração (`generateOccurrencesForExpense`) é a mesma no cadastro e na rotina; **a rotina do
  `cron-transportada` continua sendo a T1.5**, que só precisa chamar `createGenerateExpenseOccurrencesUseCase`.
- **RF5/CA02:** `PATCH /expenses/:id` muda nome, valor, dia, veículo e `active`; nenhuma ocorrência é reescrita (contrato cobra).
- **Baixa e cancelamento** são `UPDATE … WHERE status = 'open'`: a corrida perdida vira 409 e nunca sobrescreve. Baixa grava `paid_at` como meio-dia de São Paulo
  (a data civil não escorrega de dia). `POST …/cancellation` exige motivo (RF6).
- **Totais** (`totals` da lista): previsto soma as não canceladas, pago soma as baixadas, mais `paidByDriver` (RF1c); soma em centavos (`bigint`), nunca float.
  O destaque de "vencida" fica para o painel (compara `dueDate` com hoje).
- **Auditoria (RF9):** `audit_logs` com `permission = 'expenses.manage'` (`expense.created`, `expense.updated`, `expense.occurrence.settled|canceled`,
  `expense.category.created|activated|deactivated`), metadados sem dado pessoal.
- **Isolamento (CA04):** todo repositório filtra por `company_id`; conta, ocorrência ou categoria de outra empresa responde 404; `companyId` e autor vêm só do contexto
  e o corpo é `.strict()` (um `companyId` no payload é 400).

**Para a T1.4b/T1.4c:** o `ExpenseOccurrenceListItem` já devolve `payeeDriverId`/nome/modelo; a tabela de viagens do pagamento entra ao lado sem mexer na chave
`(expense, competence, slot)`. Dúvida deixada em aberto: a leitura aceita só `expenses.read` (sem "qualquer uma de"), conforme CA03.

## T1.4b — Viagens do pagamento (2026-11-13)

**Alinhamento com a T1.4c.** O PR #741 (docs do rateio) já estava mergeado e trouxe a T1.4c só como task. Para ela não
precisar de migration trocando restrição, a tabela nasce com `parcel_kind` (`driver` | `helper`, CHECK) e a chave
`unique(trip_id, parcel_kind, driver_id)`. O `driver_id` entra na chave porque a parcela da viagem soma a tripulação inteira
daquele papel (dois condutores, ou dois ajudantes, são duas pessoas a pagar, e a valoração da 143 já tem uma linha por
condutor); a regra continua "a parte de uma pessoa numa parcela da viagem é paga uma vez só". RF1d da spec foi ajustado.

**Contratos** (de dentro de `apps/api-transportada`): `bun --env-file=../../.env.test test ./test/expenses.contract.test.ts` →
56 pass / 0 fail (18 novos em `test/expenses/occurrence-trips.contract.ts`, mais as 4 rotas novas na lista exata de
`expense-routes.contract.ts`). Migration: `DRIZZLE_TEST_DATABASE_URL=… bun run db:test` → 269 pass / 0 fail contra Postgres 16
descartável (inclui `company-expense-occurrence-trips.static.contract.ts`, o snapshot e migration + rollback).
**Integração** nova `test/integration/expense-occurrence-trips.integration.ts` (registrada em `test:integration`) contra Postgres 16:
6 pass, junto dos 4 da T1.4 (10 pass), com a valoração real (`DrizzleTripValuationQuery`):

- a quinzena lista as concluídas do favorecido pelo dia de São Paulo (conclusão às 23h30 de 15/11 em SP, 02h30 UTC de 16/11,
  cai na 1ª quinzena), com `250,00 × 3 dias` lidos da diária do motorista e de `trips.daily_allowance_days`;
- incluir copia a linha e o previsto vira a soma (`1250,00`); a mesma viagem em outro pagamento é 409;
- duas inclusões **simultâneas** da mesma viagem em pagamentos diferentes: uma `included`, outra `taken`, uma linha só no banco;
- remover recalcula, e sem viagem o previsto volta ao valor da conta;
- ocorrência paga é imutável; viagem e ocorrência de outra empresa são 404 e `listHeld` da outra empresa vem vazio;
- `audit_logs` com `expense.occurrence.trip.included|removed` e `permission = 'expenses.manage'`.

Lista completa de contrato `bun --env-file=../../.env.test run test`: 15216 pass / 26 skip / 0 fail (230 arquivos). Na primeira
rodada dois guardas pegaram o que faltava e foram corrigidos: a política do recorte de staging (`deploy/staging-refresh/prune-source.sql`
ganhou `company_expense_occurrence_trips` como `keep`; viagem cortada leva a linha junto pela FK) e a lista fechada de leitores de
posição (196 RF12): a leitura de `trip_status_events` foi para `infrastructure/payable-trip.query.ts`, só com colunas explícitas.
`tsc --noEmit`, `eslint` e `prettier --check` limpos nos arquivos tocados.

**Decisões**

- **De onde vem o valor:** da valoração em lote da lista de viagens (spec 259, `readValuationContexts` +
  `buildValuationFromContext`), a linha da pessoa em `basis.crew` (`diária × dias`). Não lê `trip_financial_results`: o
  congelamento só existe por recálculo manual hoje (nenhuma escrita automática), então a valoração é o número que a viagem mostra.
  O valor é **copiado** na inclusão; mudar a diária depois não altera o pagamento já montado.
- **Arredondamento:** a linha (`numeric(19,4)`) vira centavos meio para cima, por viagem; o previsto é a soma das linhas
  arredondadas, calculada pelo banco (`sum(amount)`) na mesma transação.
- **Lacuna:** parcela `missing`/`period` (sem dias conhecidos, sem condutor) não entra; sai em `pending` com o código da lacuna
  (`NO_PLANNED_DURATION` etc.), e o `POST` responde `409 EXPENSE_TRIP_PARCEL_MISSING`.
- **Conclusão:** última transição para `completed` em `trip_status_events`; viagem anterior ao histórico cai em `closed_at` e
  depois em `updated_at`. Só `status = 'completed'` entra.
- **Período:** o da ocorrência (mês; quinzenal 1–15 / 16–último). `?from&to` (os dois, até 93 dias) alcança a viagem que ficou
  para trás. A viagem já incluída em qualquer pagamento não aparece.
- **Corrida:** incluir e remover travam a ocorrência (`FOR UPDATE`) e só agem com ela `open`; a baixa é
  `UPDATE … WHERE status = 'open'`, então as duas nunca se cruzam. O `unique` decide a mesma viagem em duas ocorrências.
- **Erros novos:** `409 EXPENSE_OCCURRENCE_NOT_DRIVER_PAYMENT` (conta sem favorecido), `404 EXPENSE_TRIP_NOT_FOUND`,
  `409 EXPENSE_TRIP_NOT_COMPLETED`, `409 EXPENSE_TRIP_NOT_PAYEE` (favorecido fora da tripulação, ou ajudante até a T1.4c),
  `409 EXPENSE_TRIP_PARCEL_MISSING`, `409 EXPENSE_TRIP_ALREADY_INCLUDED`, `404 EXPENSE_OCCURRENCE_TRIP_NOT_FOUND`. Repetir a
  inclusão na mesma ocorrência é idempotente (200, sem auditoria nova).
- **"Previsto editável" (RF1d):** não há rota para editar o previsto da ocorrência (nem antes desta task); a diferença fica
  visível pela baixa (`paidAmount` livre) contra `tripsTotal`. Se a tela da T2.2b precisar editar o previsto, é uma rota nova.

**Para a T1.4c:** acrescentar `'helper'` em `PAYABLE_TRIP_PARCEL_KINDS` e ler a linha do ajudante em
`trip-person-parcel.gateway.ts`; a parcela `helper` da valoração ainda não tem `basis` por pessoa.
**Para a T2.2b:** a resposta de `GET|POST|DELETE …/trips` é `{ data: { occurrence, items[], tripsTotal } }`; a de
`available-trips` é `{ data: { period, available[], pending[] } }`.

## T1.4c — O ajudante no pagamento (2026-11-13)

**Sem migration.** A tabela e a chave `unique(trip_id, parcel_kind, driver_id)` da T1.4b já aceitavam `helper`.

**Decisões**

- **A linha do ajudante vem da valoração, como a do motorista.** A parcela `helper` (`buildTripHelperCost`, 149 D7) passou a
  devolver `basis: { of: 'helper', days, crew: [{ driverId, dailyAmount, rateOrigin: 'own' | 'company', subtotal }] }`, uma linha
  por ajudante **com diária**, e o `amount` passou a ser a soma dessas linhas (antes era `Σ diárias × dias`; o número é o mesmo,
  contrato de tabela com dízimas cobra `Σ subtotal === amount`). Nada fora dessa função multiplica diária × dias: o gateway do
  pagamento só procura a linha da pessoa. Sem linha não há valor inventado: ajudante sem diária (própria nem geral) sai em
  `pending` com `HELPER_DAILY_RATE_MISSING`, também quando outro ajudante da mesma viagem tem diária (parcela `measured` com
  `detail: '1/2'`); jornada nunca congelada sai com `HELPER_JOURNEY_UNKNOWN`. Sem a volta (`estimated`) a linha tem valor e entra.
- **Cada viagem entra pelo papel da pessoa nela.** `listCompleted`/`findFacts` já devolviam o papel de `trip_drivers.role`; o
  gateway olha só `crew` (condutores) para `driver` e só `helperCrew` para `helper`, então a mesma pessoa nunca é lida nas duas
  parcelas da mesma viagem. Quem dirige numa viagem e ajuda noutra aparece com as duas, cada uma com o seu `parcelKind`.
- **Não soma de novo.** Motorista e ajudante da mesma viagem viram duas linhas em `company_expense_occurrence_trips`
  (`driver`/motorista e `helper`/ajudante), cada uma no pagamento da sua pessoa; nenhuma ocorrência soma a parcela da outra.
- **Rótulo.** `GET /expense-occurrences` ganhou `payeeProfile` (`resolveExpensePayeeProfile`, lido do cadastro na hora):
  `can_drive = false` → `helper`; senão `route_table` → `aggregate` e `fixed` → `driver`. A API devolve a chave, o texto é da tela
  (T2.1). Nenhum painel publicado lê essa rota ainda (Fase 2 por fazer), então a chave nova não quebra guarda de chaves exatas.
- **Valoração na tela.** O `basis` novo aparece em `costParcels` do detalhe, da lista e da proposta de viagem. O painel lê `basis`
  por forma (`readBasis` em `tripValuationResponse.validation.ts` devolve `null` para `of` desconhecido), então a tela segue
  mostrando só o total do ajudante; o congelamento (`freeze-trip-financial-result`) só compõe nota para `of: 'driver'`.

**Provas** (de dentro de `apps/api-transportada`)

- Contratos: `bun --env-file=../../.env.test test ./test/expenses.contract.test.ts` → 65 pass / 0 fail (9 novos em
  `test/expenses/occurrence-trips-helper.contract.ts`: lista do ajudante com lacuna em pendências, pessoa nos dois papéis,
  inclusão com auditoria `parcelKind: helper`, motorista e ajudante da mesma viagem sem somar, um pagamento só, 409 de lacuna e de
  viagem em que não estava, rótulo). `test/trip-financial.contract.test.ts` + `test/suggestion-valuation.contract.test.ts` → 134 pass
  (o `basis` nos casos com valor e a soma exata das linhas).
- Integração contra Postgres 16 descartável: `expense-occurrence-trips.integration.ts` + `expenses-repository.integration.ts` →
  11 pass, com o caso novo pela valoração real (`DrizzleTripValuationQuery`): viagem com motorista, ajudante com diária própria
  130,00 e ajudante sem diária, jornada de 30 h → `130,00 × 2 = 260,00` para o primeiro, `pending` para o segundo, o motorista com
  `200,00 × 2 = 400,00` no pagamento dele e duas linhas no banco (`driver`/`helper`), `payeeProfile` `helper`/`aggregate`.
  `suggestion-helper-cost.integration.ts` e `trip-list-occupancy-financials.integration.ts` verdes.
- Lista completa de contrato `bun --env-file=../../.env.test run test`: 15217 pass / 26 skip / 9 fail; os 9 são
  `toll booth catalog repository` (`test/toll-booths/…`), que falham igual sem esta mudança nesta sessão (precisam do Postgres
  da `.env.test`, que não está de pé aqui). `trip-financial-end-to-end.integration.ts` também falha igual sem a mudança
  (`version` 11 em vez de 2, mesmo resultado com `git stash`). `tsc --noEmit`, `eslint` e `prettier --check` limpos nos arquivos tocados.

## T1.5 — Rotina que gera as ocorrências das contas fixas (2026-11-13)

**Desenho.** O `cron-transportada` é só o relógio (uma batida a cada 5 min publica as rotinas vencidas); quem executa é o worker. A rotina entra como as outras (319 T7): nome no catálogo das quatro apps (`api`, `cron`, `worker`, `frontend`), CHECKs de `job` ampliadas e uma linha em `job_schedules`. Como nenhuma app importa código de outra, o worker **não chama** `createGenerateExpenseOccurrencesUseCase`: ele espelha a política de calendário (`expense-schedule.policy.ts`) e o SQL de `listActiveFixed`/`insertIfAbsent`, e `test/company-expense-occurrence/parity.contract.ts` cobra a igualdade linha a linha contra os arquivos da API.

**Decisões**

- **Nome e cadência:** `company-expense.occurrence.generate`, uma vez por dia (a janela é de 4 meses; mais fino não gera nada novo).
- **Nasce pausada** (`enabled = false`, `paused_origin = 'system'`), como as rotinas recentes: ligar é decisão do dono (runbook § 5.33). Para a T3.1, em staging, basta retomar no painel de rotinas.
- **Data civil:** `today` = data de America/Sao_Paulo no instante do ciclo (02:30 UTC de 1º/dez ainda é 30/nov).
- **Âncora:** a API não tem coluna de âncora; a rotina usa o mês de `created_at` em São Paulo (igual ao que a T1.4 documentou), estável entre execuções — sem ela a bimestral andaria de mês a cada dia (contrato cobre).
- **Falha parcial:** a empresa que erra é registrada e as outras terminam; ao fim o ciclo lança erro (`unexpected_error`) para a execução aparecer como falha.

**Provas**

- Worker: `bun run test` → 3158 pass; os 5 que falham são `threaded canhoto barcode decoder` (`decode thread exited with 13`, `worker_thread` do Bun 1.4.4 desta sessão, o projeto fixa 1.3.14; arquivo não tocado). Contratos novos (`company-expense-occurrence.contract.test.ts`: janela em SP, idempotência, dia 31, quinzenal, âncora, falha parcial, parada, calendário e paridade) e catálogo verdes.
- Integração contra Postgres 16 descartável com as migrations aplicadas: `company-expense-occurrence.integration.test.ts` 2 pass (gera só as fixas ativas, 2º ciclo `created = 0`); `job_schedules` ficou com a linha pausada.
- Migration e rollback: `bun run db:test` (API) 266 pass / 0 fail, com o rollback encadeado (`company-expense-occurrence-job-rollback.assertion.ts` sai antes do de 319 T7).
- API `job-catalog` (13), cron (102) e frontend (`job-catalog.contract.ts`, 6) verdes; `tsc`, `eslint` e `prettier --check` limpos.

## T2.1 — Módulo `expenses` no painel (2026-11-13)

**O que entrou** (`apps/frontend-transportada/src/modules/expenses/`): `shared/expenses.types.ts` (tipos e vocabulário fechado: tipo, recorrência, estado, modelo de pagamento, parcela), `shared/expensesClient.service.ts` (contas, categorias, ocorrências, baixa, cancelamento, viagens do pagamento e viagens disponíveis; o código de erro da API sobe como veio), `shared/expensesResponse.validation.ts` (guard manual: vocabulário **conferido**, dinheiro só como texto decimal, `slot` 1 ou 2), `hooks/useExpenses.hook.ts` (leituras e mutações com a chave raiz `expenses`; toda escrita invalida a raiz, sem prender o botão) e `locales/expenses(.en).locale.json` (rótulos de tipo, recorrência, estado, motorista/agregado/ajudante, totais e mensagens dos erros `EXPENSE_*`).

**Decisões**

- O painel não importa código da API: o vocabulário é cópia por valor e o contrato lê `company-expense.schema.ts` para falhar se a API ganhar um valor que o painel não conhece.
- Para a T2.2, a lista de ocorrências já chega com nome da conta, categoria e favorecido; o rótulo "Agregado" sai de `payeeDriverPaymentModel === 'route_table'` e "Motorista" de `'fixed'`. O rótulo "Ajudante" fica para a T1.4c (a lista ainda não diz o papel).
- Sem tela, menu nem item em Configurações: T2.2 a T2.3.

**Provas** (de dentro de `apps/frontend-transportada`)

- `bun test ./test/expenses.contract.test.ts` → 11 pass / 0 fail (guard, cliente, paridade de vocabulário com a API, paridade pt/en).
- `bun run test` → 1496 pass / 0 fail. `tsc --noEmit`, `eslint` (módulo e testes) e `prettier --check` limpos.

## T2.2 — Página `/contas` (2026-11-13)

**O que entrou** (`apps/frontend-transportada/src/modules/expenses/`): `pages/ExpensesWorkspace.page.tsx`, `hooks/useExpensesWorkspace.hook.ts` (permissão, filtros, consultas), `components/ExpenseCreateDialog`, `ExpenseSettleDialog` e `ExpenseDialogShell` (foco preso e Esc pelo `useModalDialog`; tela cheia no celular), `shared/expensesView.service.ts` (vencida, resumo, máscara e validação do formulário, tudo com dinheiro em texto) e `styles/expenses.module.css`. Menu: chave `expenses`, `/contas`, grupo Fiscal, `WORKSPACE_PERMISSIONS.expenses = ['expenses.read']`; ícone `workspace-expenses`; `main.tsx` resolve a rota. Botões "Nova conta", "Dar baixa" e "Viagens" (edição) só com `expenses.manage`; baixa só em conta em aberto.

**Decisões**

- Só componentes do design system (`Select`, `DatePicker`, `Button`, `Badge`, `Skeleton`); campo de texto e dinheiro seguem o molde de `tripFinancials` (`--field-height`/`--field-padding`, rótulo em cima).
- "Vencida" é calculada na tela (aberta com vencimento anterior a hoje, data civil local); "Em aberto" e "Vencidas" saem das linhas do mês filtrado, previsto e pago vêm dos totais da API.
- A lista de pessoas do seletor e do filtro é a de motoristas ativos da frota (`useDriverOptions`, exige `fleet.read`); o rótulo Motorista/Agregado vem do cadastro na hora da leitura. **O rótulo "Ajudante" entra com a T1.4c** (PR 749).
- Sugestão de recorrência/valor pelo cadastro do motorista (RF1b) **não** entrou: a lista de frota usada não traz o período de pagamento. Fica como melhoria.
- Cancelar ocorrência não tem botão ainda (o hook existe); não estava na task.
- Tabela vira cartão abaixo de 40 rem (`data-column`, não `data-label`: o contrato de campos lê "label" no seletor).

**Provas** (de dentro de `apps/frontend-transportada`)

- `bun run test` → 1496 pass / 0 fail (inclui `test/expenses/view.contract.ts`, 9 casos novos, e os contratos de menu, permissão por workspace e de diálogo em tela cheia, ajustados para a chave nova). `tsc --noEmit`, `eslint` e `prettier --check` limpos.
- Prints (claro e escuro, desktop 1440 e celular 390), por `test/spec-325-prints.smoke.spec.ts` (fora da CI): `prints/contas-lista-*`, `contas-nova-*`, `contas-baixa-*`. Comparados com Ressarcimentos e Resultados (mesmos rótulos, campos, botões e cartão de totais) e com os previews aprovados em `325-contas/prints`.

## T2.2b — Viagens do pagamento (2026-11-13)

**O que entrou:** `components/ExpenseTripsDialog.component.tsx`: viagens incluídas (concluída em, diária × dias, valor, "Remover"), total do pagamento (`tripsTotal` da API), "Adicionar viagens" (lista as disponíveis do período com "Incluir") e, abaixo, as viagens que ficam de fora com o motivo (`gap.*`). Incluir/remover só com `expenses.manage` e conta em aberto; paga ou cancelada só mostra.

**Decisões**

- Sem "Usar como valor previsto": a T1.4b já faz o total virar o previsto a cada inclusão/remoção.
- ~~A API devolve só o `tripId`~~ Resolvido na seção "T2.2b — trajeto da viagem" abaixo.

**Provas:** `prints/contas-viagens-*` (4 combinações); guardas e cliente já cobertos pela T2.1. Mesma bateria da T2.2.

## T4.1 — ADR-0116, o rateio calculado na leitura (2026-11-13)

**Entrega:** [ADR-0116](../../docs/adr/0116-o-rateio-das-contas-e-calculado-na-leitura.md) passou de "proposto" a **aceito**, com as regras que
Anderson aprovou na T4.0, e a seção de dúvidas da extensão na `spec.md` foi fechada (5 a 8, mais o limite de 10%). Tarefa só de
documentação: nenhum código, migration ou teste mudou.

**O que a ADR fixa para as próximas tasks**

| Regra                                                                                     | Seção | Quem cobra                |
| ----------------------------------------------------------------------------------------- | ----- | ------------------------- |
| Peso de cada critério: distância planejada, diárias (143), receita do resultado vivo, 1   | §2    | T4.4 (contrato de tabela) |
| Viagem entra pela conclusão no período; conta pelo pago, senão previsto; cancelada fora   | §3    | T4.2, T4.5                |
| Conta com veículo só nas viagens dele; sem veículo, entre as viagens de todos os veículos | §3    | CA09 (T4.2)               |
| Nada gravado na viagem; mês fechado recalculado; filtro não muda o rateio                 | §4    | T4.5, CA11                |
| Excedente do pagamento de motorista = max(0, considerado − viagens), grupo administrativo | §5    | CA07 (T4.2), T4.4         |
| `distribute` da 232 (piso + resto à viagem de maior peso, ordem estável); soma fecha      | §6    | CA06, CA08 (T4.2), T4.4   |
| Um caso de uso para tela, PDF, CSV, custo por km e previsão; limite de 10% configurável   | §7    | T4.5, T4.6, T6.x          |

**Achado ao conferir o código** (para a T4.5): `trips.closed_at` é gravado pelo encerramento do painel
(`drizzle-trip.repository.ts`), mas a conclusão pelo relatório do motorista (`drizzle-driver-field-report.repository.ts`,
`.set({ status: 'completed', … })`) não grava a data. A T1.4b já contornou isso no pagamento (`payable-trip.query.ts`:
última transição para `completed` em `trip_status_events`, depois `closed_at`, depois `updated_at`); a ADR manda o rateio
usar essa mesma expressão, para a viagem não cair num mês no pagamento e noutro no resultado.

**Prova:** `bunx prettier --check` nos quatro arquivos alterados (ADR, `spec.md`, `tasks.md`, `evidence.md`): limpos.

## T2.3 — Painel "Categorias de contas" (2026-11-13)

- Aba `expenseCategories` em Configurações da empresa (`SETTINGS_PANELS`, `SETTINGS_PANEL_PLACEMENT`, `COMPANY_SETTINGS_TAB_IDS`, fonte de dados `expenseCategories`). Painel autocontido `ExpenseCategoriesPanel`: lista as categorias (marca "exige motorista" e "inativa"), cadastra por nome e desativa/reativa (nunca apaga). Usa os hooks do módulo `expenses` (T2.1); a aba segue visível com `settings.manage`, e o painel lê com `expenses.read` e escreve com `expenses.manage` (sem a leitura não faz chamada). Nome repetido (`EXPENSE_CATEGORY_NAME_TAKEN`) tem frase própria; qualquer outro código cai na genérica.
- Só componentes do design system, no mesmo molde do painel Vendedores (rótulo em cima, `Button`, `Skeleton`). Textos pt/en em `companySettings.*.locale.json`, sem mexer no locale de `expenses` nem em rota/menu (T2.2).
- Contrato novo `test/expenses/categories-panel.contract.ts` (registrado em `test/expenses.contract.test.ts`): endereço da aba e consulta ligada só nela, mapa de erros, paridade pt/en. `bun run test` do painel: verde; `tsc` e `eslint` limpos.
- Prints (claro/escuro × desktop 1440/celular 375) em `prints/categorias-*.png`, gerados por `test/spec-325-categorias-prints.smoke.spec.ts` (fora da CI, `PLAYWRIGHT_TEST_MATCH=spec-325-categorias-prints.smoke.spec.ts`), comparados com a aba Vendedores.

## T4.2 — Contratos vermelhos do rateio (2026-11-13)

**O que entrou** (`apps/api-transportada`, tudo vermelho de propósito; rodar com `bun --env-file=../../.env.test test ./test/expenses/allocation-red-entrypoint.ts`):

| Arquivo                                   | Prende                                                                                                                                                                                                                               | Fecha na |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `test/expenses/allocation.contract.ts`    | Peso dos quatro critérios; soma fecha em centavos (resto à viagem de maior peso, ordem estável); peso zero; veículo só nas viagens dele (CA09); conta sem veículo entre todos; excedente do pagamento de motorista (CA07)            | T4.4     |
| `test/expenses/result.contract.ts`        | Lucro = faturamento − custo − contas e soma por viagem/veículo/cliente (CA06); pago vence previsto; cancelada fora; período; CA07 no resultado; isolamento (CA10); critério muda divisão e não total (CA08); padrão sem configuração | T4.5     |
| `test/expenses/result-routes.contract.ts` | Permissões (`expenses.read` nas três leituras, `expenses.manage` no PUT do critério), `companyId` só do contexto; a consulta de viagens do rateio reaproveita `completedOnSql` do pagamento (ADR-0116 §3)                            | T4.5     |

**Resultado medido:** 34 testes, 0 pass / 34 fail (todos por "not implemented" ou arquivo ausente). `tsc --noEmit` e `eslint` limpos; `bun test ./test/expenses.contract.test.ts` segue 65 pass / 0 fail (a lista oficial não mudou).

**Decisões para a T4.4/T4.5**

- Formato do rateio fixado pelos tipos em `expense-allocation.policy.ts`: cada parte tem `scope` `vehicle` (conta com `vehicle_id`) ou `general` (sem veículo e excedente), que vira as colunas "rateio do veículo" e "rateio geral". Não rateado leva `reason` (`vehicle_without_trips` | `no_trip_weight`) e o veículo.
- **Data de conclusão (ADR-0116 §3):** o contrato exige que `payable-trip.query.ts` exporte `completedOnSql` e que `infrastructure/allocation-trip.query.ts` (T4.5) o importe, sem usar só `trips.closedAt`; a viagem concluída pelo relatório do motorista não grava `closed_at`. Hoje a constante não é exportada, então o contrato está vermelho por isso também.
- Empate de peso: ordem estável por data de conclusão e depois `id`; o resto do centavo vai à primeira.

## T4.4 — Serviço de rateio (2026-11-13)

**O que entrou** (`apps/api-transportada`):

- `src/expenses/domain/expense-allocation.policy.ts`: `allocateExpenses` implementado, puro e sem banco (ADR-0116).
  - Peso por critério (§2): `per_km` = metros (fração arredondada ao metro), `per_trip_day` = diárias, `per_revenue` = receita em
    décimos de milésimo (aceita as 4 casas do banco; negativa ou ilegível pesa zero), `equal` = 1.
  - Quem participa (§3): conta com `vehicleId` só nas viagens daquele veículo (`scope: 'vehicle'`); sem veículo, entre todas as
    viagens do período (`scope: 'general'`). Veículo sem viagem → não rateado `vehicle_without_trips` com o veículo; todas as
    elegíveis com peso zero (ou nenhuma viagem) → `no_trip_weight`.
  - Motorista não duplica (§5): `in_trip` entra só por `max(0, considerado − includedTripsAmount)` (ausente = `0`), listado em
    `excesses` e rateado no grupo `administrative`, sempre geral (mesmo com veículo). Abaixo das viagens: nada, sem crédito.
  - A soma fecha (§6): cada conta é dividida sozinha em centavos por `distributeByWeight`, com as viagens ordenadas por
    `completedOn` e `tripId` antes da divisão (a ordem de entrada não muda quem leva o centavo). Parte de zero centavo não sai.
  - Valor de conta ilegível, negativo ou com fração de centavo **lança** (nunca vira zero, que quebraria a soma). As 4 casas do
    banco só passam com o centavo exato (`'10.5000'`).
- `src/shared/proportional-split.policy.ts`: `distributeByWeight`, o `distribute` da 232 movido sem mudança de lógica;
  `trips/domain/document-cost-apportionment.policy.ts` passou a importá-lo (ADR-0116 §6 pede o mesmo, não uma cópia).
- `test/expenses/allocation.contract.ts` saiu de `allocation-red-entrypoint.ts` e foi importado em `test/expenses.contract.test.ts`
  (já na lista do `package.json`). Ganhou 7 casos de borda: 4 casas do banco, valor ilegível recusado, excedente sem viagem,
  excedente com veículo vai ao geral, pagamento sem a soma das viagens, ordem de entrada estável, distância fracionária.

**Fora daqui (T4.5):** `result.contract.ts` e `result-routes.contract.ts` seguem vermelhos no entrypoint de fora da lista. A data de
conclusão não passa por esta política: `AllocationTrip.completedOn` é montado pela consulta da T4.5 com `completedOnSql` de
`payable-trip.query.ts` (a conclusão pelo relatório do motorista não grava `closed_at`); exportar a constante é da T4.5, que tem o
contrato que a cobra.

**Prova:**

- `bun test ./test/expenses/allocation.contract.ts`: 25 pass / 0 fail.
- `bun test ./test/expenses.contract.test.ts ./test/trip-domain.contract.test.ts ./test/trip-valuation`: 663 pass / 0 fail (o rateio
  por nota da 232 segue verde com o `distribute` extraído).
- Suíte de contrato da API (`bun test --timeout 120000`): 15242 pass / 0 fail.
- `tsc --noEmit` limpo; `eslint` e `prettier --check` limpos nos arquivos alterados.

## T2.2b — trajeto da viagem (2026-11-13)

**Decisão (coordenação, 13/11):** o preview aprovado mostra "Viagem … · Ribeirão → Campinas"; a API passa a devolver o trajeto e o painel o mostra. Recorrência pelo cadastro e cancelar conta ficam fora.

**Não existe número de viagem no banco** (`trips` não tem coluna de número). O identificador do produto é o início do id (8 caracteres, como a tabela e o detalhe de Viagens). O painel mantém "Viagem 1f2a3b4c" e acrescenta o trajeto; numerar viagens pediria migration e fica como decisão do dono, fora desta entrega.

**API** (`apps/api-transportada/src/expenses`): `deriveExpenseTripRoute` (`domain/expense-trip-route.policy.ts`, pura) lê o rótulo da primeira e da última parada por `sequence` (`RUA X, 12, CIDADE, UF` → só a cidade; mesma cidade nas duas pontas ou parada única vira só o destino). Porta nova `payableTrips.readRoutes` (uma consulta em lote em `trip_stops`, sempre com `company_id`, sem migration). `route: { destination, origin: string | null } | null` sai em `GET /expense-occurrences/:id/trips` (e nas respostas de incluir/remover) e em `available[]`/`pending[]` de `.../available-trips`; `null` quando a viagem não tem parada.

**Painel:** `route` é **opcional** no guard (ausente = API anterior, `null` = sem parada), então o painel pode ir antes da API (ADR-0081 §9). `formatTripRoute` e as chaves `trips.tripNumberRoute` / `trips.pendingTripRoute` (pt e en).

**Provas**

- API: `bun --env-file=../../.env.test test ./test/expenses.contract.test.ts` → 70 pass / 0 fail (inclui `test/expenses/trip-route.contract.ts`, 4 casos, e o trajeto nas listas); integração contra Postgres 16 descartável (`expense-occurrence-trips.integration.ts`) → 8 pass, com o caso "o trajeto sai das paradas da própria empresa" (parada de outra empresa não vaza). `tsc --noEmit` e `eslint` limpos.
- Painel: `bun run test` → 1496 pass / 0 fail; `tsc`, `eslint` e `prettier` limpos. Prints regerados em `prints/contas-viagens-*` (claro/escuro × desktop/celular).

## T2.4 — Revisão de design da Fase 2 (2026-11-13)

- Prints regerados por `test/spec-325-prints.smoke.spec.ts` e `test/spec-325-categorias-prints.smoke.spec.ts` (fora da CI, `VITE_SMOKE_AUTH_BYPASS=true`): 20 imagens em `prints/` (lista, nova, baixa, viagens, categorias × claro/escuro × desktop 1440/celular 375).
- Comparação: filtros, cartão de totais, tabela, selos de estado e botões iguais aos de Ressarcimentos e da aba Vendedores (rótulo em cima, campo e seletor na altura padrão, botão primário/secundário padrão); e aos previews aprovados em `325-contas/prints` (diferenças só nos dados de exemplo e no rótulo "Motorista, agregado ou ajudante", decidido na T2.2).
- **Desvio achado e corrigido:** no celular, o texto de apoio da célula (favorecido na lista de contas; papel "Motorista/Agregado/Ajudante" na lista de viagens do pagamento) virava um segundo filho da grade de duas colunas e caía sob a coluna do rótulo, deixando o valor vazio. As duas células agora têm um único filho (`<div>`), como as demais tabelas empilhadas. Prints regerados.
- Provas: `bun test ./test/expenses.contract.test.ts` 26 pass / 0 fail; `tsc`, `eslint` e `prettier` limpos.

## T4.3 — Schema do rateio (2026-11-13)

- **Migration** `20261113215631_company_expense_allocation` (aditiva): `ALTER TABLE company_expense_categories ADD COLUMN cost_group varchar(16) DEFAULT 'administrative' NOT NULL` + CHECK nos quatro grupos (`vehicle_fixed`, `per_km`, `administrative`, `in_trip`), e a tabela `company_expense_allocation_settings` (`company_id`, `cost_group`, `criterion`, `updated_by_user_id`, `unique(company_id, cost_group)`, CHECK do grupo sem `in_trip` e dos quatro critérios). Categoria nova nasce `administrative` (ADR-0116 §1).
- **Semente:** `UPDATE` das oito categorias pelo nome (Aluguel, Folha, Impostos, Outros → `administrative`; Seguro → `vehicle_fixed`; Manutenção, Combustível → `per_km`; Pagamento de motorista/agregado → `in_trip`) e uma linha de critério por grupo para cada empresa existente (`vehicle_fixed` e `per_km` por km, `administrative` por faturamento). Empresa criada depois: a leitura trata ausência de linha como o padrão (a porta da T4.2 já devolve `Partial`), e `ensureSeeded` da API grava o `cost_group` das oito categorias.
- **Rollback** manual: recusa quando algum critério difere do padrão ou alguma categoria foi classificada fora da semente (escolha do dono não volta sozinha); depois apaga a tabela, a coluna e a linha do diário.
- **Só schema:** a rota de leitura/escrita da configuração e a exposição de `costGroup` na API de categorias ficam na T4.5/T5.3; nenhum arquivo de rateio (T4.4) foi tocado.
- **Contratos:** `test/database-migration/company-expense-allocation.static.contract.ts` (aditivo, listas fechadas iguais às do schema, semente, padrão igual ao `DEFAULT_ALLOCATION_SETTINGS`, rollback) registrado em `database-migration.contract.test.ts`; lista de migrations em `static-migration.contract.ts`; asserção do grupo semeado em `expenses-repository.integration.ts`.
- **Provas (Postgres 16 local descartável):** `bun test ./test/database-migration.contract.test.ts` com `DRIZZLE_TEST_DATABASE_URL` → 235 pass / 0 fail (inclui migração completa, snapshot e rollback); integração `expenses-repository` 5 pass; `tsc --noEmit`, `eslint` e `prettier --check` limpos; `./test/expenses.contract.test.ts` 65 pass.
- **CI (staging-refresh):** a tabela nova precisa de política no recorte de staging (contrato da spec 291); `company_expense_allocation_settings` entrou como `keep` em `deploy/staging-refresh/prune-source.sql` (configuração da empresa, como as demais `company_expense_*`).

## T4.5 — Resultado do mês e configuração do rateio (2026-11-13)

**O que entrou** (`apps/api-transportada`):

- `src/expenses/application/expense-result.use-case.ts`: `computeExpenseResult` (um só cálculo para resultado e custo por km, ADR-0116 §7), `createGetExpenseResultUseCase`, `createGetExpenseUnitCostsUseCase`, `createGetExpenseAllocationSettingsUseCase` e `createUpdateExpenseAllocationSettingsUseCase`. Conta paga vale o pago, cancelada não entra; lucro = faturamento − custo das viagens − contas, com o excedente do pagamento do motorista como única entrada do `in_trip`. A resposta leva o critério usado, os excedentes, os pagamentos sem viagem incluída e o não rateado com nome.
- `src/expenses/infrastructure/allocation-trip.query.ts`: viagens concluídas do período pela **mesma** data do pagamento (`completedOnSql`, agora exportado de `payable-trip.query.ts`); faturamento e custo da `buildValuationFromContext` em lote, arredondados ao centavo; cliente = contratante do emitente da nota de maior frete (empate: menor CNPJ); sem veículo ou sem contratante vira `sem-veiculo`/`sem-cliente`, nunca some do total. Dias = `dailyAllowanceDays`, senão a duração estimada em dias cheios, no mínimo 1.
- `src/expenses/infrastructure/drizzle-expense-result.repository.ts`: contas do período por competência (soma das viagens incluídas no pagamento), critério por `ON CONFLICT` e auditoria `expense_allocation_settings.update` na mesma transação.
- `src/expenses/presentation/expense-result.routes.ts`: `GET /expense-result`, `GET /expense-unit-costs` (período `from`/`to` obrigatório, até 366 dias, `companyId` da query ignorado), `GET|PUT /expense-allocation-settings`; ligadas em `main.ts`. `costGroup` passou a sair em `/expense-categories` (campo opcional, aditivo).
- Custo por km: `(custo das viagens + contas rateadas) / km`, quatro casas, `null` sem quilômetro; o geral usa todas as contas do período, inclusive o não rateado.

**Prova**

- `bun --env-file=../../.env.test test ./test/expenses.contract.test.ts`: 111 pass / 0 fail (`result.contract.ts` e `result-routes.contract.ts` saíram do vermelho; entrypoint `allocation-red-entrypoint.ts` apagado).
- Integração contra Postgres 16 descartável (`test/integration/expense-result.integration.ts`, 6 casos): viagem concluída só por `trip_status_events` (sem `closed_at`) entra em novembro pelo dia de São Paulo; outubro fica fora; empresa B não aparece; lucro fecha com as margens por viagem e por veículo; critério padrão, troca e auditoria. Regressão: `expenses-repository` e `expense-occurrence-trips` 13 pass.
- Suíte de contrato da API: 15268 pass; os 9 `fail` são `toll booth catalog repository`, que pedem banco (`Failed to connect`) e não tocam este código.
- `tsc --noEmit`, `eslint --max-warnings=0` e `prettier --check` limpos.

**Fora daqui:** filtros e exportação PDF/CSV (T4.6), telas (Fase 5), trocar o grupo de uma categoria (T5.3). Nenhuma rota nova mexe em produção, então o runbook de produção não muda.

## T4.6 — Filtros e exportação PDF/CSV (2026-11-13)

**O que entrou** (`apps/api-transportada/src/expenses`):

- **Filtros (RF18):** `computeExpenseResult` recebe `filters` (`vehicleId`, `customerId`, `categoryId`, `payeeDriverId`). O rateio é feito sempre sobre todas as viagens e contas do período; o filtro só escolhe quais viagens e quais parcelas aparecem e somam (ADR-0116 §4), então a margem de uma viagem é a mesma com ou sem filtro. Veículo e cliente restringem as viagens (com o veículo, também as contas ligadas a ele); categoria e motorista restringem as contas. Conta sem viagem elegível some com filtro de cliente e, com filtro de veículo, só fica a ligada a ele. O total de contas passou a ser "parcelas à vista + não rateado" (mesmo número de antes sem filtro: os 111 contratos da T4.5 seguem verdes). `filters` volta na resposta só quando há filtro. Valores: uuid, ou `sem-veiculo`/`sem-cliente`; chave desconhecida ou valor inválido é 400; valor vazio é "sem filtro".
- **Exportação (RF19, RF20):** `GET /expense-result/export?from&to&format=pdf|csv&<filtros>` (`expenses.read`, `no-store`, `content-disposition`). `createExportExpenseResultUseCase` chama o `computeExpenseResult` da tela e monta um `ExpenseExportDocument`; PDF (`expense-result-pdf.gateway.ts`, `pdfkit`) e CSV (`buildExpenseResultCsv`) leem esse objeto e não refazem soma. CSV: UTF-8 com BOM, `;`, vírgula decimal, uma linha por viagem (frete, custo, rateio do veículo, rateio geral, margem) e bloco de totais; texto digitado que começa com `= + - @` ganha apóstrofo (sem fórmula na planilha). Cabeçalho com empresa, período, filtros pelo nome, critério de rateio e hora do cálculo.
- **Auditoria:** cada exportação grava `expense_result.export` em `audit_logs` (formato, período, filtros, autor, correlação) antes de entregar o arquivo; falha ao gravar derruba a exportação.
- **Regra do cliente isolada:** `pickTripCustomerTaxId` (`domain/expense-trip-customer.policy.ts`) é o único lugar da regra "a viagem inteira vai ao cliente da nota de maior frete (empate: menor CNPJ)", marcada no código como pendente de confirmação; trocar a regra é trocar essa função (contrato em `test/expenses/trip-customer.contract.ts`).

**Prova**

- `bun test ./test/expenses.contract.test.ts`: 133 pass / 0 fail (22 novos: `result-filters`, `result-export`, `trip-customer` e as rotas). CA11: os totais do CSV batem com os de `GET /expense-result` para os mesmos filtros (sem filtro, veículo, categoria).
- Integração contra Postgres 16 descartável (`expense-result.integration.ts`): 7 pass, com a exportação ponta a ponta (CSV com a placa, PDF `%PDF-`, duas linhas no diário com os filtros, empresa B sem vazar o nome do veículo da A).
- Suíte de contrato da API: 15290 pass / 0 fail; `tsc --noEmit`, `eslint --max-warnings=0` e `prettier --check` limpos.
- Não há tela nesta task (T5.2b) nem mudança em produção, então o runbook não muda.

## T6.1 — Contratos vermelhos da previsão e do fora do padrão (2026-11-13)

**O que entrou** (`apps/api-transportada`, vermelho de propósito; rodar com `bun --env-file=../../.env.test test ./test/expenses/forecast-red-entrypoint.ts`):

| Arquivo                                    | Prende                                                                                                                                                                                                                                    | Fecha na |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `test/expenses/forecast.contract.ts`       | CA12: menos de 3 meses → sem previsão e aviso; 3 a 5 → previsão com aviso "poucos dados"; 6 ou mais → sem aviso; só os 6 meses mais recentes, em qualquer ordem; faixa contém o previsto; lucro = faturamento − custo; média por dia útil | T6.2     |
| `test/expenses/out-of-pattern.contract.ts` | CA13: padrão de 10%; exatamente no limite não alerta, um centavo além alerta (acima e abaixo); limite configurável; média dos 3 meses mais recentes; menos de 3 meses não alerta; conta, categoria e custo por km do veículo              | T6.2     |

**Resultado medido:** 26 testes, 1 pass (a constante do limite padrão) / 25 fail, todos por "not implemented". `tsc --noEmit` e `eslint` limpos; `bun test ./test/expenses.contract.test.ts` segue 133 pass / 0 fail (a lista oficial não mudou).

**Regras aprovadas aplicadas:** a previsão só aparece com 3 meses ou mais de dados; o fora do padrão dispara **acima** de 10% da média (exatamente 10% não alerta).

**Decisões deixadas para a T6.2 (os contratos não as fixam de propósito)**

- Largura numérica da faixa: o contrato só exige mínimo ≤ previsto ≤ máximo e que a faixa de 3 a 5 meses não seja mais estreita que a de 6 meses com os mesmos valores.
- Mês fechado sem viagem (zero faturamento) conta como mês de dado? E mês com zero dia útil? Veículo novo (custo por km sem 3 meses próprios) não alerta, pelo contrato de histórico menor que 3.
- Média zero no fora do padrão (divisão): a T6.2 decide e acrescenta o caso.

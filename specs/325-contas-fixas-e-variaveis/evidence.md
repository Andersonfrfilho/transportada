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

## T5.1 — Módulo do resultado e do rateio no painel (2026-11-14)

**O que entrou** (`apps/frontend-transportada/src/modules/expenses`, padrão da T2.1):

- **Tipos e guard:** `shared/expensesResult.types.ts` copia por valor o vocabulário da API (grupos e critérios de rateio, motivos de não rateado, `sem-veiculo`/`sem-cliente`, caminhos); `shared/expensesResult.validation.ts` recusa forma inesperada (`ExpenseResponseError`): dinheiro só como texto decimal com sinal e até 4 casas (lucro e margem podem ser negativos), vocabulário conferido e nunca afirmado, `excesses`, `paymentsWithoutTrips`, `unallocatedItems`, `settings` e `filters` opcionais como a API os omite, `costPerKm` `null` sem quilômetro.
- **Cliente:** `getResult`, `getUnitCosts` (só o período, RF17), `getAllocationSettings`, `updateAllocationSettings` (`PUT { settings }`) e `exportResult` (devolve `blob` e o nome do `content-disposition`; erro sobe o código da API). `serializeResultQuery` manda só os filtros preenchidos. O `request` foi dividido em `send`/`readJson` para a exportação reusar o envio sem tratar o arquivo como JSON.
- **Hooks:** `hooks/useExpenseResult.hook.ts` com a chave raiz `expenses`; trocar o critério invalida a raiz inteira (resultado e custo por km mudam juntos).
- **Locales pt/en:** blocos `result` (totais, abas, colunas, filtros, exportação, custo por km) e `allocation` (grupos e critérios), mais erros de validação.

**Prova**

- `bun test ./test/expenses.contract.test.ts`: 36 pass / 0 fail (`result.contract.ts` entrou no entrypoint, que já está na lista `test` do `package.json`); `bun run test` da app: 1496 pass / 0 fail.
- `tsc --noEmit`, `eslint` e `prettier --check` limpos nos arquivos tocados.
- Não há tela nesta task (T5.2/T5.2b/T5.3) nem mudança em produção, então não há prints e o runbook não muda.

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

## T6.2 — Serviço puro da previsão e do fora do padrão (2026-11-14)

**O que entrou** (`apps/api-transportada`):

- `src/expenses/domain/expense-forecast.policy.ts`: `forecastNextMonth` (RF21, RF22, CA12) e `detectOutOfPattern` (RF23, CA13), puros e sem banco, com a conta em centavos (`bigint`) e arredondamento meio para cima, o mesmo do módulo. Constantes exportadas: `FORECAST_MIN_MONTHS = 3`, `FORECAST_FULL_MONTHS = 6`, `FORECAST_BAND_FLOOR_PERCENT = { ok: 15n, limited: 30n }`, `OUT_OF_PATTERN_MONTHS = 3` e o `DEFAULT_OUT_OF_PATTERN_THRESHOLD_PERCENT = 10` da T6.1.
- `test/expenses/forecast.contract.ts` e `out-of-pattern.contract.ts` (os 26 da T6.1, sem mudança) passaram para `test/expenses.contract.test.ts`; `forecast-red-entrypoint.ts` foi apagado.
- `test/expenses/forecast-edges.contract.ts`: contrato de tabela com as bordas abaixo (mês sem viagem, zero dia útil, veículo novo, média zero, faixa em números, limite fracionado e inválido, entrada inválida, ordem da saída).

**Como a previsão é calculada** (o texto do "Como é calculado" da T6.4 sai daqui): pega os 6 meses fechados mais recentes; dos que tiveram movimento, soma faturamento e custo das viagens e divide pelos dias úteis somados (média por dia útil), multiplica pelos dias úteis do mês previsto e soma as contas recorrentes já cadastradas para o mês. Mês com mais dias úteis pesa mais na média, como o contrato da T6.1 exige.

**Decisões dos pontos que a T6.1 deixou abertos** (em todas, o comportamento mais conservador: a previsão é usada pelo dono para decidir, então errar para "mostrar menos certeza" é melhor que errar para "parecer preciso")

1. **Largura da faixa.** Meia largura de **15% do valor estimado com 6 meses** e **30% com 3 a 5 meses**, ou a variação que os próprios meses mostraram, se for maior (a faixa vai do pior ao melhor mês, cada um projetado para os dias úteis do mês previsto, para mês curto não parecer mês ruim). As contas recorrentes entram inteiras nos três pontos (são valores cadastrados, sem incerteza). O lucro usa o **pior e o melhor par**: mínimo = menor faturamento − maior custo, máximo = maior faturamento − menor custo. Por que: uma faixa calculada só pelo desvio de 3 a 6 meses parecidos sai estreita demais e passa uma precisão que a média simples não tem; o piso garante uma faixa honesta mesmo com meses iguais, e dobrar com pouco dado cumpre o "faixa mais larga" do RF22. Consequência aceita: o lucro mínimo pode ficar negativo com poucos dados (exemplo do contrato: 3 meses iguais, lucro previsto de 8.000,00 com faixa de −1.000,00 a 17.000,00), e é isso que a tela deve mostrar.
2. **Mês sem viagem não é mês de dado.** Mês fechado com faturamento e custo de viagem zerados, ou com zero dia útil, **não conta** para os 3/6 meses e **não entra** na média, mas **ocupa o lugar dele** na janela dos 6 meses mais recentes (não puxa um mês mais antigo para o lugar). Por que: mês vazio quase sempre é a empresa ainda sem usar o sistema ou um buraco de lançamento, não um mês real sem frete; contá-lo mostraria a previsão antes de haver 3 meses de movimento de verdade e puxaria a média para baixo. Mês só com custo (sem faturamento) conta, porque houve operação. Se a empresa teve mesmo um mês parado, o efeito é a previsão ficar com menos meses (aviso de poucos dados ou nenhuma previsão), nunca uma média inventada.
3. **Média zero no fora do padrão.** A regra é feita por multiplicação cruzada (|corrente − média| × 100 > limite × média), sem divisão. Média zero com corrente zero **não alerta**; média zero com qualquer valor diferente de zero **alerta** (um gasto que não existia e apareceu passa de qualquer porcentagem de zero, e é justamente o que a lista existe para mostrar). Por que: o contrário esconderia o caso mais grave, a conta nova ou a categoria que nunca teve gasto.

**Outras decisões fixadas pelo contrato de borda**

- A comparação usa a **média arredondada ao centavo**, a mesma que a tela mostra. Com a média exata, 99,99/100,00/100,00 (exibida 100,00) e corrente 110,00 alertaria com uma diferença exibida de exatamente 10%, contradizendo a regra na frente do usuário.
- **Veículo novo** (ou conta nova) com menos de 3 meses próprios não alerta. Para a T6.3: `previousMonths` leva só os meses em que o item existiu; custo por km de mês sem viagem é **ausência**, não zero, senão o zero dispara alerta falso.
- O limite aceita até duas casas (`12.5`), de 0 a 1000%; fora disso é `RangeError` (a T6.3 valida na entrada da configuração e devolve 400). Dinheiro negativo ou com três casas, dia útil fracionado ou negativo também são `RangeError`: entrada inválida não vira previsão.
- A lista de alertas sai na ordem da entrada; ordenar (por exemplo, pela maior diferença) é decisão da tela ou da T6.3.

**Resultado medido** (de `apps/api-transportada`, Bun 1.4.4 no contêiner):

- `bun test ./test/expenses.contract.test.ts`: **194 pass / 0 fail** (inclui os 26 da T6.1, agora verdes, e os de borda).
- `bunx tsc --noEmit`: limpo. `bunx eslint` e `bunx prettier --check` nos arquivos alterados: limpos.

## T6.3 — Caso de uso e rota da previsão e do fora do padrão (2026-11-14)

**O que entrou** (`apps/api-transportada`): `src/expenses/application/expense-forecast.{port,use-case}.ts`, `infrastructure/drizzle-expense-forecast.repository.ts`, `presentation/expense-forecast.routes.ts`, ligados em `main.ts`; `buildExpenseUnitCosts` extraído do custo por km da T4.5 para o fora do padrão reaproveitar o mesmo cálculo.

**Como o mês é lido.** `month` é o mês corrente; o previsto é o seguinte; o histórico são os 6 meses fechados antes dele, cada um por `computeExpenseResult` (faturamento e custo das viagens do mesmo caminho do painel); o padrão de cada item são os 3 fechados mais recentes. Dias úteis: calendário da cidade do perfil fiscal da empresa (spec 238, sábado conforme o ajuste); sem perfil ou com calendário recusado, segunda a sexta.

**Decisões.**

- Pagamento de motorista (`in_trip`) nunca entra nas contas do mês previsto nem no alerta: já está no custo das viagens (RF13).
- Contas do mês previsto = ocorrências não canceladas da competência (fixas geradas até 3 meses à frente e variáveis já lançadas), pelo valor pago, se baixada, senão o previsto.
- Itens do alerta: conta (`expense`), categoria (`category`) e custo por km do veículo (`vehicle_cost_per_km`, arredondado ao centavo como a tela mostra). Mês em que o item não existiu fica de fora de `previousMonths` (ausência, não zero); com menos de 3 meses a regra da T6.2 não alerta.
- Limite: coluna `out_of_pattern_threshold_percent` em `company_expense_allocation_settings` (padrão 10). A troca grava o mesmo valor nos três grupos, criando a linha que faltar com o critério padrão; a configuração do rateio (T4.5), ao criar uma linha, herda o limite da empresa. Sem linha, vale 10.
- **Recorte de staging (spec 291):** nenhuma tabela nova — a tabela já tem política `keep` em `deploy/staging-refresh/prune-source.sql`, e a coluna acompanha.

**Provas.**

- `test/expenses/forecast-use-case.contract.ts` (12) e `forecast-routes.contract.ts` (4): previsão indisponível/limitada/ok, contas do mês previsto, `in_trip` fora, isolamento por empresa (CA10), limite padrão, personalizado e exatamente no limite (CA13), custo por km com placa, mês sem viagem não vira zero, permissões e `companyId` só do contexto, mês inválido 400.
- `test/database-migration/company-expense-out-of-pattern-threshold.static.contract.ts` (2) e a cadeia de migrations (`static-migration.contract.ts`).
- `test/integration/expense-forecast.integration.ts` (7, Postgres 16 descartável): padrão 10 sem linha, troca só da empresa, três grupos, auditoria, herança pela configuração do rateio, CHECK recusando 1000,01, dias úteis sem perfil (21 em 11/2026), caso de uso inteiro sobre o SQL real. Rollback aplicado em banco migrado: coluna e CHECK saem e a linha do diário também.
- `bun run test` (15376 pass, 0 fail), `bun run lint`, `bun run typecheck` e `drizzle-kit check` verdes.

## T7.1 — Contratos vermelhos dos lembretes e da baixa por resposta (2026-11-13)

**O que entrou** (`apps/api-transportada`, tudo vermelho de propósito; rodar com `bun --env-file=../../.env.test test ./test/expenses/reminders-red-entrypoint.ts`):

| Arquivo                                      | Prende                                                                                                                                                                                                                                                                                                                                                              | Fecha na |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `test/expenses/reminders.contract.ts`        | CA14: aviso 3 dias antes (prazo configurável), no dia e a cada dia de atraso até 3; duas rodadas no mesmo dia não duplicam; paga/cancelada não avisa; sem responsável (ou responsável inexistente) vai ao administrador; canal desligado na empresa não sai; falha de envio não derruba a rotina; isolamento                                                        | T7.4     |
| `test/expenses/reply-settlement.contract.ts` | CA15: "paguei" do responsável baixa com valor previsto e data do dia, gravando autor e canal; outra pessoa, número desconhecido, palavra outra, repetido, cancelada, sem responsável e outra empresa não baixam; link do e-mail de uso único, vencido ou de ex-responsável não baixa; desfazer (RF31): só administrador, em 24 h, com motivo, só baixa por resposta | T7.4b    |

**Esqueleto:** `src/expenses/application/expense-reminder.port.ts` (formato das portas e dos resultados, fixado pelos contratos) e `expense-reminder.use-case.ts` (três factories que lançam "not implemented"); quatro erros `ExpenseReplyUndo*` em `expense.error.ts` (403/409/400/409) para o desfazer, para o teste não passar por "lançou qualquer coisa".

**Decisões para a T7.2/T7.3/T7.4/T7.4b**

- A chave do aviso enviado é (empresa, ocorrência, responsável, dia, tipo); o canal não entra: um aviso por pessoa e dia. A porta `sent.record` devolve `false` quando a chave já existe.
- O filtro por status (só `open`) e a escolha do destinatário (responsável, senão administradores) são do caso de uso, não da consulta: a porta devolve tudo da empresa e o contrato prova o filtro.
- Canal só sai se estiver ligado na empresa **e** na pessoa; e-mail é o padrão. Falha de envio é contada e não grava o registro de enviado.
- Recusa da resposta devolve `refused` com o motivo (`not_responsible`, `not_open`, `unknown_word`, `already_used`, `expired`) para o bot e a tela explicarem (RF30); o link de e-mail não é gasto quando a ocorrência já não está aberta.
- Desfazer lê a hora da baixa por resposta (`findReplySettlement`); baixa dada pelo painel não tem essa marca e continua imutável (RF5).

**Resultado medido:** 31 testes, 0 pass / 31 fail (todos por "not implemented"). `tsc --noEmit`, `eslint` e `prettier --check` limpos; `bun test ./test/expenses.contract.test.ts` segue 133 pass / 0 fail (a lista oficial não mudou).

## T7.2 — Schema dos lembretes e da baixa por resposta (2026-11-14)

**Migration** `20261114001611_company_expense_reminders` (aditiva; nenhuma linha existente muda; `snapshot.json` gerado pelo `db:generate`):

| Objeto                                                                    | O que guarda                                                                                                                                                                                                                                     | Usado por  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `company_expenses.responsible_user_id` (nula, FK usuário)                 | O responsável da conta (RF24); nulo → administradores                                                                                                                                                                                            | T7.4/T7.5  |
| `company_expense_reminder_settings` (1 por empresa)                       | `days_before` (3), `max_overdue_notices` (3), `email_enabled` (sim), `whatsapp_enabled`/`push_enabled` (não), `daily_summary_enabled` (não) e `daily_summary_hour` (8). Sem linha vale o padrão de `DEFAULT_REMINDER_SETTINGS`                   | T7.4/T7.5  |
| `company_expense_reminders_sent`                                          | Aviso enviado. **Única** `(occurrence_id, recipient_user_id, day, kind)`; o canal é coluna, não entra na chave (decisão da T7.1). `sent.record` = `INSERT … ON CONFLICT DO NOTHING`                                                              | T7.4       |
| `company_expense_summaries_sent`                                          | Resumo diário enviado, único `(company_id, recipient_user_id, day)` (RF27/RF28); não cabia na tabela de avisos porque o resumo não tem ocorrência                                                                                                | T7.4       |
| `company_expense_reply_links`                                             | Link do "Já paguei" por e-mail: só o **hash** SHA-256 do token (`unique`, CHECK de 64 hex), `expires_at` e `used_at` (uso único)                                                                                                                 | T7.4b      |
| `company_expense_occurrences.settled_via_channel` / `settled_by_reply_at` | Canal (`email`/`whatsapp`) e hora da baixa por resposta; o autor é o `paid_by_user_id` que já existe. CHECK: os dois andam juntos e só em ocorrência `paid`. O desfazer (RF31) lê a hora para a janela de 24 h e zera as duas colunas ao reabrir | T7.4b/T7.5 |

**Decisões**

- O motivo e o autor do desfazer ficam na trilha de operações (`audit_logs`), como pede o RF31; não ganharam coluna.
- Preferência de canal por pessoa (WhatsApp/push "nas preferências dele", RF26) **não** entrou: a T7.3 decide quem recebe por qual canal e é onde essa leitura nasce; a configuração da empresa (liga/desliga por canal) já está aqui.
- Recorte de staging (spec 291): `company_expense_reminder_settings` é `keep` (configuração); `reminders_sent`, `summaries_sent` e `reply_links` são `empty` (registro operacional e token de produção não atravessam; o contrato `staging-refresh` cobre as quatro).
- O rollback (`rollback.sql`) recusa rodar se houver responsável, configuração, aviso, resumo, link ou baixa por resposta, porque apagar o registro reenviaria o aviso do dia e apagar a marca impediria o desfazer.

**Resultado medido**

- `bun test ./test/database-migration.contract.test.ts` com `DRIZZLE_TEST_DATABASE_URL` apontando para um Postgres 16 descartável: 242 pass / 0 fail (migration aplicada na cadeia inteira, snapshot, rollback). Sem banco: 238 pass / 4 skip.
- Contrato novo `test/database-migration/company-expense-reminders.static.contract.ts` (7 testes): aditiva, chave única, listas fechadas iguais às do schema e da porta, padrão igual a `DEFAULT_REMINDER_SETTINGS`, só hash do token, política de staging, rollback.
- `bun test ./test/deploy.contract.test.ts` 214 pass / 0 fail; `./test/expenses.contract.test.ts` 133 pass / 0 fail; `migration-chain` 4 pass; `tsc --noEmit`, `eslint` e `prettier --check` limpos.
- Os 31 contratos vermelhos da T7.1 seguem fora da lista oficial (a T7.4/T7.4b os movem).

## T5.2 e T5.2b — Página de resultado, filtros e exportação (2026-11-14)

**O que entrou** (`apps/frontend-transportada`, módulo `expenses`): `pages/ExpenseResult.page.tsx`, `hooks/useExpenseResultPage.hook.ts`, `shared/expensesResultView.service.ts`, locales `resultPage.*` (pt/en), estilos em `expenses.module.css` e a rota `/contas/resultado` em `main.tsx` (mesmo workspace `expenses`; o menu não ganhou entrada nova, a página abre por "Ver resultado" em Contas).

**Decisões**

- Variação dos indicadores é sobre o **período anterior de mesmo tamanho**, com os mesmos filtros (uma segunda leitura de `GET /expense-result`). "Últimos meses" são quatro leituras mensais até o mês do fim do período, também com os filtros.
- Custo, receita e margem por km usam os quilômetros de `GET /expense-unit-costs` do período; sem quilômetro mostram "—".
- Nomes: veículo (placa) e cliente vêm das listas de opções dos filtros; id sem nome cai no próprio id. **Viagem aparece pelos 8 primeiros caracteres do id** (a viagem não tem número no banco). Veículo, cliente, km e trajeto vieram no follow-up abaixo.
- Previsão e "fora do padrão" do preview são da T6.4, não desta tarefa. "Comparar com" e "Critério de rateio" não são filtros desta tela (o critério é da T5.3).
- Exportar usa `saveArchiveFile` com o blob da rota da T4.6; falha mostra alerta.

**Resultado medido**

- `bun test ./test/expenses.contract.test.ts`: 43 pass / 0 fail (contrato novo `test/expenses/result-view.contract.ts`: períodos, tendência, percentuais, centavos). `tsc --noEmit`, `eslint` e `prettier --check` limpos nos arquivos tocados.
- Prints (smoke `test/spec-325-resultado-prints.smoke.spec.ts`, API dublada, fora da CI): `prints/resultado-{light,dark}-{desktop,mobile}.png`. Conferidos contra a tela de Contas vizinha: rótulo em cima, campos na altura padrão, botões `Button` padrão, tabelas no molde `.table` (cartão no celular). Exportar CSV exercitado no smoke (`format=csv` na requisição).

## T5.2 — Detalhes da viagem no resultado (follow-up, 2026-11-14)

- API: cada linha de `byTrip` ganha `trip { vehicleId, customerId, distanceMeters, route }` (aditivo; `byVehicle`/`byCustomer` e os valores não mudam). O trajeto é o da T2.2b (`deriveExpenseTripRoute`, primeira e última parada), lido em lote por `readTripRoutes`, extraído de `payable-trip.query.ts` e agora usado também por `allocation-trip.query.ts`. `AllocationTrip.route` é opcional e não entra no rateio.
- Painel: `trip` é opcional na guarda (API anterior segue valendo; a coluna cai em "—"). Linha mostra código, cliente e trajeto, mais veículo e km. **Ordem de publicação: painel e API juntos em staging; o painel tolera a API antiga.**
- Medido: `bun --env-file=../../.env.test test ./test/expenses.contract.test.ts` na API 211 pass / 0 fail (contrato novo "detalhes da viagem no resultado"); painel 44 pass / 0 fail; `tsc`, `eslint` e `prettier` limpos nas duas apps. Prints refeitos em `prints/resultado-*`.

## T5.3 — Painel "Rateio das contas" (2026-11-14)

**O que entrou**

- API: `PUT /expense-categories/:id/cost-group` (`expenses.manage`, corpo `{ costGroup }` estrito). Caso de uso `createSetExpenseCategoryCostGroupUseCase`, porta `categories.setCostGroup`, repositório Drizzle e diário `expense.category.cost_group_changed` (antes, depois, nome). Regra: `in_trip` é só da categoria que exige motorista, e ela não sai dele; senão `422 EXPENSE_CATEGORY_COST_GROUP_INVALID`. Categoria de outra empresa é `404`. Sem migration: a coluna `cost_group` já existia (T4.3), e o rateio é calculado na leitura (ADR-0116), então nada gravado precisa ser refeito.
- Painel: aba "Rateio das contas" em Configurações (`expenseAllocation` em `SETTINGS_PANELS`, `SETTINGS_PANEL_PLACEMENT` e `COMPANY_SETTINGS_TAB_IDS`). Três blocos: "Como cada grupo é dividido" (três seletores), "Fora do padrão" (limite em %, 0 a 1000 com até duas casas) e "Grupo de cada categoria". O rascunho guarda só o que a pessoa mexeu; o Salvar manda o diff e relê as três consultas. Sem `expenses.manage` os campos ficam desligados e o botão some.
- Módulo `expenses`: `costGroup` na categoria (leitura tolerante: ausente vira `administrative`), `setCategoryCostGroup`, `getOutOfPatternThreshold` e `updateOutOfPatternThreshold` no cliente e hooks.

**Resultado medido**

- API: `bun test ./test/expenses.contract.test.ts` 214 pass / 0 fail (4 contratos novos em `category-cost-group.contract.ts`, mais a linha da rota em `expense-routes.contract.ts`); `tsc --noEmit` e `prettier --check` limpos.
- Frontend: `bun run test` 8886 pass / 0 fail e `test:hooks` 1496 pass / 0 fail; contrato novo `test/expenses/allocation-panel.contract.ts` (endereço da aba, diff do Salvar, limite, rótulos, cliente e paridade pt/en). `tsc --noEmit` e `eslint` limpos nos arquivos tocados.
- Primeira rodada reprovou `mutation-invalidation.contract.ts` (o hook do painel invalidava a chave `expenses` direto); corrigido: as mutações do módulo já renovam a raiz, e o painel só espera a releitura das próprias consultas.
- Revisão de design (`web.md` §15), comparada com a aba vizinha "Categorias de contas": rótulo em cima, `Select` e campo na altura `--field-height`, botão padrão. Prints em `prints/rateio-{light,dark}-{desktop,mobile}.png` (1440 e 375), gerados por `test/spec-325-rateio-prints.smoke.spec.ts` (fora da CI). Desvios do preview aprovado: ganhou o bloco "Fora do padrão" (pedido da T5.3/T6.3) e o Salvar fica abaixo dos blocos.

## T7.3 — Modelo do aviso e regra de quem, por qual canal e quando (2026-11-14)

**Regra** (`src/expenses/domain/expense-reminder.policy.ts`, pura; datas civis de São Paulo em texto):

| Pergunta                                     | Decisão                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quando (`reminderKindOn`)                    | `before` exatamente `daysBefore` dias antes (0 desliga), `due_today` no dia, `overdue` do 1º ao `maxOverdueNotices`-ésimo dia de atraso, **pelo calendário** (rotina que falhou num dia não empurra o aviso). O status (`open`) é do caso de uso.                                                                      |
| A que horas (`isReminderHour`)               | A partir de `daily_summary_hour` (padrão 8h, São Paulo), para avisos **e** resumo: uma hora só por empresa, sem aviso de madrugada. `ReminderSettings` ganhou `dailySummaryEnabled` e `dailySummaryHour` (as colunas da T7.2).                                                                                         |
| Quem (`chooseReminderRecipients`)            | O responsável, se ainda é da empresa (vínculo e conta ativos) **e** tem algum canal ligado na empresa. Senão, todos os `company-admin` ativos alcançáveis. **Responsável que não pode receber nada conta como sem responsável** (`responsible_unreachable`): o aviso de dinheiro cai no administrador em vez de sumir. |
| Canal da pessoa (`personalReminderChannels`) | E-mail sempre que há e-mail (perfil, senão o contato do convite por e-mail) — **sem opt-out**, é o canal que garante o aviso; quem não quer recebê-lo pede para trocar o responsável. WhatsApp só com opt-in **e** número verificado (`user_whatsapp_phones.verified_at`). Push só com opt-in.                         |
| Canal efetivo (`effectiveReminderChannels`)  | Os da pessoa ∩ os ligados na empresa, ordem fixa e-mail, WhatsApp, push.                                                                                                                                                                                                                                               |
| Resumo (`belongsToDailySummary`)             | Ocorrência `open` que vence hoje ou já venceu, sem limite de dias de atraso. Quem recebe é o mesmo destinatário de cada conta.                                                                                                                                                                                         |

**Preferência de canal por pessoa** (deixada pela T7.2): tabela própria `company_expense_reminder_preferences` (migration
aditiva `20261114014120_company_expense_reminder_preferences`, `unique(company_id, user_id)`, `whatsapp_enabled`/`push_enabled`
padrão `false`, sem coluna de e-mail; rollback recusa com linha; recorte de staging `keep`). Não reusei as preferências do
módulo de notificação: lá o padrão é ligado (opt-out) e os canais do painel são só caixa e e-mail; aqui WhatsApp e push são
opt-in e não aparecem na tela de Preferências de hoje. Leitor: `drizzle-expense-reminder-recipients.repository.ts`
(`findById`/`findAdmins` sempre pelo vínculo ativo da empresa; `createDrizzleExpenseReminderSettings` devolve o padrão sem linha).
A rota e a tela para a pessoa ligar WhatsApp/push ficam na T7.5.

**Modelos** (editáveis em Notificações depois de publicados; layout no modelo, nunca em código — ADR-0110):

- `contas.aviso-vencimento` e-mail (`src/expenses/expense-mail-templates/aviso-vencimento.html`): assunto
  `{{conta}} {{situacao}} — {{valor}}`; texto `transportadora`, `responsavel`, `conta`, `categoria`, `favorecido`, `competencia`,
  `vencimento`, `valor`, `situacao`; HTML do sistema `botaoJaPaguei` (link assinado da T7.4b; vazio até lá) e `botaoAbrirContas`.
- `contas.aviso-vencimento` WhatsApp (`expense-whatsapp-templates/aviso-vencimento.txt`): o mesmo texto, sem HTML, com "responda
  _paguei_" (RF29).
- `contas.resumo-diario` e-mail: `transportadora`, `responsavel`, `dia`, `quantidade`, `totalAberto`; HTML `tabelaContas` e
  `botaoAbrirContas`.
- Régua (`expense-reminder-mail-template.policy.ts`): HTML seguro (SDK), área `<!-- mensagem -->`, HTML do sistema fora da área,
  assunto, variáveis da lista fechada de cada modelo, WhatsApp sem HTML. O publicador (`occurrence-mail-templates-publish`) lê os
  três arquivos e aplica essa régua pela chave `contas.*`.
- Renderização (`expense-reminder-mail.policy.ts`): `interpolateEmailHtml` do SDK (valor escapado, só os botões e a tabela crus,
  valor nunca reinterpretado), `htmlToPlainText` para o texto puro, dinheiro em centavos (`R$ 1.234,50`), botão só com URL
  `https://`. ⚠️ O `text/plain` mostra "Já paguei" sem o link: a T7.4b decide se o texto puro leva a URL.
- **Push:** o texto não entrou aqui. O push sai pelo módulo de notificação (catálogo), e a categoria nova no catálogo mexe na tela
  de Preferências; fica para o notificador da T7.4, que é quem decide o envio.

**Fica para depois**

- Publicar os três modelos em staging/produção (`bun run scripts/occurrence-mail-templates-publish.ts --company <uuid> --confirm`)
  é mudança de dados: pede aprovação, junto da T7.4.
- O `APP_BASE_URL` (painel) dá o link do `botaoAbrirContas`; sem ele o botão some.

**Resultado medido**

- `bun test ./test/expenses.contract.test.ts`: 167 pass / 0 fail (34 novos: `reminder-policy.contract.ts` e
  `reminder-mail-template.contract.ts`, registrados no entrypoint).
- `bun --env-file=../../.env.test test ./test/integration/expense-reminder-recipients.integration.ts` contra Postgres 16
  descartável: 7 pass / 0 fail (vínculo/conta desligados e outra empresa = não existe, e-mail do convite, WhatsApp exige número
  verificado, preferência por empresa, padrão sem linha, unique). Registrado em `test:integration`.
- `bun test ./test/database-migration.contract.test.ts` com `DRIZZLE_TEST_DATABASE_URL`: 246 pass / 0 fail (migration e rollback
  na cadeia, snapshot, contrato estático novo `company-expense-reminder-preferences.static.contract.ts`).
- `bun test ./test/deploy.contract.test.ts` 214 pass; `tsc --noEmit`, `eslint` e `prettier --check` limpos.
- Os 31 contratos vermelhos da T7.1 seguem fora da lista oficial (a T7.4/T7.4b os movem).

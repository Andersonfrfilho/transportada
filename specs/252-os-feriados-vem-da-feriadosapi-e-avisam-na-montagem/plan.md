# Plano — 252

> Desenho do `architect` (`opus`, 2026-10-07). Decisão completa no **ADR-0100** (aceita na T0.1). Fatos conferidos em
> `origin/staging` (`927335484`) e **reconferidos na T0.2** em `eaa2a7eb7` (2026-10-07): tabela "citado → real" em
> `evidence.md` § T0.2.

## Contexto (o que já existe)

- **Calendário (238, ADR-0096):** `municipal_holidays` (`apps/api-transportada/src/database/delivery-client.schema.ts`
  ~240–288; único `(company_id, city_ibge_code, holiday_on)`; `kind` e `source_rule_id`), `municipal_holiday_rules`,
  `state_holidays` (`state-holiday.schema.ts`, `once`/`yearly`), a política `business-calendar` e
  `loadBusinessCalendarRules` (`business-calendar/infrastructure/business-calendar-rules.query.ts` 109–131, quatro
  leituras **em série**). A linha com `source_rule_id` nulo entra como `once` na política (`readTypedHolidays` 53–74):
  a importada (com `provider_entry_id` e `source_rule_id` nulo) já entra sem mudar o filtro. **A origem não existe
  ainda:** `HolidayReason` (`business-calendar/domain/business-calendar.types.ts` 44–47) só diz o escopo, e os
  mapeadores (`business-calendar-rule.mapper.ts` 56–73, 87–93) não carregam origem — a T4.2 a acrescenta.
- **Escritas da 238 que tratam a importada como digitada** (a T4.1 corrige): `save`/`update`/`remove` de
  `drizzle-municipal-holiday.repository.ts` (65–111, 113–150, 152–182), `isSameTypedHoliday`
  (`municipal-holiday.support.ts` 54–61), `typedHolidaysKept` (`municipal-holiday-typed.queries.ts` 37–48) e as
  equivalentes de `state_holidays`.
- **Prazo (236):** `trips/infrastructure/trip-delivery-deadline-calendar.support.ts` (`loadCityCalendars` 22–44) lê o
  calendário por cidade e é recalculado a cada leitura do detalhe (`trip-delivery-deadline.support.ts` 133–154, com o
  desvio manual em 76).
- **Roteirizador — corrigido (Fase 1, em staging):** a leitura saiu do repositório para
  `apps/worker-transportada/src/routing/infrastructure/drizzle-pool-window.query.ts` (`readPoolWindows` 27–120, select
  de feriado com `cityIbgeCode` 102–116) e a resolução para `routing/domain/pool-window.policy.ts` (chave 16–21,
  `resolveStopWindows` 40–86, filtro por cidade 52, `resolvePoolWindow` 98–118); o repositório as chama em 917 e 929.
  `routing/domain/delivery-window.policy.ts` (`resolveDeliveryWindow` 66–97) e o contrato com o solver não mudaram.
  A junção do destino físico do roteirizador: SQL em `drizzle-route-optimization.repository.ts` 797–830, escolha
  `resolvePhysicalDestination` em 854–862 (`routing/domain/physical-destination.policy.ts`); sem desvio manual.
- **Teste do roteirizador:** `apps/worker-transportada/test/route-optimization-municipal-holiday.integration.test.ts`,
  casos por cidade em 231–264 (o antigo "comportamento atual" ~199–206 foi invertido para `[CITY_B]`).
- **Molde de rotina diária com migration:** `apps/api-transportada/drizzle/20261007133324_cargo_preview_retention/`
  (das quatro CHECK, as **duas** de `job` em `job_schedules` e `job_executions`, `NOT VALID` + `VALIDATE`; linha em
  `job_schedules`; o `rollback.sql` apaga o histórico da rotina em `job_executions` antes de devolver as CHECK). A
  última migration em staging é `20261007140303_business_calendar`; a 250 tem `20261007205304_nfse_national_taxation`
  ainda fora de staging.
- **Catálogo de jobs (4 cópias, 16 rotinas em staging):** `apps/api-transportada/src/shared/job-catalog.constant.ts`
  (molde 266–272, `minimumIntervalSeconds` por rotina), `apps/worker-transportada/src/shared/job-catalog.constant.ts`,
  `apps/cron-transportada/src/shared/job-catalog.constant.ts`, `apps/frontend-transportada/src/modules/shared/jobCatalog.constant.ts`;
  paridade em `test/job-catalog/catalog.contract.ts` na API, no worker e no cron, e em
  `apps/frontend-transportada/test/shared/job-catalog.contract.ts` no painel. CHECK de `job` em `job-schedule.schema.ts`
  71 e 149; piso do banco 72–75 (batida de 300 s); pausa de fábrica `paused_origin = 'system'` (58–67). Trava:
  `job_executions_open_unique` (145–147; lease 30 s em `worker/src/job-run/application/run-job-cycle.ts:27`,
  renovado a cada 10 s; rotina ausente em 102–113).
- **Chave de terceiro opcional:** `apps/worker-transportada/src/config/environment.schema.ts` 82–92
  (`GOOGLE_MAPS_API_KEY`: vazio = ausente, rotina não registrada, `job_run_routine_missing`); molde de redação do
  segredo em mensagem: `nfse-issuance/infrastructure/nota-rp-v2.client.ts` 158–161.
- **Aviso de hoje na montagem:** `apps/frontend-transportada/src/modules/trip/shared/routeSchedule.service.ts` 30–74 (só
  feriado nacional em 64, só a última parada, dia pelo `slice(0, 10)` do ISO); `TripAssemblyMap.component.tsx`
  1166–1169; `trip/hooks/useSolverCityOrder.hook.ts` 102.
- **ETA por parada:** `estimatedArrivalAt` na sugestão (`frontend-transportada/src/modules/routing/shared/routeSuggestion.types.ts:44`)
  e `trip_stops.estimated_arrival_at` (`api-transportada/src/database/trip.schema.ts:800`, "some quando a ordem
  muda"). A cidade da parada é o 1º segmento da `addressKey` (`api-transportada/src/trips/domain/stop-address-key.ts`,
  `buildStopAddressKey` 53–61: `cidade|CEP|número`), e o desvio manual move a parada
  (`drizzle-delivery-address-override.repository.ts` 137–190). A viagem **não** tem data planejada própria.
  `trip_stops` não guarda o nome da cidade (770–800; o `label` é montado por `stop-label.policy.ts` e não se desmonta
  com segurança): o `cityName` vem de `listStopAddresses` (`trips/infrastructure/nfe-destination-address.support.ts`
  102–150, com `city`), que o detalhe já lê e a leitura do motorista não.
- **Permissões:** a sugestão de rota usa `trip.manage`/`fleet.read`
  (`routing/presentation/route-suggestion.routes.ts` 33–34); as rotas do calendário usam `settings.manage`.
- **Cache global de terceiro:** `geocoded_addresses` (`database/geocoding.schema.ts` 25–30), sem `company_id`.
- **Descoberta:** cursor sobre `nfe_documents_company_updated_issued_id_idx` (`database/nfe.schema.ts` 304–309; todas as
  colunas `DESC`); `nfe_addresses` **sem índice** por `(company_id, participant_id)` (416–429).
- **Destinos de saída:** `docs/SECURITY.md` 1768–1806 (a entrada do CEP e a atualização da 186, com o Google e os
  termos dele aceitos como risco); a entrada da 252 em 61–83. Não há uma lista de destinos à parte.
- **App do motorista** (`apps/frontend-driver`, ADR-0075): lê `GET /me/trips/current`
  (`api-transportada/src/trips/presentation/me-trip.routes.ts`, `application/find-current-driver-trip.use-case.ts`,
  `infrastructure/drizzle-current-driver-trip.repository.ts`), recortada pelo vínculo do motorista. A guarda da
  resposta (`driver-trip/shared/driverTripResponse.validation.ts`, `toStop` 215–235) **escolhe campo a campo**: campo
  desconhecido é ignorado, campo essencial ausente (`documents`, `sequence`, `id`, `label`) vira
  `DriverTripResponseError`. O que passa pela guarda é o `DriverTripSnapshot` guardado no aparelho
  (`tripSnapshot.service.ts`, 24 h em 14, dono `SHA-256(sub)` em 43), de onde o app abre sem rede. O relógio do
  aparelho é corrigido pelo `Date` das respostas (`clockOffset.service.ts`). O painel ainda tem a cópia legada
  `frontend-transportada/src/modules/driver-trip/` (spec 189, em drenagem). A leitura da API
  (`drizzle-current-driver-trip.repository.ts`) roda em `Promise.all` fora de transação (330–371), com os produtos
  isolados por `.catch` (365–368).
- **Contagem e isolamento na leitura do motorista:** `test/integration/driver-snapshot-products.integration.ts` conta
  as consultas a `nfe_products` (uma por viagem) e prova que a falha dos produtos não derruba o snapshot (247 T4.6);
  **não há contrato da contagem total** da leitura — a T4.3 mede e fixa. `test/trip-domain/delivery-deadline-isolation.contract.ts`
  impede que `driver-score.policy.ts`, `delivery-proof-*.ts`, `proof-pending.query.ts` e
  `drizzle-current-driver-trip.repository.ts` importem o prazo da 236 (agulha `delivery-deadline` em 11, arquivos
  15–23) — por isso o módulo do aviso não importa `trip-delivery-deadline-calendar.support.ts`.
- **Regra de ordem do `apps/api-transportada/CLAUDE.md`** (555–556): "`.strict()` exige API antes do app" — é sobre
  corpo de **requisição**. `holidayWarnings` é **resposta**: clientes tolerantes primeiro, API depois.

## Desenho

### Fase 1 — Roteirizador (sem migration) — feita

O select de `municipal_holidays` passa a trazer `cityIbgeCode`. `PoolWindowIntervals` passa a ser indexado por
`${cityCode}\u0000${taxId}`; para cada parada, a janela do cliente é resolvida com os feriados **daquela cidade**.
`resolvePoolWindow` recebe a cidade da parada para montar a chave. A política e a forma da janela entregue ao solver
não mudam. A Fase 1 sai sozinha para staging e é pré-requisito de toda escrita da rotina em `municipal_holidays`.
**Em staging desde 2026-10-07** (`913aad994`, `4454228ac`, `1754e36e7`), com a extração para
`drizzle-pool-window.query.ts` e `pool-window.policy.ts` (divergência da correção mínima justificada pelo tamanho do
repositório, evidência da 238).

### Fase 2 — Dado e catálogo

Uma migration aditiva (`apps/api-transportada/drizzle/<timestamp>_holiday_provider_import/`, timestamp depois do
último em staging na hora de gerar — e depois de `20261007205304` se a 250 entrar antes; regerar o `snapshot.json` no
rebase) com `migration.sql`, `rollback.sql` e `snapshot.json`; tabelas, colunas e **nomes explícitos** do ADR-0100 §3
(nenhum nome padrão do drizzle: o da FK de `municipal_holidays.provider_entry_id` teria 67 bytes). Ordem dentro do
arquivo: primeiro as tabelas novas, depois as duas CHECK de `job` e a linha de `job_schedules` **pausada de fábrica**
(`enabled = false`, `paused_at = now()`, `paused_origin = 'system'`, 86.400 s; D13), **por último** os comandos em
`municipal_holidays` e `state_holidays` (lock retido até o `COMMIT` do lote, ADR-0096 §5). O `rollback.sql` recusa
se houver execução da rotina aberta (`finished_at` nulo), apaga o histórico dela em `job_executions` e a linha de
`job_schedules` (molde da 237), devolve as CHECK de `job` com a lista de antes, deixa as linhas importadas como datas
digitadas comuns (o roteirizador continua respeitando-as) e apaga FKs, índices, colunas e tabelas novas. A cópia do
schema no worker ganha só o que a rotina lê/escreve.

Catálogo: o painel aprende o nome primeiro (rótulo e locale), depois API, worker e cron com a migration.

### Fase 3 — A rotina no worker

`apps/worker-transportada/src/holiday-provider-pull/` (conferido na T0.2: os módulos de rotina levam o nome do job —
`fuel-price-pull/`, `nfse-status-pull/`, `geocoding-refine/` — com `application/<job>.routine.ts` registrado em
`main.ts`, casos de uso e portas em `application/`, clientes em `infrastructure/` e a política de falha em
`domain/<job>-failure.policy.ts`):

- `infrastructure/feriados-api.client.ts` — cliente HTTP, guarda Zod, erros tipados, header redigido (molde
  `anp-series.client.ts` / `google-places.gateway.ts`).
- `domain/` — políticas puras: ordem dos pares, vencimento (180 dias, 90 dias para `not_covered`), backoff, D7, D4
  (paridade), D5/D6 (o que se aplica), `holiday-provider-pull-failure.policy.ts`.
- `application/holiday-provider-pull.routine.ts` + `pull-holiday-provider.use-case.ts` — as três etapas (descoberta,
  busca, aplicação), relógio e `sleep` injetados, teto por ciclo e orçamento.
- `infrastructure/drizzle-holiday-provider.repository.ts` — upserts por conjunto.

Limitador: `sleep(1200)` entre requisições, injetado (o contrato mede o espaçamento sem esperar de verdade).
Orçamento: `INSERT INTO holiday_provider_monthly_usage (month, requests) VALUES ($m, 1) ON CONFLICT (month) DO UPDATE
SET requests = holiday_provider_monthly_usage.requests + 1 WHERE holiday_provider_monthly_usage.requests < $budget
RETURNING requests` antes de cada chamada — sem linha devolvida, o ciclo para. (Um `UPDATE` cru não acharia linha no
primeiro pedido do mês e pararia a rotina para sempre; o orçamento é `>= 1` no schema.)

Descoberta: o lote de notas pelo cursor, depois **uma** consulta dos endereços dos dois papéis para o lote inteiro e a
escolha em TypeScript com `resolvePhysicalDestination` (cópia do worker), agregada por cidade antes do upsert. Medir o
lote com `EXPLAIN` (sem índice em `nfe_addresses` por participante). Checar o cancelamento pedido pelo operador entre
requisições.

### Fase 4 — API

- Rotas de gestão (`settings.manage`): desligar/restaurar (`holiday_import_suppressions` + `audit_logs`; desligar só
  de hoje em diante), adotar (o `PATCH` de nome/tipo **e** o `POST` da mesma data da 238 numa linha importada zeram
  `provider_entry_id`), o `DELETE` da 238 numa importada vira o desligar (com supressão), `typedHolidaysKept` conta só
  `provider_entry_id IS NULL`, o mesmo para `state_holidays`; status da importação.
- Origem no calendário: `origin` (`code`/`typed`/`rule`/`imported`) nas regras e em `HolidayReason`, lida de
  `provider_entry_id` nos mapeadores; o filtro de `readTypedHolidays` não muda.
- `holidayWarnings` no detalhe: reaproveita o calendário que o prazo da 236 monta; cidades das paradas pendentes que
  ainda não estão no calendário entram na **mesma** carga (+4 fixas, em série, nunca por parada); o `cityName` sai de
  `listStopAddresses`, que o detalhe já lê (+0), e só quando o `city_code` do endereço é a cidade da parada.
- `POST /business-calendar/day-checks` (`fleet.read`): até 200 itens, uma carga do calendário para o conjunto de
  cidades, resposta só com os dias não úteis por feriado (`explainDay(...).reasons` com a origem).
- `holidayWarnings` em `GET /me/trips/current` (T4.3, D12): o cálculo mora num módulo de aviso próprio, chamado pelo
  caso de uso da leitura depois do recorte pelo vínculo — nunca dentro de `driver-score.policy.ts` nem das políticas
  do comprovante. Data: `estimated_arrival_at` em dia civil de São Paulo, ou hoje (relógio injetado) com a parada em
  andamento. Uma carga do calendário para as cidades das paradas, em série, mais uma leitura de endereços para o
  `cityName` (+5 fixas no total), isolada com `.catch` que devolve "sem aviso" e loga só ids e contagem (a leitura do
  motorista não pode cair por um refinamento). O módulo usa `loadBusinessCalendarRules` + `buildBusinessCalendar`
  direto (não o suporte da 236, cujo nome contém a agulha do isolamento) e é chamado pelo caso de uso, nunca pelo
  repositório da leitura. O contrato de isolamento ganha a agulha do calendário/aviso para os arquivos da nota e do
  comprovante.

### Fase 5 — Painel e app do motorista

Tolerância primeiro (campo ausente = sem aviso), no painel (T5.1) e no app do motorista (T5.1b), as duas publicadas
**antes** da API. Depois aba Calendário (origem, desligar/restaurar, removidos pelo fornecedor, status) e avisos
(montagem: por parada, uma chamada a `day-checks` quando o solver termina, com recuo para o aviso nacional; detalhe:
selo na parada). Texto neutro, nunca bloqueia "Criar viagem".

App do motorista (T5.4): o aviso no cartão da parada (`DriverStopCard.component.tsx`, que já tem 75 KB — o aviso
entra como componente próprio, no molde dos `Driver*Notice.component.tsx`), lido do snapshot (funciona sem rede),
texto curto de campo, "hoje" só quando a data do aviso é o dia civil de São Paulo no relógio do aparelho corrigido
(`clockOffset.service.ts`), nunca esconde nem bloqueia ação, alvo ≥ 44 px se houver toque, locale do app
(`driver-trip/locales/driverTrip.locale.json` e `driverTrip.en.locale.json`), nada importado do painel.

## Riscos e mitigação

| Risco                                                       | Mitigação                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Importar antes da Fase 1 fecha todos os clientes do roteiro | Fase 1 publicada em staging é pré-requisito da escrita; T3.4 confere no início                 |
| Termos de uso não permitem guardar (Q4)                     | Rotina inerte sem token; o usuário confirma antes de configurar                                |
| Cota cobrada por cidade sem preço conhecido (Q3)            | Orçamento mensal no banco, teto de 100 por ciclo, prioridade por volume de notas               |
| Token em log                                                | Header redigido no gateway e no logger; contrato sobre a saída                                 |
| Contrato do fornecedor muda                                 | Guarda Zod com chaves esperadas; `malformed_response`; nada gravado                            |
| Lock em `municipal_holidays`/`state_holidays`               | Comandos no fim do arquivo; `NOT VALID` + `VALIDATE`; medir antes de produção                  |
| Rollback com rotina ligada                                  | `rollback.sql` recusa com execução aberta; reverter o worker junto (molde da 237 T4.8)         |
| Contador do mês sem linha no dia 1º                         | Upsert condicional, nunca `UPDATE` cru                                                         |
| Descoberta varrendo `nfe_addresses`                         | `EXPLAIN` na T3.2; índice em migration própria se preciso                                      |
| Rotina falhando todo dia sem token                          | Nasce pausada de fábrica (D13)                                                                 |
| Nome de constraint acima de 63 bytes                        | Todos os nomes explícitos e contados (ADR-0100 §3)                                             |
| Painel publicado antes da API                               | Painel tolerante (T5.1) sai primeiro; `day-checks` ausente cai no aviso nacional               |
| App do motorista publicado depois da API                    | A guarda já ignora campo desconhecido; ainda assim T5.1b sai antes e lê o aviso como acessório |
| Aviso derruba a leitura do motorista                        | Carga do calendário isolada (`.catch` → sem aviso); integração com o calendário falhando       |
| Feriado mexer na nota do motorista                          | Contrato de isolamento + integração com e sem feriado (CA16)                                   |
| Aviso guardado no aparelho envelhece                        | O app mostra a data; "hoje" só se for o dia civil do aparelho                                  |
| Concorrência com edição manual no calendário                | `ON CONFLICT DO NOTHING`; supressão consultada na aplicação; lock por empresa da 238           |

## Ordem de publicação

1. T1.2 sozinha (worker) em staging — **feito** (`4454228ac`, 2026-10-07).
2. T2.2 com T2.3 — painel primeiro, depois a migration com API/worker/cron.
3. Painel tolerante (T5.1) e app do motorista tolerante (T5.1b).
4. API (Fase 4).
5. Worker (Fase 3), **inerte sem token** e com a rotina pausada de fábrica.
6. O usuário confirma termos e plano (Q3, Q4), configura o token em staging e despausa a rotina.
7. Acompanhar o 1º ciclo (requisições, orçamento, linhas gravadas, falhas) e registrar em `evidence.md`.
8. Telas (T5.2, T5.3, T5.4) depois dos prints aprovados.
9. Produção por PR `staging → main` com aprovação humana (e a migration com aprovação própria, Q2).

## Documentação viva

`docs/spec/domain-model.md`, `docs/ai-context/api-transportada.md`, `docs/ai-context/worker-transportada.md`,
`docs/ai-context/frontend-transportada.md`, `docs/ai-context/frontend-driver.md`, `CLAUDE.md` das apps tocadas, `docs/SECURITY.md` (destino de saída
`feriadosapi.com`), `.env.example`, `.railway/railway.ts`.

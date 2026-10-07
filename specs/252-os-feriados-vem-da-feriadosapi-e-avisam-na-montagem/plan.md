# Plano — 252

> Desenho do `architect` (`opus`, 2026-10-07). Decisão completa no **ADR-0100**. Fatos conferidos em `origin/staging`
> (`927335484`) em 2026-10-07; a T0.2 reconfere arquivo e linha antes do código.

## Contexto (o que já existe)

- **Calendário (238, ADR-0096):** `municipal_holidays` (`apps/api-transportada/src/database/delivery-client.schema.ts`
  ~240–288; único `(company_id, city_ibge_code, holiday_on)`; `kind` e `source_rule_id`), `municipal_holiday_rules`,
  `state_holidays` (`state-holiday.schema.ts`, `once`/`yearly`), a política `business-calendar` e
  `loadBusinessCalendarRules` (`business-calendar/infrastructure/business-calendar-rules.query.ts`, quatro leituras
  **em série**). A linha com `source_rule_id` nulo entra como `once` na política: a importada (com `provider_entry_id`
  e `source_rule_id` nulo) já entra sem mudar a consulta.
- **Prazo (236):** `trips/infrastructure/trip-delivery-deadline-calendar.support.ts` lê o calendário por cidade e é
  recalculado a cada leitura do detalhe.
- **Roteirizador:** `apps/worker-transportada/src/routing/infrastructure/drizzle-route-optimization.repository.ts`
  `readPoolWindows` ~990–1092 (select de feriado ~1050–1060, aplicação a todos os clientes ~1076, mapa por `taxId`
  ~1090) e `routing/domain/delivery-window.policy.ts` ~62–98. Contrato com o solver congelado.
- **Teste de caracterização:** `apps/worker-transportada/test/route-optimization-municipal-holiday.integration.test.ts`
  ~199–206 ("comportamento atual (defeito conhecido…)", espera `[CITY_A, CITY_B]`).
- **Molde de rotina diária com migration:** `apps/api-transportada/drizzle/20261007133324_cargo_preview_retention/`
  (CHECK de `job` em `job_schedules` e `job_executions`, `NOT VALID` + `VALIDATE`, linha em `job_schedules`). A última
  migration em staging é `20261007140303_business_calendar`.
- **Catálogo de jobs (4 cópias):** `apps/api-transportada/src/shared/job-catalog.constant.ts`,
  `apps/worker-transportada/src/shared/job-catalog.constant.ts`, `apps/cron-transportada/src/shared/job-catalog.constant.ts`,
  `apps/frontend-transportada/src/modules/shared/jobCatalog.constant.ts`, cada uma com `test/job-catalog/catalog.contract.ts`.
  CHECK de `job` em `job-schedule.schema.ts` (~71 e ~149). Trava: `job_executions_open_unique` (lease 30 s).
- **Chave de terceiro opcional:** `apps/worker-transportada/src/config/environment.schema.ts` ~82–92
  (`GOOGLE_MAPS_API_KEY`: vazio = ausente, rotina não registrada, `job_run_routine_missing`).
- **Aviso de hoje na montagem:** `apps/frontend-transportada/src/modules/trip/shared/routeSchedule.service.ts` ~31–75 (só
  feriado nacional, só a última parada, dia pelo `slice(0, 10)` do ISO); `TripAssemblyMap.component.tsx` ~1159–1170;
  `trip/hooks/useSolverCityOrder.hook.ts` ~102.
- **ETA por parada:** `estimatedArrivalAt` na sugestão (`frontend-transportada/src/modules/routing/shared/routeSuggestion.types.ts`)
  e `trip_stops.estimated_arrival_at`. A cidade da parada é o 1º segmento da `addressKey`
  (`api-transportada/src/trips/domain/stop-address-key.ts`). A viagem **não** tem data planejada própria.
- **Permissões:** a sugestão de rota usa `trip.manage`/`fleet.read`
  (`routing/presentation/route-suggestion.routes.ts` ~33–34); as rotas do calendário usam `settings.manage`.
- **Cache global de terceiro:** `geocoded_addresses` (`database/geocoding.schema.ts`), sem `company_id`.
- **Destinos de saída:** `docs/SECURITY.md` ~1771–1782 (CEP, Google; termos do Google aceitos como risco, spec 186).
- **App do motorista** (`apps/frontend-driver`, ADR-0075): lê `GET /me/trips/current`
  (`api-transportada/src/trips/presentation/me-trip.routes.ts`, `application/find-current-driver-trip.use-case.ts`,
  `infrastructure/drizzle-current-driver-trip.repository.ts`), recortada pelo vínculo do motorista. A guarda da
  resposta (`driver-trip/shared/driverTripResponse.validation.ts`, `toStop` ~215–235) **escolhe campo a campo**: campo
  desconhecido é ignorado, campo essencial ausente vira `DriverTripResponseError`. O que passa pela guarda é o
  `DriverTripSnapshot` guardado no aparelho (`tripSnapshot.service.ts`, 24 h, dono `SHA-256(sub)`), de onde o app abre
  sem rede. O painel ainda tem a cópia legada `frontend-transportada/src/modules/driver-trip/` (spec 189, em drenagem).
- **Contagem e isolamento na leitura do motorista:** `test/integration/driver-snapshot-products.integration.ts` conta
  as consultas a `nfe_products` (uma por viagem) e prova que a falha dos produtos não derruba o snapshot (247 T4.6);
  **não há contrato da contagem total** da leitura — a T4.3 mede e fixa. `test/trip-domain/delivery-deadline-isolation.contract.ts`
  impede que `driver-score.policy.ts`, `delivery-proof-*.ts`, `proof-pending.query.ts` e
  `drizzle-current-driver-trip.repository.ts` importem o prazo da 236.
- **Regra de ordem do `apps/api-transportada/CLAUDE.md`** (~555): "`.strict()` exige API antes do app" — é sobre corpo
  de **requisição**. `holidayWarnings` é **resposta**: clientes tolerantes primeiro, API depois.

## Desenho

### Fase 1 — Roteirizador (sem migration)

O select de `municipal_holidays` passa a trazer `cityIbgeCode`. `PoolWindowIntervals` passa a ser indexado por
`${cityCode}\u0000${taxId}`; para cada parada, a janela do cliente é resolvida com os feriados **daquela cidade**.
`resolvePoolWindow` recebe a cidade da parada para montar a chave. A política e a forma da janela entregue ao solver
não mudam. A Fase 1 sai sozinha para staging e é pré-requisito de toda escrita da rotina em `municipal_holidays`.

### Fase 2 — Dado e catálogo

Uma migration aditiva (`apps/api-transportada/drizzle/<timestamp>_holiday_provider_import/`, timestamp depois do
último em staging na hora de gerar) com `migration.sql`, `rollback.sql` e `snapshot.json`; tabelas e colunas do
ADR-0100 §3. Ordem dentro do arquivo: primeiro as tabelas novas, **por último** os comandos em `municipal_holidays` e
`state_holidays` (lock retido até o `COMMIT` do lote, ADR-0096 §5). O `rollback.sql` deixa as linhas importadas como
datas digitadas comuns (o roteirizador continua respeitando-as), apaga as tabelas novas, as colunas, o índice e
devolve as CHECK de `job` — e recusa se houver execução da rotina em andamento. A cópia do schema no worker ganha só
o que a rotina lê/escreve.

Catálogo: o painel aprende o nome primeiro (rótulo e locale), depois API, worker e cron com a migration.

### Fase 3 — A rotina no worker

`apps/worker-transportada/src/holiday-provider-import/` (nome a confirmar na T0.2 contra os módulos vizinhos):

- `infrastructure/feriados-api.gateway.ts` — cliente HTTP, guarda Zod, erros tipados, header redigido.
- `domain/` — políticas puras: ordem dos pares, vencimento (180 dias, 90 dias para `not_covered`), backoff, D7, D4
  (paridade), D5/D6 (o que se aplica).
- `application/holiday-provider-pull.use-case.ts` — as três etapas (descoberta, busca, aplicação), relógio e
  `sleep` injetados, teto por ciclo e orçamento.
- `infrastructure/drizzle-holiday-provider.repository.ts` — upserts por conjunto.

Limitador: `sleep(1200)` entre requisições, injetado (o contrato mede o espaçamento sem esperar de verdade).
Orçamento: `UPDATE holiday_provider_monthly_usage SET requests = requests + 1 WHERE month = $m AND requests < $budget
RETURNING requests` antes de cada chamada — sem linha devolvida, o ciclo para.

### Fase 4 — API

- Rotas de gestão (`settings.manage`): desligar/restaurar (`holiday_import_suppressions` + `audit_logs`), adotar (o
  `PATCH` de nome/tipo da 238 numa linha importada zera `provider_entry_id`), status da importação.
- `holidayWarnings` no detalhe: reaproveita o calendário que o prazo da 236 monta; cidades das paradas pendentes que
  ainda não estão no calendário entram na **mesma** carga (+4 fixas, em série, nunca por parada).
- `POST /business-calendar/day-checks` (`fleet.read`): até 200 itens, uma carga do calendário para o conjunto de
  cidades, resposta só com os dias não úteis por feriado (`explainDay(...).reasons` com a origem).
- `holidayWarnings` em `GET /me/trips/current` (T4.3, D12): o cálculo mora num módulo de aviso próprio, chamado pelo
  caso de uso da leitura depois do recorte pelo vínculo — nunca dentro de `driver-score.policy.ts` nem das políticas
  do comprovante. Data: `estimated_arrival_at` em dia civil de São Paulo, ou hoje (relógio injetado) com a parada em
  andamento. Uma carga do calendário para as cidades das paradas, em série, isolada com `.catch` que devolve "sem
  aviso" e loga só ids e contagem (a leitura do motorista não pode cair por um refinamento). O contrato de isolamento
  ganha a agulha do calendário/aviso para os arquivos da nota e do comprovante.

### Fase 5 — Painel e app do motorista

Tolerância primeiro (campo ausente = sem aviso), no painel (T5.1) e no app do motorista (T5.1b), as duas publicadas
**antes** da API. Depois aba Calendário (origem, desligar/restaurar, removidos pelo fornecedor, status) e avisos
(montagem: por parada, uma chamada a `day-checks` quando o solver termina, com recuo para o aviso nacional; detalhe:
selo na parada). Texto neutro, nunca bloqueia "Criar viagem".

App do motorista (T5.4): o aviso no cartão da parada (`DriverStopCard.component.tsx`), lido do snapshot (funciona sem
rede), texto curto de campo, "hoje" só quando a data do aviso é o dia civil do aparelho, nunca esconde nem bloqueia
ação, alvo ≥ 44 px se houver toque, locale do app (`driver-trip/locales/`), nada importado do painel.

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
| Painel publicado antes da API                               | Painel tolerante (T5.1) sai primeiro; `day-checks` ausente cai no aviso nacional               |
| App do motorista publicado depois da API                    | A guarda já ignora campo desconhecido; ainda assim T5.1b sai antes e lê o aviso como acessório |
| Aviso derruba a leitura do motorista                        | Carga do calendário isolada (`.catch` → sem aviso); integração com o calendário falhando       |
| Feriado mexer na nota do motorista                          | Contrato de isolamento + integração com e sem feriado (CA16)                                   |
| Aviso guardado no aparelho envelhece                        | O app mostra a data; "hoje" só se for o dia civil do aparelho                                  |
| Concorrência com edição manual no calendário                | `ON CONFLICT DO NOTHING`; supressão consultada na aplicação; lock por empresa da 238           |

## Ordem de publicação

1. T1.2 sozinha (worker) em staging.
2. T2.2 com T2.3 — painel primeiro, depois a migration com API/worker/cron.
3. Painel tolerante (T5.1) e app do motorista tolerante (T5.1b).
4. API (Fase 4).
5. Worker (Fase 3), **inerte sem token**.
6. O usuário confirma termos e plano (Q3, Q4) e configura o token em staging.
7. Acompanhar o 1º ciclo (requisições, orçamento, linhas gravadas, falhas) e registrar em `evidence.md`.
8. Telas (T5.2, T5.3, T5.4) depois dos prints aprovados.
9. Produção por PR `staging → main` com aprovação humana (e a migration com aprovação própria, Q2).

## Documentação viva

`docs/spec/domain-model.md`, `docs/ai-context/api-transportada.md`, `docs/ai-context/worker-transportada.md`,
`docs/ai-context/frontend-transportada.md`, `docs/ai-context/frontend-driver.md`, `CLAUDE.md` das apps tocadas, `docs/SECURITY.md` (destino de saída
`feriadosapi.com`), `.env.example`, `.railway/railway.ts`.

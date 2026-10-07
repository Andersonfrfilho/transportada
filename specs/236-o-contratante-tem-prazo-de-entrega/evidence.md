# Evidência — 236

## Passo 0 — correção do texto antigo (2026-10-07, `541c1ec91`)

O architect `opus` achou texto do rascunho que contradizia as decisões do usuário. Corrigidos `spec.md`, `plan.md`,
`tasks.md`, `specs/237-…/spec.md` (linha da dúvida: "cidade do destinatário" → destino físico) e o ADR-0096 (Q2: o
**desvio manual** mora em `delivery_address_overrides`, um por `trip_document`, vale o mais recente; não é de
`resolvePhysicalDestination`, que só conhece `delivery` e `recipient`). **Nenhuma decisão do usuário mudou.**

- **Confirmação pendente em uma linha** (D5): o prazo que vale é o **copiado na chegada**
  (`cargo_arrivals.delivery_deadline_business_days`, ADR-0094), não o "perfil atual" que o rascunho dizia. É o que o
  usuário aprovou na 237; o usuário confirma em uma linha que a 236 segue a cópia.
- A janela de 24 h saiu da assinatura da política; `recipientCityIbge` saiu (quem chama resolve o IBGE do destino
  físico); o fuso virou fixo `America/Sao_Paulo`; o estado `open` virou `on_time` com `businessDaysRemaining`;
  `dueAt` virou `dueOn` (data civil); o detalhe da viagem não faz join com `contractors`; o `loadRules` da 238 faz
  quatro consultas e roda em série dentro da transação (T1.2a).

## T1.1 — `delivery-deadline.policy.ts` e a borda de datas (2026-10-07)

Executada com `sonnet` sobre o desenho validado pelo architect (`opus`). Worktree isolado
`agent-ae772c299d8346443`, branch `work/236-t11` a partir de `origin/staging` (`50908c1fd`).

- **Contrato antes** (`bff3c1a81`): `test/trip-domain/delivery-deadline.contract.ts` (tabela), `…-input.contract.ts`
  (a borda: instante de São Paulo → data civil), `…-isolation.contract.ts` (CA6 estático), tabelas em
  `delivery-deadline.cases.ts` e calendários em `test/fixtures/delivery-deadline-calendar.fixture.ts`, registrados
  pela entrada fina `test/trip-domain.contract.test.ts` (já na lista explícita do `package.json`). Vermelho por
  `Cannot find module '../../src/trips/application/delivery-deadline-input.service.js'`.
- **Implementação** (`499aa0305`): `src/trips/domain/delivery-deadline.{policy,types,constant}.ts` (pura: datas
  civis em texto, sem fuso, sem relógio, sem I/O) e `src/trips/application/delivery-deadline-input.service.ts`
  (`resolveDeliveryDeadlineFromInstants`: `toCivilDate` no fuso `America/Sao_Paulo`).
- **Verde:** `bun --env-file=<.env.test> test ./test/trip-domain.contract.test.ts` → 488 pass / 0 fail (421 antes;
  +67 novos). Suíte inteira de contratos da API: **10566 pass / 25 skip / 0 fail** (antes: 10499 / 25 / 0).
  `bun run typecheck` → 0; `bun run lint` → 0 (`--max-warnings=0`); `bun run format:check` na raiz → limpo.

### A tabela foi refeita por conta independente

As 46 linhas do architect foram refeitas por raciocínio próprio (dia da semana a partir de 01/01, Páscoa por
Meeus/Anônimo: 2028 = 16/04, logo Carnaval 28 e 29/02/2028) **e** por um script Python que não importa nada do
repositório. **Nenhuma divergência**. Observação: a fixture da 238 inventa um aniversário 29/02 em BH; a linha 36 (BH,
28/02/2024 + 1 → 29/02/2024) só vale com BH sem regra municipal, então a 236 tem a própria fixture.

### Mutações (CA4) — cada uma derrubou o contrato, e o arquivo foi restaurado (`git diff --quiet`)

| Mutação                                              | Arquivo                      | Falhas | Linhas / testes que derrubaram                            |
| ---------------------------------------------------- | ---------------------------- | -----: | --------------------------------------------------------- |
| somar 24 h à chegada                                 | `delivery-deadline-input`    |     12 | 1–11 (borda)                                              |
| contar sábado                                        | `business-calendar.policy`   |     25 | 4, 5, 9, 12, 13, 16, 18, 19, 22–26, 28, 30, 32–35, 37, 38 |
| ignorar o aniversário da cidade                      | `business-calendar-build`    |      3 | 20, 24, 26                                                |
| `<` no lugar de `≤` (entrega no dia)                 | `delivery-deadline.policy`   |      4 | 6, 10 (tabela e borda)                                    |
| `≤` no pendente (vence hoje vira no prazo)           | `delivery-deadline.policy`   |      7 | 2, 15, 16, 31, 32 e "23:30 de quinta"                     |
| data em UTC                                          | `delivery-deadline.constant` |      3 | 10, 11 e "23:30 de quinta"                                |
| dia 0 estilo `WORKDAY` do Excel                      | `delivery-deadline.policy`   |      6 | 12, 13, 14, 15, 16, 30                                    |
| UF errada (estadual de SP em BH)                     | `business-calendar-build`    |      1 | 23                                                        |
| `today` usado em nota entregue                       | `delivery-deadline.policy`   |     13 | 6–10, 37, 39 e "ignora o hoje"                            |
| precedência do `not_applicable` (desfecho × chegada) | `delivery-deadline.policy`   |      1 | "o desfecho que encerra a nota vence…"                    |
| precedência sem prazo × sem cidade                   | `delivery-deadline.policy`   |      1 | "sem chegada vence sem prazo…"                            |
| entrega medida pelo agora (chegada ao servidor)      | `delivery-deadline-input`    |      4 | 6, 8, 9, 10 (borda)                                       |
| import de `delivery-deadline` em `src/fleet/**`      | `driver-score.policy`        |      1 | isolamento (CA6)                                          |

### Divergências do desenho validado

- `BUSINESS_CALENDAR_TIME_ZONE` **não existe em `origin/staging`** (só na branch não publicada da 238). A borda usa
  `DELIVERY_DEADLINE_TIME_ZONE` em `delivery-deadline.constant.ts`; quando a 238 publicar, trocar pela constante dela
  é uma linha.
- `DeliveryOutcome.delivered` carrega `deliveredOn: CivilDate`; a borda aceita `DeliveryInstantOutcome` (com
  `deliveredAt: Date`) e converte. O nome da função da borda (`resolveDeliveryDeadlineFromInstants`) é nosso.
- O desenho dizia "`dueAt`" em alguns trechos; a política devolve `dueOn`.

### Não rodado

Integração contra Postgres, `make migration-test`, smoke e painel: esta task não tem consulta, rota, migration nem
tela (T1.2 em diante). `bun run lint` na raiz não se aplica (lint é por app).

## T1.2 — o prazo de entrega por nota no detalhe da viagem (2026-10-07)

Executada com `sonnet` sobre o desenho validado pelo architect (`opus`), no worktree `angry-hamilton-090c30` (branch
`work/spec-232-momento-do-evento`, a partir de `origin/staging` `394406a61`, rebase sem nada a aplicar, `bun install --frozen-lockfile` limpo).
Sem migration, sem tela, sem push. Banco de integração: o Postgres do `.env.test` (`localhost:65432`), com **um banco descartável por teste**
(`withDisposableDatabase` cria e derruba; nenhum dado de produção lido).

| Commit      | Parte                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| `e397c158f` | T1.2a — contrato vermelho: leituras do calendário em série (módulo inexistente / ENOENT)               |
| `e5d512e55` | T1.2a — `loadBusinessCalendarRules(executor, params)` em série; o repositório só delega                |
| `baf9abe51` | **PAINEL** T1.2b — contrato + guarda tolerante (`apps/frontend-transportada` + docs), sem renderizar   |
| `085202094` | T1.2c/d — contratos e integrações vermelhos (módulos inexistentes; serialização sem o campo)           |
| `3d4d0f5ee` | T1.2c — a leitura: joins da chegada, desvio, entrega, calendário uma vez, relógio injetado, serializer |
| `992bd26a4` | T1.2a — `tenant-safety` do calendário passa a ler o arquivo novo das consultas                         |

### T1.2a — `loadRules` em série

`src/business-calendar/infrastructure/business-calendar-rules.query.ts` (`loadBusinessCalendarRules`): as quatro leituras, uma de cada vez,
aceitando banco ou transação; `DrizzleBusinessCalendarRepository.loadRules` delega. Com lista de cidades vazia continua sendo uma consulta só
(a configuração da empresa). Entrou em `test/transaction-serial-queries.contract.test.ts` (contrato estático) **e** ganhou prova de
comportamento sem banco: um executor de mentira (`test/fixtures/recording-select-executor.fixture.ts`) mede o pico de consultas ao mesmo tempo
(`maxInFlight = 1`) para a função e para o repositório. ADR-0096 §6 corrigido (dizia "`Promise.all` está certo ali").

### T1.2b — painel

`deliveryDeadline` em `TRIP_DOCUMENT_DETAIL_OPTIONAL_KEYS` com chaves exatas por estado (`isDeliveryDeadline`, em `isDocumentDetail`), **só** no
`TripDocumentDetail`. A armadilha da brief confirmada: o leitor tolerante cai para os obrigatórios quando QUALQUER opcional vem malformado e
levaria `contact`/`proofPending` junto; por isso `readTolerantDocumentDetail` passa por `dropMalformedDeliveryDeadline` antes. JSON de
referência `test/fixtures/trip-document-delivery-deadline.golden.json` (os cinco estados), cópia idêntica na API.

### T1.2c — a leitura

- **Join sem consulta nova:** `cargo_arrival_documents` por `(company_id, nfe_document_id)` e `cargo_arrivals` por `(company_id, arrival_id)` no
  `documentRecords`; traz `arrived_at`, a **cópia** `delivery_deadline_business_days` e `return_to_contractor`.
- **Cidade:** `stopAddresses` (`listStopAddresses`, antecipada para antes do `map` das notas) + desvio manual por cima
  (`delivery_address_overrides`, `selectDistinctOn`, mais recente). **Entrega:** `selectDistinctOn` sobre `trip_stop_events` com
  `deliveredMomentSql`. **Calendário:** `loadBusinessCalendarRules` uma vez por viagem, `buildBusinessCalendar` por cidade.
- **Policies puras novas:** `delivery-deadline-outcome.policy.ts` (a precedência do desfecho) e `delivery-deadline-coverage.policy.ts` (a cobertura).
- **Relógio:** `clock` (e `logger`) nas `dependencies` de `DrizzleTripRepository`, montados só em `main.ts`; contrato de fiação em
  `test/composition/trip-delivery-deadline-wiring.contract.ts`. Sem `clock` o campo não é calculado.
- **Serialização:** `deliveryDeadline` só em `serializeTripDocumentDetail` (política de campo `safe`); o `TripDocument` não o ganha.

### Contagem real de consultas (CA5)

Medida contra Postgres real, contando `select` **e** `selectDistinctOn` (`trip-detail-delivery-deadline-count.integration.ts`), sempre pela
diferença entre o detalhe com o relógio e o mesmo detalhe sem ele:

| Cenário                                          | Consultas a mais |
| ------------------------------------------------ | ---------------: |
| viagem sem nenhuma chegada (3 notas)             |           **+0** |
| 1 nota, 1 cidade, com chegada                    |           **+6** |
| 200 notas, 40 cidades, com chegada               |           **+6** |
| candidata sem cidade válida de destino (2 notas) |           **+2** |

O total do detalhe da viagem pequena e o da grande são iguais (`largeTotal === smallTotal`).

### Gates

- API: `bun run typecheck` → 0; `bun run lint` (`--max-warnings=0`) → 0; contratos `bun --env-file=<.env.test> test --timeout 120000`
  → **10708 pass / 25 skip / 0 fail** (antes: 10659 / 25 / 0; +49). Integrações, **um arquivo por vez**: as 5 novas
  (`trip-detail-delivery-deadline{,-moments,-return,-count,-transaction}`: 4 + 4 + 1 + 3 + 1 = 13 testes), os 64 arquivos `trip-*`, `business-calendar-*`,
  `municipal-holiday-*` e `delivered-moment` (**411 pass, 1 skip que já existia, 0 fail**) e os 4 outros que constroem `DrizzleTripRepository`
  (`delivery-charge-end-to-end`, `multi-vehicle-suggestion`, `me-trip`, `mixed-cargo-end-to-end`: 36 pass / 0 fail). As 13 do calendário seguem verdes
  sem alteração.
- Painel: `bun run typecheck` → 0; `bun run lint` → 0; `bun run test` → **7393 pass / 0 fail** + `test:hooks` **934 pass / 0 fail** (antes: 7374 / 934;
  +19 = os testes novos do contrato `delivery-deadline-tolerance`).
- `bun run format:check` na raiz → limpo.

### Mutações — cada uma derrubou o contrato, e o arquivo foi restaurado (`git diff --quiet`)

| Mutação                                               | Arquivo                                      | Falhas | O que derrubou                                                                          |
| ----------------------------------------------------- | -------------------------------------------- | -----: | --------------------------------------------------------------------------------------- |
| `Promise.all` de volta no `loadBusinessCalendarRules` | `business-calendar-rules.query.ts`           |      5 | `maxInFlight` da função e do repositório, +6 em série, contrato estático                |
| perfil atual no lugar da cópia                        | `drizzle-trip.repository.ts` (select)        |      1 | integração "o perfil muda de 3 para 5 dias depois da chegada"                           |
| entrega medida por `recorded_at`                      | `trip-delivery-deadline.query.ts`            |      1 | integração "a entrega é medida pelo momento da 234"                                     |
| sem o desvio manual                                   | `trip-delivery-deadline-locate.support.ts`   |      1 | contrato "o desvio manual sem cidade deixa a nota sem prazo" (e a integração do desvio) |
| calendário carregado por nota (N+1)                   | `trip-delivery-deadline.support.ts`          |      3 | "+6" com candidata, "uma nota ou duzentas", desvio com cidade                           |
| campo no `TripDocument` (chaves exatas do painel)     | `trip.routes.ts` (`serializeTripDocument`)   |      1 | "never answers it on the plain TripDocument"                                            |
| guarda do painel derrubando os outros opcionais       | `tripResponse.validation.ts`                 |     11 | os 11 "descarta só o campo quando vem …: contact e proofPending ficam"                  |
| erro de calendário derrubando o detalhe               | `trip-delivery-deadline-calendar.support.ts` |      1 | "o erro do calendário vira sem prazo com aviso só de ids e código"                      |
| sem o ano seguinte na cobertura (extra)               | `delivery-deadline-coverage.policy.ts`       |      5 | tabela da cobertura (a integração de 30/12 também a prende)                             |

### Divergências do desenho validado

- **`fromYear` inclui o ano de hoje** (o desenho dizia "menor ano entre chegadas e entregas"): chegada com data futura deixaria o "hoje" fora
  da cobertura e a nota cairia em `OUT_OF_COVERAGE`. Só muda o caso patológico.
- **`return_to_contractor` vem de `cargo_arrival_documents`**, não de `cargo_arrivals` (a coluna é da nota na chegada). `marked` e `returned` valem
  `returned_to_contractor`.
- **A candidata não filtra por desfecho:** nota devolvida/cancelada/liberada com chegada ainda paga as seis consultas (a política devolve
  `not_applicable` depois). Filtrar antes pouparia consultas em viagem encerrada à custa de a contagem deixar de ser fixa.
- **Desvio manual sem cidade** deixa a nota sem prazo (não cai no endereço cadastrado). **Entregue sem evento** usa `trip_documents.delivered_at`;
  sem nenhum momento, `null`. Só `nfe_documents.status = 'cancelled'` conta como cancelada (denegada não).
- **O `warn` é um por código e por viagem** (com a lista de `tripDocumentIds`), não um por nota — 200 notas não geram 200 linhas de log.
- **`buildBusinessCalendar` recebe as regras de todas as cidades** (ele mesmo filtra a sua): a guarda `TOO_MANY_RULES` continua valendo para a
  leitura truncada em vez de ser perdida por um filtro por cidade.
- **Dois contratos da 238 tocados:** `test/business-calendar-schema/tenant-safety.contract.ts` lia `drizzle-business-calendar.repository.ts` para
  conferir `isNull(sourceRuleId)` e os três `.limit(BUSINESS_CALENDAR_MAX_RULES + 1)`; as consultas se mudaram, e o contrato passou a ler o
  arquivo novo (nada de asserção afrouxada, e o arquivo novo também entra na varredura de `companyId`).
- A borda da T1.1 segue com `DELIVERY_DEADLINE_TIME_ZONE` (a constante da 238 `BUSINESS_CALENDAR_TIME_ZONE` já existe; trocar é uma linha, fora desta task).

### Risco aceito

Os caminhos de escrita que devolvem o detalhe (`close`, vínculo, cancelamento…) **também pagam** as seis consultas quando há candidata. A integração
`trip-detail-delivery-deadline-transaction` prova `close` com o prazo dentro da transação real do driver de produção (sem trava).

### Não rodado

`make smoke`/Playwright e qualquer verificação de tela (não há tela nesta task); `make migration-test` (sem migration); `make worker-integration`;
as ~20 integrações que não tocam o repositório de viagens nem o calendário; `make check` completo; nenhuma leitura de banco de produção.

## T1.2e — correções da revisão `opus` da Fase 1 (2026-10-07)

Executada com `sonnet` no worktree `angry-hamilton-090c30` (rebase sobre `origin/staging` sem conflito: o commit do painel `baf9abe51` caiu
como patch idêntico — já publicado como `d2d1837ca`; `bun install --frozen-lockfile` limpo). Sem migration, sem tela, sem push. Banco de integração:
o Postgres do `.env.test` (`localhost:65432`), **um banco descartável por teste** (`withDisposableDatabase`); nenhum dado de produção lido.

| Commit      | Parte                                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `228cf2327` | contratos e integrações vermelhos: entrega sem evento, viagem entregue lida em 2032, formatador, 2 contratantes, prazo nulo, desvio mais recente, 5 leituras em série |
| `5c11716fb` | o código: itens 1, 2, 3, 4 e 7                                                                                                                                        |
| `97949ce07` | T1.3 (teste de comportamento) + painel: `openOccurrenceCase` sobrevive a `deliveryDeadline` malformado                                                                |

Vermelhos antes do código (pelo motivo certo): `entregue sem evento não é medida` (recebia 1, esperava 0), `viagem toda entregue lida anos depois`
(`undefined` no lugar de `delivered_on_time`: a cobertura 2027–2032 deixava a chegada de 2026 de fora), `cem chamadas constroem o formatador` (100 > 1),
as duas integrações equivalentes (entregue pelo servidor sem evento; viagem entregue em 2032). As do item 6 já passavam: eram lacunas de prova, não
defeitos.

- **1. Entrega só pelo evento.** `documentDeliveredAt` saiu do tipo da nota, do mapper e do `??` do locate. Nota entregue sem evento: `null`
  (`not_applicable`). **Decisão:** nos caminhos do barracão `trip_documents.delivered_at` é o `now()` do clique
  (`drizzle-trip-document.repository.ts`, `drizzle-trip-document-batch.repository.ts`); medir por ele contrariava "os 3 dias são de ENTREGA, medida pelo
  momento do evento (234)" e o resto do sistema (nota do motorista e comprovante medem só por `trip_stop_events`). Spec RF3 atualizado. Custo
  aceito: a entrega antiga sem evento fica sem selo.
- **2. Cobertura.** `todayYear: number | null`: o ano de hoje só entra se alguma candidata está **pendente** (as entregues são medidas pela chegada e
  pela entrega). Sem hoje, `toYear` passa a cobrir também os anos de entrega (antes o hoje os cobria). Viagem toda entregue lida anos depois mantém o
  selo e não gera `warn`.
- **3. Constantes (§16).** `DELIVERED_EVENT_KIND`, `DELIVERED_DOCUMENT_STATUS`/`RETURNED_DOCUMENT_STATUS` e `BUSINESS_CALENDAR_TIME_ZONE` importadas
  (cópias apagadas, inclusive `DELIVERY_DEADLINE_TIME_ZONE`: cobertura e calendário dependem de ser o MESMO fuso); `separationStatus` tipado
  `TripDocumentSeparationStatus`; a mensagem do log foi para `trip-delivery-deadline.constant.ts`; `(n) =>` virou `(candidate) =>`.
- **4. `toCivilDate`.** Formatador guardado por fuso num `Map` de módulo com teto de 16 entradas (esvazia ao estourar; o conjunto real é 1 fuso). Os 121
  contratos da 238 T1.1 e o da borda da 236 seguem verdes **sem alteração**.
- **5. Leituras em série.** `readTripDeliveryDeadlines`, `locateNotes`, `loadCityCalendars`, `loadDeliveryAddressOverrideCities` e
  `loadDeliveredMoments` entraram em `test/transaction-serial-queries.contract.test.ts` (12 → 17 entradas).
- **6. Lacunas.** (a) `trip-detail-delivery-deadline-edge.integration.ts`: dois contratantes na MESMA viagem (o sem chegada `null`, o outro mantém),
  prazo copiado nulo → `null`; (b) três desvios gravados fora de ordem: vale o de `created_at` mais recente; (c) painel: `openOccurrenceCase`
  sobrevive a `deliveryDeadline` malformado, na lista e na parada (11 casos).
- **7. `warn` por leitura.** Volume esperado antes: o painel relê o detalhe a cada 30 s (3 s com a planta pendente) — uma regra ruim geraria 2
  linhas/min por espectador, até 20/min com a planta pendente, por código. `trip-delivery-deadline-warn-throttle.support.ts`: **um aviso por
  viagem e código a cada 5 min**, em memória, com teto de 2000 chaves (esvazia ao estourar). Reiniciar o processo só repete um aviso. Risco que sobra
  a medir em staging: o limite é por processo (hoje 1 réplica).

### Mutações (T1.2e) — cada uma derrubou o contrato, e o arquivo foi restaurado

| Mutação                                                 | Arquivo                                           | Falhas | O que derrubou                                                           |
| ------------------------------------------------------- | ------------------------------------------------- | -----: | ------------------------------------------------------------------------ |
| plano B da entrega de volta (`deliveredAt = arrivedAt`) | `trip-delivery-deadline-locate.support.ts`        |      1 | "entregue sem evento não é medida"                                       |
| ano de hoje sempre na cobertura                         | `trip-delivery-deadline.support.ts`               |      1 | "viagem toda entregue lida anos depois mantém o selo, sem aviso"         |
| `new Intl.DateTimeFormat` por chamada                   | `civil-date.service.ts`                           |      1 | "cem chamadas … no máximo uma vez"                                       |
| `Promise.all` em `locateNotes`                          | `trip-delivery-deadline.support.ts`               |      3 | contrato estático de série + "+6" + "uma nota ou duzentas" (maxInFlight) |
| aviso a cada leitura (sem a janela)                     | `trip-delivery-deadline-warn-throttle.support.ts` |      1 | "um por viagem e código a cada cinco minutos"                            |
| descartar tudo menos `id` do detalhe malformado         | `tripDeliveryDeadline.validation.ts` (painel)     |     11 | os 11 "descarta só o campo … openOccurrenceCase ficam"                   |

### Gates (T1.2e)

- API: `bun run typecheck` → 0; `bun run lint` (`--max-warnings=0`) → 0; contratos `bun --env-file=<.env.test> test --timeout 120000` →
  **10720 pass / 25 skip / 0 fail** (antes: 10708 / 25 / 0; +12). Integrações da 236, **uma por vez**: `trip-detail-delivery-deadline` 4,
  `-moments` 4, `-return` 1, `-count` 3, `-transaction` 1, `-edge` 5 (nova) e `delivery-deadline-driver-independence` 1 (nova, T1.3): todas verdes.
  As 13 do calendário (11 `business-calendar-*` + 2 `municipal-holiday-*`) verdes **sem alteração**.
- Painel: `bun run typecheck` → 0; `bun run lint` → 0 erros (16 avisos que já existiam); `bun run test` e `bun run test:hooks` → **956 pass / 0 fail**
  cada (sumário final do runner).

### Não rodado (T1.2e)

`make smoke`/Playwright e tela (não há tela); `make migration-test` (sem migration); `make worker-integration`; `make check` completo; nenhuma leitura de banco
de produção; a medição do volume real do `warn` em staging (fica para depois do deploy).

## T1.3 — não-regressão (CA6), a prova de comportamento (2026-10-07)

Nenhuma suíte abaixo foi alterada. Contratos por agregador (`bun --env-file=<.env.test> test ./test/<arquivo>`):

| Suíte                                                                                                     | Resultado                                  |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `fleet-domain` (inclui `driver-score*.contract.ts`)                                                       | 152 pass / 0 fail                          |
| `trip-delivery-proof` (inclui `punctuality*.contract.ts` e `late-registration.contract.ts`)               | 349 pass / 0 fail                          |
| `settings-resolution.contract.test.ts`                                                                    | 8 pass / 0 fail                            |
| `trip-allowed-actions` (spec 164, `allowed-actions` byte a byte)                                          | 26 pass / 0 fail                           |
| `cte-batch-{schema,domain,application,http,infrastructure}` (onde vive o `delivery_days`)                 | 12 + 25 + 58 + 80 + 31 = 206 pass / 0 fail |
| `trip-http` (inclui `allowed-actions` e o contrato do prazo) · `fleet-application` · `fleet-http`         | 319 · 113 · 129 pass / 0 fail              |
| `trip-occurrence` (inclui `driver-snapshot-products` com o golden `driver-snapshot-document.golden.json`) | 704 pass / 0 fail                          |

Integrações (uma por vez, banco descartável próprio): `driver-score` 10, `me-trip` 21, `me-trip-departure` 12, `driver-snapshot-products` 5,
`trip-detail-occurrence-marker` (a regressão de `allowed-actions` com tratativa aberta) 1, `cte-batch-name-conflict` 1, `cte-batch-suggested-name` 1 — **todas verdes, 0 fail**.

**O teste de comportamento novo** — `test/integration/delivery-deadline-driver-independence.integration.ts`: dois motoristas, quatro notas iguais
(uma entregue há 72 h com foto `late`, uma há 25 h sem foto, em cada motorista); o motorista A tem chegada e prazo de 1 dia útil nas suas duas
notas (lidas como `delivered_late`), o B não tem nada (selo `null`). Resultado: a nota é **85 nos dois**, as penalidades (`missing_proof` 10 e
`late_proof` 5, com as mesmas datas) são iguais, e `classifyProofPunctuality` dá o mesmo veredito (`late_and_away`) — o `missingAfterHours` de 24 h decide a
foto ausente igual nos dois cenários.

Mutações de CA6:

| Mutação                                                                        | Contrato que derrubou                                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| a nota do motorista ignora entregas de notas com chegada (prazo ligado à nota) | o novo de comportamento: A recebe `null`, esperava 85                               |
| import de `delivery-deadline` em `driver-score.policy.ts`                      | o estático `delivery-deadline-isolation` ("nenhum arquivo vigiado importa o prazo") |

Limite honesto: `computeDriverScore` e `classifyProofPunctuality` são puros e não têm entrada de prazo; a prova que importa é a da leitura do banco
(`DrizzleDriverScoreRepository`), que é onde o prazo poderia ser ligado, e o contrato estático segura os imports.

## Fase 2 — painel: o selo do prazo e o filtro (2026-10-07)

Executada com `sonnet` no worktree `agent-a741c27bb4f2d11da`, branch `work/236-fase2` a partir de `origin/staging` (`dc379a36b`), `bun install --frozen-lockfile` limpo. **Só `apps/frontend-transportada` + docs e prints da spec; sem push** (tela visível: T2.4/T2.5 esperam a aprovação dos prints). API e worker intocados. Dado sintético, API dublada; nenhuma leitura de banco.

| Commit      | Parte                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| `30511ed0c` | T2.1 — contratos vermelhos (`Cannot find module` do serviço de visão, do filtro, do hook e dos componentes) |
| `3a673a898` | T2.2 — selo, campo no "Dados da nota", filtro, locales pt-BR/en, estilos                                    |
| `6fa2db1a6` | T2.3 — duas lacunas achadas pela mutação (ordem das notas na parada; marcar a parada com filtro)            |
| (seguinte)  | T2.2/T2.4 — smoke, tinta do alerta, prints, docs e esta evidência                                           |

### O que foi decidido

- **Textos** (a spec P1/RF2 os define; nada inventado): "Vence em N dia(s) útil(eis)", "Vence hoje", "Vencida há N dia(s) útil(eis)", "Entregue no prazo", "Entregue com N dia(s) útil(eis) de atraso". Os dois casos que a spec não cobre, por N = 0: **"Vencida"** e **"Entregue fora do prazo"** (sem número). Em en: "Due in N business day(s)", "Due today", "Overdue by N business day(s)" / "Overdue", "Delivered on time", "Delivered N business day(s) late" / "Delivered after the deadline".
- **Data**: `dueOn` separado em partes (`dd/mm/aaaa` em pt-BR, `mm/dd/aaaa` em en), nunca `new Date(texto)`; vai na dica do `Tooltip` do design system (o `title` nativo é proibido), num trecho para leitor de tela dentro do selo e no campo "Prazo de entrega" do "Dados da nota" (o estado fica só no cabeçalho, uma vez).
- **Filtro**: no cliente, na lista de notas do detalhe (decisão do architect), seleção múltipla com união, URL `?deadline=`, só oferecido quando alguma nota tem prazo. **Filtro na lista de viagens: adiado** (decisão aberta com o usuário).
- **Divergência do pedido**: o filtro faz "marcar todas" (da viagem e da parada) alcançar só as notas à mostra — sem isso o operador marcaria, e emitiria CT-e de, nota que não vê. Isso exigiu trocar a asserção de texto do `select-all-documents.contract.ts` (`documentIds={deadlineScope.visibleDocuments…}`; sem filtro é idêntico a antes). Limite conhecido: seleção feita **antes** do filtro continua valendo para as notas escondidas (o contador da barra de seleção a mostra).
- **Tinta do alerta**: a revisão de design reprovou o selo "Vencida" no tema claro com `--color-alert` sobre o próprio fundo diluído (**4,11:1**). Nasceu `--color-alert-ink` (`#ff6b63` escuro, `#a92f27` claro) nos três blocos de tema do `index.css`, como as tintas `-ink` existentes.
- **Smoke fora da CI**: `test/spec-236-prazo-prints.smoke.spec.ts` (modo `delivery-deadline` em `trip-smoke.helper.ts`, dados em `test/trip-delivery-deadline.fixture.ts`) roda com `PLAYWRIGHT_TEST_MATCH`, como os specs de prints das outras specs; **a config da CI não foi tocada**.

### Contagens de passes (`bun run test`, que termina com `test:hooks`)

| Suíte                  | Antes (origin/staging) | Depois | Novos                                                                 |
| ---------------------- | ---------------------: | -----: | --------------------------------------------------------------------- |
| contratos (`test`)     |                   7393 |   7425 | +32 (`view`, `filter`, `wiring`; `select-all` ajustado, mesmo número) |
| `test:hooks` (com DOM) |                    956 |   1007 | +51 (`delivery-deadline-badge` e `delivery-deadline-filter`)          |

`bun run typecheck` → 0; `bun run lint` → 0 erros (16 avisos que já existiam); `bun run format:check` na raiz → limpo.

### Estabilidade do DOM

Todos os arquivos de DOM novos instalam `stubVisibleLayout()` (helper novo `visibleLayout.helper.ts`), nenhum `expect(nó).toBeNull()` dentro de `waitFor` (só `querySelectorAll(...).length`), e **os ganchos ficam dentro de um `describe`**: a primeira versão tinha `beforeEach` no topo do arquivo, que num contrato importado pelo `test:hooks` vale para a suíte **inteira** — vazou `/trips/trip-1` para o contrato `trip-document-occurrence-link` (falha na rodada completa, nenhuma na isolada). `bun run test:hooks`: **10 execuções seguidas verdes** (1007 pass / 0 fail em todas) e **3 com CPU ocupada** (11 `yes > /dev/null`, um por núcleo, mortos pelos PIDs; 1007 pass / 0 fail, 40–42 s contra 25 s sem carga).

### Mutações (CA3) — cada uma derrubou o contrato; o arquivo foi restaurado e conferido (`git diff --quiet`)

| Mutação                                                           | Arquivo                                    | Falhas |
| ----------------------------------------------------------------- | ------------------------------------------ | -----: |
| selo some em `due_today`                                          | `TripDeliveryDeadlineBadge.component.tsx`  |      3 |
| N = 0 mostra o número ("0 dias")                                  | `tripDeliveryDeadlineView.service.ts`      |      8 |
| data convertida por `new Date(texto)` (recua um dia em SP)        | `tripDeliveryDeadlineView.service.ts`      |      1 |
| filtro único no lugar do múltiplo                                 | `useTripDeliveryDeadlineFilter.hook.ts`    |      2 |
| filtro por interseção em vez de união                             | `tripDeliveryDeadlineFilter.service.ts`    |      4 |
| campo do prazo no `TripDocument` em vez do detalhe                | `trip.constant.ts`                         |     13 |
| estado trocado: vencida usa o rótulo de entregue com atraso       | `tripDeliveryDeadlineView.service.ts`      |      9 |
| estado trocado no filtro: entregue com atraso conta como vencida  | `tripDeliveryDeadline.constant.ts`         |     10 |
| tom trocado: vencida em tom neutro                                | `tripDeliveryDeadline.constant.ts`         |      6 |
| locale pt sem `dueToday`                                          | `trip.locale.json`                         |      3 |
| locale en sem `onTime_other`                                      | `trip.en.locale.json`                      |      3 |
| selo sem a dica do design system (Tooltip desligado)              | `TripDeliveryDeadlineBadge.component.tsx`  |      2 |
| selo sem a data para o leitor de tela                             | `TripDeliveryDeadlineBadge.component.tsx`  |      2 |
| selo só nas notas entregues                                       | `TripStopList.component.tsx`               |     25 |
| parada sem nota no filtro some em vez de avisar                   | `TripStopList.component.tsx`               |      1 |
| filtro apaga o resto da URL e o hash                              | `useTripDeliveryDeadlineFilter.hook.ts`    |      2 |
| voltar no navegador não relê o filtro                             | `useTripDeliveryDeadlineFilter.hook.ts`    |      1 |
| "limpar filtros" sempre visível                                   | `TripDeliveryDeadlineFilter.component.tsx` |      1 |
| "marcar todas" da viagem alcança a nota escondida                 | `TripDetail.component.tsx`                 |      2 |
| filtro oferecido sem nota com prazo                               | `tripDeliveryDeadlineFilter.service.ts`    |      3 |
| `Sem prazo` ignora o campo ausente (API anterior)                 | `tripDeliveryDeadlineFilter.service.ts`    |     21 |
| o selo reordena as notas da parada (sobreviveu à 1ª rodada)       | `TripStopList.component.tsx`               |  0 → 1 |
| marcar a parada alcança a nota escondida (sobreviveu à 1ª rodada) | `TripStopList.component.tsx`               |  0 → 1 |

As duas que sobreviveram viraram teste (`6fa2db1a6`) e derrubam agora.

### Smoke e prints (T2.2/T2.4, `web.md` §15)

Build com `VITE_SMOKE_AUTH_BYPASS=true` em pasta temporária, `vite preview` na porta **53517** (faixa 53500–53559), config do Playwright descartável, API 100% dublada; preview parado pela tarefa que este trabalho iniciou, config e resultados apagados, porta livre ao fim. **22 testes verdes** (prints × 3 larguras × 2 temas, o filtro com "marcar todas", a URL e as duas revisões de estilo). Revisão de design **por `getComputedStyle`**:

- **Vizinho** (375, escuro): o selo e `separationStatusBadge` têm a mesma altura (24 px), borda (1 px), fonte (`SFMono-Regular` 11,52 px), peso e caixa-alta.
- **Contraste** (≥ 4,5:1): selos — escuro 4,84 (vencida) / 4,92 / 6,00 / 4,94 / 4,92; claro 5,13 / 4,79 / 5,57 / 4,79 / 4,79. Contador do filtro 6,33 (escuro) / 5,66 (claro); "parada sem nota" 6,61 / 5,48.
- **Alvo de toque** (375): gatilho do filtro 48 px, "Limpar filtros" 48 px (≥ 44). **Foco**: `:focus-visible` verdadeiro, contorno sólido de 2 px.
- **Geometria**: sem rolagem horizontal e nada além da borda do recorte; o selo mais longo ("Entregue com 2 dias úteis de atraso") cabe a 375 px.

PNGs em `specs/236-o-contratante-tem-prazo-de-entrega/prints/` (375, 768 e 1280 px; `-dark` e `-light`): `prazo-selo-estados-*`, `prazo-selo-detalhe-*`, `prazo-filtro-*` (painel aberto, duas opções marcadas, lista filtrada ao fundo) e `prazo-filtro-lista-*` (painel fechado).

### Não rodado

`make smoke` e os specs da CI no Playwright (o smoke da 236 é à parte, como os de prints); `make check` completo; integração/migration/worker (sem mudança neles); teste em aparelho real e em staging; a aprovação dos prints (**T2.4 e T2.5 seguem `[ ]`**); filtro na lista de viagens (adiado).

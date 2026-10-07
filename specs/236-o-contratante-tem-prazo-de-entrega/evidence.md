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

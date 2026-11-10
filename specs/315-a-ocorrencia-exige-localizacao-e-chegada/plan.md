# Plano técnico — Feature 315

## Contexto e premissas

- O tipo já carrega os modos de exigência como colunas (`attachment_mode`, `note_mode`, `signature_mode`, `items_mode`,
  `reference_number_mode`, `declared_amount_mode`), lidos pelo resolvedor único `resolveOccurrenceRequirements`
  (`apps/api-transportada/src/trips/domain/occurrence-requirements.policy.ts`) e cobrados por
  `assertDriverOccurrenceRequirements` (`occurrence-requirement-guard.policy.ts`). Esta spec acrescenta dois modos ao mesmo
  desenho — nenhum mecanismo novo de exigência.
- A ocorrência de parada (`report-stop-occurrence.use-case.ts`) hoje não cobra modo nenhum (246 D-d). Ela ganha o guarda para
  foto e observação (D7) e para os dois campos novos.
- A chegada é gravada por `reportStopArrival` → `performSequencedStopArrival` (`recorded-together-steps.service.ts`), que já
  aceita `occurredAt` informado e `recordedAt` (chegada pelo escritório, 156 A1). O registro da ocorrência reutiliza esse
  caminho dentro da mesma transação (`unitOfWork.execute`), não cria um escritor de chegada novo.

## Arquitetura e arquivos afetados

**API (`apps/api-transportada`)**

- `src/database/trip.schema.ts` — `locationMode`, `arrivalTimeMode` em `companyOccurrenceTypes` + CHECKs
  (`company_occurrence_types_location_mode_check`, `…_arrival_time_mode_check`).
- `src/shared/trip-occurrence.constant.ts` — defaults (`off`) junto de `OCCURRENCE_TYPE_REQUIREMENT_DEFAULTS`;
  `OCCURRENCE_ARRIVAL_MAX_AGE_HOURS = 24`.
- `domain/occurrence-requirements.policy.ts` — os dois modos no tipo resolvido (sem camada de exceção: `Layered` só do tipo).
- `domain/occurrence-requirement-guard.policy.ts` — `locationProvided`, `arrival` no parâmetro; erros novos em
  `domain/trip.error.ts` (`TripOccurrenceLocationRequiredError`, `TripOccurrenceArrivalTimeRequiredError`,
  `TripOccurrenceArrivalTimeInvalidError`) e mapeamento HTTP/catálogo de mensagens.
- `domain/occurrence-arrival-time.policy.ts` (novo, puro) — valida `arrivedAt` (futuro com tolerância da 234, idade máxima,
  anterior à saída da viagem).
- `application/report-stop-occurrence.use-case.ts` — lê o tipo completo (`findStopOccurrenceType` passa a devolver os modos),
  aplica o guarda, e quando a parada não tem `arrived_at` chama `performSequencedStopArrival` antes de `recordOccurrence`.
- `application/driver-field-report.port.ts` + `infrastructure/drizzle-driver-field-report.repository.ts` — o retorno de
  `findStopOccurrenceType` e a leitura de `arrived_at` da parada.
- `application/save-occurrence-type.use-case.ts`, `save-occurrence-type-values.mapper.ts`, `list-field-occurrence-types.use-case.ts`,
  `read-settings-resolution.use-case.ts`, `presentation/occurrence.schema.ts` (escrita do tipo) — campos novos na escrita e
  leitura; ausente no `PUT` mantém.
- `presentation/me-trip.routes.ts` e a rota de parada em `trip.routes.ts` — `arrivedAt` e `confirmOutOfOrder` no corpo
  `.strict()`; `arrivalRecorded` na resposta.
- Snapshot do motorista (`drizzle-current-driver-trip.repository.ts`) — `locationMode`, `arrivalTimeMode` por tipo e a parada
  já chegou.
- Registro por nota (`register-driver-occurrence.use-case.ts`) — só `locationMode` (D2).

**Painel (`apps/frontend-transportada`)**

- `modules/trip/shared/occurrenceType.types.ts`, `occurrenceTypeUpdate.service.ts`, `tripResponse.validation.ts`,
  `occurrenceRecordConfig.service.ts`, `settingsResolution.service.ts` — campos tolerantes a ausência.
- O editor do tipo na aba Tipos de `/ocorrencias` (`OccurrenceTypeCatalogPanel` e o componente do seletor de modo já usado por
  Observação/Assinatura) — **reusar o mesmo seletor de três estados**; locale pt/en.

**App do motorista (`apps/frontend-driver`)**

- `modules/driver-trip/shared/occurrenceRequirements.service.ts`, `occurrenceRequiredFields.service.ts`,
  `occurrenceMissingFields.service.ts`, `occurrenceDraftValues.service.ts`, `driverTrip.types.ts` — os modos, o campo faltante e o
  rascunho (`arrivedAt` como `HH:mm`, nunca pré-preenchido com "agora").
- `components/OccurrenceValuesSection.component.tsx` + dois componentes novos (`OccurrenceLocationField`,
  `OccurrenceArrivalTimeField`) feitos com os componentes do design system do app (rótulo em cima, campo na altura padrão).
- `shared/driverTripClient.service.ts` e `occurrenceDispatch.service.ts` — corpo do registro de parada com `location`,
  `arrivedAt`, `confirmOutOfOrder`; o item da fila só nasce com o ponto capturado quando o tipo o exige.

## Contratos/API/eventos

- `POST /v1/me/trips/current/stops/:stopId/occurrences` — corpo ganha `arrivedAt?: string (ISO)` e `confirmOutOfOrder?: boolean`;
  resposta ganha `arrivalRecorded: boolean`. Erros novos: `422 TRIP_OCCURRENCE_LOCATION_REQUIRED`,
  `422 TRIP_OCCURRENCE_ARRIVAL_TIME_REQUIRED`, `422 TRIP_OCCURRENCE_ARRIVAL_TIME_INVALID`; `409 TRIP_STOP_OUT_OF_ORDER` já existe.
- `PUT/GET /v1/company-settings/occurrence-types` — `locationMode`, `arrivalTimeMode` (`off|optional|required`).
- Evento de domínio: o `arrived` gravado pela ocorrência é o mesmo evento de chegada (mesmo contador de `trip_stop_events`,
  mesma notificação de "chegou"), com `occurred_at` informado e `recorded_at` do servidor. O contrato da `api-transportada.md`
  (docs/ai-context) e o `apps/api-transportada/CLAUDE.md` são atualizados na T10.

## Dados, migration e rollback

- Uma migration aditiva (`ALTER TABLE … ADD COLUMN … NOT NULL DEFAULT 'off'` + dois CHECKs). **Sem backfill**: todo tipo existente
  fica `off`, então a aplicação não muda comportamento.
- `rollback.sql` derruba as duas CHECKs e as duas colunas. Entra em `make migration-test` com o par asserção/estático das
  migrations anteriores (modelo: `occurrence-declared-amount.*`).
- A nota de pré-condição D7 (foto/observação na parada passam a ser cobradas) não é migration, é **efeito de deploy da API**:
  T1 mede os tipos `flow: stop` ativos com `attachment_mode` ou `note_mode` = `required` em staging **e** produção (script
  `.sh` em `tmp/ops/`, saída em arquivo) antes do merge, e o resultado vai ao `evidence.md`.

## Segurança e tenant

- `companyId` do contexto autenticado; o tipo é lido por `(companyId, id, active)`. A parada e a nota seguem conferidas por
  `findStopForDriver`/`findDocumentForDriver` (o horário nunca fura o alcance da parada).
- O horário é dado do motorista, validado (D6), nunca confiado para ordem ou autoria. Não entra em log.

## Idempotência e concorrência

- A chegada gravada pela ocorrência roda dentro de `withFieldReport` do registro (mesma chave). Reenvio devolve a ocorrência
  gravada (`recall`) e não repete a chegada.
- Corrida com o toque de "Cheguei": a leitura de `arrived_at` e a escrita da chegada ficam na mesma transação, com a trava de
  linha da parada que a 294 já usa; perdeu a corrida, `arrivalRecorded: false`.

## Observabilidade

- Contador `occurrence_arrival_recorded_total{source="occurrence"}` ao lado do existente da chegada, e log estruturado do código
  de recusa (sem coordenada nem horário). A trilha do escritório continua registrando a hora informada.

## Estratégia de testes

- Contrato antes do código: política de horário (tabela de casos), guarda (tabela por modo × presença), caso de uso da
  parada (corrida, ordem, idempotência), rota (corpo `.strict()`, códigos), escrita/leitura do tipo.
- Integração (`test/integration`, segundo comando do CLAUDE.md): a chegada nasce na mesma transação da ocorrência e a corrida com
  o toque.
- Paridade: contrato de tabela espelhada de `resolveOccurrenceRequirements` nas três apps (skill `contrato-de-paridade`).
- Frontends: serviço de campos faltantes e de montagem do `arrivedAt` (virada de dia), contrato de render da seção.
- Smoke Playwright do app do motorista só se a tela já tem smoke; senão, prints (RNF4).

## Riscos

- **R1 — D7 muda comportamento de tipos de parada existentes.** Mitigação: medir antes (T1) e subir a cobrança de foto/observação
  da parada em etapa própria da API se a medição achar tipo afetado em produção.
- **R2 — Motorista sem GPS fica bloqueado.** É o que o dono pediu para estes tipos; a tela explica como ligar. Os tipos só ficam
  `required` depois do app novo (D9), e o dono pode voltar o tipo a `optional` sem deploy.
- **R3 — Horário errado digitado.** Aceito dentro das janelas de D6; o escritório vê chegada informada e pode corrigir pelo
  fluxo de correção de chegada que já existe.
- **R4 — Dois consumidores do resolvedor (painel e app) divergirem.** O contrato espelhado quebra a CI.

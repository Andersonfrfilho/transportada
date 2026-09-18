# Spec 156 — T3 🧠: desenho do `FieldTripTarget` nas portas de campo

> Etapa 1 foi o desenho, e a etapa 2 a implementação. O `architect` **aprovou com ressalvas**
> (R1–R7), e elas estão incorporadas abaixo. Onde o texto original divergia, vale a seção
> "Validação e decisões".

## 0. Validação e decisões

Decisões do líder:

1. Os erros seguem o padrão existente: classe `ApiError` em `trips/domain/trip.error.ts`. Não nasce
   `shared/errors/codes.ts` (§4.5).
2. A idempotência reusa **409 `TRIP_FIELD_REPORT_KEY_REUSED`**, estendendo a comparação ao ator. Isso
   é implementado **só na T6** (§8).
3. O alvo `trip` não leva `companyId` (§3).

Ressalvas do `architect`, todas implementadas nesta T3:

- **R1.** Antes do refactor, um contrato do `startFieldTrip` pelo caminho do motorista: `readCurrent`
  recebe `{ companyId, driverId }`, o toque repetido dá `changed: false` e a falta de viagem dá
  `TRIP_NOT_FOUND`. Ele rodou verde contra o código antigo e continua verde
  (`test/field-trip-target/start-field-trip-driver.contract.ts`).
- **R2.** `updateStatus` virou compare-and-set (`where status = <lido>`) e devolve `boolean`. A porta
  ganhou `readStatus`. Quando nenhuma linha é afetada, o caso de uso relê e decide de novo: `unchanged`
  vira `changed: false`, `blocked` vira 409 `STATE_TRANSITION_NOT_ALLOWED`, e `applied` tenta de
  novo, no máximo três vezes, porque o status só anda para a frente. A corrida tem contrato de
  integração: a viagem conclui entre a leitura e a gravação, e o status continua `completed`.
- **R3.** `FieldTripLocator` com os campos `never` cruzados.
- **R4.** `ResolvedTripFieldTarget` tem marca (`unique symbol`), e só `resolveFieldTripTarget` a põe.
  Um `@ts-expect-error` no contrato prova que um literal não compila.
- **R5.** A nota fora do alcance responde **409 `TRIP_DOCUMENT_NOT_REACHABLE`**, e a parada
  responde 404 `TRIP_STOP_NOT_REACHABLE` (§12). As integrações prendem os dois códigos.
- **R6.** A integração 12 cobre também o `tripId` inexistente, que dá `null` como o de outra
  empresa. **Nota para a T5:** o `:id` passa por `parseUuidPathIdentifier` antes de `findTripCrew`,
  para um id malformado não chegar ao Postgres.
- **R7.** O alvo resolvido não carrega o `driverId` pedido, só `onBehalfOfDriverId`. O comentário de
  `start-field-trip.use-case.ts` que dizia "O escritório não os alcança" agora cita a ADR-0067.

## 1. O problema em uma frase

Os seis casos de uso de campo acham a viagem **pelo motorista** (`driverId` → `trip_drivers` → viagem
na rua). O escritório precisa achá-la **pelo id da viagem na empresa do contexto**, e ainda saber em
nome de qual motorista está registrando. Isso precisa entrar sem mudar o que o PWA e o WhatsApp
fazem hoje, e sem editar nenhum teste deles (gate da T3).

## 2. O que o código mostra hoje

| Caso de uso                      | Arquivo                                                       | Como acha a viagem hoje                                                                         |
| -------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| conferir carga / iniciar trajeto | `trips/application/start-field-trip.use-case.ts:55`           | `StartFieldTripPort.readCurrent({ companyId, driverId })`, a primeira viagem ativa do motorista |
| chegada na parada                | `trips/application/report-stop-arrival.use-case.ts:45`        | `transaction.findStopForDriver({ companyId, driverId, stopId })`                                |
| entregar / devolver              | `trips/application/report-document-delivery.use-case.ts:119`  | `transaction.findDocumentForDriver({ companyId, documentId, driverId })`                        |
| ocorrência de parada             | `trips/application/report-stop-occurrence.use-case.ts:82,90`  | `findStopForDriver` e `findDocumentForDriver`                                                   |
| comprovante                      | `trips/application/attach-delivery-proof.use-case.ts:141`     | `DeliveryProofPort.findDeliveryEventId({ companyId, documentId, driverId })`                    |
| ocorrência da nota (spec 079)    | `trips/application/register-driver-occurrence.use-case.ts:86` | `DriverOccurrencePort.findReachableDocument({ companyId, documentId, driverId })`               |

A chegada na parada é `report-stop-arrival.use-case.ts`. Ela usa a mesma porta transacional
(`DriverFieldReportTransactionPort`) e entra na T3 junto com as outras cinco.

As implementações:

- `trips/infrastructure/drizzle-driver-field-report.repository.ts:114` (`findStopForDriver`) e `:153`
  (`findDocumentForDriver`) fazem `inner join trip_drivers` com `eq(tripDrivers.driverId, …)`.
- `trips/infrastructure/drizzle-delivery-proof.repository.ts:48` (`findDeliveryEventId`) faz o mesmo
  join, com viagem em `TRIP_DISPATCHED_STATUSES`.
- `trips/infrastructure/delivery-proof-read.support.ts:382` (`findDriverReachableDocument`) faz o
  mesmo join, com o mesmo recorte de status.
- `trips/infrastructure/drizzle-current-driver-trip.repository.ts:97` (`readCurrent`) lê a primeira
  viagem ativa do motorista.

**Os chamadores do canal do motorista não montam a entrada.** `me-trip.routes.ts` e
`whatsapp-commands/application/register-driver-flow-actions.ts` recebem funções
(`MeTripDependencies`, as dependências do fluxo do WhatsApp) cujo tipo de entrada leva `driverId`.
Quem liga essas funções aos casos de uso é o `main.ts` (`:715-735` para o WhatsApp,
`:2391-2466` para `/me`), sempre com `{ ...input, … }`. É isso que torna o gate possível: se o caso
de uso continuar aceitando `{ driverId }`, nenhum desses três arquivos muda.

**Os dublês não leem `driverId`.** `test/driver-trip/field-report.double.ts:69-70` responde por
`input.stopId` e `input.documentId`. `test/driver-trip/delivery-proof.contract.ts:36` e
`test/trip-delivery-proof/receiver-document.contract.ts:53` respondem
`findDeliveryEventId: () => …`, e `test/trip-occurrence/driver.contract.ts:43` responde
`findReachableDocument()` sem ler o argumento. Trocar o **tipo do argumento** dessas quatro
consultas não quebra nenhum deles. Trocar o **nome** do método quebraria.

## 3. Tipos

Arquivo novo: `apps/api-transportada/src/trips/application/field-trip-target.types.ts`.

```ts
import type { TripStatus } from '../../database/trip.schema.js'

export const FIELD_TRIP_TARGET_KIND = { driver: 'driver', trip: 'trip' } as const

/** O motorista logado: a viagem é a dele na rua (ADR-0045 §2). PWA e WhatsApp. */
export type DriverFieldTripTarget = {
  readonly kind: typeof FIELD_TRIP_TARGET_KIND.driver
  readonly driverId: string
}

/**
 * O escritório: a viagem é a do caminho `/trips/:id`, na empresa do contexto (ADR-0067 §1).
 * `driverId` é o motorista **pedido**. Quem o valida é o resolvedor (§4), e nenhuma consulta das
 * portas filtra por ele.
 */
export type TripFieldTripTarget = {
  readonly kind: typeof FIELD_TRIP_TARGET_KIND.trip
  readonly tripId: string
  readonly driverId?: string
}

export type FieldTripTarget = DriverFieldTripTarget | TripFieldTripTarget

declare const RESOLVED_TRIP_FIELD_TARGET: unique symbol

/** O alvo `trip` resolvido (R4: com marca; R7: sem o motorista pedido). */
export type ResolvedTripFieldTarget = {
  readonly kind: typeof FIELD_TRIP_TARGET_KIND.trip
  /** ADR-0067 §2: o motorista em nome de quem o escritório registra. A T4 grava, a T5 audita. */
  readonly onBehalfOfDriverId: string
  readonly tripId: string
  readonly tripStatus: TripStatus
  readonly [RESOLVED_TRIP_FIELD_TARGET]: true
}

/**
 * Como um caso de uso de campo chega à viagem. `{ driverId }` é a forma de hoje, e continua sendo a
 * do canal do motorista. `{ target }` é a do escritório, sempre já resolvida.
 */
export type FieldTripLocator =
  | { readonly driverId: string; readonly target?: never }
  | { readonly driverId?: never; readonly target: ResolvedTripFieldTarget }

export function toFieldTripTarget(locator: FieldTripLocator): FieldTripTarget {
  if (locator.target !== undefined) {
    return { kind: FIELD_TRIP_TARGET_KIND.trip, tripId: locator.target.tripId }
  }
  return { driverId: locator.driverId, kind: FIELD_TRIP_TARGET_KIND.driver }
}
```

**Diferença em relação ao `plan.md`:** o alvo `trip` **não** carrega `companyId`. A empresa já chega
em todo caso de uso como `input.companyId`, vinda do contexto autenticado. Uma segunda cópia dentro
do alvo abriria um estado que não deveria existir (as duas divergirem), e alguém teria que decidir
qual das duas vale. Com uma cópia só, toda consulta filtra por `input.companyId` e pronto.

`toFieldTripTarget` é pura. Ela só existe para que os seis casos de uso não repitam o mesmo `if`.

## 4. Resolver o alvo `trip`: porta, política e caso de uso

### 4.1 Porta (arquivo novo `trips/application/field-trip-target.port.ts`)

```ts
export type FieldTripCrewDriver = { readonly driverId: string; readonly position: number }

export type FieldTripCrew = {
  readonly drivers: readonly FieldTripCrewDriver[]
  readonly tripId: string
  readonly tripStatus: TripStatus
}

export type FieldTripTargetPort = {
  /** `null`: a viagem não existe **nesta empresa**. É 404, nunca 403 (ADR-0067 §2, isolamento). */
  findTripCrew(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<FieldTripCrew | null>
}
```

### 4.2 Repositório (arquivo novo `trips/infrastructure/drizzle-field-trip-target.repository.ts`)

`DrizzleFieldTripTargetRepository implements FieldTripTargetPort` faz uma consulta só:

```sql
select t.id, t.status, td.driver_id, td.position
from trips t
left join trip_drivers td
  on td.company_id = t.company_id and td.trip_id = t.id
where t.company_id = :companyId and t.id = :tripId
order by td.position asc
```

- Nenhuma linha → `null`. É o caso da viagem de outra empresa, e o da viagem inexistente: os dois
  respondem igual.
- Uma linha com `driver_id` nulo (o `left join` sem tripulação) → `drivers: []`.
- `position` é `bigint` no schema (`trip.schema.ts:245`). Ele vira `number` no mapeamento. O CHECK
  `trip_drivers_position_check` limita o valor a `1..MAX_DRIVERS_PER_TRIP`, então a conversão não
  perde nada.
- O join é composto, com `company_id` nos dois lados, no mesmo padrão das outras consultas
  (`trip_drivers_company_trip_fk`).
- Sem filtro de status: quem decide se a viagem aceita a ação é a política de estados (§5),
  igual para os dois canais.

### 4.3 Política pura (arquivo novo `trips/domain/field-trip-target.policy.ts`)

```ts
export type PickOnBehalfOfDriverParams = {
  readonly drivers: readonly FieldTripCrewDriver[]
  readonly requestedDriverId?: string
}

export function pickOnBehalfOfDriver(params: PickOnBehalfOfDriverParams): string
```

1. `drivers` vazio → `TripWithoutDriverError` (422 `TRIP_WITHOUT_DRIVER`). Isso vale **também**
   quando `requestedDriverId` veio: a viagem sem tripulação é o fato mais fundamental.
2. `requestedDriverId` presente → devolve esse id se ele estiver em `drivers`. Senão, lança
   `DriverNotOnTripError` (422 `DRIVER_NOT_ON_TRIP`).
3. Sem `requestedDriverId` → o motorista de **menor `position`**. Pela montagem da tripulação,
   essa posição é 1 (`trip.policy.ts:78`, `index + 1`). A política não depende da ordem em que as
   linhas chegam.

A comparação do `driverId` pedido é feita em memória, contra a tripulação lida. Ele **nunca vai para
o `where`**. Assim, um `driverId` malformado não chega ao Postgres. A validação de formato (UUID)
continua na borda Zod da T5.

### 4.4 Caso de uso (arquivo novo `trips/application/resolve-field-trip-target.use-case.ts`)

```ts
export type ResolveFieldTripTargetParams = {
  readonly companyId: string
  readonly repository: FieldTripTargetPort
  readonly target: TripFieldTripTarget
}

export type ResolveFieldTripTargetResult = ResolvedTripFieldTarget

export async function resolveFieldTripTarget(
  params: ResolveFieldTripTargetParams,
): Promise<ResolveFieldTripTargetResult>
```

- `findTripCrew` devolve `null` → `TripNotFoundError` (404 `TRIP_NOT_FOUND`, a classe que já
  existe em `trip.error.ts:57`).
- Nos outros casos, devolve `{ ...target, onBehalfOfDriverId, tripStatus }`, com o motorista vindo
  de `pickOnBehalfOfDriver`.
- Não tem try/catch. Os erros sobem até o filtro global do router.

### 4.5 Erros

Dois códigos novos, cada um com sua classe em `apps/api-transportada/src/trips/domain/trip.error.ts`
(subclasses de `ApiError`, no mesmo padrão de `TripFieldReportKeyReusedError` e
`TripDocumentNotReachableError`):

| Classe                   | `code`                | `status` |
| ------------------------ | --------------------- | -------- |
| `TripWithoutDriverError` | `TRIP_WITHOUT_DRIVER` | 422      |
| `DriverNotOnTripError`   | `DRIVER_NOT_ON_TRIP`  | 422      |

⚠️ **O arquivo `shared/errors/codes.ts` não existe nesta app.** O pedido e a ADR-0067 §3
(`DELIVERED_AT_*`) o citam, mas os códigos da API moram hoje **na própria classe de erro do
domínio** (`TRIP_FIELD_REPORT_KEY_REUSED` só aparece em `trip.error.ts` e no contrato). Criar um
catálogo paralelo só para estes dois códigos deixaria o código com duas fontes. Por isso a
proposta é seguir o padrão do repositório. Corrigir a menção na ADR fica para a T15. **Decidido
pelo líder (§0):** seguir o padrão, sem `codes.ts`.

## 5. As portas depois da mudança

O que muda nas quatro consultas é o **tipo do argumento**: `driverId: string` sai e
`target: FieldTripTarget` entra. Os **nomes ficam como estão** (§9, alternativa C).

```ts
// driver-field-report.port.ts: DriverFieldReportTransactionPort
findStopForDriver(input: {
  readonly companyId: string
  readonly stopId: string
  readonly target: FieldTripTarget
}): Promise<DriverStopReference | null>
findDocumentForDriver(input: {
  readonly companyId: string
  readonly documentId: string
  readonly target: FieldTripTarget
}): Promise<DriverDocumentReference | null>

// attach-delivery-proof.use-case.ts: DeliveryProofPort
findDeliveryEventId(input: {
  readonly companyId: string
  readonly documentId: string
  readonly target: FieldTripTarget
}): Promise<string | null>

// register-driver-occurrence.use-case.ts: DriverOccurrencePort
findReachableDocument(input: {
  readonly companyId: string
  readonly documentId: string
  readonly target: FieldTripTarget
}): Promise<null | { readonly tripId: string }>
```

**`StartFieldTripPort`** (emendado pela R2). `readCurrent` continua só para o motorista. Para o alvo
`trip`, o status já vem resolvido em `target.tripStatus`. Duas coisas mudam:

```ts
readStatus(input: { readonly companyId: string; readonly tripId: string }): Promise<TripStatus | null>
updateStatus(input: {
  readonly actorUserId: string
  readonly companyId: string
  readonly expectedStatus: TripStatus // compare-and-set
  readonly tripId: string
  readonly tripStatus: TripStatus
}): Promise<boolean> // false: outra escrita chegou antes, nada foi gravado
```

Os métodos de escrita das outras portas (`recordEvent`, `recordOccurrence`, `saveProof`,
`saveOccurrence`, `claim`) **não mudam na T3**.

### 5.1 Como o repositório resolve cada `kind`

Um helper privado da infraestrutura, com um único ponto de verdade para o recorte (arquivo novo
`trips/infrastructure/field-trip-target.query.ts`, no molde de `trip.query.ts`):

```ts
export function fieldTripTargetCondition(target: FieldTripTarget): SQL
// driver → exists (select 1 from trip_drivers td
//                  where td.company_id = trips.company_id
//                    and td.trip_id    = trips.id
//                    and td.driver_id  = :driverId)
// trip   → trips.id = :tripId
```

As quatro consultas trocam o `innerJoin(tripDrivers, …)` + `eq(tripDrivers.driverId, …)` por
`fieldTripTargetCondition(input.target)` no `where`. **Todo o resto fica igual:**
`eq(<tabela>.companyId, input.companyId)`, o join `trips` composto com `company_id`, e o recorte de
status de cada uma. São eles: `TRIP_ON_ROAD_STATUSES` para a parada, nenhum filtro de status para o
documento (de propósito, `:149-152`) e `TRIP_DISPATCHED_STATUSES` para o comprovante e a ocorrência
da nota.

- **`kind: 'driver'`**: o `exists` é equivalente ao `inner join` filtrado por um motorista. O
  unique `(company_id, trip_id, driver_id)` garante no máximo uma linha, então o join nunca
  duplicava resultado, e o `exists` também não duplica. Não muda nenhum resultado para o motorista.
- **`kind: 'trip'`**: `trips.id = :tripId` junto de `company_id = :companyId`. Uma parada ou nota
  **de outra viagem da mesma empresa** passada no caminho `/trips/:id/...` responde `null`, e o
  caso de uso transforma isso em `TRIP_STOP_NOT_REACHABLE`/`TRIP_DOCUMENT_NOT_REACHABLE`. Uma viagem
  de outra empresa nem chega aqui, porque o resolvedor já respondeu 404. Mesmo assim, o filtro por
  `company_id` continua em toda consulta (defesa em profundidade: um alvo forjado dentro do processo
  não atravessa a empresa).
- `trip.driverId` (o motorista pedido) é ignorado aqui. Ele já foi validado em §4.3.

`findDriverReachableDocument` (`delivery-proof-read.support.ts:382`) muda a assinatura do mesmo jeito:
`{ companyId, documentId, target }`.

## 6. Os casos de uso depois da mudança

Em cada `*Input`, `readonly driverId: string` sai e a interseção com `FieldTripLocator` entra:

```ts
export type ReportStopArrivalInput = FieldTripLocator & {
  readonly actorUserId: string
  readonly companyId: string
  readonly idempotencyKey: string
  readonly location: ReportedLocation | null
  readonly now: Date
  readonly stopId: string
  readonly unitOfWork: DriverFieldReportUnitOfWork
}
```

O mesmo vale para `StartFieldTripInput`, `ReportDocumentOutcomeInput` (e, por extensão,
`ReportDocumentReturnInput`), `ReportStopOccurrenceInput`, `AttachDeliveryProofInput` e
`RegisterDriverOccurrenceInput`. Dentro de cada um, a chamada à porta passa
`target: toFieldTripTarget(input)` no lugar de `driverId: input.driverId`.

**Os tipos de resultado não mudam na T3.** Nenhum `*Result` ganha campo.

## 7. O motorista efetivo (`onBehalfOfDriverId`) sem gravar nada

- Ele nasce em `resolveFieldTripTarget` e viaja **dentro do alvo resolvido**
  (`ResolvedTripFieldTarget.onBehalfOfDriverId`). Esse alvo entra no caso de uso como
  `input.target`.
- A rota do escritório (T5/T6) chama primeiro `resolveFieldTripTarget` e depois o caso de uso. Ela
  **já tem** o motorista efetivo em mãos para gravar em `audit_logs`, sem que o resultado do caso de
  uso precise devolvê-lo.
- **T4**: quando a coluna existir, o caso de uso deriva a autoria do localizador:

  ```ts
  type FieldAuthorship = {
    readonly channel: 'driver_app' | 'office' | 'whatsapp'
    readonly onBehalfOfDriverId: string | null
  }
  // { target }   → { channel: 'office', onBehalfOfDriverId: target.onBehalfOfDriverId }
  // { driverId } → { channel: input.channel ?? 'driver_app', onBehalfOfDriverId: null }
  ```

  A autoria segue como campo novo nas entradas de escrita (`recordEvent`, `recordOccurrence`,
  `saveProof`, `saveOccurrence`, `claim`, `updateStatus`). A T4 acrescenta o `channel` opcional à
  variante `{ driverId }` do localizador, e o `main.ts` passa `'whatsapp'` na ligação do fluxo do
  WhatsApp. Os contratos atuais usam `toMatchObject` sobre o que foi salvo
  (`delivery-proof.contract.ts:106`, `receiver-document.contract.ts:196`), então um campo a mais não
  os quebra. Isso é da T4: a T3 não grava nada.

## 8. `DOCUMENT_ALREADY_SETTLED`: fica para a T6

O lugar é `report-document-delivery.use-case.ts`, em `runOutcome`, logo depois do
`checkTripDocumentTransition` (`:139-147`) e **antes** de `settle` e de `recordEvent`:

```ts
if (alreadySettled && 'target' in input) throw new TripDocumentAlreadySettledError() // 409
```

- Ele lança **dentro** de `withFieldReport`, na transação. O `claim` da chave sofre rollback, então
  a chave não é consumida.
- Um reenvio com a **mesma** `Idempotency-Key` depois de um sucesso passa pelo `recall` antes do
  `perform` e devolve o mesmo evento (200). É o comportamento certo: repetição não é baixa nova.
- O canal do motorista (`{ driverId }`) não entra no `if` e mantém o no-op idempotente de hoje.

**Por que na T6 e não na T3.** A T3 é refatoração sem mudança de comportamento, e o gate dela é "os
contratos de hoje, verdes e sem edição". A regra não tem consumidor antes da rota `field-delivery`
(T6), e o aceite 12 ("sem evento novo, canal do motorista inalterado") se prova melhor na rota.
Levar a regra para a T3 custaria duas linhas e um contrato de unidade, sem risco para o motorista.
Não há ganho em antecipar.

**Idempotência, decidido pelo líder (§0):** a ADR-0067 §2 falava em 422 `IDEMPOTENCY_KEY_REUSED`
para a mesma chave vinda de outro ator. Fica o código de hoje, **409
`TRIP_FIELD_REPORT_KEY_REUSED`**, e a comparação do `withFieldReport` passa a incluir o ator, além
da operação. Isso é da T6, e a ADR se ajusta junto.

## 9. Call sites que mudam

**Código de produção (etapa 2 da T3):**

| Arquivo                                                                            | Mudança                                                    |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/trips/application/field-trip-target.types.ts`                                 | **novo** (§3)                                              |
| `src/trips/application/field-trip-target.port.ts`                                  | **novo** (§4.1)                                            |
| `src/trips/application/resolve-field-trip-target.use-case.ts`                      | **novo** (§4.4)                                            |
| `src/trips/domain/field-trip-target.policy.ts`                                     | **novo** (§4.3)                                            |
| `src/trips/domain/trip.error.ts`                                                   | + `TripWithoutDriverError`, `DriverNotOnTripError`         |
| `src/trips/infrastructure/drizzle-field-trip-target.repository.ts`                 | **novo** (§4.2)                                            |
| `src/trips/infrastructure/field-trip-target.query.ts`                              | **novo** (§5.1)                                            |
| `src/trips/application/driver-field-report.port.ts:59-68`                          | argumento de `findStopForDriver` / `findDocumentForDriver` |
| `src/trips/application/attach-delivery-proof.use-case.ts:54-58, 92-97, 141-145`    | porta, entrada e chamada                                   |
| `src/trips/application/register-driver-occurrence.use-case.ts:23-27, 46-51, 86-90` | porta, entrada e chamada                                   |
| `src/trips/application/start-field-trip.use-case.ts:30-36, 55-59`                  | entrada e ramo do alvo resolvido (porta intacta)           |
| `src/trips/application/report-stop-arrival.use-case.ts:12-21, 45-49`               | entrada e chamada                                          |
| `src/trips/application/report-document-delivery.use-case.ts:24-33, 119-123`        | entrada e chamada                                          |
| `src/trips/application/report-stop-occurrence.use-case.ts:36-56, 82-94`            | entrada e duas chamadas                                    |
| `src/trips/infrastructure/drizzle-driver-field-report.repository.ts:114-192`       | `where` por `fieldTripTargetCondition`                     |
| `src/trips/infrastructure/drizzle-delivery-proof.repository.ts:48-84`              | idem                                                       |
| `src/trips/infrastructure/delivery-proof-read.support.ts:382-411`                  | idem                                                       |

**O que não muda, e por quê:**

- `src/main.ts` (`:715-735` e `:2391-2466`) não muda. As ligações fazem `{ ...input, … }` com
  `input.driverId`, que continua casando com a variante `{ driverId }` de `FieldTripLocator`. Os
  lambdas `findReachableDocument: (query) => findDriverReachableDocument(db, query)` repassam a
  consulta, e o tipo dela acompanha a porta. O resolvedor só é ligado na T5, com a rota que o
  consome.
- `src/trips/presentation/me-trip.routes.ts` não muda. `MeTripDependencies` (`:87-161`) continua
  tipando `driverId`, e a rota não conhece o caso de uso.
- `src/whatsapp-commands/application/register-driver-flow-actions.ts` não muda. As dependências
  (`:82-106`) continuam com `driverId`.
- `drizzle-current-driver-trip.repository.ts` não muda. `readCurrent` segue só para o motorista.
- **A assinatura HTTP não muda.** Nenhum path, método, corpo, header, status ou código de erro das
  rotas `/me/trips/current/...` é tocado. A T3 não cria rota.

## 10. Prova de que os contratos atuais passam sem edição

| Arquivo de teste                                                                   | O que cobre                                                                                          | Por que não precisa de edição                                                                                                  |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `test/driver-trip/me-routes.contract.ts` (via `test/driver-trip.contract.test.ts`) | HTTP de `/me/trips`                                                                                  | usa dependências falsas no nível de `MeTripDependencies`, que não muda                                                         |
| `test/driver-trip/field-report.contract.ts` + `field-report.double.ts`             | chegada, entrega, devolução, ocorrência de parada e idempotência                                     | passa `driverId` na entrada (variante do localizador). O dublê lê só `stopId`/`documentId` (`:69-70`)                          |
| `test/driver-trip/delivery-proof.contract.ts`                                      | comprovante                                                                                          | `findDeliveryEventId: () => …` não lê o argumento. A entrada leva `driverId`                                                   |
| `test/driver-trip/current-trip.contract.ts`, `dispatch.contract.ts`                | leitura e despacho                                                                                   | não tocam em nenhuma porta alterada                                                                                            |
| `test/trip-delivery-proof/receiver-document.contract.ts`                           | documento do recebedor                                                                               | mesmo caso de `delivery-proof.contract.ts`                                                                                     |
| `test/trip-occurrence/driver.contract.ts`                                          | ocorrência da nota (spec 079)                                                                        | `findReachableDocument()` sem argumento lido. A entrada leva `driverId`                                                        |
| `test/trip-occurrence/stop-notification.contract.ts`                               | aviso da ocorrência de parada                                                                        | a entrada leva `driverId`. O dublê é o de `field-report.double.ts`                                                             |
| `test/whatsapp-commands/driver-flow-actions.contract.ts`                           | fluxo do WhatsApp                                                                                    | usa dependências falsas no nível das ações, que não mudam                                                                      |
| `test/integration/me-trip.integration.ts`                                          | Drizzle ponta a ponta, incluindo "a viagem de uma empresa não alcança o motorista de outra" (`:276`) | usa as classes Drizzle reais com `driverId`. É a regressão do `exists` do `kind: 'driver'`                                     |
| `test/integration/whatsapp-driver-flow-actions.integration.ts`                     | WhatsApp contra o Postgres                                                                           | monta os casos de uso com `{ ...input }` com `driverId`. O lambda de `findDriverReachableDocument` (`:434`) repassa a consulta |

A etapa 2 fecha com `bun run typecheck`, `bun run lint`, `bun run --cwd apps/api-transportada test` e,
de dentro de `apps/api-transportada`, `bun --env-file=../../.env.test test --timeout 120000` rodando
`me-trip.integration.ts` e `whatsapp-driver-flow-actions.integration.ts`. Mais o
`git diff --stat -- apps/api-transportada/test` mostrando **só arquivos novos**, que é a prova do
"sem edição".

## 11. Contratos novos, escritos antes da implementação

Entrypoint novo `test/field-trip-target.contract.test.ts`, com as suítes em `test/field-trip-target/`,
listado no `"test"` do `package.json`. Os entrypoints existentes não são tocados. Os dublês existentes
podem ser **importados** (`field-report.double.ts`) sem serem editados.

### Unidade (dublês das portas)

`test/field-trip-target/policy.contract.ts`, sobre `pickOnBehalfOfDriver`:

1. Tripulação vazia → `TRIP_WITHOUT_DRIVER`, com e sem `requestedDriverId`.
2. Sem `requestedDriverId`, com a tripulação `[pos 2, pos 1]` fora de ordem → o de `position 1`.
3. `requestedDriverId` = o de `position 2` → ele.
4. `requestedDriverId` fora da tripulação → `DRIVER_NOT_ON_TRIP` (422).

`test/field-trip-target/resolve.contract.ts`, sobre `resolveFieldTripTarget` com uma porta falsa:

5. A porta devolve `null` (viagem de outra empresa) → `TRIP_NOT_FOUND` com **404**, nunca 403.
6. A porta recebe o `companyId` dos params, não um valor de dentro do alvo.
7. O resultado carrega `onBehalfOfDriverId`, `tripStatus` e `tripId`.

`test/field-trip-target/use-cases.contract.ts`, sobre os casos de uso com o localizador `{ target }`:

8. `reportStopArrival` / `reportDocumentDelivery` / `reportStopOccurrence`: a porta recebe
   `target: { kind: 'trip', tripId }`. Usa o dublê de `field-report.double.ts` embrulhado por um
   espião, sem editá-lo.
9. As mesmas chamadas com `{ driverId }`: a porta recebe `{ kind: 'driver', driverId }`. Isso prova
   a equivalência do canal do motorista.
10. `startFieldTrip` com `{ target }` não chama `readCurrent`, usa `target.tripStatus`, e uma
    transição bloqueada responde 409 `STATE_TRANSITION_NOT_ALLOWED`.
11. `attachDeliveryProof` e `registerDriverOccurrence` com `{ target }`: a porta recebe o alvo `trip`.

### Integração (Drizzle, `.env.test`)

`test/integration/field-trip-target.integration.ts`, listado em `"test:integration"` e rodado com
`bun --env-file=../../.env.test test --timeout 120000`. Sem o `.env.test`, ele pula, e pular não é
passar. O arranjo do banco descartável é o mesmo de `me-trip.integration.ts`.

12. `DrizzleFieldTripTargetRepository.findTripCrew` com o `tripId` da empresa B e o contexto da
    empresa A → `null`.
13. Viagem sem linha em `trip_drivers` → `{ drivers: [] }`, e o resolvedor responde
    `TRIP_WITHOUT_DRIVER`.
14. Viagem com dois motoristas → `drivers` ordenados por `position`, e o padrão do resolvedor é o
    de `position 1`.
15. `findStopForDriver` / `findDocumentForDriver` com `kind: 'trip'`: uma parada ou nota da viagem
    alvo é encontrada. Uma da **outra viagem da mesma empresa** → `null`. Um `tripId` de outra
    empresa → `null`.
16. `findDeliveryEventId` e `findDriverReachableDocument` com `kind: 'trip'`: os mesmos três casos,
    incluindo a viagem `completed`, que o comprovante ainda alcança (`TRIP_DISPATCHED_STATUSES`).

## 12. Riscos

- **Os nomes `…ForDriver` passam a mentir um pouco.** `findStopForDriver` também atende o alvo
  `trip`. O JSDoc de cada método diz isso. O rename vira uma limpeza à parte, quando for aceitável
  tocar nos dublês (§9, alternativa C).
- **Status fora do recorte segue os códigos de hoje (R5).** Chegar numa parada de uma viagem
  `completed`, ou numa parada de outra viagem, responde 404 `TRIP_STOP_NOT_REACHABLE`. A nota fora
  do alcance responde **409 `TRIP_DOCUMENT_NOT_REACHABLE`**. São os códigos do motorista, iguais nos
  dois canais, de propósito. Se a tela da T8 precisar distinguir, quem resolve é o
  `allowedActions` (T7), que esconde a ação antes do clique.
- **O status resolvido pode envelhecer no `startFieldTrip`.** Isso foi resolvido pela R2: a
  gravação é compare-and-set sobre o status lido, e perder a corrida relê em vez de regredir. Vale
  para os dois canais, então o motorista também ganhou a proteção.
- **O resolvedor roda fora da transação do relato de campo.** Um motorista desvinculado entre a
  resolução e a gravação ainda seria registrado como `on_behalf_of`. A janela é de milissegundos, e
  a FK composta da T4 impede apontar para motorista de outra empresa. Aceito.
- **O `exists` no lugar do `inner join`** muda o plano de consulta do caminho quente do motorista.
  Os índices `(company_id, trip_id, driver_id)` (unique) cobrem o `exists`. Se houver dúvida, a
  etapa 2 registra o `EXPLAIN` no `evidence.md`.

## 13. Alternativas rejeitadas

- **A. Duplicar os casos de uso para o escritório** (`reportDocumentDeliveryForOffice` etc.).
  Rejeitada: é o que a ADR-0067 §1 proíbe ("os mesmos casos de uso"). Duas cópias de
  `runOutcome` divergiriam na primeira correção. É a lição das cinco listas de status que
  `trip-state.policy.ts:95` registra.
- **B. Trocar `driverId` por `target` na entrada dos casos de uso**, com `main.ts` convertendo.
  Rejeitada: é mais puro, mas obriga a editar `field-report.contract.ts`,
  `delivery-proof.contract.ts`, `receiver-document.contract.ts`, `driver.contract.ts`,
  `stop-notification.contract.ts` e as duas integrações, e isso fura o gate da T3.
- **C. Métodos novos nas portas** (`findStopForTrip`, `findDocumentForTrip`, …) ou renomear os
  existentes. Rejeitada: os dublês tipados como a porta (`field-report.double.ts:54`, e o
  `DeliveryProofPort` dos contratos) deixariam de compilar, e o gate cairia. Trocar só o tipo do
  argumento chega ao mesmo SQL sem tocar em teste.
- **D. Resolver o motorista dentro de cada consulta** (cada `find…` devolve também o
  `onBehalfOfDriverId`). Rejeitada: as regras `TRIP_WITHOUT_DRIVER`, `DRIVER_NOT_ON_TRIP` e
  `position 1` ficariam repetidas em quatro SQLs, e os tipos de retorno mudariam, quebrando os
  dublês.
- **E. Reusar a consulta do motorista com o motorista efetivo e conferir `tripId` depois.**
  Rejeitada: `findDeliveryEventId` devolve só o id do evento, sem `tripId` para conferir. Além
  disso, uma nota de outra viagem do mesmo motorista passaria pelo caminho `/trips/:id` errado.
- **F. `companyId` dentro do alvo `trip`**, como no `plan.md`. Rejeitada em §3: seriam duas fontes
  da empresa.
- **G. Pôr o resolvedor como método da porta transacional.** Rejeitada: o dublê
  `field-report.double.ts` deixaria de compilar (C), e a leitura da tripulação não precisa do
  lock da transação do relato.

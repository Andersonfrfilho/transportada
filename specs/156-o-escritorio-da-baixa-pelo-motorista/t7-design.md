# Spec 156 — T7 🧠: desenho de `anyPermission`, `allowedActions` e ocorrência em massa

> A etapa 1 foi o desenho, e a etapa 2 a implementação. O `architect` **aprovou com ressalvas**, e
> as ressalvas estão incorporadas abaixo. Onde o texto original diverge, vale a §0.

## 0. Validação e decisões

**Decisões do líder:**

- **L1.** Sim: `me-routes.contract.ts` passa a usar o `authorize` real.
- **L2.** Sim: `GET /trips/occurrence-types/field`, com `trip.report-on-behalf`, devolve só `id` e
  `name`.
- **L3.** O anexo do lote vai para a **T7b** desta spec, que entrou no `tasks.md` logo depois da T7.
- **L4.** Sim: 422 `OCCURRENCE_TYPE_NOT_FIELD`.
- **L5.** Ok: o `finance` continua sem o feed.
- **L6.** Já viraram tarefas separadas, registradas no `evidence.md` da T7.

**Ressalvas do `architect`** (valem sobre o texto original):

- **M1 — mudança de desenho.** O `allowedActions` **sai** do `GET /trips/:id` e vira rota própria:
  `GET /trips/:id/allowed-actions`, com a mesma `anyPermission` das cinco leituras (agora seis).
  O motivo é que uma aba com bundle antigo recusa o detalhe inteiro por chave desconhecida
  (`hasKeys`), e uma rota nova não tem esse risco. Com isso, a §2.4 (formato) vale para o corpo da
  rota nova, e a §2.5 perde o passo T7.0: **não há promoção em duas etapas**.
  - Os nulos de `driverTaxId`, `driverEmail` e `driverPhone` só chegam a quem não tem `fleet.read`.
    Essas pessoas recebiam 403 antes, então o detalhe não quebra para ninguém que já tinha acesso.
  - Mesmo assim, o validador do frontend passa a aceitar `null` nesses três campos, no mesmo commit
    da T7.1. Também está registrado na ADR-0067.
  - `TRIP_DETAIL` e os testes do detalhe **não** ganham `allowedActions`.
- **A1.** O `allowedActions` **não** publica `deliver`/`return` do caminho do barracão
  (`trip.manage`). Contrato: o separador não recebe `deliver`, `return` nem nenhuma `field*`, e o
  `finance` não recebe ação do barracão. Com isso, a linha `deliver`/`return` da tabela da §2.2 cai.
- **A2.** `resolveTripHasRoute` espelha **exatamente** o SQL (`drizzle-trip-route.repository.ts:277`):
  nota `returned` sem parada é ignorada, junto com a nota liberada. Um contrato de integração compara
  as duas cópias, incluindo esse caso.
- **M2.** A ocorrência do galpão (`occurrence`, `trip.manage`) segue
  `operator-trip-actions.policy.ts:50`. Reaproveita `resolveOperatorTripActions`, sem duplicar o
  portão.
- **M3.** `canReadDriverContact` é **obrigatório** em `serializeTripDetail` e em todas as chamadas,
  inclusive `POST /trips/:id/close` (:980), e é calculado com `TRIP_READ_POLICY.permission`, não com
  um literal.
- **A3.** No lote:
  - A validação (tipo e alcance das notas) fica **dentro** do `perform` do lote.
  - O `recall` do lote reconstrói `items` a partir das reservas por nota, na ordem do pedido, e nunca
    devolve `null`.
  - A marca "criada nesta chamada" é uma variável fechada no `perform` de cada nota. O `recall` não
    a acende, e é por isso que o reenvio não avisa de novo.
  - Contrato: o reenvio depois de o tipo ser aposentado devolve o mesmo resultado.
- **B1.** A chave derivada tem espaço próprio, `batch:<sha256(chave)>:<documentId>`, com uma
  `operation` exclusiva (`office.document.occurrence-batch-item`). Assim ela nunca colide com a chave
  que um cliente mandaria.
  - Resíduo aceito: um cliente pode mandar como `Idempotency-Key` uma chave que já comece com
    `batch:`. Mesmo assim ela não mistura dado nenhum: a `operation` é diferente, e o
    `withFieldReport` responde 409 `TRIP_FIELD_REPORT_KEY_REUSED` para os dois lados.
- **M4.** O `dedupeKey` do aviso inclui o `documentId`, para duas notas sem rótulo não colapsarem num
  aviso só. Os avisos vão para quem despachou a viagem, que é o destinatário do trilho de ocorrência
  (`occurrence-notifier.gateway.ts`).
- **B3.** Aceito como está: `Promise.all` só fora da transação, com reservas sequenciais dentro.
- **B4.** O validador do `allowed-actions` no frontend exige que as chaves de `documents` e `stops`
  sejam ids da própria viagem (⊆), e ignora nome de ação desconhecido.
- **B5.** Documentado: a lista promete o que a máquina aceita, não que o toque passe (§2.1).
- **B6.** No `me-routes.contract.ts`, `expect(route.policy).toBeDefined()` continua. Só a leitura de
  `.permission` dá lugar ao `authorize`.

Cobertura extra:

- **Aceite 4 por HTTP:** com a viagem em `on_delivery_route`, o `operator` recebe `fieldDelivery` e
  `fieldReturn` numa nota `loaded`.
- **Aceite 14:** o JSON do detalhe para o `finance` não contém o CPF da fixture em lugar nenhum.

Os commits são isolados, nesta ordem:

1. **T7.1:** `anyPermission` + recorte + validador do frontend aceitando `null`.
2. **T7.2:** `allowed-actions`.
3. **T7.3:** `occurrence-types/field` + o lote.

Lido para este desenho: `spec.md` (D7, D10, D11; aceites 1, 4, 10, 14), `plan.md` §API 5 e 7,
`tasks.md` T7, ADR-0067 § Consequências, `evidence.md` T2–T6, `apps/api-transportada/CLAUDE.md`, e o
código citado em cada seção (caminhos relativos a `apps/api-transportada/`, salvo indicação).

---

## 1. Leitura da viagem pelo `finance`: `anyPermission` (D11, aceite 14)

### 1.1 O tipo

Em `src/identity/domain/authorization.policy.ts`, entra uma quarta variante no mesmo molde de
`MembershipAuthorizationPolicy`, que já tem `permission?: never`:

```ts
/**
 * ADR-0067 / spec 156 D11: "qualquer uma de". Só para leitura (o router recusa no boot em outro
 * método) e só onde a decisão está escrita. Pelo menos duas: com uma só, é `CompanyAuthorizationPolicy`.
 */
export type CompanyAnyPermissionPolicy = {
  readonly anyPermission: readonly [CompanyPermission, CompanyPermission, ...CompanyPermission[]]
  /** Sem permissão única: quem lê `policy.permission` numa lista de rotas recebe `undefined`. */
  readonly permission?: never
  readonly scope: 'company'
}

export type RouteAuthorizationPolicy =
  | CompanyAuthorizationPolicy
  | CompanyAnyPermissionPolicy
  | MembershipAuthorizationPolicy
  | PlatformAuthorizationPolicy

export type GrantsAnyPermissionParams = {
  readonly granted: ReadonlySet<CompanyPermission>
  readonly required: readonly CompanyPermission[]
}

export function grantsAnyPermission({ granted, required }: GrantsAnyPermissionParams): boolean {
  return required.some((permission) => granted.has(permission))
}
```

- A tupla com no mínimo dois elementos torna `anyPermission: ['fleet.read']` um erro de tipo. Assim,
  uma permissão única não se esconde na variante nova.
- `permission?: never` mantém o tipo de `route.policy?.permission` **igual ao de hoje**
  (`CompanyPermission | 'companies.manage' | undefined`, porque a variante de membership já tem
  `undefined`). Nenhum leitor em `src/` quebra na compilação.

### 1.2 O `authorize`

Em `src/identity/application/authorization.service.ts`, o ramo novo entra entre o de membership e o
de permissão única:

```ts
if ('anyPermission' in policy) {
  if (
    context.scope.kind !== 'company' ||
    !grantsAnyPermission({ granted: context.scope.permissions, required: policy.anyPermission })
  ) {
    throw forbidden()
  }
  return
}
```

A primeira guarda do método (`context.scope.kind !== policy.scope`) já recusa o escopo de
plataforma. O token de serviço (`automation`) só tem `mdfe.auto-issue` e `whatsapp.settle`, então
não alcança nenhuma das duas permissões.

**Guarda de boot** (defesa em profundidade, no molde de `assertMembershipRoutesUnderMe`, em
`src/http/router.service.ts:307`): `assertAnyPermissionRoutesAreReads` derruba o boot se uma rota
com `anyPermission` não for `GET`. A D11 é uma decisão sobre leitura. Uma escrita com "qualquer uma
de" seria a forma mais silenciosa de alargar quem escreve.

### 1.3 Onde entra: as cinco rotas, e só elas

Em `src/trips/presentation/trip.routes.ts`, ao lado de `TRIP_READ_POLICY` (:240):

```ts
/**
 * Spec 156 D11: o `finance` dá baixa (`trip.report-on-behalf`) e precisa abrir a viagem sem ganhar
 * `fleet.read`, que é a ficha de todos os motoristas (CPF, CNH, PIX, endereço). Só nestas cinco
 * leituras. Feed, geometria, produtos, agendamento e prontidão fiscal continuam `fleet.read`.
 */
const TRIP_FIELD_READ_POLICY = {
  anyPermission: ['fleet.read', 'trip.report-on-behalf'],
  scope: 'company',
} as const satisfies CompanyAnyPermissionPolicy
```

| Rota                                               | Linha hoje | Antes        | Depois                   |
| -------------------------------------------------- | ---------- | ------------ | ------------------------ |
| `GET /trips`                                       | :503       | `fleet.read` | `TRIP_FIELD_READ_POLICY` |
| `GET /trips/:id`                                   | :878       | `fleet.read` | `TRIP_FIELD_READ_POLICY` |
| `GET /trips/:id/stops`                             | :1317      | `fleet.read` | `TRIP_FIELD_READ_POLICY` |
| `GET /trips/:id/documents/:documentId/proof`       | :1047      | `fleet.read` | `TRIP_FIELD_READ_POLICY` |
| `GET /trips/:id/documents/:documentId/occurrences` | :1131      | `fleet.read` | `TRIP_FIELD_READ_POLICY` |

⚠️ O `POST` de `TRIP_DOCUMENT_OCCURRENCES_PATH` (:1210) divide o caminho com o `GET` e **continua
`trip.manage`**. Só o `GET` muda.

Continuam `fleet.read`, e o aceite 14 prende três delas: `GET /fleet/drivers`,
`GET /trip-occurrences` (feed), `GET /trip-occurrences/:id/attachments`,
`GET /trips/:id/route-geometry`, `POST /route-geometry`, `GET /trips/:id/schedules`,
`GET /trips/:id/fiscal-readiness`, `GET …/products`, `GET …/delivery-address-history` e
`GET /trip-documents/returned-with-active-cte`.

### 1.4 O que cada leitura expõe, e o que muda

| Rota                   | O que sai de pessoa ou de dinheiro                                                                                              | Tratamento                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /trips/:id`       | `drivers[].driverTaxId/driverEmail/driverPhone` (`serializeTripDetail`, :1516-1523). Valores já passam por `canReadFinancials`. | **Redigir**: sem `fleet.read`, os três saem `null`, e `driverName` e `driverId` ficam.                                                                                                                              |
| `GET /trips`           | `driverNames` (só nome) e `amounts` (receita e soma das notas).                                                                 | Nada muda para o `finance`, que tem `trip.financials`. ⚠️ **Achado anterior à spec**: `amounts` sai **sem** o recorte de `trip.financials` para quem tem `fleet.read`, inclusive `separator` e `viewer` (§5, [L6]). |
| `GET /trips/:id/stops` | Nada (`TripStopSummary`: endereço, janela, ids).                                                                                | Nenhum.                                                                                                                                                                                                             |
| `GET …/proof`          | Nome de quem recebeu. O documento vai mascarado (ADR-0045 §7, ADR-0057 §3).                                                     | Nenhum. É o que o `finance` precisa ver ao conferir o canhoto.                                                                                                                                                      |
| `GET …/occurrences`    | Tipo, nota e item.                                                                                                              | Nenhum.                                                                                                                                                                                                             |

A redação é feita no serializador, que já recebe objeto. `serializeTripDetail` ganha
`canReadDriverContact: boolean`, calculado por `permissions.has('fleet.read')`:

```ts
drivers: trip.drivers.map((driver) => ({
  driverEmail: input.canReadDriverContact ? driver.driverEmail : null,
  driverId: driver.driverId,
  driverName: driver.driverName,
  driverPhone: input.canReadDriverContact ? driver.driverPhone : null,
  driverTaxId: input.canReadDriverContact ? driver.driverTaxId : null,
  position: driver.position,
})),
```

`POST /trips` (:895) também serializa o detalhe. Ele passa o mesmo cálculo, e o resultado não muda,
porque todo papel com `trip.manage` tem `fleet.read`.

O contato do **destinatário** (`documents[].contact`) fica como está. A D11 recorta a ficha do
motorista, e o telefone do cliente é justamente o que o escritório usa para confirmar a entrega.

⚠️ `GET /trips/:id` enfileira o cálculo da planta de carga (`requestCargoLayoutAfterRead`, :850).
A leitura do `finance` também passa a enfileirar. É o mesmo efeito da leitura do `viewer`,
idempotente por hash (ADR-0063), e fica registrado aqui só para não surpreender.

### 1.5 Os testes que leem `route.policy?.permission`, um por um

Varredura feita com `rg -F '.policy' test` e `rg "'membership' in|RouteAuthorizationPolicy" src test`:

| Arquivo:linha                                                                        | O que lê                                                                       | Com `anyPermission`                                                                                                                               |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/driver-trip/me-routes.contract.ts:44, 68, 84`                                  | só `meRoutes`                                                                  | Não quebra: nenhuma rota `/me` muda.                                                                                                              |
| **`test/driver-trip/me-routes.contract.ts:56-61`**                                   | `officeRoutes = createTripRoutes(...)`, com `expect(permission).toBeDefined()` | **QUEBRA**: nas cinco rotas, `permission` é `undefined`. Ver [L1].                                                                                |
| `test/trip-field-office/policy.contract.ts:29-68`                                    | só `createTripFieldOfficeRoutes`                                               | A política continua `permission` única e passa. ⚠️ `toHaveLength(7)` vira 8 por causa da rota nova da §3, que é contagem esperada, não regressão. |
| `test/fleet-application/aggregate-attachment-review.contract.ts:177`                 | rotas de frota                                                                 | Não quebra.                                                                                                                                       |
| `test/separator-role.contract.test.ts:56-81`                                         | `service.authorize(context, route.policy)`, o real                             | Não quebra. O separador tem `fleet.read` e continua alcançando as cinco. A lista exaustiva fica **idêntica**, sem edição.                         |
| `test/whatsapp-commands/membership-policy-lock.contract.ts:105`                      | `'membership' in route.policy`                                                 | Não quebra.                                                                                                                                       |
| `test/fixtures/router.fixture.ts:67`, `router-path-parameters.fixture.ts:44,164,189` | só repassam o tipo                                                             | Compilam, porque a união só cresce.                                                                                                               |
| `test/*` com `expect(route.policy).toEqual({ permission: … })`                       | contractor-portal, camera, nfe-package-box, companies, settlement              | Nenhuma delas é das cinco rotas. Não quebram.                                                                                                     |
| `src/whatsapp-commands/application/with-authorized-actor.service.ts:37-126`          | tipa `CompanyAuthorizationPolicy`, não a união                                 | Não é afetado. As `FlowAction` continuam com permissão única.                                                                                     |
| `src/http/router.service.ts:39,62,87,312`                                            | tipo e `'membership' in`                                                       | Compila. Ganha a guarda de boot do §1.2.                                                                                                          |

**[L1] — A única quebra é `me-routes.contract.ts:56-61`.** A intenção do teste é "o papel `driver`
não alcança nenhuma rota de viagem do escritório". A proposta é trocar a leitura de
`policy.permission` por `new AuthorizationService().authorize(driverContext, route.policy)`
esperando 403, como faz `separator-role.contract.test.ts`. O teste fica **mais forte**, porque passa
a exercitar a decisão real e não uma leitura da política. A alternativa sem editar o teste é
`{ permission: 'fleet.read', anyPermission: [...] }`. Ela foi rejeitada: qualquer leitor de
`.permission` concluiria que o `finance` não alcança a rota, e esse é exatamente o erro que o
contrato existe para impedir.

Os testes HTTP que fazem `toEqual(TRIP_DETAIL)` (`test/trip-http/detail.contract.ts:31, 126` e
`money-redaction.contract.ts`) quebram por causa do `allowedActions` da §2, não por causa da
política. A correção é na fixture `test/fixtures/trip-http-payload.fixture.ts`, que passa a ter
`allowedActions` vazio para `FINANCIALS_PERMISSIONS` (`fleet.read` + `trip.financials`, sem
capacidade de ação).

---

## 2. `allowedActions` em `GET /trips/:id` (D10, aceite 4)

### 2.1 Semântica

> **Uma ação está em `allowedActions` quando a máquina de estados a aplicaria agora (`applied`) e o
> usuário tem a permissão da rota que a executa.**

- `unchanged` fica **fora**: um botão que não muda nada é ruído, e é o mesmo critério do menu do
  WhatsApp (spec 144 T016).
- `blocked` fica fora.
- **Pré-condições de negócio com erro próprio ficam fora do cálculo e continuam na rota.** Exemplos:
  parada sem agendamento no despacho, foto obrigatória (aceite 9) e CT-e. A lista diz o que "a
  máquina aceita". Não promete que o toque sempre passe. Isso é deliberado: trazer essas regras
  para cá duplicaria consultas de `dispatch-trip` e da configuração de comprovante.
- `allowedActions` ⊆ o que o servidor aceita. O servidor aceita mais: repetir uma ação dá
  `unchanged`, e há a chegada numa viagem `completed`. O inverso nunca acontece.

### 2.2 A tabela de ações

Os nomes seguem `TRIP_ACTION` e `TRIP_DOCUMENT_ACTION` (`trip-state.policy.ts:12, 21`) onde já
existem.

| Nível  | Ação               | Rota que executa                                              | Capacidade       | Regra (pura)                                                                                          |
| ------ | ------------------ | ------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| viagem | `planRoute`        | `POST /trips/:id/plan-route`                                  | `trip.manage`    | `checkTripTransition({ action: planRoute, hasRoute })` = `applied`                                    |
| viagem | `dispatch`         | `POST /trips/:id/dispatch`                                    | `trip.manage`    | `checkTripTransition(dispatch)` = `applied`                                                           |
| viagem | `cancel`           | `POST /trips/:id/cancel`                                      | `trip.manage`    | `checkTripTransition(cancel)` = `applied`                                                             |
| viagem | `confirmLoad`      | `POST /trips/:id/confirm-load`                                | report-on-behalf | `checkTripTransition(confirmLoad)` = `applied` **e** `hasDriver`                                      |
| viagem | `startRoute`       | `POST /trips/:id/start-route`                                 | report-on-behalf | `checkTripTransition(startRoute)` = `applied` **e** `hasDriver`                                       |
| parada | `arrive`           | `POST /trips/:id/stops/:stopId/arrive`                        | report-on-behalf | status em `TRIP_ON_ROAD_STATUSES`, `stop.arrivedAt === null` e `hasDriver`                            |
| parada | `occurrence`       | `POST /trips/:id/stops/:stopId/occurrences`                   | report-on-behalf | status em `TRIP_ON_ROAD_STATUSES` e `hasDriver`                                                       |
| nota   | `separate`/`load`  | `POST …/documents/:documentId/{separate,load}`                | `trip.manage`    | `checkTripDocumentTransition` = `applied`, e a nota não foi liberada                                  |
| nota   | `deliver`/`return` | `POST …/{deliver,return}` (caminho do barracão, spec 056)     | `trip.manage`    | idem. É o que o servidor aceita hoje, e a T8 decide se a tela oferece                                 |
| nota   | `fieldDelivery`    | `POST …/field-delivery`                                       | report-on-behalf | `checkTripDocumentTransition(deliver)` = `applied`, não liberada, `hasDriver`                         |
| nota   | `fieldReturn`      | `POST …/field-return`                                         | report-on-behalf | `checkTripDocumentTransition(return)` = `applied`, não liberada, `hasDriver`                          |
| nota   | `fieldProof`       | `POST …/field-proof`                                          | report-on-behalf | `separationStatus === 'delivered'`, viagem despachada e não cancelada, não liberada, `hasDriver`      |
| nota   | `occurrence`       | `POST …/documents/:documentId/occurrences` (galpão, spec 079) | `trip.manage`    | nota não liberada (a rota não olha estado, `register-trip-occurrence.use-case.ts`)                    |
| nota   | `fieldOccurrence`  | `POST /trips/:id/documents/field-occurrences` (§3)            | report-on-behalf | `isTripDispatched(status)`, a mesma régua de `findDriverReachableDocument`, não liberada, `hasDriver` |

Com isso, o aceite 4 sai da tabela: em `on_delivery_route`, com nota `loaded`,
`checkTripAcceptsDocumentWork(deliver)` dá `null`, porque é trabalho de rua e a viagem está
despachada. Então `fieldDelivery` e `fieldReturn` entram.

### 2.3 Função pura no domínio

`src/trips/domain/trip-allowed-actions.policy.ts` (novo). Não importa nada de `identity`: recebe
**capacidades**, e a camada de apresentação é quem as deriva das permissões.

```ts
export const STOP_ALLOWED_ACTION = { arrive: 'arrive', occurrence: 'occurrence' } as const
export const DOCUMENT_ALLOWED_ACTION = {
  ...TRIP_DOCUMENT_ACTION, // deliver, load, return, separate
  fieldDelivery: 'fieldDelivery',
  fieldOccurrence: 'fieldOccurrence',
  fieldProof: 'fieldProof',
  fieldReturn: 'fieldReturn',
  occurrence: 'occurrence',
} as const

export type TripActionCapabilities = {
  readonly canManage: boolean // trip.manage
  readonly canReportOnBehalf: boolean // trip.report-on-behalf
}

export type AllowedActionsTripSnapshot = {
  readonly documents: readonly {
    readonly id: string
    readonly releasedAt: string | null
    readonly separationStatus: TripDocumentSeparationStatus
  }[]
  readonly hasDriver: boolean
  readonly hasRoute: boolean
  readonly status: TripStatus
  readonly stops: readonly { readonly arrivedAt: string | null; readonly id: string }[]
}

export type ResolveTripAllowedActionsParams = {
  readonly capabilities: TripActionCapabilities
  readonly trip: AllowedActionsTripSnapshot
}

export type ResolveTripAllowedActionsResult = {
  readonly documents: Readonly<Record<string, readonly DocumentAllowedAction[]>>
  readonly stops: Readonly<Record<string, readonly StopAllowedAction[]>>
  readonly trip: readonly TripAction[]
}

export function resolveTripAllowedActions(
  params: ResolveTripAllowedActionsParams,
): ResolveTripAllowedActionsResult
```

Para caber no limite de 40 linhas, ela é dividida em `resolveTripLevelActions`,
`resolveStopActions` e `resolveDocumentActions`. Cada uma recebe um objeto e compõe
`checkTripTransition` e `checkTripDocumentTransition`, **nunca uma tabela paralela**.

**`hasRoute`** sai de `resolveTripHasRoute({ documents, stops })`, que também é pura e fica no
mesmo arquivo: existe parada **e** nenhuma nota viva (`releasedAt === null`) está sem `stopId`.
Hoje essa regra só existe em SQL (`drizzle-trip-route.repository.ts:282-284`). ⚠️ São duas
cópias. Um contrato de integração compara as duas na mesma viagem, antes e depois de vincular uma
nota sem parada (§4). **`hasDriver`** é `trip.drivers.length > 0`, o mesmo critério do
`TRIP_WITHOUT_DRIVER` da T3.

A rota (`GET /trips/:id`) monta as capacidades assim:

```ts
capabilities: {
  canManage: context.scope.permissions.has(TRIP_MANAGE_POLICY.permission),
  canReportOnBehalf: context.scope.permissions.has(OFFICE_REPORT_PERMISSION),
}
```

`'trip.report-on-behalf'` passa a aparecer duas vezes: em `TRIP_FIELD_READ_POLICY` e no cálculo de
capacidade. Pela regra do §16, vira constante `TRIP_REPORT_ON_BEHALF_PERMISSION` em
`trips/shared/trip-permission.constant.ts` (novo). `trip-field-office.routes.ts` (:73) passa a
importá-la.

### 2.4 Formato do payload

A chave `allowedActions` fica **no topo do detalhe**, com mapas esparsos por id. Ids sem ação não
aparecem.

```json
"allowedActions": {
  "trip": ["startRoute"],
  "stops": { "5b0e…": ["arrive", "occurrence"] },
  "documents": {
    "9c1a…": ["fieldDelivery", "fieldReturn", "fieldOccurrence"],
    "77d2…": ["fieldProof", "fieldOccurrence"]
  }
}
```

Por que esta forma:

- **No topo, não dentro de `documents[]` e `stops[]`.** No frontend, `isDocumentDetail` usa
  `hasExactKeys(TRIP_DOCUMENT_KEYS)` (`tripResponse.validation.ts:286`). Uma chave a mais em cada
  nota recusaria **o detalhe inteiro**, o mesmo defeito que `trip.constant.ts:177-183` registra. No
  topo, basta uma chave em `TRIP_DETAIL_OPTIONAL_KEYS`.
- **Esparso por id, e não por ação → ids.** Uma nota `loaded` na rua tem até seis ações. Invertido,
  o id dela (36 bytes) apareceria seis vezes. Por id, ele aparece uma vez. O pior caso realista é
  100 notas × (36 + ~70) ≈ 10 KB, contra um detalhe que já serializa cada nota duas vezes (em
  `documents` e dentro de `stops[].documents`).
- **Rejeitado: um perfil por `separationStatus`** (`{ loaded: [...], delivered: [...] }`). Ele é
  ainda menor, mas obriga o frontend a conhecer a regra de chaveamento, e quebra no dia em que uma
  ação depender de algo da nota além do status (por exemplo, "já tem canhoto").

`allowedActions` entra **só** no `GET /trips/:id`. `serializeTripDetail` recebe
`allowedActions?: ResolveTripAllowedActionsResult`, e `POST /trips` não o manda.

### 2.5 Consumidores atuais do `GET /trips/:id`

- `apps/frontend-transportada`: `tripResponse.validation.ts` (`isDetail`, :335). Hoje ele **quebra
  em dois pontos**:
  1. `allowedActions` é chave desconhecida para `hasKeys`, e a resposta inteira é recusada.
  2. Para o `finance`, `driverTaxId: null` reprova `isString(value.driverTaxId)` (:259).
- `apps/frontend-client` (portal do contratante): **não consome**. Ele não chama `/trips/*` (`rg`
  em `src/` sem ocorrência) e usa `/contractor-portal/*`.
- PWA do motorista e app nativo: usam `/me/trips/current`, que não muda.
- MDF-e: tem `driverTaxId` próprio (`mdfe-manifest/*`), fora deste detalhe.

**Portanto a T7 tem um passo de frontend, e ele vai em commit anterior ao da API** (padrão spec 078
D2, "aceito antes de a API servir"). Senão, a janela de deploy derruba o detalhe da viagem para
todo mundo:

- `trip.constant.ts`: `TRIP_DETAIL_OPTIONAL_KEYS` ganha `'allowedActions'`.
- `trip.types.ts`: `driverTaxId: string | null` e o tipo `TripAllowedActions`.
- `tripResponse.validation.ts`: `isNullableString(driverTaxId)` e `isAbsentOrAllowedActions`. A
  forma é estrita (`hasExactKeys(['documents','stops','trip'])`, com arrays de string), mas **nome de
  ação desconhecido é filtrado, não recusado**. Assim a API pode acrescentar ação sem repetir a
  janela de deploy. É uma exceção deliberada ao "estado estranho reprova", porque aqui o desconhecido
  só pode esconder um botão, nunca mostrar um.

### 2.6 Como a T8 consome

- O hook `useTripAllowedActions(trip)` devolve `canTrip(action)`, `canStop(stopId, action)` e
  `canDocument(documentId, action)`. Na seleção em massa, fica
  `selection.filter((id) => canDocument(id, 'fieldDelivery'))`.
- Ausente, que é o caso da API antiga na janela de deploy: **nenhuma ação de campo aparece** (falha
  fechada). As ações do barracão continuam em `tripStatus.service.ts` até a T8 decidir migrá-las.
- `tripStatus.service.ts` perde `canReturnDocuments` e `canDeliverDocuments` para as ações de campo
  (T1 já corrigiu `on_delivery_route`). O teste `test/trip/state-gates.contract.ts` passa a exercitar
  o hook com payloads fixos.
- ⚠️ Para a T8: o `finance` recebe 403 em geometria, agendamento, prontidão fiscal e produtos. Os
  painéis dessas rotas precisam ficar ocultos ou mostrar "sem acesso", **nunca** derrubar a tela.
  Isso vale também para a placa via `useFleet`, como a própria T8 já prevê.

---

## 3. `POST /trips/:id/documents/field-occurrences` (D7, aceite 10)

### 3.1 Contrato HTTP

- Permissão: `trip.report-on-behalf` (`OFFICE_REPORT_POLICY`), com rota em
  `trip-field-office.routes.ts`.
- Cabeçalho `Idempotency-Key` obrigatório (`parseIdempotencyKey`, de `me-trip.schema.ts`).
- Corpo JSON:

```ts
{
  documentIds: string[]      // uuid, 1..MAX_BATCH_DOCUMENTS (50), sem repetição
  occurrenceTypeId: string   // uuid: o tipo cadastrado da empresa
  note: string               // trim, até 500, padrão '' (o mesmo de occurrence.schema.ts:16)
  driverId?: string          // uuid, igual às outras rotas do escritório (D3)
}
```

- Usa **`occurrenceTypeId`, e não `typeCode`**. O tipo é cadastro da empresa, com id
  (`company_occurrence_types`). A rota do motorista, a do galpão e a T5 já recebem
  `occurrenceTypeId`, e um código solto reabriria a lista em código que a spec 079 aposentou.
- `productCode` não existe no lote: é sempre `''` (a nota inteira). Cada nota tem os seus itens, e
  apontar um produto em lote é engano por construção (`occurrence-scope.policy.ts`).
- `MAX_BATCH_DOCUMENTS = 50` **já existe** (`trip-request.schema.ts:54`, o `batch-status`). Ele é
  exportado e reaproveitado, sem constante nova. Esse limite segura também as 50 notificações de
  um toque.
- Resposta `201`: `{ data: { items: [{ documentId, id }] } }`, na ordem de `documentIds`.

### 3.2 Recomendação: transação única, tudo ou nada

**Recomendado: uma transação para o lote inteiro.** Ou as N ocorrências gravam, ou nenhuma grava.

Por que não resultado parcial como na entrega em massa (D5):

- A D5 é parcial porque **cada nota é uma requisição**, com a própria foto e a própria falha de
  rede. O cliente repete só a que falhou.
- A D7 é **uma requisição e um fato**: "cliente ausente" nesta parada, com o mesmo tipo e a mesma
  observação. As falhas possíveis são de validação (nota fora da viagem, tipo errado), que o
  usuário corrige e reenvia, ou de infraestrutura (a transação cai), que se resolve reenviando a
  mesma chave. Nos dois casos, tudo ou nada deixa um único estado para a tela explicar.
- O parcial exigiria `207`, um resultado por nota, uma idempotência que recorda sucessos misturados
  com falhas e uma tela de "tentar só estas". É a complexidade da D5 sem o motivo da D5.

**Validação antes de gravar, com todos os erros de uma vez** (`apis.md`, "return all validation
errors at once"): uma consulta com `inArray` lê as N notas pelo alvo resolvido. Se alguma não estiver
alcançável (outra viagem, liberada, viagem não despachada), responde **409
`TRIP_DOCUMENT_NOT_REACHABLE`** com `details: [{ field: 'documentIds', message: <id> }, …]`, sem
gravar nada. O `ApiError` já aceita `details` (`shared/api.error.ts:8`). O código é o mesmo da T3
(R5), e a classe ganha o parâmetro opcional `unreachableDocumentIds`.

### 3.3 Idempotência do lote

Há **uma chave por lote**, vinda do cliente. No servidor, ela se desdobra sem migration, reusando
`withFieldReport` (`trip-field-report.port.ts`) **sem alteração**:

1. **Guarda do lote.** `withFieldReport` roda com `idempotencyKey = <chave>` e
   `operation = 'office.document.occurrence-batch:' + <impressão>`. A impressão é o sha256 de
   `occurrenceTypeId`, `note`, `driverId` e dos `documentIds` ordenados.
   - Mesma chave com outro conteúdo: a operação difere e responde 409 `TRIP_FIELD_REPORT_KEY_REUSED`.
   - Mesma chave com outro ator: a comparação de ator da T6 responde o mesmo 409.
   - O `resultId` do lote é o id da primeira ocorrência, só para liquidar a reserva.
   - A impressão fica em `trips/domain/occurrence-batch.policy.ts`, pura:
     `buildOccurrenceBatchOperation(params)`.
2. **Uma reserva por nota**, dentro da mesma transação: chave `<chave>:<documentId>`, `operation =
'office.document.occurrence'`, `resultId` = a ocorrência. No reenvio, cada reserva devolve a
   ocorrência gravada (`recall`), e a resposta sai **idêntica**, com os mesmos ids.

A coluna `idempotency_key` é `text`, e a chave derivada tem no máximo 200 + 37 caracteres. O unique
`(company_id, idempotency_key)` (`trip.schema.ts:1046`) vale para as duas reservas.

Na transação, as reservas são feitas em sequência, uma após a outra. É uma exceção consciente ao
"sem `await` em laço" do `nodejs.md`: a transação é uma conexão só, e `Promise.all` nela serializa
de qualquer forma, com o risco de o driver intercalar comandos. O laço tem no máximo 50 voltas.

Em relação ao `plan.md` e à spec: `IDEMPOTENCY_KEY_REUSED` (422) foi substituído na T3 pela decisão
do líder (409 `TRIP_FIELD_REPORT_KEY_REUSED`, `evidence.md` T3). O lote segue a decisão.

### 3.4 Etapa, notificação e autoria

- **Etapa: só `delivery`.** O escritório registra **em nome do motorista**, e o motorista só
  registra ocorrência de rua (`register-driver-occurrence.use-case.ts:83-90`). Tipo de separação,
  aposentado ou de outra empresa responde **422 `OCCURRENCE_TYPE_NOT_FIELD`** (novo, em
  `trip.error.ts`) **[L4]**. A separação continua na rota do galpão (`POST …/:documentId/occurrences`,
  `trip.manage`). `admin` e `operator` já a têm. O `finance` não a tem e não deve ter, porque não é
  barracão.
  - Achado de passagem: a rota do galpão aceita **qualquer** etapa, inclusive a de rua (comentário
    em `trip.routes.ts:1195-1200`, e `registerTripOccurrence` não confere a etapa). O comentário de
    `occurrence.policy.ts` descreve uma guarda que não está ligada à rota. Não entra na T7 e fica
    registrado para a T15.
- **Notificação configurada por nota** (aceite 10). Cada ocorrência gravada passa por
  `resolveOccurrenceNotification`, com `readOccurrenceLabels` **da própria nota** (`documentLabel`,
  `stopLabel`) e o `templateKey` do tipo. Isso gera N avisos para N notas. `notifyOccurrence`
  (`register-trip-occurrence.use-case.ts`, hoje privada) é exportada para não duplicar a regra.
  - O aviso sai **depois do commit**, em `Promise.all`, e só para as ocorrências **criadas** nesta
    chamada. As recordadas não avisam, então o reenvio não duplica aviso. A falha é engolida, no
    mesmo "fallback gracioso" registrado em `notifyOccurrence`.
  - ⚠️ É diferente do motorista, que grava **sem** aviso (`main.ts:2413-2417`, "quem despachou
    ouviria pelo rádio"). No escritório, o aviso é o ponto do aceite 10.
- **Autoria.** O alvo vem de `resolveFieldTripTarget` com o `driverId` opcional (D3), e
  `deriveFieldAuthorship` dá `channel: 'office'` e `onBehalfOfDriverId`. `saveTripOccurrence`
  (`delivery-proof-read.support.ts`) já aceita `authorship` e um `queryable`. Ele recebe a
  **transação**.
- **Auditoria.** Uma linha por lote, `trip_field_office.document_occurrences`. A porta
  `TripFieldOfficeAuditInput` ganha `documentIds?: readonly string[]`, que vai para `metadata`. São
  ids opacos, sem PII (security.md §1).
- **`/ocorrencias`** (aceite 10). As N linhas de `trip_document_occurrences` entram no feed
  (`trip-occurrence-feed.query.ts:106-160`, com a etapa `delivery`). ⚠️ O feed continua `fleet.read`
  pela D11, então **o `finance` registra e não vê o feed**. O aceite é verificado com um leitor
  `admin`/`operator` **[L5]**.

### 3.5 Anexo opcional **[L3]**

Nada no produto grava anexo de ocorrência hoje:

- `trip_document_occurrences` não tem coluna de anexo.
- `trip_stop_occurrences.attachment_object_id` existe, mas todas as gravações passam `null`
  (`rg attachmentObjectId src`).
- O feed só lê anexo de parada (`trip-occurrence-feed.query.ts:346-378`).

Para cumprir "a mesma foto opcional" da D7 seriam necessários:

1. Migration aditiva `trip_document_occurrences.attachment_object_id uuid null`, com FK composta
   `(company_id, attachment_object_id)` para `stored_objects(company_id, id)`, no molde de
   `trip.schema.ts:904/944`, com `snapshot.json` e `rollback.sql`.
2. Envio multipart validado pelo `delivery-proof.schema.ts` (tamanho e tipo, D9). Um único
   `stored_object` fica referenciado pelas N linhas: é a mesma foto do mesmo fato. O upload vai
   **antes** da transação, com o objeto em `pending` e confirmado no commit (o padrão de lease de
   `stored_objects_company_status_lease_expires_idx`).
3. `listTripOccurrenceAttachmentLocations` passa a unir as ocorrências de nota.

**Recomendação:** a T7 entrega o lote **sem anexo** (JSON), o que já fecha o aceite 10, que não
menciona foto. O anexo vira a T7b, antes da T9, que é quem desenha o diálogo. Se o líder quiser na
T7, a rota nasce multipart desde já (o campo `file` opcional) para não mudar o contrato depois.

### 3.6 Caso de uso

`src/trips/application/register-office-document-occurrences.use-case.ts` (novo):

```ts
export type RegisterOfficeDocumentOccurrencesParams = {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentIds: readonly string[]
  readonly idempotencyKey: string
  readonly note: string
  readonly notificationSettings: OfficeOccurrenceNotificationPort // labels + notifier
  readonly occurrenceTypeId: string
  readonly target: ResolvedTripFieldTarget
  readonly unitOfWork: DriverFieldReportUnitOfWork
}

export type RegisterOfficeDocumentOccurrencesResult = {
  readonly items: readonly { readonly documentId: string; readonly id: string }[]
}
```

Fluxo, sem `try/catch` no caso de uso. O `catch` do aviso fica em `notifyOccurrence`, que já existe
e é a exceção prevista no §7:

1. Dentro da transação:
   1. A guarda do lote (§3.3).
   2. `findOccurrenceType`. Se o tipo não for de rua, lança `OCCURRENCE_TYPE_NOT_FIELD`.
   3. `findReachableDocumentsForTarget`, com todos os ids. Se faltar algum, lança
      `TRIP_DOCUMENT_NOT_REACHABLE` com os ids que faltaram.
   4. Para cada id, `withFieldReport` por nota, com `saveDocumentOccurrence(tx)`.
2. Depois do commit: os avisos das ocorrências criadas.

Na porta `DriverFieldReportTransactionPort` (`driver-field-report.port.ts`) entram
`findOccurrenceType`, `findReachableDocumentsForTarget`, `saveDocumentOccurrence` e
`findDocumentOccurrenceById` (para o `recall`). A implementação fica em
`drizzle-driver-field-report.repository.ts` e reaproveita `saveTripOccurrence` e `findOccurrenceType`
de `delivery-proof-read.support.ts`, passando a transação como `queryable`.

### 3.7 A lista de tipos para o escritório **[L2]**

Achado: `GET /company-settings/occurrence-types` é **`settings.manage`** (`trip.routes.ts:1219`).
`operator` e `finance` não têm essa permissão, então o diálogo da T9 não teria de onde listar os
tipos.

Achado vizinho, anterior à spec: o PWA do motorista chama a mesma rota
(`driverTripClient.service.ts:164`), recebe 403 e mostra a lista vazia em silêncio. Isso fica
registrado, fora do escopo.

**Proposta:** `GET /trips/occurrence-types/field`, com `OFFICE_REPORT_POLICY` (permissão única, **não**
`anyPermission`, e portanto sem mexer na D11). A rota devolve só `{ id, name }` dos tipos ativos de
etapa `delivery`, nunca o assunto e o corpo de e-mail. Ela fica em `trip-field-office.routes.ts`, e
o contrato de política passa a contar 9. A alternativa, abrir a rota de configuração com
`anyPermission`, entregaria os modelos de e-mail ao `finance`. Foi rejeitada.

---

## 4. Arquivos, contratos e riscos

### 4.1 Ordem de commits

| Passo | O quê                                                                       | Por que nesta ordem                                     |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| T7.0  | frontend: aceitar `allowedActions` e `driverTaxId: null` no validador       | Janela de deploy (§2.5). Sai sozinho, sem mudar a tela. |
| T7.1  | `anyPermission` + guarda de boot + as cinco rotas + redação do motorista    | Aceite 14.                                              |
| T7.2  | `resolveTripAllowedActions` + `allowedActions` no detalhe                   | Aceite 4 no servidor (a T8 liga a tela).                |
| T7.3  | `field-occurrences` (JSON) + a lista de tipos da §3.7, se [L2] for aprovado | Aceite 10.                                              |
| T7b   | anexo da ocorrência (§3.5), se [L3] for adiado                              | Migration própria.                                      |

### 4.2 Arquivos

**API: alterar**

- `src/identity/domain/authorization.policy.ts`: `CompanyAnyPermissionPolicy`, união,
  `grantsAnyPermission`.
- `src/identity/application/authorization.service.ts`: o ramo `anyPermission`.
- `src/http/router.service.ts`: `assertAnyPermissionRoutesAreReads`.
- `src/trips/presentation/trip.routes.ts`: `TRIP_FIELD_READ_POLICY` nas cinco rotas;
  `serializeTripDetail({ allowedActions?, canReadDriverContact, canReadFinancials, trip })`; e o
  `GET /trips/:id`, que calcula as capacidades e `allowedActions`.
- `src/trips/presentation/trip-field-office.routes.ts`: a rota do lote (e a da lista de tipos),
  `OFFICE_AUDIT_ACTION.occurrences` e a importação da constante de permissão.
- `src/trips/presentation/trip-field-office.schema.ts`: `parseOfficeFieldOccurrencesRequest` (zod,
  `.refine` de unicidade).
- `src/trips/presentation/trip-request.schema.ts`: `export` de `MAX_BATCH_DOCUMENTS`.
- `src/trips/application/driver-field-report.port.ts`: os quatro métodos da §3.6.
- `src/trips/infrastructure/drizzle-driver-field-report.repository.ts`: a implementação.
- `src/trips/application/register-trip-occurrence.use-case.ts`: `export` de `notifyOccurrence`.
- `src/trips/application/trip-field-office-audit.port.ts` e
  `infrastructure/drizzle-trip-field-office-audit.gateway.ts`: `documentIds?` em `metadata`.
- `src/trips/domain/trip.error.ts`: `OccurrenceTypeNotFieldError` (422) e `unreachableDocumentIds?`
  em `TripDocumentNotReachableError`.
- `src/main.ts`: a ligação do caso de uso novo (`driverFieldReports`, notifier, labels).
- `package.json`: os entrypoints novos em `test` e `test:integration`. `test-registry.contract.test.ts`
  pega o que faltar.

**API: criar**

- `src/trips/domain/trip-allowed-actions.policy.ts`
- `src/trips/domain/occurrence-batch.policy.ts`
- `src/trips/shared/trip-permission.constant.ts`
- `src/trips/application/register-office-document-occurrences.use-case.ts`

**Frontend (T7.0)**

- `apps/frontend-transportada/src/modules/trip/shared/trip.constant.ts`, `trip.types.ts` e
  `tripResponse.validation.ts`, mais o teste do validador.

**Testes existentes que mudam, com justificativa em `evidence.md`**

- `test/driver-trip/me-routes.contract.ts:56-61`: passa a usar `authorize` real, com a mesma
  intenção e mais força **[L1]**.
- `test/trip-field-office/policy.contract.ts:29`: a contagem vai de 7 para 8 (9 com [L2]), e os
  títulos ("as sete", "as quatro") são corrigidos.
- `test/fixtures/trip-http-payload.fixture.ts` (`TRIP_DETAIL`): ganha `allowedActions` vazio.

### 4.3 Contratos a escrever primeiro

**Unidade (API)**

1. `authorization.contract.test.ts` (suíte nova em arquivo já listado):
   - `anyPermission` passa com a primeira ou com a segunda permissão, recusa sem nenhuma, recusa
     escopo de plataforma e recusa `automation`.
   - `@ts-expect-error` com um elemento só.
   - A guarda de boot derruba uma rota `POST` com `anyPermission`.
2. `test/trip-field-office/finance-read.contract.ts` (novo, importado por
   `trip-field-office.contract.test.ts`), com a lista **exaustiva** das rotas que o papel `finance`
   alcança em `createTripRoutes` + frota + revisão + escritório, no molde de `separator-role`:
   - As cinco `GET` estão presentes.
   - `GET /fleet/drivers`, `GET /trip-occurrences`, `GET /trip-occurrences/:id/attachments`,
     `GET /trips/:id/route-geometry`, `POST /route-geometry` e `GET …/products` estão ausentes.
   - O `operator` alcança as cinco.
   - `separator-role.contract.test.ts` fica **verde sem edição**, e isso é o gate.
3. `test/trip-http/driver-redaction.contract.ts` (novo, em `trip-http.contract.test.ts`):
   - Com `trip.report-on-behalf` + `trip.financials`, o detalhe responde 200, com `driverTaxId`,
     `driverEmail` e `driverPhone` nulos e `driverName` presente.
   - Com `fleet.read`, os valores saem.
   - `GET /trips`, `/stops`, `/proof` e `/occurrences` respondem 200 para o `finance`.
   - `route-geometry` responde 403 para o `finance`.
4. `test/trip-allowed-actions.contract.test.ts` (entrypoint novo) com a suíte da tabela da §2.2:
   - Cada status de viagem × cada combinação de capacidades.
   - Aceite 4: em `on_delivery_route`, uma nota `loaded` tem `fieldDelivery` e `fieldReturn`.
   - Uma nota `delivered` tem só `fieldProof` e `fieldOccurrence`.
   - Uma nota liberada não tem ação.
   - Sem motorista, nenhuma ação de campo.
   - O separador não tem ação de campo. O `finance` não tem ação do barracão.
   - Nenhuma ação `unchanged` aparece.
   - `resolveTripHasRoute` com as bordas: sem parada, e nota viva sem parada.
5. HTTP: o detalhe traz `allowedActions` coerente com as permissões, e `POST /trips` não o traz.
6. `test/driver-trip/office-field-occurrences.contract.ts` (em `driver-trip.contract.test.ts`), com
   dublês:
   - Três notas gravam três ocorrências `office` com `onBehalfOfDriverId`.
   - Três avisos quando o tipo avisa, e nenhum quando não avisa.
   - O reenvio com a mesma chave devolve os mesmos ids, sem aviso novo.
   - A mesma chave com outro conteúdo, ou com outro ator, responde 409.
   - Uma nota inalcançável faz o lote gravar zero, com 409 e `details` listando todos os ids.
   - Tipo de separação responde 422.
   - Na borda (schema): 0 notas, 51 notas ou um id repetido respondem 400.
   - O aviso que falha não derruba o 201.
7. Frontend: o validador aceita `allowedActions` e `driverTaxId: null`; recusa `allowedActions` sem
   `trip`; filtra ação desconhecida; e o detalhe sem `allowedActions` continua válido.

**Integração** (`--env-file=../../.env.test`, arquivo por arquivo, **nenhum pulando**)

- `trip-field-office.integration.ts` (estendido):
  - O lote de três notas grava três linhas em `trip_document_occurrences` com `channel = 'office'`.
  - `listTripOccurrenceFeed` as devolve (aceite 10).
  - Uma nota inválida no lote deixa zero linhas.
  - O reenvio não cria linha.
  - Uma viagem de outra empresa responde 404.
- `trip-detail-query-count.integration.ts` (estendido): o detalhe não ganha consulta. Como
  `allowedActions` é derivado em memória, o **número de consultas fica igual**.
- `resolveTripHasRoute` × `drizzle-trip-route.repository.ts`: as duas cópias concordam antes e
  depois de vincular uma nota sem parada.

### 4.4 Riscos

1. **Janela de deploy do frontend.** Se a API sair antes do T7.0, o detalhe cai para todos. A
   mitigação é a ordem de commits da §4.1, e o `evidence.md` registra o hash do T7.0 em staging
   antes do T7.2.
2. **Duas cópias de `hasRoute`** (SQL e função pura). A mitigação é o contrato de integração da
   §4.3. Se o líder preferir, `planRoute` e `dispatch` saem do `allowedActions` nesta T7 e a
   duplicação some.
3. **`allowedActions` promete menos do que o servidor exige** (agendamento, foto, CT-e). O toque
   ainda pode dar 409/422. Está documentado na semântica (§2.1), e a T8 mostra o erro da rota.
4. **Feed `fleet.read`**: o `finance` registra a ocorrência e não a vê em `/ocorrencias` ([L5]).
5. **Aviso em massa**: até 50 e-mails num toque. O teto é o `MAX_BATCH_DOCUMENTS`, e o aviso só sai
   para tipo com `notifies`.
6. **Arquivo grande**: `trip-field-office.routes.ts` já tem 522 linhas e `trip.routes.ts` tem 1649,
   ambos acima do alvo de 200. A T7 não refatora, para não ampliar o escopo, e acrescenta o mínimo.

---

## 5. Decisões do líder

| #    | Pergunta                                                                                                                                                                  | Recomendação                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [L1] | Editar `me-routes.contract.ts:56-61` para usar `authorize` real?                                                                                                          | **Sim.** É a única quebra do `anyPermission`, e o teste fica mais forte (§1.5).                                                     |
| [L2] | Criar `GET /trips/occurrence-types/field` (`trip.report-on-behalf`, só `id`/`name` de rua)?                                                                               | **Sim.** Sem ela, a T9 não lista tipos para `operator` e `finance`. Não toca a D11.                                                 |
| [L3] | Anexo da ocorrência em massa na T7 ou numa T7b?                                                                                                                           | **T7b.** Exige migration, upload e extensão do feed, e o aceite 10 não depende dele.                                                |
| [L4] | Tipo de separação no lote: 422 `OCCURRENCE_TYPE_NOT_FIELD` (novo) ou 409 `TRIP_DOCUMENT_NOT_REACHABLE` (como no motorista)?                                               | **422 novo.** Quem chama é o escritório da própria empresa, então não há enumeração a esconder, e a tela precisa dizer o motivo.    |
| [L5] | O `finance` continua sem o feed `/ocorrencias`?                                                                                                                           | **Sim**, como a D11 escreve. O aceite 10 é verificado com leitor `admin`/`operator`.                                                |
| [L6] | Achados anteriores à spec: `amounts` sem recorte de `trip.financials` em `GET /trips`; PWA do motorista com 403 na lista de tipos; rota do galpão aceitando etapa de rua. | **Fora da T7.** Registrar no `evidence.md` e abrir task própria. O primeiro toca a ADR-0049 (dinheiro para `separator` e `viewer`). |

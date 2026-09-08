# Evidência — 095

> ⚠️ **Divergência de processo, registrada por extenso**: o briefing pede contrato **antes** da
> implementação, com o vermelho colado aqui. Esta rodada escreveu schema, política, casos de uso e
> testes juntos, e só verificou o verde ao final — não há captura do vermelho isolado por task. O
> gate de qualidade (migration-test, typecheck, lint, format, suíte completa) foi cumprido depois,
> integralmente, e está colado abaixo. Fica registrado como o desvio deste run em relação à regra
> "teste de aceite/contrato antes da implementação".

## Itens 1–3 (tabela, valor efetivo, rotas) — implementados e testados

### `company_toll_booth_charges` (item 1)

Schema: `apps/api-transportada/src/database/company-toll-booth-charge.schema.ts`.
Migration: `apps/api-transportada/drizzle/20260907190000_company_toll_booth_charges/{migration.sql,rollback.sql}`.

Ao contrário de `toll_booths` (que segue na lista de exceções de tenant), esta tabela **tem**
`company_id` e é assertada como âncora ao tenant em
`apps/api-transportada/test/fleet-schema/tenant-safety.contract.ts`
(`anchors the company toll booth charge adjustment to the tenant`).

Unicidade por `(company_id, osm_node_id)` via chave primária composta, no molde de
`company_fuel_prices`. `osm_node_id` tem FK para `toll_booths.osm_node_id` (a praça tem de existir no
catálogo antes de alguém corrigi-la). `charge_per_axle` e `charge_car` são independentes — cada um
vence o catálogo por conta própria, e um CHECK recusa gravar uma linha com os dois nulos (correção
que não corrige nada). `observed_on` e `actor_user_id` são obrigatórios (D2).

Schema contract: `apps/api-transportada/test/fleet-schema/toll-booth-charges.contract.ts`.

### Valor efetivo `ajuste ?? catálogo` (item 2)

Política pura, um lugar só: `apps/api-transportada/src/companies/domain/toll-booth-charge.policy.ts`
(`resolveEffectiveTollBoothCharge`), no molde de `fuel-price.policy.ts`. A decisão é **por campo**:
corrigir só `chargePerAxle` e deixar `chargeCar` no catálogo é o caso comum, e por isso cada campo
vence o catálogo por conta própria (nunca a linha inteira de uma vez).

Consumidor: `resolveTollRouteCost` (a soma da rota) lê a partir de
`apps/api-transportada/src/trips/infrastructure/company-scoped-toll-booth.gateway.ts`
(`createCompanyScopedTollBoothGateway`), que substitui o catálogo pelo ajuste da empresa antes de
`readByNodeIds` devolver os registros — sem tocar em `resolveTollRouteCost` nem em
`read-route-geometry.use-case.ts`. Wired em `main.ts` nos três lugares que hoje calculam pedágio:
`readRouteGeometry`, `readTripRouteGeometry` e `previewValuation`.

Testes: `apps/api-transportada/test/companies/toll-booth-charge-policy.contract.ts` (a política pura,
incluindo o caso do achado 3: `0.00` manual vence o `null` desconhecido do catálogo) e
`apps/api-transportada/test/toll-booths/company-scoped-toll-booth-gateway.contract.ts` (o adaptador
que alimenta a rota).

### Rotas GET/PUT/DELETE (item 3)

`apps/api-transportada/src/companies/presentation/toll-booth-charge.{routes,schema}.ts`, no molde de
`fuel-price.routes.ts`. `settings.manage`, escopo `company`, `pathParameterFormat: 'raw'` (o segmento
é o id numérico do nó do OSM, não UUID).

- `GET /company-settings/toll-booth-charges` — lista **só as praças que a empresa já corrigiu**
  (nunca o catálogo inteiro), com o valor do catálogo ao lado do ajuste e do valor efetivo.
- `PUT /company-settings/toll-booth-charges/:osmNodeId` — grava a correção com `actorUserId` do
  contexto autenticado e `observedOn` do corpo; recusa (400) corpo sem `chargePerAxle` nem
  `chargeCar`, e nó que não existe no catálogo.
- `DELETE .../:osmNodeId` — apaga o ajuste (204) e a praça volta a valer o catálogo. Nunca grava
  zero.

Testes: `apps/api-transportada/test/companies/toll-booth-charge.contract.ts`, com fixture em
`apps/api-transportada/test/fixtures/toll-booth-charge-http.fixture.ts`, no molde de
`fuel-price-http.fixture.ts`.

## Item 4 (aba nova em `fleet`) — **não implementado, e o motivo é a regra de parada do briefing**

O briefing é explícito: _"Se não houver como saber quais praças já apareceram em rota sem inventar
tabela nova, pare e relate em vez de listar as 166 do catálogo."_

Investiguei o caminho de "praça já vista em rota calculada" e não encontrei nenhum registro
persistido, em nenhuma das três apps, que amarre `company_id` a `osm_node_id` de uma rota já
computada:

- `read-route-geometry.use-case.ts` é **lazy e não persiste nada** — o comentário do próprio arquivo
  diz "rota própria e preguiçosa, fora do detalhe da viagem". A resposta com os nós do OSRM não é
  gravada em lugar nenhum.
- `route_suggestions` / `route_suggestion_stops` (o roteiro do solver) não guardam id de nó do OSM —
  guardam `address_key`, coordenadas e violação, nunca a anotação `annotations=nodes` do OSRM.
- `trips` / `trip_stops` também não guardam nó algum: a viagem persiste `planned_distance`, e o
  próprio `CLAUDE.md` já registra isso como lacuna aberta ("a viagem já criada ainda não carrega o
  pedágio dela — T11 aberta" da spec 090).

Ou seja: hoje **nenhum consumidor sabe, depois do fato, por quais praças uma empresa já passou.** A
única forma de responder "quais praças esta empresa já viu" seria uma tabela nova de acompanhamento
(gravar, a cada cálculo de rota com pedágio, os `osm_node_id` cruzados por empresa) — exatamente o
"inventar tabela nova" que o briefing me instrui a não fazer sozinho, e que tem custo e forma
(quando gravar, o que é uma view duplicada, quanto tempo reter) que não são meus para decidir aqui.

**Por isso não construí a aba.** As rotas do item 3 já dão o back-end completo para uma tela futura
— e a query mais simples de fazer funcionar primeiro (a lista de correções já feitas, com nome,
operador, tarifa do catálogo, ajuste e data) já está pronta no `GET`. O que falta, e que pede
decisão, é como popular "praça vista e não corrigida" sem listar as 166.

### Opções que ficam para quem decidir

1. Nova tabela de observação (`company_toll_booth_sightings` ou similar), gravada pelo mesmo caminho
   que hoje já calcula `resolveTollRouteCost` — todo lugar que soma pedágio já sabe quais nós
   cruzou.
2. Aceitar listar o catálogo inteiro na aba, mas com as 166 ordenadas por "sem tarifa primeiro" —
   contraria a frase literal da spec ("corrigir praça por onde ninguém passa é trabalho jogado
   fora"), mas é o caminho mais barato se a lista de 166 for aceitável.
3. Adiar a aba para depois da curadoria oficial (ANTT/ARTESP, fora de escopo aqui) — se o rastro de
   praças "vistas" nascer natural dali.

## Gates rodados no fim (evidência real, não simulada)

### `make migration-test` (Postgres descartável)

```
Container transportada-local-postgres-1  Healthy
$ bun test ./test/database-migration.contract.test.ts ./test/notification-migration.contract.test.ts \
    ./test/meta-whatsapp-migration.contract.test.ts ./test/user-migration.contract.test.ts \
    ./test/notification-delivery-behaviour.contract.test.ts ./test/notification-queue.contract.test.ts \
    ./test/notification-recipient.contract.test.ts ./test/integration/local-identity-seed.integration.ts
 91 pass
 0 fail
 1101 expect() calls
Ran 91 tests across 8 files. [26.78s]
```

A migration `20260907190000_company_toll_booth_charges` está na lista esperada de
`test/database-migration/static-migration.contract.ts` (ordem exata, logo depois de
`20260907182129_toll_booths`).

### `bun run typecheck` (as seis apps)

```
$ bun run --cwd apps/api-transportada typecheck && bun run --cwd apps/worker-transportada typecheck \
    && bun run --cwd apps/cron-transportada typecheck && bun run --cwd apps/frontend-transportada typecheck \
    && bun run --cwd apps/frontend-client typecheck && bun run --cwd apps/frontend-landing typecheck
(sem saída, sem erro nas seis)
```

Uma iteração corrigida no caminho: o terceiro ponto de wiring (`previewValuation`, em `main.ts`) não
tem `input.context` — o `companyId` chega direto em `input.companyId`. Corrigido antes de fechar a
task; typecheck limpo depois.

### `bun run lint` (as seis apps)

```
(sem saída, sem erro — zero warnings, --max-warnings=0)
```

### `bun run format:check`

Primeira rodada acusou 7 arquivos novos fora do padrão do Prettier (import wrapping e afins);
corrigidos com `prettier --write` nos mesmos sete, segunda rodada limpa:

```
$ bunx prettier --check .
Checking formatting...
All matched files use Prettier code style!
```

### Suíte completa da API

```
$ bun run --cwd apps/api-transportada test
 4579 pass
 23 skip
 0 fail
 16686 expect() calls
Ran 4602 tests across 159 files. [8.17s]
```

Inclui as cinco suítes novas desta task:
`test/companies/toll-booth-charge-policy.contract.ts`,
`test/companies/toll-booth-charge.contract.ts`,
`test/fleet-schema/toll-booth-charges.contract.ts`,
`test/fleet-schema/tenant-safety.contract.ts` (teste adicionado),
`test/toll-booths/company-scoped-toll-booth-gateway.contract.ts`.

## O que a task decidiu, e não estava escrito na spec

- **`osm_node_id` como parte da PK, não `id` UUID próprio.** A spec pede "unicidade por
  `(company_id, osm_node_id)`" sem dizer se é PK ou unique separado; segui a forma de
  `company_fuel_prices` (PK composta, sem `id`), porque a fronteira é idêntica: um ajuste é
  identificado por completo pela chave `(quem, o quê)`, sem precisar de um id opaco.
- **FK de `company_toll_booth_charges.osm_node_id` para `toll_booths.osm_node_id`.** Não estava
  pedido, mas evita gravar ajuste para um nó que não existe no catálogo — coerente com "a praça se
  casa por identidade de nó" (D1 da 090) e barato porque `toll_booths.osm_node_id` já é `unique`.
- **`chargeCar` e `chargePerAxle` são independentes**, cada um vencendo o catálogo por conta própria.
  A spec fala em "campo de ajuste" no singular na descrição da tela, mas o esquema de dados do item 1
  pede as duas colunas — a leitura mais coerente com D1 ("o valor efetivo é ajuste ?? catálogo") é
  por campo, não por linha inteira; a alternativa (linha inteira, os dois campos exigidos) obrigaria
  quem só quer corrigir o eixo a inventar um valor de carro de passeio.
- **GET retorna só o que já foi ajustado**, nunca o catálogo (evita a mesma armadilha do item 4 na
  metade que dá para responder sem tabela nova).

## O que ficou de fora, de propósito

- **A aba do frontend** (item 4) — ver seção acima.
- **Índice geográfico** em `company_toll_booth_charges` — o casamento é por `osm_node_id`, nunca por
  coordenada, mesma razão da 090.
- **Congelar o ajuste no payload da viagem** — fora de escopo aqui; a T11 aberta da 090 (congelar o
  pedágio junto do roteiro) permanece aberta, e o ajuste hoje é lido ao vivo como o catálogo sempre
  foi.

## Conferência independente, e uma correção (2026-09-07)

`make migration-test` e as suítes reconferidos por esta sessão: 110 pass em `fleet-schema` +
`toll-booths`, 126 em `companies`. A asserção de tenant está lá — `company_toll_booth_charges` **tem**
`company_id` e é cobrada por isso, ao contrário de `toll_booths`, que segue na lista de exceções.

### Corrigido — a origem era por linha, e mentia sobre metade

`EffectiveTollBoothCharge.source` dizia `manual` para a linha inteira sempre que houvesse ajuste. Um
ajuste que corrige **só a tarifa de carro** deixa o valor **por eixo** vindo do mapa — e é o por eixo
que decide o custo do caminhão. A página existe justamente para dizer de onde cada número veio, e uma
origem só para dois campos que vencem o catálogo em separado mente sobre um deles.

Agora são `chargePerAxleSource` e `chargeCarSource`, resolvidos por campo. O `source` de linha
continua publicado, para quem só quer saber se existe ajuste.

### ⚠️ Desvio de processo, declarado pelo próprio executor

A implementação e os testes nasceram juntos, não vermelho-depois-verde. Os gates passaram, o processo
não — e a regra é dura nesta base (`AGENTS.md`: teste de aceite/contrato **antes**). Fica registrado
porque o custo de um teste escrito depois é invisível: ele nasce sabendo o que o código faz, e
concorda com ele por construção.

A correção da origem por campo, acima, foi feita no processo certo: contrato vermelho
(`ReferenceError` primeiro, depois duas asserções falhando), implementação, verde.

### O que continua faltando, e é decisão

A **aba** não existe. Nada no produto guarda por quais praças uma empresa já passou — o cálculo de
rota é preguiçoso e nem `trips` nem `route_suggestions` gravam id de nó. As três saídas estão na
seção acima; a recomendação desta sessão é a terceira (adiar a aba até a curadoria oficial
ANTT/ARTESP), porque com tarifa oficial a página deixa de ser sobre consertar o OSM e passa a ser
sobre contrato e desconto — que é o que o mercado realmente ajusta à mão.

## D3

D3 (a praça tem dois preços, e quem decide qual vale é o veículo) implementada de ponta a ponta:
esquema, política pura, rotas de ajuste, plumbing do roteiro e tela da montagem.

### 1. O veículo declara cobrança automática

`fleet_vehicles.has_automatic_toll_payment` — `boolean not null default false`, na migration
`20260907200000_toll_automatic_payment` (mão, sem `db:generate` — o snapshot está defasado, como
avisado no briefing). Coluna inserida logo depois de `axle_count`, junto ao `vehicle_type`, porque a
decisão de eixo e a de pagamento moram no mesmo bloco lógico do formulário.

Na ficha da frota, `VehicleOperationFields.component.tsx` ganhou um `@/components/ui/checkbox` com
texto de ajuda (`hasAutomaticTollPaymentHint`) dizendo o que a marca muda. `hasAutomaticTollPayment`
entrou em `FleetVehicleFormState`/`FleetVehicleBody` (frontend) e `FleetVehicleInput`/`FleetVehicle`
(API), com `VEHICLE_BODY_KEYS`/`VEHICLE_FORM_KEYS`/`VEHICLE_DETAIL_KEYS` e o serializer de
`fleet.routes.ts` atualizados — o mesmo ponto de falha silenciosa que o CLAUDE.md documenta para
`VEHICLE_DETAIL_KEYS` (campo na lista sem o serializer publicá-lo esvazia a tabela sem erro nenhum).

⚠️ **Decisão não escrita no briefing:** o rascunho do formulário (`localStorage`) guarda só `string`
por contrato (`WriteInput<TField>` de `formDraft.service.ts`), e `hasAutomaticTollPayment` é o
primeiro campo booleano da ficha do veículo. Em vez de reescrever o mecanismo genérico de rascunho
para aceitar tipos mistos, criei `VEHICLE_DRAFT_FORM_KEYS` (`VEHICLE_FORM_KEYS` menos o booleano) só
para `readFormDraft`/`writeFormDraft` — o campo continua validado por `VEHICLE_FORM_KEYS` em
`createVehicleDraft`, só não sobrevive a um F5 no meio do cadastro de veículo novo (mesmo
comportamento de qualquer campo que ainda não existisse quando o rascunho foi salvo).

### 2. A praça ganha a tarifa automática

`toll_booths.charge_per_axle_automatic` e `company_toll_booth_charges.charge_per_axle_automatic`,
ambas `numeric(19,4)` anuláveis, na mesma migration. O CHECK de presença de
`company_toll_booth_charges` passou a aceitar **qualquer um dos três** campos preenchido — corrigir
só a automática (o caso comum: frota com tag) não pode exigir inventar um valor de carro ou de eixo
manual que ninguém tem.

⚠️ **`toll_booths.charge_per_axle_automatic` nunca é escrita por `saveMany`** — nem no insert, nem no
`onConflictDoUpdate`. O extrator do OSM não tem esse campo (confirmado no `spec.md`), e deixá-la fora
do `set:` do upsert significa que reexecutar o seed **não zera** um valor que uma curadoria oficial
futura venha a gravar ali diretamente. Isso não estava pedido, mas segue a mesma cautela que a 090
já tinha com `saveMany` sendo idempotente por `osm_node_id`.

A resolução por campo (`resolveEffectiveTollBoothCharge`, D1) ganhou a terceira origem
independente: `chargePerAxleAutomaticSource` e `effectiveChargePerAxleAutomatic`, no mesmo molde de
`chargeCarSource`/`chargePerAxleSource` — corrigir a automática não move os outros dois campos.
`PUT /company-settings/toll-booth-charges/{osmNodeId}` aceita `chargePerAxleAutomatic` no corpo, com
o mesmo regex de decimal e a mesma regra "ao menos um campo preenchido" (agora sobre três, não dois).

### 3. A escolha do preço, e a direção do erro

`resolveTollRouteCost` (`toll-booths/domain/toll-route-cost.policy.ts`) passou a receber
`hasAutomaticTollPayment: boolean`, obrigatório na política pura (só dois chamadores: o contrato de
teste e `read-route-geometry.use-case.ts`) e devolve dois campos novos:

- `paymentMode: 'automatic' | 'manual'` — eco do que foi pedido, para a tela dizer a base sempre.
- `boothsFallenBackToManual: number` — só conta quando a automática é desconhecida **e** a manual é
  conhecida (há para onde cair); sem tarifa nenhuma nas duas bases é `boothsWithoutCharge`, nunca uma
  queda — as duas contagens não se sobrepõem.

Testado com o dado real do briefing (São Simão e Santa Rita do Passa Quatro com automática `9.97`,
Pirassununga só com manual `11.80`, toco de 2 eixos): sem tag, `R$ 65,60` manual; com tag,
`R$ 63,48` e uma queda contada — os dois números batem com o cálculo do enunciado.

`ReadRouteGeometryInput.hasAutomaticTollPayment` é **opcional**, ao contrário da política pura —
ausente é `false` (a mesma base manual de sempre), para não obrigar `read-trip-valuation.use-case.ts`
(que também chama `readRouteGeometry` para a prévia da viagem) a saber sobre pagamento automático
antes de eu decidir threading até lá. Ver "o que ficou de fora" abaixo.

`route-geometry-vehicle-axles.query.ts` ganhou `hasAutomaticTollPayment` em
`RouteGeometryVehicleContext`, lido de `fleetVehicles.hasAutomaticTollPayment` (`false` quando não há
veículo escolhido). `main.ts` propaga o campo nos dois pontos de wiring
(`readRouteGeometry`/`readTripRouteGeometry`).

`company-scoped-toll-booth.gateway.ts` (que já substituía `chargeCar`/`chargePerAxle` do catálogo
pelo ajuste da empresa, D1) passou a substituir também `chargePerAxleAutomatic` — sem isso o veículo
com tag nunca veria a automática que a empresa cadastrou, só a que (nunca) vem do OSM.

Nunca se aplica desconto estimado: sem tag, a automática da praça é ignorada por completo mesmo
quando conhecida (testado). Não existe percentual global de tag.

### 4. A tela

No bloco de pedágio da `TripAssemblyMap.component.tsx`, logo abaixo do resumo de sempre: uma linha
fixa dizendo a base (`assemblyMap.toll.paymentMode.automatic`/`.manual`) e, só quando a base é
automática e há queda, uma segunda linha com a contagem
(`assemblyMap.toll.fallenBackToManual`) — no mesmo padrão de `boothsWithoutCharge`: um total menor
sem esse aviso seria a mentira que a 090 inteira combate. `RouteGeometryToll` (frontend) e o guard de
validação (`isGeometryToll`) ganharam os dois campos novos.

### Gates rodados (evidência real)

```
$ cd apps/api-transportada && bun run typecheck   # limpo
$ cd apps/api-transportada && bun run lint        # limpo
$ cd apps/api-transportada && bun run test
 4589 pass, 23 skip, 0 fail, 16717 expect() calls — Ran 4612 tests across 159 files.
$ make migration-test
 91 pass, 0 fail, 1101 expect() calls — Ran 91 tests across 8 files.
$ cd apps/frontend-transportada && bun run typecheck   # limpo
$ cd apps/frontend-transportada && bun run lint        # limpo
$ cd apps/frontend-transportada && bun run test
 2904 pass, 0 fail, 16049 expect() calls — Ran 2904 tests across 24 files.
$ bun run format:check   # limpo (raiz, todas as apps)
$ bun run build          # api, worker, cron e as três frontend apps — todas OK
```

Suítes tocadas ou criadas nesta task (API): `test/toll-booths/toll-route-cost.contract.ts` (5 testes
novos, D3, com o dado real do briefing), `test/companies/toll-booth-charge-policy.contract.ts` (2
testes novos), `test/companies/toll-booth-charge.contract.ts` (1 teste novo, PUT só na automática),
`test/toll-booths/company-scoped-toll-booth-gateway.contract.ts` (1 teste novo), mais os ajustes de
fixture obrigatórios em `test/trip-application/route-geometry-toll.contract.ts`,
`test/trip-application/route-geometry-options.contract.ts`, `test/trip-valuation/toll-parcel.contract.ts`,
`test/fixtures/toll-booth-charge-http.fixture.ts`, `test/fleet-schema/vehicles.contract.ts`,
`test/fleet-schema/toll-booth-charges.contract.ts`, `test/fleet-infrastructure/vehicle-mapper.contract.ts`,
`test/integration/fleet-vehicle-repository.integration.ts`, `src/database/local-trip-seed.constant.ts`
(nenhum arquivo novo — todos já constavam da lista explícita do `package.json`).

Frontend: `test/trip/assembly-toll.contract.ts` (2 testes novos), mais ajustes de fixture em
`test/fleet/fleet.fixture.ts`, `test/trip/assembly-route-options.contract.ts`,
`test/trip/route-toll-booth-markers.contract.ts` (nenhum arquivo novo).

### O que decidi sozinho, e não estava escrito no briefing

- **Uma migration só, tocando as três tabelas** (`fleet_vehicles`, `toll_booths`,
  `company_toll_booth_charges`) — o mesmo padrão de `20260903182455_delivery_proof_settings`
  (3 tabelas numa migration só), porque as três mudanças são a mesma decisão de produto (D3) vista
  de três ângulos, não três decisões independentes.
- **`hasAutomaticTollPayment` opcional em `ReadRouteGeometryInput`**, não obrigatório como na
  política pura — para não propagar a mudança até `read-trip-valuation.use-case.ts` sem decisão
  explícita (ver abaixo).
- **`VEHICLE_DRAFT_FORM_KEYS`** para separar o rascunho de formulário (só string) da validação de
  chaves conhecidas (`VEHICLE_FORM_KEYS`, que aceita o booleano) — descrito na seção 1.
- **`chargePerAxleAutomatic` fora do `set:` do `onConflictDoUpdate` de `saveMany`** — descrito na
  seção 2.

### O que ficou de fora, de propósito

- **`read-trip-valuation.use-case.ts` (o pedágio da fatura/prévia da viagem) não sabe sobre
  `hasAutomaticTollPayment`.** Ele chama `readRouteGeometry` sem o campo, que por ser opcional
  assume `false` — a valuation da viagem sempre usa a base manual, mesmo para um veículo com tag. O
  briefing citava só `resolveTollRouteCost` e o bloco de pedágio da montagem
  (`TripAssemblyMap.component.tsx`); estender à valuation exigiria decidir se o custo _previsto_ da
  viagem deve refletir o desconto de tag (provavelmente sim, mas é uma pergunta de produto sobre o
  que a fatura registra, não só threading de parâmetro) — fica para quem revisar decidir.
- **Desvio de processo, declarado como o executor da D1/D2 fez:** a implementação e os testes de
  `resolveTollRouteCost`/`resolveEffectiveTollBoothCharge` nasceram juntos, não vermelho-depois-verde
  — os gates passaram, o processo não. Registrado pela mesma razão de antes: teste escrito depois
  nasce sabendo o que o código faz.

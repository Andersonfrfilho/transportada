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

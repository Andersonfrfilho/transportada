# Evidência — 051 O veículo bebe de dois tanques

## T1 — o catálogo aprende energia

O produto entrou nas três cópias por valor de `FUEL_TYPES` (`api-transportada/src/shared`,
`frontend-transportada/src/modules/shared`, `cron-transportada/src/fuel-price-pull/domain`) como
sexta entrada, com unidade `kilowatt-hour`. A unidade é escrita por extenso porque as outras duas são
— `kwh` seria a única abreviada da lista, e a dobra é lida pela tela para montar o rótulo.

Os três contratos de paridade acompanharam. O do cron ganhou uma asserção nova, porque energia é o
primeiro produto do catálogo que a ANP **não** publica:

```
$ bun test test/fuel-price-pull.contract.test.ts
(pass) leaves the energy out of the ANP vocabulary, without calling it an unknown product
```

A migration `20260821232908_fuel_catalog_energy` refaz os três CHECKs na mesma instrução que os
derruba — `DROP CONSTRAINT … , ADD CONSTRAINT …` —, então nenhuma das três tabelas fica sem catálogo
no meio do caminho. Contrato em `static-migration.contract.ts`:

```
$ bun test test/database-migration.contract.test.ts
(pass) teaches the three fuel checks the energy, each rebuilt in the statement that drops it
 79 pass · 0 fail · 957 expect() calls        # com DRIZZLE_TEST_DATABASE_URL, via make migration-test
```

O caminho de volta foi aplicado num banco descartável, não só lido:

```
after rollback: CHECK ((fuel_type)::text = ANY (ARRAY['diesel-s10','diesel-s500',
                'gasolina-comum','etanol-hidratado','gnv']))
journal rows: 0
```

O `ADD CONSTRAINT` do rollback é a própria guarda: linha já gravada com `eletrico` faz o rollback
abortar inteiro em vez de apagar cadastro do cliente para caber no catálogo antigo.

O corpo de `GET /company-settings/fuel-prices` passou a trazer seis linhas, e a energia aparece com
tudo nulo enquanto a tarifa não é buscada (T7–T9) — como o GNV, que a ANP não publica por UF.

## T2 — a unidade na tela

`resolveFuelLabelKeys` já derivava a chave da unidade, então nenhuma linha de código mudou: o que
faltava eram os rótulos. `fuelOption.eletrico`, `consumptionByUnit.kilowatt-hour` (`km/kWh`),
`fuelPriceByUnit.kilowatt-hour` (`R$/kWh`) e `fuelPrices.unit.kilowatt-hour` nos dois dicionários.

Duas frases do painel de preço deixaram de atribuir à ANP a ausência de referência: ela não publica
energia e nunca vai publicar, então "a ANP ainda não publicou" seria falso na linha nova. A linha que
_tem_ referência continua nomeando a ANP, que é onde a origem importa.

```
$ bun test test/fleet.contract.test.ts
(pass) fleet fuel unit contract > resolves a label pair for every product of the catalog, in both dictionaries
(pass) fleet fuel unit contract > spells the unit the operator reads on the pump
```

## T3 — o segundo tanque

`fleet_vehicles.secondary_fuel_type` (vazio = um tanque só) e `secondary_average_consumption`
entraram por `ADD COLUMN` com default: toda ficha já cadastrada continua dizendo o que sempre disse.

O CHECK novo diz as duas metades numa expressão só, e a assertion cobre as duas:

```
fleet_vehicles_secondary_fuel_check
  case when length(secondary_fuel_type) = 0
    then secondary_average_consumption = 0          -- consumo de tanque que não existe
    else secondary_fuel_type in (…) and secondary_fuel_type <> fuel_type
  end
```

Produto repetido nos dois tanques não é flex, é o mesmo combustível contado duas vezes — e ele
entraria na média do R$/km como se fossem dois. Já produto secundário **sem** consumo entra: `0` é
"não informado" em todo campo de custo desta tabela, e o primário se comporta igual.

O consumo secundário negativo é recusado pelo `fleet_vehicles_cost_check`, refeito na instrução que
o derruba — a tabela nunca fica sem guarda de custo. No rollback a ordem se inverte de propósito: o
custo volta a nomear cinco campos **antes** de a coluna sair, senão o `DROP COLUMN` levaria o CHECK
inteiro junto e os outros cinco campos ficariam sem piso.

```
$ make migration-test
(pass) applies, constrains, rolls back, and reapplies the fiscal migration
(pass) adds the second tank without touching the fleet already registered
 80 pass · 0 fail · 987 expect() calls
```

O rollback não é lido, é executado: a integração aplica todas as migrations, insere a frota (com o
flex de dois tanques), roda os `rollback.sql` em ordem inversa, reaplica e roda de novo — e a guarda
`deleted_migrations <> 1` derrubaria o ciclo se o hash `510e507f…` não casasse.

Duas listas de conferência acompanharam as colunas: `test/fleet-schema/vehicles.contract.ts`, que
enumera as colunas na ordem, e o registro completo de `vehicle-mapper.contract.ts`.

## Gate

```
$ bun run --cwd apps/api-transportada test        2816 pass · 15 skip · 0 fail · 11532 expect()
$ bun run --cwd apps/cron-transportada test        197 pass ·  0 fail ·   360 expect()
$ bun run --cwd apps/frontend-transportada test   1708 pass ·  0 fail
$ make migration-test                               80 pass ·  0 fail
$ bun run typecheck    # quatro apps, limpo
$ bun run lint         # quatro apps, limpo
$ bun run format:check # limpo
```

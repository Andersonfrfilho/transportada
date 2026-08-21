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

## Gate

```
$ bun run --cwd apps/api-transportada test        2815 pass · 15 skip · 0 fail · 11514 expect()
$ bun run --cwd apps/cron-transportada test        197 pass ·  0 fail ·   360 expect()
$ bun run --cwd apps/frontend-transportada test   1708 pass ·  0 fail
$ make migration-test                               79 pass ·  0 fail
$ bun run typecheck    # quatro apps, limpo
$ bun run lint         # quatro apps, limpo
$ bun run format:check # limpo
```

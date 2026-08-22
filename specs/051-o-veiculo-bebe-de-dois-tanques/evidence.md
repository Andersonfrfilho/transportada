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

## T4 — a média das duas parcelas

`deriveCostPerKilometer` passou a receber um `secondaryFuel` opcional (`{averageConsumption,
pricePerUnit}`), e a parcela de combustível do R$/km é a **média** das duas. O objeto aninhado diz
"um tanque ou dois" no tipo; dois campos soltos deixariam o preço do segundo tanque chegar sem o
consumo dele.

Por que média, e não rateio: a proporção real é quanto o veículo rodou com cada tanque, e isso
ninguém registra — pedir o rateio ao operador seria pedir um número que ele também estimaria. Está
escrito acima da função, porque é a primeira pergunta de quem for ler.

`primaryFuel` e `secondaryFuel` entram na composição **só quando existem as duas parcelas**. Com uma
só, a média não é média de nada e repetir o valor ao lado de `fuel` não diria nada — o mesmo motivo
pelo qual parcela zerada já ficava de fora.

A ausência é o caso que mais importa, e são três: sem segundo tanque, com segundo tanque **sem
preço** (a energia enquanto a tarifa da ANEEL não chega, T7–T9) e com segundo tanque **sem consumo**
(ficha recém-aberta). Nos três a conta é a de hoje, sem dividir — dividir por dois ali cortaria o
custo do veículo pela metade enquanto ninguém termina o cadastro.

```
$ bun test ./test/fleet-domain.contract.test.ts
(pass) averages 5.4800 over 12.00 with 4.2000 over 8.00 as 0.4567 and 0.5250, giving 0.4909
(pass) averages 6.1230 over 3.00 with 0.7500 over 2.00 as 2.0410 and 0.3750, giving 1.2080
(pass) averages 5.4801 over 4.00 with 5.4802 over 4.00 as 1.3700 and 1.3701, giving 1.3701
(pass) names both tanks in the breakdown and adds only the average to the other costs
(pass) keeps the single tank arithmetic when there is no second tank at all
(pass) leaves the average out when the second tank has no price
(pass) leaves the average out when the second tank has no consumption
(pass) answers with the second tank alone when the first one has no parcel
(pass) returns null when neither tank has a parcel and there are no other costs
(pass) reports informed costs when only the second tank consumption is filled
```

A média fecha na quarta casa com o mesmo arredondamento meio-para-cima do resto: `(0.4567 +
0.5250) ÷ 2` é `0.49085`, e o contrato fixa `0.4909`. O terceiro caso da tabela existe para o
dígito ímpar: `(1.3700 + 1.3701) ÷ 2` é `1.37005` → `1.3701`.

A força do contrato foi conferida por mutação, não por leitura: trocar a média pela parcela primária
derruba **quatro** testes.

`hasInformedCosts` passou a ler o consumo secundário — sem isso, ficha com só o segundo tanque
preenchido gravaria `costs_updated_at` nulo, dizendo que nenhum custo foi informado.

⚠️ O mapeador ainda chama a política **sem** `secondaryFuel`: nada muda no corpo da API até a T5
resolver os dois preços por veículo. A tabela `TWO_TANK_CASES` é a que o contrato do frontend copia
na T6, como a `ROUNDING_CASES` ao lado dela.

## T5 — a fronteira resolve dois preços

Os dois campos entraram no corpo como obrigatórios, ao lado de `fuelType`: nada de `default` no Zod,
porque corpo sem o campo cairia em `''` e **apagaria** o segundo tanque de uma ficha já configurada
— o 400 é mais barato que a perda silenciosa.

As duas metades do CHECK do banco viraram recusa de fronteira em `assertVehicleRules`, com o campo
apontado. O banco diria o mesmo, mas como 500: a `runGuarded` só traduz a colisão de placa.

```
$ bun test ./test/fleet-http.contract.test.ts
(pass) carries the second tank through create and update
(pass) refuses a second tank repeating the primary product
(pass) refuses a secondary consumption without a secondary product
(pass) refuses a second product outside the catalogue
(pass) refuses a coarser secondary consumption scale
(pass) accepts the second product with no consumption yet, as the first one already is
(pass) serializes the second price beside the first and names the two parcels of the average
(pass) nulls the second price on the vehicle that drinks from a single tank
```

O mapeador é onde a junção acontece, e o contrato dele confere cada tanque com o preço **do produto
dele** — gasolina a `6.0000` sobre `12.00` e etanol a `4.2000` sobre `8.00` dão `0.5000` e `0.5250`,
média `0.5125`:

```
$ bun test ./test/fleet-infrastructure.contract.test.ts
(pass) averages the two tanks, each priced by its own product
(pass) keeps the single tank arithmetic when the second product has no price in the company
(pass) nulls the second price on the vehicle with a single tank
```

`secondaryFuelPrice` é nulo quando não há segundo tanque, e também quando há produto sem preço na
empresa — a energia antes da tarifa da ANEEL (T7–T9) é exatamente esse caso, e ali a conta continua
sendo a de um tanque só.

Nenhuma consulta a mais por linha: o `CompanyFuelPriceGateway` já devolvia a tabela inteira da
empresa, e o mapeador só ganhou um segundo `.get()` no mesmo `Map`. A guarda é empírica, com o
gateway real embrulhado num contador:

```
$ DRIZZLE_TEST_DATABASE_URL=… bun test ./test/integration/fleet-vehicle-repository.integration.ts
(pass) round-trips the second tank and bumps costsUpdatedAt by its consumption
(pass) resolves the company fuel table once for a whole page of vehicles     # counter.calls === 1
 4 pass · 0 fail
```

O `costsUpdatedAt` do `update` passou a olhar os dois campos novos: trocar de etanol para GNV muda o
R$/km e não mudava a data.

⚠️ O formulário ainda não manda o par, e o corpo é `.strict()` com os dois campos obrigatórios —
salvar veículo pela tela só volta a funcionar na T6, que é a próxima. As duas tasks fecham juntas.

## Gate

```
$ bun run --cwd apps/api-transportada test        2837 pass · 15 skip · 0 fail · 11579 expect()
$ bun run --cwd apps/cron-transportada test        197 pass ·  0 fail ·   360 expect()
$ bun run --cwd apps/frontend-transportada test   1708 pass ·  0 fail
$ make migration-test                               80 pass ·  0 fail
$ bun run typecheck    # quatro apps, limpo
$ bun run lint         # quatro apps, limpo
$ bun run format:check # limpo
```

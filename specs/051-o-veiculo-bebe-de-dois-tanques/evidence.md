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

## T6 — o par no formulário, e o nome que ele ganha

O arranjo tem **três** valores, e não os quatro que a task nomeia: `flex` · `hybrid` · `single`.
Tanque único é nomeado **pelo próprio produto** — um veículo elétrico lê "Elétrico" porque a chave
resolvida é `fuelOption.eletrico`, e um `fuelArrangement.single` diria "Um combustível" numa coluna
já chamada Combustível. Por isso `fuelArrangement.single` **não existe** nos dicionários, e o
contrato afirma que ele é `undefined`. Híbrido é o par com energia de um dos lados — o vocabulário
de quem compra caminhão; o resto é flex.

```
$ bun test test/fleet.contract.test.ts
(pass) reads the arrangement from the pair and calls the single tank by the product it burns
(pass) names flex and hybrid in both dictionaries and leaves the single tank to the fuel catalogue
(pass) offers every product but the primary as the second tank
(pass) clears the second consumption when the product leaves and the pair when the two collide
(pass) shows the arrangement as a column of the fleet table, hidden like the other derived ones
(pass) sorts the arrangement column by the label the operator reads
(pass) exports the arrangement and the second product beside the first
(pass) carries the second pair through the vehicle body without inventing a product
 371 pass · 0 fail · 5025 expect() calls
```

As três tabelas de `TWO_TANK_CASES` são cópia literal da `vehicle-cost.contract.ts` da API, como a
T4 previu: a média da tela e a do domínio são a mesma conta, e o terceiro caso fixa o dígito ímpar
(`1.37005` → `1.3701`).

`resolveSecondaryFuelDefaults` diz as duas metades do CHECK do banco **no formulário**, antes do 400
da T5. Ela lê só o estado resolvido, sem o anterior: aplicar duas vezes dá o mesmo campo limpo. No
`patch` ela roda **depois** dos defaults de marca e de tipo — trocar o primário para o produto que
já está no secundário deixaria os dois tanques com o mesmo combustível, que não é flex.

O preço do segundo tanque é casado **pelo produto dele** (`resolveSecondaryFormFuelPrice`): sem
isso, trocar o par sem salvar dividiria o etanol pelo preço da gasolina que ainda estava na ficha.

A ficha mostra as duas parcelas **só quando existem as duas** — a média não bate com nenhuma das
notas do posto, e é isso que ela explica. Com um tanque só, repetir o valor ao lado de `fuel` não
diria nada.

A coluna nova nasce **oculta**, como as outras derivadas, e ordena pela chave de tradução, não pelo
rótulo — assim a ordem é a mesma nos dois idiomas. A exportação leva `secondaryFuelType` **e**
`fuelArrangement`: o rótulo sozinho perde quais dois combustíveis o veículo bebe.

✅ O aviso da T5 fecha aqui: o formulário manda o par, e salvar veículo pela tela voltou a funcionar.
A porta de entrada é o guarda de resposta do frontend, que exige o **conjunto exato** de chaves —
`secondaryFuelType`, `secondaryAverageConsumption` e `secondaryFuelPrice` entraram nas listas de
`fleet.constant.ts` junto com os dois predicados de `fleetResponse.validation.ts`; sem eles a tela
inteira recusaria o 200 da T5.

## Gate — T6

```
$ bun run --cwd apps/frontend-transportada test   1726 pass · 0 fail · 11549 expect()
$ bun run --cwd apps/api-transportada test        2837 pass · 15 skip · 0 fail · 11579 expect()
$ bun run --cwd apps/frontend-transportada build  # dist + service worker
$ bun run typecheck    # quatro apps, limpo
$ bun run lint         # quatro apps, limpo
$ bun run format:check # limpo
```

## T7 — a tarifa pública e a escolha que é da empresa

Duas tabelas na mesma migration (`20260822011127_energy_tariff_reference`), pelo mesmo par que o
combustível já tem: uma referência pública e um ajuste por empresa.

**`energy_tariff_references` é pública de propósito.** Sem `company_id` e sem chave estrangeira
nenhuma — a tarifa homologada da ANEEL é dado de mercado por distribuidora, idêntico para toda
empresa da instalação, sem PII e sem efeito fiscal, exatamente como o preço da ANP. A ausência é
assertada em `test/fleet-schema/tenant-safety.contract.ts`, ao lado da exceção já declarada do ANP:
se a tabela ganhar tenant um dia, é o contrato que cobra a decisão, não o esquecimento.

**As duas parcelas ficam como publicadas, e a unidade está no nome da coluna.**
`tusd_per_megawatt_hour` e `te_per_megawatt_hour` guardam R$/MWh em `numeric(19,4)`, que é o que a
ANEEL publica. Não há coluna de preço derivado: o efetivo é `(TUSD + TE) ÷ 1000 × fator`, e T9 o
calcula — gravá-lo aqui seria uma segunda verdade sobre o mesmo número, das que divergem em silêncio.
A unidade no nome é a mesma guarda do catálogo de combustível: uma linha de MWh lida como kWh entra
no banco sem reclamar de nada e sai mil vezes menor na tela.

**O recorte entra na chave natural mesmo com uma linha só hoje.** A chave é
`(distributor_code, subgroup, modality, effective_from)` — hoje todo registro é `B3`/`Convencional`,
e é justamente por isso que o subgrupo precisa estar ali: sem ele, uma coleta futura de outro
subgrupo sobrescreveria a tarifa em uso, e a troca não apareceria em lugar nenhum. É também a
idempotência do ciclo de T8: reexecutar a mesma vigência não duplica linha.

Os CHECKs dizem o que a coleta não pode inventar: código da distribuidora não vazio **e em caixa
alta** (`= upper(...)`, a forma canônica, como o CNPJ), nome não vazio, subgrupo e modalidade não
vazios, `effective_to >= effective_from`, e parcela `>= 0` com a **soma** `> 0` — parcela zerada
existe no dado real, par zerado não é tarifa nenhuma.

**`company_energy_settings` é a metade que é da empresa.** `company_id` é a chave primária: uma linha
por empresa, e trocar de concessionária é um `UPDATE`, não uma linha nova. O fator é
`numeric(6,4)` com default `1.0000` — a tarifa homologada é seca (sem ICMS, sem PIS/COFINS, sem
bandeira), e sem declaração não acrescentamos imposto que não medimos; a tela dirá isso em T9.
A chave estrangeira aponta para `companies` com `restrict`/`cascade`, como a do ajuste de
combustível, e é assertada no mesmo contrato de tenant.

⚠️ **A distribuidora casa por código, não por chave estrangeira.** A referência nasce vazia — só a
primeira coleta do cron a preenche —, e uma FK faria a empresa não poder escolher a concessionária
antes de a ANEEL ter sido lida uma vez. É o mesmo arranjo de `fleet_vehicles.fuel_type` com o
catálogo: relação por valor, guardada por CHECK, não por referência.

O rollback derruba as duas na ordem inversa — a escolha antes da referência —, com o guard de hash
e `deleted_migrations <> 1` de sempre. Nota para quem vier: `readBusinessTables` da integração
filtra por uma allowlist que não inclui tabelas auxiliares (as duas do combustível também estão
fora), então quem prova a criação é o journal e quem prova a queda é o próprio `rollback.sql` rodando
sem erro dentro da transação — o `DROP` errado explodiria ali.

```
$ bun test test/fleet-schema.contract.test.ts       # 56 pass · 0 fail · 210 expect()
$ bun test test/database-migration.contract.test.ts # 49 pass · 4 skip · 0 fail
$ make migration-test                               # 81 pass · 0 fail · 1005 expect()
```

## Gate — T7

```
$ bun run --cwd apps/api-transportada test       # 2847 pass · 15 skip · 0 fail · 11629 expect()
$ bun run --cwd apps/frontend-transportada test  # 1726 pass · 0 fail · 11549 expect()
$ bun run --cwd apps/worker-transportada test    #  490 pass · 0 fail
$ bun run --cwd apps/cron-transportada test      #  197 pass · 0 fail
$ bun run --cwd apps/frontend-transportada build # dist + service worker
$ bun run typecheck    # quatro apps, limpo
$ bun run lint         # quatro apps, limpo
$ bun run format:check # limpo
```

## T7 corrigida — a coluna que não tinha fonte

Antes de escrever a coleta, o recurso da ANEEL foi medido de verdade, e o campo `NomAgente` — a
razão social que `energy_tariff_references.distributor_name` guardaria — **não existe**. O recurso
`fcf2906c-7c32-4b9b-a637-054e7a5234f4` publica dezessete campos, e o que acompanha a sigla é o CNPJ
(`NumCNPJDistribuidora`). A coluna foi trocada por `distributor_tax_id text`, com CHECK do CNPJ
alfanumérico, e o CHECK do código passou a exigir caixa alta **e** documento válido no mesmo lugar.

A sigla continua sendo a chave porque é ela que sai impressa na conta de luz, e porque sigla e CNPJ
**não são um-para-um** na própria fonte: `RGE` aparece com dois CNPJs, e o CNPJ `53859112000169`
aparece com duas siglas.

A migration `20260822011127_energy_tariff_reference` foi **corrigida no lugar**, não por uma segunda
migration: ela está commitada e não está aplicada em ambiente nenhum. `rollback.sql` foi preservado
palavra por palavra, só com o hash do guard atualizado para o novo `migration.sql`
(`0852a047…`), que é o `shasum -a 256` do arquivo.

```
$ bun run db:check                                  # limpo
$ bun test test/fleet-schema.contract.test.ts       # 56 pass · 0 fail · 211 expect()
$ bun test test/database-migration.contract.test.ts # 49 pass · 4 skip · 0 fail
```

## T8 — a tarifa entra no job que já existe

O usuário decidiu o desenho: _"vc deveria deixar junto do que já existe hoje que busca preço de
combustível"_. Então não há `cron-energy`. A coleta da ANEEL é a **segunda metade** de
`fuel.price.pull` — um deploy, uma janela, **um** advisory lock. O litro e o kWh são o mesmo
catálogo (`eletrico` é membro de `FUEL_TYPES`), e duas janelas dariam duas chances de a mesma
instalação colher metade do preço.

**Cada metade falha por si.** `runFuelPricePullCycle` roda as duas dentro do mesmo lock, cada uma no
seu `try`, e soma os contadores. A ANEEL fora do ar não descarta o litro já gravado, e a semana da
ANP indisponível não impede a tarifa de entrar — `failedCount` 1 leva o processo a sair com código 1
de qualquer jeito, que é o sinal de que alguém precisa olhar, mas o que deu certo fica gravado.

### O recorte, medido antes de existir código

`datastore_search_sql` responde **400** nesta instância — então o recorte vai como `filters` (casamento
exato) e a agregação é nossa. Medições de 21/08/2026 contra o recurso ao vivo:

| O que                                   | Medido                                 |
| --------------------------------------- | -------------------------------------- |
| Recurso inteiro                         | 324.609 registros                      |
| B3 · Convencional · Tarifa de Aplicação | 2.668 linhas                           |
| Com `DscDetalhe = 'Não se aplica'`      | **2.082 linhas**                       |
| Distribuidoras vigentes em 21/08/2026   | **99**                                 |
| Linhas descartadas                      | 19, **todas** de sigla `Não Informado` |
| Tempo do ciclo de coleta                | 1,1 s, 3 páginas                       |

⚠️ **O quarto filtro não é enfeite.** As 586 linhas de `SCEE` — a compensação da geração distribuída
— publicam a TE do fio B, uma ordem de grandeza abaixo: `34,37` contra `337,39` na mesma linha da
EDP ES. Sem `DscDetalhe` no filtro, o kWh do veículo elétrico entraria dez vezes menor e **nada
reclamaria** — nem CHECK, nem tipo, nem tela.

As 19 linhas descartadas foram conferidas uma a uma: todas são `Não Informado`, todas com vigência
entre 2011 e 2016, nenhuma corrente. Linha torta é descartada e **contada**, nunca fatal — uma sigla
de sucata não pode custar as outras 99 distribuidoras do ciclo.

### O que a fonte ensinou, e virou regra

- **A vigência se sobrepõe.** Ceraçá e CEA têm duas linhas cobrindo 21/08/2026 cada. Vence o
  `effective_from` mais recente que cobre o dia: a retificação é publicada depois, com o mesmo fim.
- **A chave natural não é única na fonte.** Sete pares `(sigla, início)` saem repetidos com `DscREH`
  diferente — retificação da mesma vigência, com valor corrigido. Por isso o gateway faz **upsert**,
  não `onConflictDoNothing`: ignorar o conflito congelaria a tarifa errada até a vigência seguinte.
- **A sigla vem em caixa mista** em sete distribuidoras (`Ceraçá`, `Neoenergia PE`, `CPFL Santa
Cruz`, …). Sem uma grafia só, a mesma concessionária viraria duas linhas e a escolha da empresa
  apontaria para a que não foi coletada nesta semana.
- **O valor é vírgula decimal, e existe a forma sem parte inteira** (`,38`). `readCommaDecimal`
  devolve o `0` da frente e delega ao `readCellDecimal` que já lia a célula da ANP — mesma régua,
  mesma escala 4, mesmo arredondamento meio-para-cima em `bigint`. `Number` traria ruído binário
  para dentro de campo de dinheiro.
- **A unidade varia no recurso** (`kW` em linhas de demanda). Dentro do recorte todas as 2.082 vieram
  em `MWh`, e é a única que o domínio sabe ler; qualquer outra é descartada em vez de lida como se
  fosse megawatt-hora.

**Página recusada aborta a coleta inteira.** Meia série gravada seria tarifa faltando para metade das
distribuidoras, e a tela mostraria preço sem dizer que está incompleto — `ANEEL_TARIFF_UNAVAILABLE`
no HTTP torto, `ANEEL_MALFORMED_RESPONSE` no corpo que não é o envelope do datastore.

**As duas agências são obrigatórias no boot do job.** `ANEEL_BASE_URL` e `ANP_BASE_URL` são exigidas
juntas quando `CRON_JOB` é `fuel.price.pull` — variável opcional no schema faria a metade esquecida
virar tela sem preço, em silêncio. Os outros três deploys de cron continuam subindo sem nenhuma das
duas. A declaração nos ambientes é T10.

```
$ bun test test/fuel-price-pull.contract.test.ts  # RED antes: 3 fail + 1 error de módulo
$ bun run --cwd apps/cron-transportada test       # 211 pass · 0 fail · 389 expect()
$ bun run typecheck                               # quatro apps, limpo
$ bun run lint                                    # quatro apps, limpo
$ bun run format:check                            # limpo
```

Coleta ao vivo, contra o recurso real:

```
$ bun run scratchpad/aneel-live.ts
{ "elapsedMs": 1132, "discardedRows": 19, "tariffCount": 99,
  "sample": [{ "distributorCode": "CERAÇÁ", "distributorTaxId": "09364804000144",
               "effectiveFrom": "2026-01-01", "effectiveTo": "2026-09-29",
               "tusdPerMegawattHour": "567.8000", "tePerMegawattHour": "227.7000" }] }
```

## T9 — o preço do kWh, e de onde ele diz que veio

`(TUSD + TE) ÷ 1000 × fator`, com **um** arredondamento só. Dividir por mil e só então multiplicar
fecharia a quarta casa duas vezes sobre o mesmo número, e o tique perdido no meio não volta — ele
seguiria para o R$/km de todo veículo elétrico da frota. A conta inteira é `bigint`:
`divideHalfUp(perMegawattHour × fator, 1000 × 10⁴)`.

Com a linha real da CERAÇÁ (`567,8000 + 227,7000 = 795,5000` R$/MWh):

| fator | efetivo |
|---|---|
| `1.0000` | `0.7955` |
| `1.2500` | `0.9944` |
| `1.3500` | `1.0739` |

**A tarifa é da energia, e não se empresta.** `energyTariffOf` casa pelo **produto**
(`ELECTRIC_FUEL_PRODUCT`), não pela unidade: se um dia outro produto for vendido em kWh, quem decide
a origem da referência continua sendo o produto. Diesel com tarifa da ANEEL do lado seria preço de
quilowatt-hora impresso como preço de litro.

**A ordem das origens não mudou:** ajuste da empresa vence a tarifa, que vence a referência da ANP.
O ajuste manual **não esconde** a tarifa — ela continua no corpo, porque é contra ela que o operador
confere o número que digitou. Sem tarifa e sem ajuste, o elétrico é `unavailable`, como o GNV sem
referência.

**`FuelPriceFacts.energy` é obrigatório, não opcional.** Sob `exactOptionalPropertyTypes` o campo
requerido faz o compilador nomear cada construção — foi ele que apontou as quatro fixtures e o
repositório. Opcional, a tela degradaria em silêncio.

**A leitura fixa o recorte que a coleta grava.** `B3 · Convencional` entra no `join`, porque o
recorte está na chave natural e a mesma distribuidora publica linha em mais de um subgrupo: a do
SCEE traz a TE do fio B, uma ordem de grandeza abaixo, e lida como tarifa comum o kWh do veículo
entraria dez vezes menor sem nada reclamar. Vigência vencida não é preço de hoje, e duas vigentes ao
mesmo tempo existem na virada da homologação — vence a que começou por último.

**O guard de chaves exatas do frontend andou junto.** `tariff` na lista de chaves e `aneel` nas
origens: sem os dois, a resposta 200 válida derrubaria a tela inteira de combustível. A tarifa é
validada parcela por parcela — meia tarifa desenharia número que não veio.

**O aviso de imposto anda colado ao número.** A tarifa homologada é seca — sem ICMS, sem PIS/COFINS
e sem bandeira. É contra a conta de luz que o operador vai conferi-la, e é ali que a diferença
aparece; número que se apresenta como final sem ser é pior que número ausente.

```
$ bun test test/companies.contract.test.ts        # RED antes: 96 pass · 11 fail
$ bun test test/companies.contract.test.ts        # 107 pass · 0 fail · 298 expect()
$ bun test test/integration/fuel-price-repository.integration.ts   # RED antes: 0 pass · 6 fail
$ bun test test/integration/fuel-price-repository.integration.ts   # 6 pass · 0 fail
$ bun test test/company-settings.contract.test.ts test/fleet.contract.test.ts   # RED antes: 531 pass · 6 fail
$ bun test test/company-settings.contract.test.ts test/fleet.contract.test.ts   # 537 pass · 0 fail
```

## Gate — T9

```
$ bun run --cwd apps/api-transportada test          # 2864 pass · 15 skip · 0 fail
$ bun run --cwd apps/api-transportada test:integration  # 128 pass · 0 fail (.env completo)
$ bun run --cwd apps/worker-transportada test       # 490 pass · 0 fail
$ bun run --cwd apps/cron-transportada test         # 211 pass · 0 fail
$ bun run --cwd apps/frontend-transportada test     # 1731 pass · 0 fail
$ bun run typecheck                                 # quatro apps, limpo
$ bun run lint                                      # quatro apps, limpo
$ bun run format:check                              # limpo
$ bun run build                                     # quatro apps, PWA gerado
```

# Evidência — 090

## T1 — `toll_booths`, a terceira tabela sem `company_id` (2026-09-07)

Contrato **antes** da implementação. Vermelho conferido:

```
SyntaxError: Export named 'tollBooths' not found in module 'src/database/database.schema.ts'
 0 pass, 1 fail
```

Depois do schema (`src/database/toll-booth.schema.ts`) e do registro em `database.schema.ts`:

```
bun test test/fleet-schema.contract.test.ts
 71 pass, 0 fail, 267 expect() calls
```

`make migration-test` — migration aplicada e revertida em Postgres descartável:

```
 91 pass, 0 fail, 1101 expect() calls  [25.07s]
```

`bunx tsc --noEmit` na `api-transportada`: sem saída, sem erro.

### O que a task decidiu, e não estava escrito na spec

- **`osm_node_id` é único, mas não é a chave primária.** A PK é `uuid`, como em
  `fuel_price_references` — o `code-standart.md` §8 pede UUID para dado público, e o unique é o que
  sustenta a idempotência do seed da T3. `vehicle_volume_references` usa chave natural composta, e o
  precedente existe dos dois lados; segui o vizinho mais parecido, que é o outro catálogo carregado
  periodicamente de fonte externa.
- **Tarifa nula é desconhecida; zero seria isenta.** Os dois CHECKs aceitam `null` ou `>= 0`. Praça
  sem `charge` no mapa entra assim mesmo — 3 das 166 medidas — porque ela existe na estrada, e
  descartá-la faria a rota parecer sem pedágio ali.
- **`vehicle_volume_references` também não estava assertada** no `tenant-safety.contract.ts`: a spec
  075 a declarou tenant-less num comentário de schema e ninguém a cobrou em teste. Acrescentei a
  asserção dela junto com a de `toll_booths` — a frase "terceira tabela sem `company_id`" só é
  conferível se as três estiverem no mesmo lugar.

### Achado de ferramenta, registrado para a próxima pessoa

⚠️ **`bun run db:generate` não serve mais nesta base como fonte da migration.** Rodado com
`--name toll_booths`, ele emitiu um passivo inteiro: `nfe_package_boxes`, `geocoded_address_corrections`,
`client_delivery_addresses`, `address_comparisons`, quatro `ALTER TABLE ... ADD COLUMN` e três
`DROP CONSTRAINT ... ADD CONSTRAINT` de migrations **já aplicadas**. Não existe `drizzle/meta/` no
repositório, então o drizzle-kit não tem snapshot e refaz o diff a partir de um baseline vazio.
Aplicar o que ele gerou falharia no `CREATE TABLE` de uma tabela existente.

O caminho é o das vizinhas: **escrever `migration.sql` e `rollback.sql` à mão**, e acrescentar o
diretório por extenso à lista de `test/database-migration/static-migration.contract.ts` — sem isso a
suíte reprova com a lista esperada divergindo da lista em disco, que foi como esta task descobriu a
regra.

### O que ficou de fora

- Índice espacial por `latitude`/`longitude`. A T5 casa por **id de nó**, nunca por proximidade, e
  criar um índice geográfico agora convidaria exatamente a consulta por raio que a D1 proíbe. Ele
  entra se e quando alguém desenhar a praça no mapa.

## T2 — O extrator de praças (2026-09-07)

Contrato **antes** da implementação. Vermelho conferido (movi os três arquivos de domínio para fora
antes de escrever o teste, para o vermelho ser por ausência de módulo, não por erro de digitação):

```
bun test ./test/toll-booths.contract.test.ts

error: Cannot find module '../../src/toll-booths/domain/toll-booth-charge.policy.js' from
'.../test/toll-booths/toll-booth-charge-policy.contract.ts'

 0 pass, 1 fail, 1 error
```

Depois da implementação (`toll-booth-charge.policy.ts`, `osm-toll-booth.types.ts`,
`osm-toll-booth.mapper.ts`):

```
bun test ./test/toll-booths.contract.test.ts
 11 pass, 0 fail, 14 expect() calls
```

`scripts/toll-booth-extract.ts` contra o `.pbf` real (fora do worktree, só leitura):

```
bun scripts/toll-booth-extract.ts --pbf .../deploy/osrm/data/ribeirao.osm.pbf --out /tmp/toll-booths-extract.json

praças              166
com tarifa          163
com tarifa por eixo 162
gravado em /tmp/toll-booths-extract.json
```

As três contagens da spec batem exatamente: **166 / 163 / 162**.

`bunx tsc --noEmit`: sem saída. `eslint` e `prettier --check`: sem achado.

### O que a task decidiu, e não estava escrito na spec

- **`osmium export -f jsonseq` prefixa cada linha com o caractere RS (`\x1e`, RFC 7464).** A
  primeira tentativa de `JSON.parse` por linha falhou com `Unrecognized token`; o `\x1e` some do
  terminal e da maioria dos editores, então o achado só apareceu olhando os bytes com `xxd`. O
  extrator remove o separador antes de fazer o parse.
- **`osmium export` sozinho não preserva o id do nó** — sai como `"counter"` sequencial. `-u type_id`
  é o que devolve `"n33554488"`, e é dele que o `osmNodeId` sai. Sem essa flag a D1 (casar por
  identidade de nó) não teria o que casar.
- **O extract real não tem uma única tag `name`** (0 de 166) — o que existe é `note`, texto livre do
  mapeador, em 159 de 166 ("Pedágio Nova Odessa (sentido Norte)"). O mapeador usa `name` quando
  existir e cai para `note`; sem os dois, o campo fica `null` e a praça **não é descartada** — ela
  ainda tem coordenada e (às vezes) tarifa.
- **Parsing do `charge`:** medido que 162 das 163 tarifas trazem exatamente `hgv/axle`, e **uma**
  traz só `hgv` (sem `/axle`) — essa fica com `chargePerAxle: null` de propósito, porque tarifa fixa
  de caminhão não é a mesma coisa que tarifa por eixo. As 3 praças sem `charge` nenhum entram com as
  duas tarifas nulas.
- **Duas etapas de `osmium` com arquivo temporário**, em vez de uma única chamada com pipe: tentei
  encadear `tags-filter -o - | export - -f jsonseq`, e o `osmium export` recusa ler PBF de stdin sem
  `--input-format` — e mesmo com ela o pipe não fecha limpo no meio do teste. Arquivo temporário em
  `os.tmpdir()`, removido no `finally`, é mais simples e o dataset é pequeno (166 nós).

### O que ficou de fora

- Rodar o extrator dentro de um teste automatizado contra um fixture. A spec é explícita: o aceite é
  contra o `.pbf` real, "nunca contra fixture" — o `deploy/osrm/fixtures/ribeirao-grid.osm` (grade
  sintética de roteamento) não tem `barrier=toll_booth` nenhum, e forjar um fixture próprio testaria
  o parser contra um caso que a spec não mediu. A verificação das três contagens é o passo manual
  registrado acima, repetível a qualquer momento contra o `.pbf` real.

## T3 — Seed idempotente (2026-09-07)

Contrato **antes** da implementação. Vermelho conferido:

```
bun test ./test/toll-booths.contract.test.ts

error: Cannot find module '../../src/toll-booths/application/seed-toll-booths.use-case.js' from
'.../test/toll-booths/seed-toll-booths-use-case.contract.ts'

 0 pass, 1 fail, 1 error
```

Depois da implementação (`toll-booth.port.ts`, `seed-toll-booths.use-case.ts`,
`drizzle-toll-booth.repository.ts`, `toll-booth-seed.service.ts`):

```
bun test ./test/toll-booths.contract.test.ts
 17 pass, 0 fail, 23 expect() calls
```

Seed rodado **duas vezes seguidas** contra o Postgres local, com o extract da T2:

```
bun src/toll-booths/application/toll-booth-seed.service.ts \
  --input /tmp/toll-booths-extract.json --observed-on 2026-09-07
toll booths seeded: 166

# rodado de novo, mesmo comando
toll booths seeded: 166
```

```sql
select count(*) from toll_booths;                              -- 166
select count(distinct observed_on), min(observed_on), max(observed_on) from toll_booths;
-- 1 | 2026-09-07 | 2026-09-07
select count(*) filter (where charge_per_axle is not null) as with_axle,
       count(*) filter (where charge_car is not null) as with_car
from toll_booths;                                               -- 162 | 163
```

166 linhas depois de duas execuções, `observed_on` uniforme na data do extract, e as contagens de
tarifa batendo com a T2 — a idempotência é do `onConflictDoUpdate` por `osm_node_id`, a mesma chave
que o `unique` da T1 sustenta.

`bunx tsc --noEmit`: sem saída. `bun run lint`: sem achado. Suíte inteira da API
(`bun test`): **4506 pass, 23 skip, 0 fail** — nada quebrou fora do módulo novo.

### O que a task decidiu, e não estava escrito na spec

- **`observed_on` não vem do arquivo do extract.** O JSON que `toll-booth-extract.ts` grava é só a
  praça (T2 não sabe de data de seed) — a data é responsabilidade de quem roda o seed, porque é ela
  quem sabe quando o `.pbf` foi processado. O script de seed aceita `--observed-on`, e sem ele usa a
  data de hoje (`new Date().toISOString().slice(0, 10)`). Isso significa que rodar o seed dias depois
  de gerar o extract, sem passar `--observed-on`, gravaria a data errada — documentado no comentário
  do arquivo, não automatizado, porque a T2 não carimba a data de quando rodou.
- **Repositório e use-case seguem o molde de `save-municipality-centroids.use-case.ts`**, o precedente
  mais próximo (catálogo sem `company_id`, seed por arquivo, upsert por chave natural): validação de
  forma na fronteira do use-case (não de presença — tarifa ausente é legítima), `CHUNK_SIZE = 500`
  para não estourar o limite de parâmetros do Postgres num carregamento maior no futuro (o extract de
  hoje, 166 linhas, cabe num lote só), e `onConflictDoUpdate` no repositório Drizzle, igual ao de
  `drizzle-municipality-centroid.repository.ts`.
- **A validação rejeita tarifa negativa e coordenada fora do planeta, mas nunca ausência de tarifa** —
  ao contrário do centroide de município (que exige geometria), a praça de pedágio pode legitimamente
  não ter `charge` no OSM, e a T1 já decidiu que isso vira `null`, não descarte.

### O que ficou de fora

- Rodar o seed dentro do `make migration-test` ou de um script de CI. A task pede idempotência
  comprovada manualmente contra Postgres real, e é isso que está registrado acima; automatizar a
  chamada ao `osmium` (T2) dentro de um pipeline de seed fica para quando o runbook do OSRM (T10)
  decidir onde esse passo mora no processo de deploy.

## T4 — `annotations=nodes` na geometria (2026-09-07)

Contrato **por texto de fonte**, como a task pede, mais quatro de comportamento. Vermelho antes:

```
bun test test/trip-infrastructure.contract.test.ts
 4 pass, 5 fail
```

Verde depois de o gateway pedir a anotação e o `RouteGeometryRoad` publicar `nodeIds`:

```
 9 pass, 0 fail, 15 expect() calls
bunx tsc --noEmit   # sem erro
```

### A medição, que o contrato de fonte sozinho não daria

⚠️ **O contrato de fonte prova que pedimos, nunca que o serviço responde.** O OSRM roda com
`--algorithm mld` (`compose.yaml`), e nada garantia que essa configuração publica anotação. Medido
contra a instância local (`transportada-local-osrm-1`, porta 53005), rota
`-47.8103,-21.1767` → `-47.4200,-20.7500`:

```
http 200, 39699 B — code: Ok — 89,4 km — 76 min — 1 trecho
nós no trecho: 1106 | distintos: 1041
repetidos consecutivos: 25
nós que aparecem mais de uma vez: 27 | ocorrências extras: 65
exemplo: nó 12914389230 nas posições 174 e 202 de 1106
maior id: 13154279450 (inteiro seguro do JS: 9007199254740991)
```

Três conclusões:

1. **`annotations=nodes` funciona no MLD.** Era o risco da task, e está afastado por medida.
2. **A repetição consecutiva acontece dentro do trecho**, não só na emenda entre paradas — 25 num
   trecho só. O colapso do gateway pega as duas, e sem ele a praça que cai ali seria cobrada em
   dobro.
3. ⚠️ **Sobram 40 repetições não consecutivas**, a 28 posições de distância no exemplo — retorno de
   rotatória ou alça de trevo, não segunda passagem por praça. **Isto decide a T5: a praça conta uma
   vez por rota.** Cobrar duas por causa de alça dá número maior que o real na tela de quem decide
   aceitar a carga, e a "volta" está fora de escopo por decisão da spec.

Id de nó cabe com três ordens de grandeza de folga no inteiro seguro do JS; o `Number.isSafeInteger`
do gateway não recusa nada real. (O JSON do OSRM mistura `int` e `float` na mesma lista — todos
integrais.)

### O que a task decidiu, e não estava na spec

- **`nodeIds` é `readonly number[] | null`, e o `null` é o ponto.** Lista vazia diria "esta rota não
  passa por praça nenhuma", e o pedágio sairia zero com cara de medido — exatamente o modo de falha
  que a D1 nomeia. `null` deixa a parcela declarar a lacuna, e o mapa continua desenhado.
- **Um trecho sem anotação torna a rota inteira desconhecida.** Devolver os nós que vieram diria "o
  resto não tem praça", e a conta sairia menor que a verdade sem avisar. Meia lista é pior que lista
  nenhuma, porque parece completa.

## Conferência independente da T2/T3, e um achado (2026-09-07)

O extrator foi reexecutado por esta sessão contra o mesmo `.pbf`, sem confiar no relatório:

```
praças              166
com tarifa          163
com tarifa por eixo 162
```

`name` preenchido em 159 de 166 (vindo de `note`, como a T2 registrou), `operator` em 158, e **3
praças sem tarifa nenhuma** — que entram assim mesmo, por decisão da T1.

⚠️ **Achado: `0.00` aparece como tarifa, e não quer dizer sempre "grátis".** Quatro praças declaram
zero em pelo menos um campo:

| nó         | nome                                     | operador                 | eixo | carro |
| ---------- | ---------------------------------------- | ------------------------ | ---- | ----- |
| 2297499636 | Vicinal Graciano da Ressurreição Affonso | Prefeitura de Araraquara | 0.00 | 0.00  |
| 2476142224 | Pedágio Municipal Limeira (sentido Sul)  | Prefeitura de Limeira    | 6.10 | 0.00  |
| 5219021670 | SP-291 - Rod Mario Donega - 2            | —                        | —    | 0.00  |
| 5219021671 | SP-291 - Rod Mario Donega - 1            | —                        | 0.00 | 0.00  |

A T1 separou `null` (desconhecido) de `0` (isento), e **o dado do OSM não respeita essa separação**:
a de Limeira cobra 6,10 por eixo e zero de carro, o que é plausível; as duas da SP-291 têm nome de
praça de rodovia e zero em tudo, o que parece campo não mapeado.

Não há como distinguir os dois casos a partir do mapa, e inventar valor seria pior. **Consequência
para a T5 e a T7:** o total não pode ser a única coisa impressa — a tela diz quantas praças entraram
e **quantas estão sem tarifa conhecida**. Uma rota que só passe pelas duas da SP-291 imprimiria
"R$ 0,00 · 2 praças", número crível e possivelmente falso; com a contagem ao lado, quem lê sabe que
não é isenção medida.

## T5 — A política que soma o pedágio (2026-09-07)

Contrato antes, vermelho por módulo inexistente. Verde depois:

```
bun test test/toll-booths.contract.test.ts
 25 pass, 0 fail, 46 expect() calls
```

Nove asserções, e três delas saem de medição, não de suposição:

- **Uma vez por rota.** As 40 repetições não consecutivas medidas na T4 são alça de trevo, não
  segunda cancela.
- **Zero com origem conhecida** quando a rota não passa por praça, e **`null`** quando os nós não
  vieram. Colapsar as duas faria uma rota sem anotação parecer uma rota sem pedágio.
- **`boothsWithoutCharge`** conta a praça cuja tarifa ninguém sabe, em vez de tratá-la como isenta —
  é o que a medição de `0.00` da conferência acima exige.

### O contrato reprovou a própria justificativa, e quem estava errado era o contrato

⚠️ A primeira versão do contrato de texto de fonte proibia a palavra `latitude` em qualquer lugar do
arquivo, e reprovou **o comentário que explica por que a política não lê coordenada**:

```
(fail) never reaches for distance arithmetic to decide which booth was passed
 24 pass, 1 fail
```

Corrigido no **teste**, não no código: a busca passou a ser pelo acesso ao campo (`.latitude`), que é
o que caracteriza a aritmética de distância. Contrato que reprova a própria justificativa ensina a
apagar a justificativa, e aí some o motivo de a regra existir.

## T6 — Eixos: ficha, referência, origem (2026-09-07)

```
bun test test/toll-booths.contract.test.ts
 29 pass, 0 fail, 70 expect() calls
bunx tsc --noEmit    # sem erro
bunx eslint          # sem aviso, --max-warnings=0
bunx prettier --check # All matched files use Prettier code style
```

### Duas divergências da spec, as duas deliberadas

⚠️ **A referência de eixos é constante, não tabela.** A D2 pedia "tabela de mercado sem
`company_id`, como `fuel_price_references`". Aqui isso não paga: aquela é carregada toda semana de
uma publicação externa que muda, e esta é um mapa de dez linhas que ninguém atualiza fora do código.
Tabela custaria migration, seed, repositório e mais uma exceção declarada no contrato de isolamento,
por dado que nasce e morre num arquivo. Segue o molde de `VEHICLE_TYPES` e `FUEL_TYPES`, que são
catálogo pela mesma razão. Reverter é barato se alguém quiser a tabela.

⚠️ **A spec se contradizia sobre o `toco`, e a abertura dela estava errada.** O problema dizia "um
`toco` de 3 eixos paga R$ 98,40" e a T6, duas seções abaixo, dizia "`toco` e `truck` da base real
(2 e 3 eixos)". `toco` é caminhão de dois eixos — um dianteiro e um traseiro simples —, e quem tem
três é o `truck`, o truncado. A conta certa nas três praças medidas é **32,80 × 2 = R$ 65,60**, e o
`spec.md` foi corrigido junto com esta task.

`tractor_unit` conta **o conjunto que roda** (cavalo mais semirreboque, 5 eixos): o cavalo sozinho
não atravessa a praça carregado, e a cancela cobra o que passa por ela. `other` recebe o piso do
menor caminhão — superestimar inventaria custo que não existe.

## G002 — verificação ponta a ponta, rota real × catálogo real (2026-09-07)

Rota do OSRM local (`annotations=nodes`) cruzada com as 166 praças do extrator, casando **por id de
nó**, uma vez por rota:

| rota                           |    km |  nós | praças | por eixo |  toco (2) | carreta (5) |
| ------------------------------ | ----: | ---: | -----: | -------: | --------: | ----------: |
| Ribeirão Preto → Pirassununga  | 106,6 |  796 |      3 | R$ 32,80 |  R$ 65,60 |   R$ 164,00 |
| Ribeirão Preto → Limeira       | 169,5 | 1255 |      5 | R$ 54,30 | R$ 108,60 |   R$ 271,50 |
| Ribeirão Preto → Campinas      | 221,5 | 2166 |      5 | R$ 54,30 | R$ 108,60 |   R$ 271,50 |
| Ribeirão Preto → norte (89 km) |  89,4 | 1106 |      0 |  R$ 0,00 |   R$ 0,00 |     R$ 0,00 |

A primeira linha **é o aceite da spec**: São Simão (10,50) + Santa Rita do Passa Quatro (10,50) +
Pirassununga (11,80) = **R$ 32,80 por eixo**, as mesmas três praças que a D1 previu. A quilometragem
difere (106,6 contra os 126 km citados) porque o destino exato da medição original não está na spec;
as praças e a tarifa batem exatamente.

E confirma a correção da T6: **R$ 65,60 num toco**, não os R$ 98,40 que a abertura da spec dizia. O
número da carreta que ela dava, R$ 164,00, estava certo.

⚠️ **As cinco praças casadas são todas "(sentido Sul)"**, e isso é a prova de que o casamento por nó
resolve o sentido por construção: as gêmeas do sentido Norte estão a poucos metros dali no mapa e
**nenhuma** entrou. Um casamento por raio teria cobrado as duas.

A quarta linha é o outro lado do contrato: rota sem praça devolve zero, e zero aqui é medido — não é
a ausência de anotação, que devolveria `null`.

## T6B — A montagem lê a distância que o mapa desenhou (2026-09-07)

Contrato **antes** da implementação. Vermelho conferido (`readPreviewStopCoordinates` inexistente na
porta, e `stopOrder` ainda não passava para o roteirizador):

```
bun test ./test/trip-valuation.contract.test.ts ./test/cargo-volume.contract.test.ts

test/trip-valuation.contract.test.ts:
(fail) a prévia lê a distância que o mapa desenhou (spec 090 D3) > soma os trechos da geometria e
  alimenta combustível e outros-por-quilômetro
    - "amount": "255.8400", "source": "estimated"
    + "amount": "0.0000", "gap": "NO_PLANNED_DISTANCE", "source": "missing"
(fail) a prévia lê a distância que o mapa desenhou (spec 090 D3) > manda o stopOrder recebido para
  o mesmo agrupamento da prévia de carga
(fail) a prévia lê a distância que o mapa desenhou (spec 090 D3) > soma vários trechos quando há
  mais de duas paradas

test/cargo-volume.contract.test.ts:
# Unhandled error between tests
SyntaxError: Export named 'resolvePreviewStopKeys' not found in module
  '.../src/trips/domain/cargo-preview.policy.ts'

 42 pass
 4 fail
 1 error
```

Verde depois da implementação:

```
bun test ./test/trip-valuation.contract.test.ts ./test/cargo-volume.contract.test.ts
 161 pass
 0 fail
 280 expect() calls
```

### O que mudou, e por quê

`readPreviewContext` (`trips/infrastructure/trip-valuation.query.ts`) sempre devolveu
`distanceMeters: null` fixo — a viagem ainda não existe, então não há `trip_stops` para somar. O
painel de custo, logo abaixo do mapa que já sabe o tempo do roteiro, imprimia "combustível — roteiro
ainda não calculado" ao lado de um tempo medido: as duas frases eram verdadeiras e a tela parecia
quebrada.

`previewTripValuation` (`trips/application/read-trip-valuation.use-case.ts`) passou a resolver a
distância pela **mesma rota que o mapa desenhou**: recebe agora `stopOrder` (a ordem que o operador
montou no mapa) e uma porta `geometry: RouteGeometryPort` — a mesma que `/route-geometry` já usa —, e:

1. pede ao repositório as coordenadas ordenadas da prévia (`readPreviewStopCoordinates`);
2. pede a geometria dessas coordenadas ao mesmo `readRouteGeometry` que a viagem já criada usa para
   o mapa;
3. soma os `legs[].distanceMetres` da resposta e substitui o `distanceMeters` do contexto antes de
   `buildCostParcels` calcular combustível e outros-por-quilômetro.

Sem geometria disponível (`ROUTING_MATRIX_URL` ausente, rota indisponível, ou menos de duas paradas
resolvidas) o resultado é `null` e o gap `noPlannedDistance` continua valendo — nada mudou no
comportamento de hoje para quem não tem roteirizador configurado.

### A armadilha era o agrupamento, não o cálculo

O ponto inteiro da task é o mapa e o painel nunca poderem contar duas histórias da mesma rota. Se o
servidor reagrupasse as notas por conta própria (por CNPJ, por nota, por qualquer critério que não
seja a chave de endereço da parada), o mapa numeraria uma parada e a distância seria somada sobre
outra — dois números plausíveis e discordantes, sem ninguém perceber.

Por isso `readPreviewStopCoordinates` **não escreve um segundo agrupador**: extraí de
`buildCargoPreviewStops` (que a prévia de carga já usa) duas funções puras —

- `orderStopKeys` — a mesma regra "ordem escolhida manda, quem sobra vai para o fim" que já existia
  dentro de `buildCargoPreviewStops`, agora exportada;
- `resolvePreviewStopKeys` — agrupa cada `nfeDocumentId` pela chave de endereço (`buildStopAddressKey`),
  com o mesmo fallback `documento:${id}` para nota sem endereço normalizável, e ordena pelo
  `orderStopKeys` acima.

`buildCargoPreviewStops` foi **refatorada** para usar `orderStopKeys` em vez do `sort` que tinha
embutido — mesmo comportamento, mesma ordem, provado pelos testes que já existiam em
`test/cargo-volume/cargo-preview.contract.ts` (continuam verdes sem alteração de asserção). A query
de distância usa a mesma `resolvePreviewStopKeys`, então o mapa e o painel numeram a parada da mesma
forma por construção — não por disciplina de quem escreve o próximo código.

As coordenadas em si saem de `geocoded_addresses`, casadas pela chave de endereço — a mesma tabela
que `listTripStopCoordinates` já lê depois de a viagem existir (ela não mora em `trip_stops`, cujas
colunas de latitude/longitude estão nulas em toda a base). Nota cujo endereço nunca foi
geocodificado não entra na conta, exatamente como acontece hoje com o roteiro já planejado.

### O que ficou de fora, por decisão do próprio T6B

- **Pedágio não entra aqui.** T5/T6 (`toll-route-cost.policy.ts`, `vehicle-axles.policy.ts`) são
  políticas puras já testadas e ainda **não estão ligadas** a nenhuma viagem real nem à prévia — isso
  é T7/T9, que dependem explicitamente desta task. T6B resolve só a fonte da distância que alimenta
  combustível e outros-por-quilômetro, como o próprio `tasks.md` da T6B define.
- **A parcela do motorista não muda.** Ela falta por cadastro ausente (spec 086), e mudar a fonte da
  distância não inventa tabela de região que não existe.

### Testes escritos

- `test/cargo-volume/cargo-preview.contract.ts` — quatro casos novos para `resolvePreviewStopKeys`
  (mesmo endereço vira uma parada, ordem escolhida manda, parada fora da ordem vai para o fim, nota
  sem chave vira parada própria pelo id) — os mesmos quatro comportamentos que já cobriam
  `buildCargoPreviewStops`, provando que a extração não mudou a regra.
- `test/trip-valuation/preview-distance.contract.ts` (novo) — `previewTripValuation` com porta de
  geometria e repositório falsos: soma os trechos e alimenta combustível/outros-por-km; propaga o
  `stopOrder` recebido para `readPreviewStopCoordinates`; soma múltiplos trechos (mais de duas
  paradas); sem geometria disponível (ou com menos de duas paradas) mantém `noPlannedDistance` e
  **não chama** a porta de geometria.

### Gates

```
bun run --cwd apps/api-transportada typecheck   # bunx tsc --noEmit — sem erro
bun run --cwd apps/api-transportada lint        # bunx eslint --max-warnings=0 — sem aviso
bunx prettier --check apps/api-transportada/src apps/api-transportada/test
  # All matched files use Prettier code style!
bun run --cwd apps/api-transportada test
  # 4527 pass, 23 skip, 0 fail, 16563 expect() calls (158 arquivos)
```

⚠️ Uma execução isolada do `test` completo acusou `1 fail` em
`test/deploy/keycloak-realm.contract.ts` (exit code 22 num teste que não toca em `trips/` nem
`toll-booths/`); rodado de novo — sozinho e dentro do `test` completo — deu 0 fail nas duas vezes
seguintes. Flutuação pré-existente, não relacionada a esta task.

### Frontend

`useTripValuationPreview` (spec 090 D3) passou a receber `stopOrder` e a mandá-lo no corpo de
`POST /trips/valuation-preview`, com a mesma chave de consulta sem `sort` que `useTripCargoPreview`
já usa para a ordem (`orderKey = input.stopOrder.join('>')` — ordenar a chave esconderia a
reordenação). `TripQuickCreateDialog` passa `quickCreate.cityOrder`, a mesma ordem que já alimenta a
prévia de carga e o mapa.

```
bun run --cwd apps/frontend-transportada typecheck   # tsc --noEmit — sem erro
bun run --cwd apps/frontend-transportada lint        # eslint . — sem aviso
bunx prettier --check apps/frontend-transportada/src/modules/trip-financials
  apps/frontend-transportada/src/modules/trip/components/TripQuickCreateDialog.component.tsx
  # All matched files use Prettier code style!
bun run --cwd apps/frontend-transportada test
  # 2865 pass, 0 fail, 15951 expect() calls (24 arquivos)
```

### Divergências deste briefing

Nenhuma decisão própria além do reaproveitamento descrito acima (extrair `orderStopKeys` de dentro
de `buildCargoPreviewStops` em vez de duplicar o critério de ordenação) — o briefing já previa essa
armadilha e pedia exatamente esse reuso.

## Conferência independente da T6B (2026-09-07)

Rodado por esta sessão, sem confiar no relatório:

```
bun test trip-valuation + cargo-volume + toll-booths → 190 pass, 0 fail
typecheck + lint + format:check (raiz, as duas apps) → exit 0
```

Conferido também o que o briefing chamava de armadilha: **um agrupador só**.
`trip-valuation.query.ts` importa `resolvePreviewStopKeys` de `cargo-preview.policy.ts`, a mesma
regra que `buildCargoPreviewStops` usa — não há segundo critério.

⚠️ **Armadilha de nome, encontrada na conferência e deixada como está.** O `stopOrder` enviado pelo
frontend é `quickCreate.cityOrder`, do tipo `AssemblyCityOrder`, manipulado por `moveCity({code})` —
todo o vocabulário diz **cidade**. E ele carrega **chave de endereço**: `resolveStopOrder` casa por
`stop.addressKey`, e é o comentário dele que registra isso ("casa por `addressKey`, não por cidade:
duas paradas no mesmo município teriam a mesma cidade e ordens diferentes").

Se o nome fosse verdade, o agrupamento por endereço do servidor não casaria com nada e a distância
sairia sobre a ordem de chegada da nota — silenciosamente, porque o resultado continuaria plausível.
Não renomeei: o alcance é grande e não é desta spec. Fica escrito para quem mexer nisso não concluir
pelo nome.

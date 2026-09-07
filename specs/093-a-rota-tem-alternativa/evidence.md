# Evidência — 093

## T5 — O radar com a velocidade permitida (2026-09-07)

### O dado, medido no `.pbf` real

`osmium tags-filter n/highway=speed_camera` sobre `ribeirao.osm.pbf`:

```
radares: 527
com maxspeed: 438 (83%)
valores: 40 (110×), 60 (108×), 110 (61×), 50 (52×), 90 (42×), 80 (30×), 100 (19×), 70 (11×)
outras tags: maxspeed 438, direction 49, maxspeed:hgv 12, ref 9
```

### O overlay reassado, e o que ele passou a carregar

`overlay.yml` ganhou `maxspeed`, `maxspeed_hgv` e `direction`. Reassado **localmente**, pelo caminho
que a evidência da 089b registrou (jar do planetiler extraído por `docker cp`, sem build remoto):

```
planetiler generate-custom --schema=overlay.yml --osm_path=ribeirao.osm.pbf
5 s, 112 kB
```

Metadados do PMTiles gerado:

```
radar -> class, direction, maxspeed, maxspeed_hgv
```

Contagem de feições nas telhas (z ≤ 12), decodificando o MVT:

```
feições radar: 631 | com maxspeed: 522 (82,7%) | com maxspeed:hgv: 12
```

Os 631 contra 527 são a duplicação de borda entre telhas e zooms que a 089b já havia registrado (lá
foram 72 feições para 70 radares). A proporção — **82,7% contra os 83% do `.pbf`** — e os **12 de
`maxspeed:hgv`, idênticos**, são o que prova que o atributo atravessou o pipeline sem perda.

### O estilo

```
bun test test/trip.contract.test.ts        → 445 pass, 0 fail
bun test test/design-system.contract.test.ts → 247 pass, 0 fail
```

Dois contratos novos, sobre as duas regras que a medição impôs:

- **`maxspeed:hgv` vence `maxspeed`** — asserta a ordem dos ramos do `case`, porque em rodovia
  brasileira o limite do caminhão é menor e quem lê este mapa opera frota.
- **Radar sem velocidade fica só com o triângulo** — asserta que o último ramo do `case` é o glifo
  sozinho. São 89 de 527, e imprimir "60" porque é o mais comum seria inventar o número que o
  motorista obedece.

### ⚠️ Ordem invertida, e por quê

Aqui o contrato veio **depois** da implementação, ao contrário da regra da spec. O motivo é que o
estilo referencia campos da telha, e **não havia como contratar um campo antes de provar que o
`generate-custom` o produz**: um contrato escrito primeiro estaria afirmando sobre `maxspeed_hgv` sem
nenhuma evidência de que aquele nome existiria na saída. A ordem foi: medir o `.pbf` → mudar o
schema → reassar → conferir os metadados e contar as feições → só então escrever estilo e contrato.

### O que ficou de fora

- **`direction` está na telha e não é usado pelo estilo.** 49 radares dizem o sentido em que
  fiscalizam, e desenhar isso é decisão de arte (seta? rotação do glifo?) que não foi tomada. O dado
  está lá para quando for.
- **O overlay publicado ainda é o antigo.** Este foi reassado localmente para medir; publicar exige o
  build remoto do `map-tiles`, que é passo de deploy e não desta task.

## T2 — A comparação que soma combustível (2026-09-07)

Contrato antes, vermelho por módulo inexistente. Verde depois:

```
bun test test/route-options.contract.test.ts → 7 pass, 0 fail
bunx tsc --noEmit → sem erro
```

### O caso de Campinas, que é o motivo da política existir

Com o toco de referência (3,5 km/l, diesel a R$ 6,20) sobre as duas rotas medidas:

| rota |    km |   pedágio | combustível |     total |
| ---- | ----: | --------: | ----------: | --------: |
| 0    | 221,5 | R$ 108,60 |   R$ 392,37 | R$ 500,97 |
| 1    | 239,6 |  R$ 93,20 |   R$ 424,43 | R$ 517,63 |

```
mais rápida: 0 | mais barata: 0
```

**A mesma rota ganha os dois rótulos**, e a que tem uma praça a menos perde por R$ 16,66. É
exatamente o que a D1 previu: comparar só o pedágio elegeria a rota 1 e chamaria de barata a opção
mais cara.

### Detalhe de centavo, registrado para ninguém "consertar"

⚠️ `392.3713` contra os `392.3714` da conta direta. A diferença vem do `fuelCost`, que arredonda os
litros antes de multiplicar pelo preço — helper já usado por toda a valoração da viagem. A primeira
versão do contrato afirmava o número da minha calculadora e reprovou o código; **quem estava errado
era o teste**, e ele passou a afirmar o número do produto. Reimplementar a conta aqui daria dois
combustíveis diferentes no mesmo produto, que é pior que um décimo de milésimo.

### O que a política recusa a fazer

- **Sem consumo ou sem preço não há mais barata** (`NO_FUEL_BASELINE`): estimar o consumo para
  preencher o rótulo seria inventar o número que decide a escolha.
- **Pedágio desconhecido em qualquer opção anula a comparação** (`TOLL_UNKNOWN`): desconhecido não
  vira zero.
- **Uma opção só não é escolha** (`hasChoice: false`): três de quatro rotas medidas têm caminho
  único, e um seletor de uma opção ensina que existe escolha onde não existe.

## T1 — `alternatives=true` e o custo total de cada opção (2026-09-07)

Contrato antes, vermelho por campo/parâmetro inexistente. Verde depois:

```
bun test ./test/trip-infrastructure.contract.test.ts   → 14 pass, 0 fail (route-geometry-alternatives.contract.ts)
bun test ./test/trip-application.contract.test.ts      → 42 pass, 0 fail (route-geometry-options.contract.ts)
bunx tsc --noEmit                                      → sem erro
bun run test (api-transportada, suíte completa)        → 4558 pass, 23 skip, 0 fail
```

### O gateway pede alternativa, e a principal continua sendo a primeira

`osrm-route-geometry.gateway.ts` acrescentou `&alternatives=true` na URL e passou a ler
`payload.routes[]` inteiro, não só `routes[0]`. `toRoad()` extrai o formato comum (`legs`, `nodeIds`,
`points`) de qualquer entrada — principal ou alternativa —, e a validação estrita (contagem de
`legs` == pontos enviados − 1) continua valendo só para a principal: **uma alternativa malformada é
descartada, e não derruba a chamada inteira** (a rota principal é o traço padrão, spec.md D2).

Medido contra o OSRM local, com as coordenadas da spec: a resposta de Ribeirão Preto → Campinas
devolve `routes[0]` e `routes[1]`, o de Ribeirão Preto → Pirassununga devolve um só — replicado nos
testes com fixtures que espelham essa forma.

### `RouteGeometryRoad.alternatives` é opcional, de propósito

A alternativa dos motivos de compatibilidade: `RouteGeometryPort`/`RouteGeometryRoad` ganharam
`alternatives?: readonly RouteGeometryRoad[]` **opcional**. Isso preserva todos os mocks de porta já
escritos nos testes anteriores (`route-geometry.contract.ts`, `route-geometry-toll.contract.ts`,
`trip-valuation` — que constroem `{legs, nodeIds, points}` sem o campo novo) sem tocar em nenhum
deles: campo ausente é lido como "nenhuma alternativa", o mesmo significado de lista vazia.

### `readRouteGeometry` monta cada opção, com o próprio pedágio

`resolveOption()` roda para a principal e para cada alternativa: simplifica o próprio traço e
resolve o próprio pedágio a partir dos próprios `nodeIds` — nunca reaproveitando o pedágio da
principal para as demais. `rankRouteOptions` (T2, já pronta) então recebe `{distanceMeters,
durationSeconds, tollTotal}` de cada opção e devolve o ranking, que a resposta publica junto:
`options[]`, `cheapestIndex`, `costGap`, `fastestIndex`, `hasChoice`.

### Compatibilidade: os campos de sempre continuam sendo os da principal

`legs`, `points`, `toll` e `source` no topo de `RouteGeometryView` continuam sendo exatamente os da
rota principal (`options[0]`) — provado pelo teste "os campos de sempre continuam sendo os da rota
principal", que monta uma resposta com alternativa e confere que o topo não muda. Os dois
consumidores existentes (`TripAssemblyMap` e o detalhe da viagem) continuam lendo a mesma coisa sem
saber que a 093 existe; só quem lê `.options`/`.hasChoice` percebe a mudança.

### Vínculo com o combustível: uma consulta só por veículo

`route-geometry-vehicle-axles.query.ts` passou a devolver `{axles, fuelBaseline}` numa única
consulta (`readVehicleContext`) — o eixo (090 T6/T7) e o consumo/preço do combustível (093 D1) vêm
da mesma linha de `fleet_vehicles`, e o preço do combustível é o mesmo `companyFuelPrices` que
`trip-valuation.query.ts` já lia para o custo previsto da viagem, para as duas contas nunca
divergirem sobre o preço do litro. Sem consumo ou sem preço, `fuelBaseline` é `{kilometersPerLiter:
null, pricePerLiter: null}` — o mesmo vocabulário de "não sei" que `rankRouteOptions` já esperava.

### O que decidi sozinho (não estava no briefing)

- **A forma de `alternatives` como campo opcional em vez de mudar o tipo de retorno do port para
  array.** Uma alternativa (trocar `Promise<RouteGeometryRoad | null>` por
  `Promise<{primary, alternatives}| null>`) obrigaria reescrever todos os mocks de porta dos testes
  anteriores; o campo opcional cresce o contrato sem tocar em nenhum teste que já existia — é a
  mesma tática que a T1 do briefing já sugeria para `RouteGeometryView`.
- **`readVehicleContext` substitui `readVehicleAxles`** (mesmo arquivo, mesmo objeto exportado) em
  vez de conviver com ele: os dois únicos chamadores são os mesmos dois pontos de `main.ts`, e uma
  segunda consulta separada para o combustível pagaria um round-trip a mais por chamada de
  `/route-geometry`.

## T3 — O seletor na montagem (2026-09-07)

Contrato antes, vermelho por trecho de texto inexistente no componente. Verde depois:

```
bun test ./test/trip.contract.test.ts   → 470 pass, 0 fail
  (assembly-route-options.contract.ts, assembly-route-selector.contract.ts,
   route-geometry-options-validation.contract.ts)
bunx tsc --noEmit                        → sem erro
bun run lint / format:check              → sem erro
bun run test (frontend-transportada, suíte completa) → 2892 pass, 0 fail
```

### O cálculo é puro, a montagem só desenha

`assemblyRouteOptions.service.ts` (`resolveRouteOptionSummaries`) converte cada `RouteGeometryOption`
em quilômetro/minuto/contagem de praças e decide as duas marcas (`isFastest`/`isCheapest`) mais
`isBestOfBoth` — a marca única para quando a mesma rota vence as duas contas (o caso medido de
Campinas), para a tela não empilhar "mais rápida" e "mais barata" dizendo a mesma coisa duas vezes.

### `TripAssemblyMap`: opção escolhida redesenha tudo, não só o traço

- `selectedOptionIndex` (estado, padrão `0` — a principal) mais um `useEffect` que o zera quando
  `routeKey`/`tollVehicleId` mudam: trocar de veículo ou de roteiro invalida qualquer escolha
  anterior, porque o índice de uma resposta não tem relação com o índice da próxima.
- `activeOption = routeOptions[boundedOptionIndex]` (limitado ao tamanho da lista atual, para uma
  resposta mais curta nunca deixar o índice apontando para `undefined`) alimenta **três** coisas ao
  mesmo tempo: o traço desenhado (`AssemblyVectorMap geometry={activeGeometry}`), o tempo do
  roteiro (`buildAssemblyLegs`) e o bloco de pedágio da T7 (`toll = activeGeometry?.toll`). Escolher
  a alternativa muda a tela inteira de uma vez, nunca só a linha do mapa.
- **Rota única não renderiza o seletor**: o bloco inteiro é `hasRouteChoice ? (...) : null`, e
  `hasRouteChoice` vem pronto de `geometryQuery.data?.hasChoice` — nenhuma conta de "tem mais de uma
  opção" duplicada no frontend.
- **Sem `totalCost` não há rótulo de mais barata**: o botão de cada opção só imprime o total quando
  ele não é `null`, e o motivo (`costGap`) sai como texto próprio (`assemblyMap.routeOptions.gap.*`)
  logo abaixo da lista — nunca inventado.

### O contrato de validação, para a leitura da API não silenciar o recurso

`tripResponse.validation.ts` ganhou `isGeometryOption` e a leitura de `options`/`cheapestIndex`/
`costGap`/`fastestIndex`/`hasChoice` em `routeGeometryFromApi` — sem isso a T1 do backend chegaria
pronta e o frontend simplesmente descartaria os campos novos ao montar `RouteGeometry`, porque o
adaptador reconstrói o objeto campo a campo. Uma opção malformada zera **só as opções** (a mesma
regra do trecho/pedágio malformado que já existia), e resposta sem os campos da 093 (contrato
anterior) é lida como "sem escolha" — nunca erro.

### Ícone: convenção do módulo, não do briefing

O botão de cada opção ganhou `<Icon name="check">` (escolhida) ou `<Icon name="target">` (oferta) —
exigido por `test/trip/action-icons.contract.ts`, contrato já existente que reprova qualquer
`<Button>` da viagem sem ícone (`web.md` §9). Não havia ícone de "rota"/"caminho" no catálogo; usei
os dois já em uso nesta mesma tela (`check` de confirmação, `target` do botão "Melhor rota") em vez
de desenhar um novo, que exigiria abrir `docs/frontend/icons.md` e o contrato do design system para
uma feature que não pediu ícone novo.

### O que decidi sozinho (não estava no briefing)

- **`options`/`cheapestIndex`/`costGap`/`fastestIndex`/`hasChoice` são opcionais em `RouteGeometry`**
  (frontend), pela mesma razão do port da T1: três testes já existentes constroem literais
  `RouteGeometry` tipados sem esses campos (`route-geometry.contract.ts`,
  `route-trace-colors.contract.ts`, `assembly-map.contract.ts`), e torná-los obrigatórios quebraria
  o typecheck desses três arquivos sem nenhum ganho de comportamento.
- **A opção escolhida também substitui o tempo do roteiro e o pedágio impressos acima do seletor**,
  não só o traço do mapa. O briefing pede só "a escolhida redesenhando o traço"; deixar o tempo e o
  pedágio grudados na principal enquanto o traço muda para a alternativa produziria uma tela
  contraditória — o operador veria o traço da rota mais barata com o tempo e o pedágio da mais
  rápida ao lado.
- **Reset da seleção por `useEffect`** ao trocar `routeKey`/`tollVehicleId`: não estava no briefing,
  mas sem ele uma segunda resposta com menos opções deixaria `selectedOptionIndex` sobrando (contido
  pelo `boundedOptionIndex`, que evita o crash, mas silenciosamente trocaria a escolha do operador
  sem avisar).

## Conferência independente da T1/T3 (2026-09-07)

Rodado por esta sessão pelo **gateway de produção** contra o OSRM local, com o catálogo real de
praças e as duas políticas em cima — nada de mock:

```
createOsrmRouteGeometryGateway → readRouteGeometry(Ribeirão Preto → Campinas)

rotas devolvidas pelo gateway: 2
   221.5 km | 179 min | 5 praças | pedágio R$ 108,60
   239.6 km | 198 min | 4 praças | pedágio R$  93,20
rankRouteOptions → mais rápida: 0 | mais barata: 0 | há escolha: true
   total R$ 500,97
   total R$ 517,56
```

**A armadilha da D1 acontece pelo caminho real**: a rota com uma praça a menos é eleita pela conta
completa como a **mais cara**, e a mesma rota ganha os dois rótulos. O seletor existe (`hasChoice`),
e é aqui que ele mostra as duas opções em vez de esconder a escolha.

Suítes: 63 pass nas três da API tocadas, 470 no `trip` do frontend, todas verdes.

⚠️ Os centavos aqui (R$ 500,9695) diferem por 2/10000 dos do contrato da T2 (R$ 500,9713) porque lá a
distância entra arredondada em metros redondos e aqui vem crua do OSRM. Não é divergência de regra.

## T4 — A praça do trajeto no mapa, com o valor ao lado (2026-09-07)

Contrato antes, vermelho por campo/wiring inexistente. Verde depois:

```
bunx tsc --noEmit (api-transportada)                              → sem erro, vermelho antes (6 erros TS2353/TS2339)
bun run test (api-transportada, suíte completa)                   → 4559 pass, 23 skip, 0 fail
bun test test/trip.contract.test.ts (frontend-transportada)       → 478 pass, 0 fail (route-toll-booth-markers.contract.ts)
bunx tsc --noEmit (frontend-transportada)                          → sem erro
bun run test (frontend-transportada, suíte completa)               → 2900 pass, 0 fail
bun run lint / format:check (raiz, todas as apps)                  → sem erro
```

### A coordenada da praça é dado novo até a resposta da rota; o schema já a tinha

`toll_booths.latitude`/`longitude` existem desde a 090 (para a seed e para nada mais). O que faltava
era o fio até `RouteGeometryToll.booths[]`: `TollBoothRecord` (API,
`toll-booths/domain/toll-route-cost.policy.ts`) ganhou os dois campos, `readByNodeIds`
(`drizzle-toll-booth.repository.ts`) passou a selecioná-los, e como `resolveTollRouteCost` já
devolve a própria linha do catálogo em `booths[]` (T5, spec 090), a coordenada atravessa sem tocar
em `read-route-geometry.use-case.ts`. Vermelho confirmado desligando as duas mudanças
(`git stash`) e rodando `tsc`: quatro `praca()` de teste e a leitura de `.latitude`/`.longitude`
reprovam por campo inexistente — o mesmo tipo de erro que o contrato novo
(`route-geometry-toll.contract.ts`, "a praça cobrada carrega a própria coordenada") cobre em
tempo de execução.

⚠️ **A política pura continua sem saber de coordenada nenhuma** (D1, cabeçalho do arquivo): ela só
carrega o campo adiante dentro do `TollBoothRecord` que já manipulava — nenhuma linha nova em
`resolveTollRouteCost` lê `latitude`/`longitude`, e a praça continua sendo casada por identidade de
nó. `RouteGeometryTollBooth` (frontend) e `isGeometryTollBooth` (validação) ganharam os mesmos dois
campos, como string — a mesma forma que o resto da API publica coordenada geográfica.

### O desenho é camada nova, alimentada pela opção **escolhida**, nunca pela principal à força

`resolveTollBoothMarkers` (`trip/shared/assemblyToll.service.ts`) é pura: recebe
`RouteGeometryToll | null` e devolve `{latitude, longitude, label}[]`, com `formatBoothCharge` ao
lado decidindo o rótulo. `AssemblyVectorMap` já recebia `geometry` como a opção **ativa**
(`activeGeometry` — T3, spec 093), então a nova camada lê `geometry?.toll` no mesmo `useEffect`
que reage a `[geometry, isReady, theme]`: trocar de opção no seletor redesenha o traço, o bloco de
texto acima e as praças no mapa, todos da mesma resposta.

A fonte (`pracas-do-trajeto`) e a camada (`praca-do-trajeto`) nascem em tempo de execução, no molde
exato de `fora-da-selecao`/`fora-da-selecao-ponto`: `GeoJSONSource.setData` quando já existem,
`addSource`/`addLayer` na primeira vez. **Nenhuma delas passa `beforeId`** — a mesma garantia que
`vector-basemap.contract.ts` já cobrava para o roteiro e para "fora da seleção" — e é essa ausência,
não a ordem de declaração, que deixa a camada sempre abaixo dos marcadores de parada: eles são
`Marker` de DOM, que o navegador desenha por cima do `<canvas>` do MapLibre de qualquer forma.

### O valor por eixo, nunca o total da rota — e nunca "R$ 0,00" para desconhecida

O rótulo é `chargePerAxle` da própria praça (o mesmo campo que o bloco de texto abaixo do seletor já
lista por nome), não `total`/`chargePerAxle` agregados da rota inteira — esses continuam sendo o
resumo, este é o valor daquela cabine. `formatBoothCharge` distingue `null` (desconhecida, imprime
"—") de qualquer string declarada, inclusive `"0.00"` (imprime o valor formatado): a mesma regra já
medida na 090 — `0.00` é tarifa declarada em 4 das 166 praças, e nem sempre é isenção — continua
sendo "não inventar zero", nunca "toda tarifa baixa é suspeita". O glifo é `● ` seguido do rótulo,
mesmo símbolo de `cabine-de-pedagio` do basemap: a linguagem visual de pedágio continua sendo uma
só, e a cor sai de `resolveBasemapTollColor` (novo export de `vectorBasemap.service.ts`, o mesmo
token `rodovia` que a cabine e a via tracejada já usam) — nunca uma cor própria que competiria com
o vocabulário existente.

### O que decidi sozinho (não estava no briefing)

- **Dois novos exports em `vectorBasemap.service.ts`** (`resolveBasemapTollColor`,
  `resolveBasemapBackground`), no molde de `resolveBasemapOutline` que já existia: a cor da praça e
  o halo do texto precisam acompanhar o tema do mapa (claro/escuro/contraste) como todo o resto da
  paleta, e os únicos acessores expostos antes desta task eram o do anel do pino. Ler `PALETTE`
  direto do componente exigiria exportar o objeto inteiro, que é privado de propósito.
- **O teste de "sem `beforeId`" da camada nova não repete o regex de `vector-basemap.contract.ts`.**
  Medido: aquele regex (`/map\.addLayer\(\{[\s\S]*?\n\s{4}\}\)/gu`) captura, por causa do
  quantificador fixo `\s{4}`, um trecho muito maior que a chamada de `addLayer` de cada camada
  sempre que a indentação real é diferente de quatro espaços — o que já era o caso das duas camadas
  anteriores (seis e oito espaços) e continuou sendo o caso da nova. O contrato antigo ainda vale
  (ele varre o arquivo inteiro em busca da palavra "beforeId", e captura grande o suficiente para
  isso), mas escrevê-lo de novo, isolado, produziria uma asserção que passa por acidente. O teste
  novo em `route-toll-booth-markers.contract.ts` isola a chamada por `indexOf` exato do início e do
  primeiro `'})'` — que só ocorre no fechamento verdadeiro do objeto, nunca nas chaves internas
  (`layout`/`paint` fecham com `},`, não `})`).
- **A palavra "beforeId" saiu do comentário que eu tinha escrito na primeira versão do efeito.**
  Ela derrubava `vector-basemap.contract.ts` (que varre o arquivo inteiro): o comentário citava a
  prop por nome para explicar a regra, e o próprio nome bastava para reprovar o teste que confere a
  ausência dela em qualquer lugar do arquivo. Reescrito sem citar o nome literal da prop.

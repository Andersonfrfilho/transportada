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

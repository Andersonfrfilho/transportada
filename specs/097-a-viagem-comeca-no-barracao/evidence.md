# Evidência — 097 — A viagem começa no barracão

## Contrato antes da implementação (vermelho)

`test/trip-application/route-geometry-depot.contract.ts` contra o código anterior (sem
`route-depot.query.ts` e sem `depot` no caso de uso):

```
bun test ./test/trip-application/route-geometry-depot.contract.ts
 2 pass
 8 fail
Ran 10 tests across 1 file.
```

Falhas: `readRouteGeometry` não aceitava `depot`, a rota não ganhava a perna extra, e
`route-depot.query.ts` não existia (`ENOENT`).

`test/trip/assembly-depot.contract.ts` (frontend) contra `TripAssemblyMap.component.tsx` sem o
aviso de ausência:

```
bun test ./test/trip/assembly-depot.contract.ts
 9 pass
 3 fail
Ran 12 tests across 1 file.
```

Falhas: a tela não imprimia `assemblyMap.depot.absence.*`, não somava o rodar do barracão ao total
(`totalAssemblyMinutes(legs, depotLegs)`), e não citava `geometry.depot` em lugar nenhum do
componente.

## Implementação

- `src/trips/domain/route-depot.policy.ts` — `planRouteFromDepot` (poe o barracão na frente e,
  conforme a política de fim, o retorno atrás) e `resolveRouteEndAddressKey` (traduz
  `end_policy`/`end_address_key`/`origin_address_key` numa chave de endereço ou `null`, sem nomear
  política nenhuma fora daqui).
- `src/trips/infrastructure/route-depot.query.ts` — lê `company_route_optimization_settings` +
  `geocoded_addresses` (a mesma fonte que o solver do worker já usa) e devolve `RouteDepot`
  resolvido ou a razão da ausência (`not_configured` | `not_geocoded`).
- `src/trips/application/read-route-geometry.use-case.ts` — `readRouteGeometry` resolve o
  barracão **antes** do corte de "menos de duas paradas", manda a lista estendida ao roteirizador,
  e devolve `depot: {absence, leadingLegs, trailingLegs} | null` na `RouteGeometryView` — a
  ausência sobrevive até quando o roteirizador não responde (rota `unavailable`).
- `src/trips/application/read-trip-valuation.use-case.ts` — `previewTripValuation` aceita a mesma
  porta de barracão e manda a mesma lista estendida ao `readRouteGeometry`: a distância que alimenta
  o combustível da prévia é a mesma da montagem.
- `src/main.ts` — `routeDepotQuery` é injetado nas três chamadas que hoje pedem geometria de
  viagem: `/route-geometry` (montagem, antes de a viagem existir), `/trips/:id/route-geometry`
  (viagem já criada — duas telas, uma conta) e a prévia de valoração.
- Frontend: `routeGeometry.service.ts`/`tripResponse.validation.ts` recebem o campo `depot`;
  `assemblyLeg.service.ts` ganha `buildAssemblyDepotLegs` (separa os trechos do barracão dos
  trechos entre entregas) e `totalAssemblyMinutes` passa a somar o rodar do barracão sem o tempo de
  descarga (D3: o barracão não é entrega); `TripAssemblyMap.component.tsx` soma o total e imprime o
  aviso de ausência (`assemblyMap.depot.absence.not_configured`/`not_geocoded`) com `Icon
name="alert"`.

## Contrato de texto de fonte (D1)

`test/trip-application/route-geometry-depot.contract.ts` varre por texto —
`read-route-geometry.use-case.ts`, `read-trip-valuation.use-case.ts` e `route-depot.query.ts` — e
reprova qualquer um dos três se `'depot'`/`"depot"` aparecer como literal. Quem interpreta a
política é só `resolveRouteEndAddressKey` (`route-depot.policy.ts`), provada contra as três
políticas (`depot`, `last_stop`, `address`) em `test/trip-domain/route-depot.contract.ts`.
`test/trip/assembly-depot.contract.ts` (frontend) faz o mesmo para o caminho da montagem no
cliente, e também reprova `'last_stop'` fixo.

## Medição real, contra o OSRM local (porta 53005)

Container `transportada-local-osrm-1`, `docker ps` → `Up (healthy)`. Barracão real desta base
(`-21.1767, -47.8208`) e as três notas de uma viagem de verdade — Orlândia (`-20.7194, -47.8869`),
Orlândia, Ipuã (`-20.4386, -48.0186`):

```bash
curl -s "http://127.0.0.1:53005/route/v1/driving/-47.8869,-20.7194;-47.8869,-20.7194;-48.0186,-20.4386?overview=false&annotations=nodes,distance,duration"
curl -s "http://127.0.0.1:53005/route/v1/driving/-47.8208,-21.1767;-47.8869,-20.7194;-47.8869,-20.7194;-48.0186,-20.4386?overview=false&annotations=nodes,distance,duration"
```

| rota                   |   distância |     tempo | nós na resposta |
| ---------------------- | ----------: | --------: | --------------: |
| sem barracão (hoje)    |  48.437,0 m | 2.372,9 s |             410 |
| com barracão na origem | 105.540,6 m | 5.166,9 s |             951 |

Convertido: **48,4 km / 40 min** sem barracão, **105,5 km / 86 min** com o barracão na origem —
os dois números do contrato de aceite, batidos.

### O pedágio mora na perna do barracão

Interseção dos nós de cada rota com `toll_booths` (166 linhas, a mesma tabela que
`resolveTollRouteCost` consulta por `osm_node_id`):

```sql
select osm_node_id, name, operator, charge_per_axle, charge_car from toll_booths;
```

```
sem barracão:  nenhuma praça na interseção (0 de 410 nós)
com barracão:  2429753986 · Pedágio Sales Oliveira (sentido Norte) · Entrevias · R$ 15,00/eixo
```

Toco tem 2 eixos (`resolveVehicleAxles`, `toll-route-cost.policy.ts`): **R$ 15,00 × 2 = R$ 30,00** —
os dois números do contrato de aceite (**1 praça**, **R$ 30,00**), batidos. Sem o barracão a
mesma rota real não passa por praça nenhuma — é exatamente o "a tela dizia sem pedágio e havia" do
`spec.md`, e a praça está inteira dentro da perna que só existe com o barracão na conta.

### O combustível cresce com a distância, provado no contrato de valoração

`test/trip-valuation/preview-depot-distance.contract.ts`: 48,3 km custavam **R$ 115,92** de
combustível (2,5 km/l, R$ 6,00/l) e 105,3 km — a mesma perna do barracão somada — custam
**R$ 252,72**. A carga não muda: nenhum teste de ocupação em `test/trip/occupancy.contract.ts` foi
tocado, e `buildCargoPreviewStops`/`trip_stops` continuam sem o barracão (D3).

## Gates

```
bun run typecheck   → api-transportada, worker-transportada, cron-transportada,
                       frontend-transportada, frontend-client, frontend-landing: limpo
bun run lint        → limpo nas seis apps (--max-warnings=0)
bun run format:check → "All matched files use Prettier code style!"
```

```
cd apps/api-transportada
bun test ./test/trip-domain/route-depot.contract.ts \
         ./test/trip-application/route-geometry-depot.contract.ts \
         ./test/trip-valuation/preview-depot-distance.contract.ts
 22 pass, 0 fail (58 expect() calls)

bun run test   (suíte inteira da API)
 4645 pass, 23 skip, 0 fail (16904 expect() calls, 159 arquivos)
```

```
cd apps/frontend-transportada
bun test ./test/trip/assembly-depot.contract.ts
 12 pass, 0 fail (25 expect() calls)

bun run test   (suíte inteira do frontend)
 2982 pass, 0 fail (16325 expect() calls, 24 arquivos)
```

## Onde desconfiar, e por que não se confirmou

- **A prévia de valoração usa as mesmas paradas da montagem, e a ocupação da carga não mudou.** A
  única alteração em `previewTripValuation` foi mandar o barracão junto ao `readRouteGeometry`; o
  agrupamento por endereço que alimenta `buildCargoPreviewStops` não foi tocado, e nenhum teste de
  ocupação (`trip/occupancy.contract.ts`, `cargo-plan.policy.ts`) precisou mudar — sinal de que o
  barracão não vazou para dentro do baú.
- **A rota já criada (`/trips/:id/route-geometry`) também ganhou o barracão**, além do
  `/route-geometry` da montagem citado no pedido: as duas telas liam a mesma pergunta
  ("quanto custa esta viagem?") por dois caminhos, e deixar só um deles com o barracão recriaria a
  divergência que esta spec existe para fechar. `readTripRouteGeometry` em `main.ts` chama a mesma
  `routeDepotQuery`.

## Decisões próprias

- Marcado `readonly depot?: null | ReadRouteGeometryDepotPort` como **opcional** em
  `ReadRouteGeometryInput`: o caso de uso continua servindo chamadores que não conhecem barracão
  (nenhum hoje, mas a assinatura não obriga).
- `RouteGeometryDepot.absence` sobrevive à resposta `unavailable` do roteirizador — testado em
  "declara a ausência mesmo quando o roteirizador não respondeu": é justamente quando não há
  traçado que o aviso mais importa.
- Endereço de fim (`end_policy = 'address'`) sem geocodificação não derruba o barracão inteiro: a
  origem já resolveu o que a D2 exige, e a rota fica sem o retorno — o mesmo "nada inventado"
  aplicado à outra ponta, sem duplicar o vocabulário de ausência para um caso que a `end_policy`
  já torna raro (poucas empresas terminam num endereço declarado).

## Nota sobre o processo

Este worktree já continha, ao início desta sessão, testes vermelhos e parte da implementação —
domínio (`route-depot.policy.ts`), infraestrutura (`route-depot.query.ts`), casos de uso e a
maior parte da tela — de um trabalho anterior nesta mesma spec. Esta sessão conferiu cada peça
contra os testes, corrigiu o que ainda faltava (o texto-fonte `geometry.depot` no componente, a
formatação) e mediu o resultado contra o OSRM real e o banco local, em vez de reescrever o que já
estava correto.

## D4 — O marcador do barracão (2026-09-08)

Requisito acrescentado pelo usuário depois de ver a tela: _"o ícone de partida deve ser diferente"_.

Contrato antes, vermelho conferido (2 fail), verde depois:

```
bun test test/trip.contract.test.ts → 514 tests, 0 fail
typecheck + lint limpos · API 4670 pass · frontend 2985 pass
```

### O que a implementação decidiu

- **Losango, não círculo.** A diferença é de **forma**: cor sozinha não sobrevive a daltonismo nem a
  mapa impresso, e a distinção aqui é categórica — origem contra destino —, não de grau.
- **Sem número.** O barracão não está na sequência de entregas, e o contrato reprova `sequence`
  dentro de `depotElement`.
- ⚠️ **Marcado uma vez só.** Com `end_policy = 'depot'` ele é o primeiro **e** o último ponto do
  traçado, e é o mesmo lugar; dois marcadores sobrepostos sugeririam dois pontos distintos, e a volta
  já está dita pela linha.
- **A coordenada sai da mesma resposta que desenhou o traçado.** O plano publicava só a contagem de
  pernas, e com ela não se marca nada; agora `RouteDepotPlan.origin` viaja até a tela. Buscá-la por
  outro caminho abriria a porta para marcar um ponto e rotear por outro — a divergência que a 090 D4
  fechou do lado do pedágio.

### Dois erros meus, no contrato e não no código

⚠️ A primeira versão do contrato apontava para `components/assemblyVectorMap.module.css`, **que não
existe** — o estilo do módulo mora em `styles/trip.module.css`. E o recorte que verifica a ausência
de número ia do início de `depotElement` até o fim do arquivo, engolindo `stopElement`, que tem
número por dever. Os dois reprovavam código correto; corrigidos no teste.

## A volta ao barracão — resolvida pela configuração, não por decisão nova (2026-09-08)

A história estava no plano como "decisão de produto pendente". Não era: **a política já existia e a
montagem a ignorava.**

Medido no banco desta base: as duas empresas têm `end_policy = 'depot'`, que é o padrão do esquema.
`resolveRouteEndAddressKey` traduz as três políticas num lugar só — `depot` volta à origem,
`last_stop` termina na última entrega, `address` usa endereço próprio —, e o contrato cobre as três.

A prova de que a volta entra: a chamada ao roteirizador sai como

```
[BARRACÃO, ORLÂNDIA, IPUÃ, BARRACÃO]
```

e o custo previsto da viagem medida passa de **R$ 0,00** (o que a tela mostrava) para **R$ 60,00** de
pedágio num toco, com 209 km em vez de 48,4.

⚠️ **O que fechou esta história foi ler a configuração, não escolher por ela.** A escolha já tinha
sido feita por quem configurou — e o defeito era a montagem ter uma política implícita própria
("começa na primeira entrega e acaba na última"), que ninguém decidiu e que não estava escrita em
lugar nenhum.

# Feature 153 — A viagem grava a rota escolhida no mapa, dinheiro só para o financeiro, e um mapa só

> Pedido do usuário em 2026-09-16, depois da correção do detalhe da viagem (commit `ebd2b039`).
> **Absorve a spec 148** ("a viagem grava a distância que o pedágio usou"), que só existe como
> documento na branch local `work/trip-planned-distance` e nunca foi implementada: as respostas às
> perguntas dela estão em D6–D9 abaixo.

## Problema e resultado

1. **A rota escolhida se perde.** O mapa da pré-criação (`TripAssemblyMap`) oferece as alternativas
   do OSRM, mas a escolha é um `useState` local (`selectedOptionIndex`). A viagem criada congela
   sempre o pedágio da rota **principal** (`freeze-trip-route-toll.use-case.ts` grava `road.toll`),
   a prévia da conta usa a principal, e o detalhe recalcula a principal. Quem escolhe uma rota mais
   barata ou sem pedágio vê outra rota e outra conta depois de criar. Não existe hoje rota "sem
   pedágio": só aparece se uma alternativa do OSRM calhar de não passar por praça.
2. **Distância não é gravada** (achado da 148): `readPlannedDistance` soma
   `trip_stops.distance_from_previous_meters`, que nenhum código grava — toda viagem real sai com a
   lacuna `NO_PLANNED_DISTANCE` e combustível não calculado.
3. **Dinheiro vaza.** `GET /trips/:id/route-geometry` e `POST /route-geometry` exigem só `fleet.read`
   e devolvem pedágio, combustível e custo da rota. A montagem mostra valor da NF-e e frete por nota
   para qualquer operador. A tela esconder não é autorização (security.md §8).
4. **Dois mapas.** Viagem e montagem usam o MapLibre (`AssemblyVectorMap`); a aba Regiões de frete
   ainda desenha pelo primitivo SVG `VectorMap`, e sobram serviços, CSS, textos e testes do desenho
   antigo da viagem.

**Resultado:** a pré-criação oferece todas as rotas (inclusive a sem pedágio) com a **mais barata
selecionada**; a viagem grava a rota escolhida — traçado, pedágio, km, tempo — e o detalhe e a conta
mostram exatamente essa rota. Quem não tem `trip.financials` não recebe valor nenhum da API. O
produto tem um mapa só.

## Decisões (não reabrir)

- **D1 — Todas as rotas, a mais barata selecionada.** A API devolve as alternativas do OSRM mais a
  rota com `exclude=toll` (quando ela difere das demais). O seletor abre na de menor `totalCost`.
  Sem custo comparável (`costGap`), abre na principal e diz por quê.
- **D2 — A escolha é identificada por assinatura, nunca por índice.** Índice depende da ordem do
  OSRM e das alternativas descartadas. A assinatura é o hash da sequência de nós OSM da rota, e o
  pedido carrega também o critério (`cheapest | fastest | no_toll | alternative`).
- **D3 — Assinatura que não se reproduz cai no critério, e diz.** Ao gravar, a API pede as rotas de
  novo; sem a assinatura, aplica o critério (`alternative` cai em `cheapest`) e grava
  `choiceReproduced: false`. Nunca afirma em silêncio uma rota que não é a escolhida.
- **D4 — A rota nasce inteira numa escrita.** Traçado simplificado, pernas, pedágio, distância total,
  parte da volta, duração, assinatura e critério são gravados juntos, com o mesmo `frozen_at`
  (148 D1). A conta e o detalhe leem o gravado; não recalculam.
- **D5 — OSRM fora do ar não derruba a operação** (148 D6): a viagem é salva, a rota fica nula e a
  tela diz "rota não calculada". Nunca zero.
- **D6 — Mudou a parada antes do despacho, recalcula e pega a mais barata.** Reordenar, vincular ou
  desvincular nota em viagem ainda não despachada limpa a rota gravada e recalcula na mesma
  operação, gravando a de menor custo (critério `cheapest`), com D5 valendo. (148 Q3)
- **D7 — Proposta: grava a escolhida no mapa da proposta.** Cada viagem da proposta multi-veículo
  tem o seletor, aberto na mais barata; o aceite envia a escolha por viagem. O aceite por viagem
  também passa a gravar a rota. (148 Q1, Q2)
- **D8 — Sem backfill.** Não há viagens em produção. (148 Q4)
- **D9 — Km e tempo aparecem para todos**, com a parte da volta ao barracão. Não são dinheiro.
  `trip_stops.distance_from_previous_*` fica como está, fora desta spec. (148 Q5, Q6)
- **D10 — Todo dinheiro é `trip.financials`, cortado na API.** Sem a permissão, as respostas de rota,
  prévia, listagem de NF-e e detalhe da viagem saem **sem** os campos monetários (pedágio por praça
  e total, tarifa por eixo, combustível, custo da rota, frete, receita, valor da NF-e). As praças
  continuam no mapa, sem preço; o rótulo "mais barata" continua. A tela não imprime traço nem zero
  no lugar: a linha some.
- **D11 — Um mapa só.** A aba Regiões migra para o MapLibre sobre o basemap próprio (polígonos por
  zona, clique para selecionar cidade). O primitivo `VectorMap` e tudo que só o mapa antigo usa
  saem. A malha do IBGE **fica**: é dado (centro do município do pino aproximado e polígonos das
  regiões), não desenho.

## Fora do escopo

- Mudar a conta de combustível, R$/km ou margem (148 D4).
- Recalcular rota depois do despacho (o snapshot do despacho manda).
- Gravar distância por perna em `trip_stops`.
- Rota sem rodovia/balsa ou qualquer outro `exclude` além de `toll`.

## Histórias

### P1 — Criar viagem pela rota sem pedágio

**Given** a pré-criação com paradas e veículo, e a API oferecendo a principal (com pedágio) e a sem
pedágio mais barata
**When** o seletor abre e o operador cria a viagem sem trocar
**Then** a viagem grava a sem pedágio; o detalhe desenha esse traçado, sem praças; a conta traz
pedágio zero de origem "rota escolhida" e combustível sobre os km dela.

### P1 — Operador troca para a mais rápida

**Given** a pré-criação com a mais barata selecionada
**When** ele escolhe a mais rápida e cria a viagem
**Then** a viagem grava a mais rápida (assinatura reproduzida) e o detalhe mostra essa rota.

### P1 — Operador sem `trip.financials`

**When** abre a pré-criação, a proposta ou o detalhe
**Then** vê rotas, km, tempo e praças, e nenhum valor em reais; a resposta HTTP também não traz os
campos monetários.

### P2 — Parada muda depois de criada

**Given** viagem planejada, não despachada
**When** alguém vincula nota de outra cidade
**Then** a rota é recalculada para as novas paradas e grava a mais barata; se o OSRM falhar, a nota é
vinculada e a tela diz "rota não calculada".

### P2 — Aba Regiões no mapa novo

**Then** as zonas aparecem como polígonos coloridos sobre o basemap, clicar numa cidade na edição a
seleciona, e a legenda e a lista de cidades fora da malha continuam.

## Requisitos funcionais

- **RF1** — Migration aditiva em `trips`: `planned_route` (jsonb), `planned_distance_meters`,
  `planned_return_distance_meters`, `planned_duration_seconds` (CHECK `>= 0`),
  `planned_route_frozen_at`; `planned_toll` continua e é gravado na mesma escrita.
- **RF2** — Gateway OSRM: segunda chamada `/route` com `exclude=toll`; a opção entra em `options`
  quando a assinatura difere. Cada `option` ganha `signature` e `isNoToll`.
- **RF3** — `POST /trips/:id/plan-route` aceita corpo opcional `{ routeChoice: { signature,
criterion } }`; o aceite multi-veículo aceita `routeChoice` por veículo; o aceite por viagem grava a
  rota. Sem corpo: `cheapest`.
- **RF4** — Seam puro `summarizeRoadDistance` (148 D2) usado pela prévia e pelo congelamento; seam
  puro `selectRouteOption({ options, choice })` para D1/D3.
- **RF5** — `readPlannedDistance` lê `trips.planned_distance_meters`; a valuation da viagem usa o
  pedágio e a distância gravados.
- **RF6** — `POST /trips/valuation-preview` aceita `routeChoice` e conta sobre a rota escolhida.
- **RF7** — `GET /trips/:id/route-geometry` devolve a rota gravada quando existe (`frozen: true`,
  `choiceReproduced`, `criterion`), e a calculada ao vivo com `frozen: false` quando não.
- **RF8** — Reordenar, vincular e desvincular em viagem não despachada recalculam (D6).
- **RF9** — Redação monetária por permissão (D10) num serviço único da API, aplicado em
  route-geometry (os dois), valuation-preview (já exige a permissão), listagem/leitura de NF-e e
  detalhe da viagem.
- **RF10** — Frontend: `TripAssemblyMap` expõe a escolha (`onRouteChoiceChange`) e abre na mais
  barata; criação manual e proposta enviam a escolha; detalhe mostra rota gravada, km, volta,
  aviso de escolha não reproduzida e "rota não calculada"; nenhum valor sem `trip.financials`.
- **RF11** — Aba Regiões em MapLibre; remoção de `VectorMap`, `tripRouteMap.service`,
  `tripBasemap.service`, `tileMap.service`, `resolveRouteTraceSegments`, CSS/locale órfãos e testes
  deles.

- **RF12** — A fila de revisão (`move`/`swap`, spec 148) desvincula a nota e chama
  `reconcileStopOnUnlink` dentro da própria transação: muda o conjunto de paradas das **duas**
  viagens antes do despacho. Origem e destino recalculam com `cheapest` (D6), pela mesma escrita
  atômica da RF1, e o OSRM fora do ar não derruba a movimentação (D5).
- **RF13** — O mapa oferece um switch explícito entre **mais rápida** (menor duração) e **mais
  barata** (menor custo total). As duas saem do mesmo conjunto que a RF2 já trouxe numa ida só, então
  trocar **não chama o OSRM de novo**: as opções ficam como rotas temporárias em mãos e o switch é
  instantâneo. O que a troca dispara é a **regravação** — a opção escolhida volta por `plan-route` e
  a viagem ganha `frozen_at` novo, porque a viagem tem de guardar a rota que o operador escolheu, não
  a que ela abriu. Quando só existe uma opção (OSRM sem alternativa, ou a mais rápida é também a mais
  barata), calcula-se uma só e a **tela avisa** que não há alternativa, em vez de mostrar um switch
  que não muda nada.

> RF12 e RF13 entraram em 2026-09-16, durante a execução, a pedido do usuário. Não reabrem D1–D11:
> a D6 já fala de mudança de parada em geral, e a D1/D2 já preveem os critérios. RF12 é a T206;
> RF13 é da Fase 4.

## Requisitos não funcionais

- Tenant: toda leitura e escrita nova filtra `company_id`.
- MapLibre continua fora do bundle principal (`lazy`) — teto de 2 MiB do precache do PWA.
- Nada disto alimenta CT-e nem MDF-e.
- Logs sem coordenada de cliente nem endereço (security.md §1).

## Casos extremos

- OSRM sem `exclude` suportado (profile sem `excludable`) → a chamada falha isolada, a opção sem
  pedágio não aparece, as demais seguem; log `warn` uma vez por processo.
- Sem pedágio igual à principal → não duplica opção.
- Pedágio desconhecido numa opção → `totalCost` nulo, não é candidata a mais barata (`costGap`).
- Parada sem coordenada → sem rota; nunca rota parcial.
- `end_policy = 'last_stop'` → volta `0`, não `null`.

## Critérios de aceite

1. Contratos vermelhos antes de cada implementação, por task.
2. Paridade: mesma escolha e mesmo gateway falso dão a mesma distância e pedágio na prévia, na
   viagem gravada e no detalhe.
3. Contrato HTTP: sem `trip.financials`, nenhuma das respostas de RF9 contém os campos monetários.
4. Contrato de fonte: nenhuma referência a `VectorMap`, `tripRouteMap.service`, `tripBasemap.service`
   ou `tileMap.service` sobra no frontend.
5. `make check` verde e `make migration-test` com migration e rollback.

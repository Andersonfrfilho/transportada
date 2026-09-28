# Feature 217 — O rascunho da viagem e a troca de tripulação

> Registrada em 2026-09-27, a pedido do dono do produto, a partir de uma pergunta de operação: como
> trocar o motorista e o veículo de uma viagem que já existe. A resposta encontrada foi "hoje, só por
> `curl`, e só na janela de tempo em que ninguém consegue clicar" — a criação no painel planeja a rota
> no mesmo clique, e a troca fica bloqueada a partir de `route_planned`.
>
> **Numeração.** Conferida em 2026-09-27 contra `origin/staging`, `origin/main` e a árvore local
> (`git ls-tree`): a última é a 216. Esta é a **217**.

## Specs do mesmo assunto

- **216 — A viagem pode esperar por motorista e veículo.** É a spec-mãe desta. Entregou o status
  `awaiting_crew` na máquina de estados (D1), a ação `defineCrew` e a rota `PATCH /trips/:id/crew`
  (D5). **Deixou pendente, conferido no código e não pelo `tasks.md`** (que está com todos os
  checkboxes em branco): a RF3 (criação decidindo `awaiting_crew` vs `draft` — `createTripSchema`
  ainda exige os dois campos, `trip-request.schema.ts:34`), a Fase 3 (gaps de valoração), a Fase 4
  (gate de despacho) e a Fase 6 inteira (frontend). A 216 também registrou por escrito, na tabela de
  fora do escopo, que estender a troca além de `draft` e recongelar o pedágio é trabalho de **uma
  spec própria**. Esta é essa spec: o mandato é herdado, não inventado aqui.
- **081 — A viagem sugerida nasce com motorista.** Já decidiu que crew vazio é válido no domínio;
  a trava é só o schema HTTP. Esta spec abre a trava, não redecide a regra.
- **178 — Trocar a rota no rascunho.** Já existe `POST /trips/:id/plan-route` com o painel "Trocar
  rota", liberado em `draft`, `route_planned`, `separating` e `loading`. O recálculo depois da troca
  de veículo **reaproveita esse caminho**; nenhum recálculo novo é escrito.
- **153 — Rota escolhida e mapa único.** D4: a rota nasce inteira numa escrita (`planned_route`,
  `planned_toll`, distâncias, duração e os carimbos juntos). D10: o corte de dinheiro por
  `trip.financials`. Esta spec segue D4 pelo avesso: **a rota morre inteira numa escrita.**
- **145 — (planta de carga).** D5: não existe estado `stale` para a planta de carga; quando a
  entrada muda, o `input_hash` muda e **nasce outra linha** (`trip-cargo-layout.schema.ts:22`).
  Trocar o veículo troca as dimensões do baú, logo a planta se invalida sozinha. Esta spec não
  escreve invalidação de planta.
- **148 — Montagem em parede.** D7/D10/D11: a fila de revisão das notas que não couberam
  (`trip_document_reviews`), alimentada por `placement.unplaced`, com a nota saindo da viagem **por
  botão, nunca sozinha**. É o mecanismo que carrega o aviso de "não cabe no veículo novo" — nenhum
  aviso novo é inventado.
- **156 D10 / 170 RF4 — Ações permitidas no cabeçalho.** `resolveTripAllowedActions`
  (`trip-allowed-actions.policy.ts`) é a fonte única: uma ação só aparece quando a máquina de estados
  a aplicaria agora, servida por `GET /trips/:id/allowed-actions`, com o frontend falhando fechado.
  "Botão que não cabe no estado não é desenhado" (170 RF4). Esta spec **alimenta** essa política; não
  cria tabela de visibilidade no frontend.
- **097 — A viagem começa no barracão.** D1/D3/D4: a rota parte do barracão e volta conforme a
  política da empresa — **não depende do motorista**. D6 (retorno para a casa do agregado) está
  decidido e **não implementado**. Por isso trocar só o motorista não mexe na rota (ver D4 abaixo).

## O problema

Três defeitos que se somam, e nenhum deles aparece sozinho:

1. **A janela de `draft` não existe na prática.** A criação no painel é uma sequência de quatro
   requisições num clique — `createTrip → linkTripDocumentsBatch → reorderTripStops → planTripRoute`
   (`quickCreateTrip.service.ts:31`). O quarto passo leva `draft → route_planned`. Quando o operador
   chega na tela de detalhe, a viagem já passou da janela em que a troca de tripulação é permitida.
2. **A viagem não pode nascer sem tripulação**, apesar de a máquina de estados já saber o que é
   `awaiting_crew`. O operador que ainda não sabe quem dirige não tem onde guardar o trabalho de
   selecionar as notas: ou inventa um motorista, ou perde a seleção.
3. **O status mente sobre a tripulação.** `checkDefineCrew` promove `awaiting_crew → draft`
   **incondicionalmente** (`trip-state.policy.ts:295`), e `updateCrew` grava `vehicleId: null` sem
   reavaliar (`drizzle-trip.repository.ts:337`). Então `PATCH /crew` com `driverIds: []`, ou com só
   um dos dois campos, produz uma viagem `draft` sem tripulação — e `draft` é exatamente a condição
   que faz o botão "Planejar rota" aparecer. A própria T015 da 216 havia escrito o critério certo
   ("com só um dos dois, mantém `awaiting_crew`") e a implementação que entrou não o cumpriu.

## Requisitos funcionais

- **RF1** — O operador salva a seleção de notas como viagem sem tripulação. A viagem nasce
  `awaiting_crew`, com as notas vinculadas e as paradas na ordem do mapa, e **sem** rota planejada.
- **RF2** — `POST /trips` aceita `driverIds` vazio e `vehicleId` ausente (RF3 pendente da 216,
  absorvida aqui), decidindo o status pelo par.
- **RF3** — O status da viagem é **função do par motorista+veículo**, nos dois sentidos: par
  completo é `draft`, par incompleto é `awaiting_crew`. Vale na criação e em toda troca.
- **RF4** — A troca de motorista e veículo é permitida em `awaiting_crew`, `draft` e
  `route_planned`, e recusada de `separating` em diante, com código estável e 409.
- **RF5** — Trocar o **veículo** de uma viagem `route_planned` devolve a viagem para `draft` e apaga,
  na mesma escrita, tudo que foi congelado a partir do veículo antigo. Trocar só o **motorista** não
  mexe na rota.
- **RF6** — "Planejar rota" não é oferecido enquanto a tripulação estiver incompleta, e "Salvar
  rascunho" só existe na criação. A visibilidade vem de `allowed-actions`, não do frontend.
- **RF7** — A viagem `awaiting_crew` mostra "a definir" onde hoje mostraria vazio, e leva selo de
  tripulação pendente na listagem (Fase 6 pendente da 216, absorvida aqui).
- **RF9** — O aceite de sugestão de rota sem motorista cria a viagem em `awaiting_crew`, sem planejar
  rota, em vez de estourar.
- **RF8** — O PWA do motorista reflete a troca: quem saiu da tripulação **é avisado** em vez de ver a
  viagem sumir calada, e a fila offline explica a recusa em português.

## Decisões

### D1 — O status é função do par, não do status anterior

`checkDefineCrew` passa a receber a composição da tripulação resultante, e o desfecho é derivado
dela: par completo (≥1 motorista **e** veículo) é `draft`; qualquer um dos dois faltando é
`awaiting_crew`. Isso conserta o defeito 3 nos dois sentidos — a promoção indevida para `draft` e a
regressão que hoje não acontece quando o operador desfaz a tripulação.

**Por que é a decisão central:** com o status honesto, `checkPlanRoute` (`trip-state.policy.ts:374`)
já exige `draft`, e `draft` já significa "tripulação montada". A RF6 sai de graça: o botão "Planejar
rota" desaparece sozinho para tripulação incompleta, sem uma linha de condição nova no frontend nem
na política de ações permitidas. A alternativa — somar uma condição "tem motorista e veículo" em
`resolveTripAllowedActions` — foi recusada: seria a mesma regra escrita em dois lugares, e um dia
divergem em silêncio.

### D2 — O corte da troca passa a ser a separação

`checkDefineCrew` hoje bloqueia de `route_planned` em diante com `TRIP_CREW_ALREADY_DEFINED`. O corte
passa para `separating`, com um bloqueio novo e nome honesto — `TRIP_SEPARATION_STARTED` — porque a
recusa deixa de ser "já tem tripulação" e passa a ser "o barracão já está contando volume para este
caminhão". `TRIP_CREW_ALREADY_DEFINED` deixa de ter uso e sai.

O limite é o trabalho humano já investido, não o dado: o separador está com papel na mão para um
veículo específico, e trocar o baú debaixo dele é pior que recusar.

### D3 — A rota morre inteira numa escrita, e o operador replaneja

Trocar o veículo em `route_planned` **não recalcula a rota na mesma transação**. A viagem volta para
`draft` e os campos congelados a partir do veículo antigo são zerados na mesma escrita — **sete
colunas, todas de `trips`**: `planned_route`, `planned_route_frozen_at`, `planned_toll`,
`planned_toll_frozen_at`, `planned_distance_meters`, `planned_return_distance_meters`,
`planned_duration_seconds`. Aí o botão "Planejar rota" reaparece (consequência de D1) e o operador usa
o caminho da 178, que já existe e já é testado.

Essas sete são exatamente o que `writePlannedRoute` escreve (conferido campo a campo na T303,
`drizzle-trip-planned-route.repository.ts:84`) — a limpeza é o congelamento pelo avesso, e por isso
reaproveita a mesma escrita, que já sabe gravar tudo nulo quando não há rota.

**A alternativa recusada** foi trocar e replanejar numa transação só. Ela parece mais gentil com o
operador e é pior de três formas: escreve um segundo caminho de congelamento de pedágio ao lado do
da 153 D4 — duas verdades sobre o mesmo número; faz a transação da troca depender do OSRM, um I/O
externo que pode falhar e derrubar uma escrita que já era válida; e esconde do operador que a rota
mudou, quando a rota mudando é justamente o que ele precisa conferir. Zerar é honesto: o número
velho não fica por aí esperando ser lido.

**Nunca zerar sem troca real.** Se o `vehicleId` recebido é o mesmo que já está na viagem, nada é
apagado e o status não regride — a troca é idempotente. Mesma coisa para troca só de motorista: a
rota não depende do motorista hoje (097 D1/D3/D4, com D6 decidido e não implementado), então ela
fica de pé e a viagem permanece `route_planned`.

### D3-bis — A hora prevista de chegada **não** é apagada (corrigido pela T303)

Decisão do dono do produto em 2026-09-27, depois de a T303 conferir o código: a hora que vale é a
ancorada na **partida real do motorista**, e o sistema já faz isso. No clique de quem sai, o ETA de
cada parada desloca o tanto que a saída atrasou (spec 109 D2, `shiftEstimatedArrivals`), e em cada
chegada real as paradas pendentes deslocam de novo pelo atraso (`report-stop-arrival.use-case.ts:96`).
A hora gravada no planejamento é o ponto de partida que o despacho corrige, não uma previsão final.

Por isso a troca **preserva** `trips.eta_departure_at`, `trips.estimated_arrival_frozen_at` e
`trip_stops.estimated_arrival_at`. Três razões, em ordem de gravidade:

1. **Zerar desliga a correção, não só a previsão.** `eta_departure_at` é a âncora do deslocamento;
   com ela nula, `resolveEtaShiftMilliseconds` não desloca nada ("âncora inventada erraria mais que
   não deslocar", `eta-anchor.policy.ts`). A viagem não ficaria sem hora: ficaria com hora que nunca
   mais se corrige.
2. **Hora apagada não volta.** O deslocamento **soma** um delta à hora existente e filtra por
   `isNotNull` — parada com ETA nulo fica fora por construção.
3. **O replanejamento não a reescreveria.** `writeEstimatedArrivals` tem um único chamador,
   `trip-composer.adapter.ts` (o aceite de sugestão de rota). O `POST /trips/:id/plan-route` nunca
   escreve ETA, então apagar seria perda definitiva, e o portal do contratante passaria a mostrar
   vazio onde havia uma hora.

O que a troca deixa desatualizado é a duração por perna do veículo antigo embutida nessas horas — e é
o menor dos males: a tela já mostra de quando a previsão é (`estimated_arrival_frozen_at`, spec 107
D3), e o despacho a re-ancora na saída real.

⚠️ **`trip_stops.distance_from_previous_meters` e `duration_from_previous_seconds` ficam fora da
limpeza porque ninguém as escreve.** A T303 conferiu: no módulo de viagens não existe um único
gravador delas; os que existem são das colunas homônimas de `route_suggestion_stops`, que é outra
tabela. Zerá-las seria fingir que alguém as congela. Ficam como estão, e quem for usá-las um dia
precisa entrar nesta lista.

### D4 — A carga que não cabe no veículo novo entra na fila de revisão, e nunca bloqueia

Decisão do dono do produto em 2026-09-27: a troca **acontece** mesmo que a carga não caiba no baú
novo. Não é preciso mecanismo novo: a planta é indexada por `input_hash`, que inclui as dimensões do
baú, então trocar o veículo já faz nascer outra planta (145 D5) — a antiga fica como histórico. A
planta nova, se a carga não couber, nasce com `placement.unplaced` preenchido, e isso já alimenta a
fila de revisão da 148, que é onde o operador vê quais notas não couberam e as tira da viagem por
botão. O aviso na tela é a entrada de revisão existente enchendo, não um alerta novo.

### D5 — "Salvar rascunho" é adicional, não substituto

O botão de criar-e-planejar num clique **permanece** e continua exigindo notas, motorista e veículo.
Ele está em produção e é o caminho de quem já tem tudo na mão; trocá-lo por dois cliques penalizaria
a viagem normal para servir a exceção. "Salvar rascunho" fica ao lado, exigindo apenas ≥1 nota —
`validateQuickCreate` (`tripQuickCreate.service.ts:166`) deixa de empurrar `driverRequired` e
`vehicleRequired` no caminho do rascunho, e continua empurrando os dois no caminho do clique único.
O rascunho salva com ou sem tripulação: quem já escolheu motorista e veículo e ainda não quer
planejar a rota também usa o botão, e a viagem nasce `draft` (consequência de D1).

### D6 — O motorista é avisado quando a viagem deixa de ser dele

O motorista vê a viagem a partir de `route_planned` — `CURRENT_DRIVER_TRIP_STATUSES`
(`drizzle-current-driver-trip.repository.ts:73`) começa um passo antes de `dispatched`, porque é ele
quem despacha pelo app (ADR-0058). Então **a troca acontece com a viagem já no celular dele**, e hoje
ela simplesmente desaparece de `GET /me/trips/current`: `resolveSelectedTrip` cai para a viagem
seguinte ou para a tela vazia, sem distinguir "reatribuída" de "concluída".

A app passa a dizer o que aconteceu, no molde do aviso que já existe para a fila de outra conta
(`DriverForeignPendingNotice.component.tsx`). Com D3, o efeito é mais amplo e é o correto: a troca de
veículo devolve a viagem para `draft`, que não está em `CURRENT_DRIVER_TRIP_STATUSES` — a viagem sai
do celular **de todos** até a rota ser replanejada. Ninguém deve estar dirigindo para um roteiro que
foi invalidado.

### D7 — A fila offline já recusa certo; falta a fila falar português

A fila offline classifica recusa do servidor como `rejected` e **não retenta** — "reenviar o que ele
já disse que não aceita repetiria a recusa para sempre" (`offlineQueue.service.ts:175`). Como a API
responde 403 `TRIP_NOT_OF_DRIVER` ou 404 `TRIP_STOP_NOT_REACHABLE` para quem saiu da tripulação, o
mecanismo já está correto e não muda. O que falta é tradução: `rejectionCauseLabel.service.ts` só
conhece dois códigos, e o motorista veria `404 TRIP_STOP_NOT_REACHABLE` cru. Os dois códigos entram
com texto de produto.

### D8 — Nenhum documento fiscal é invalidado pela troca

Verificado, e vale registrar para que ninguém precise verificar de novo: o MDF-e só é aceito de
`dispatched` em diante (`isTripDispatched` em `trip-manifest.policy.ts:54`), que está fora da janela
da troca por D2; e o payload do CT-e leva apenas o RNTRC da transportadora no modal rodoviário
(`cte-payload.builder.ts:198`), sem placa nem condutor. A troca não mexe em documento autorizado.

### D10 — O aceite de sugestão sem motorista para em rascunho (achado da T203)

Decisão do dono do produto em 2026-09-27, depois de a T203 quebrar seis testes de integração: **o
rascunho tem que poder existir sem motorista e sem veículo**, e o aceite de sugestão passa a
desembocar nele.

O conflito era real e esta spec o criou. A 081 RF-5 decidiu que aceitar um grupo sugerido **sem
motorista** é legítimo — escalar metade da frota na véspera e metade no dia é o uso normal — e o
aceite planejava a rota na hora. Com a D1, essa viagem nasce `awaiting_crew`, e `awaiting_crew` recusa
tudo que não é definir tripulação ou cancelar: o `planRoute` que o próprio aceite chamava respondia
409 `TRIP_CREW_NOT_DEFINED` e **derrubava o lote inteiro**.

Resolução: o aceite só planeja a rota quando a tripulação nasce completa, e a condição é
`resolveCrewStatus` — a mesma função do nascimento e da troca. Uma regra, três leitoras. O grupo sem
motorista fica em `awaiting_crew` com tudo que o aceite já fazia: veículo, notas vinculadas, paradas na
ordem do solver e as horas do solver gravadas. O operador define quem dirige e planeja a rota pelo
botão.

⚠️ **É mudança de comportamento em produção**, e vale dizer em voz alta: hoje esse aceite entrega a
rota pronta, e depois desta spec ele entrega um rascunho quando não há motorista. Foi decisão
consciente, tomada com a alternativa na mesa (afrouxar "Planejar rota" para exigir só o veículo, já
que rota e pedágio dependem do caminhão e não de quem dirige) — recusada porque a regra pedida para o
painel é "rota só com motorista e veículo", e duas regras diferentes para o mesmo botão é como a tela
passa a discordar do servidor.

### D9 — Notificar o motorista por push/sino fica fora do escopo

Não existe hoje nenhum aviso de atribuição ou remoção de motorista — nem push, nem e-mail, nem sino:
o catálogo de notificação não tem tipo para isso. Criar um seria feature de ponta a ponta (evento de
domínio na escrita de `trip_drivers`, tipo novo no catálogo, fila, e o sino do PWA). O aviso de D6 é
na própria tela, síncrono com a leitura, e resolve o caso do motorista que está com o app aberto.
O push fica registrado como decisão consciente de não fazer agora.

## Cenários de aceite

1. **Rascunho sem tripulação.** Operador seleciona três notas, não escolhe motorista nem veículo, e
   clica em "Salvar rascunho". A viagem existe, está `awaiting_crew`, tem as três notas vinculadas e
   as paradas na ordem do mapa. Não tem rota planejada, e a tela de detalhe não oferece "Planejar
   rota".
2. **Rascunho com tripulação.** Mesmo fluxo, com motorista e veículo escolhidos. A viagem nasce
   `draft` e o detalhe oferece "Planejar rota".
3. **Definir tripulação.** Na viagem `awaiting_crew`, o operador define motorista e veículo. A viagem
   vira `draft` e "Planejar rota" aparece.
4. **Tripulação pela metade.** Na viagem `awaiting_crew`, o operador define só o veículo. A viagem
   **continua** `awaiting_crew` e "Planejar rota" **não** aparece.
5. **Desfazer a tripulação.** Na viagem `draft`, o operador remove o motorista. A viagem volta para
   `awaiting_crew` e "Planejar rota" desaparece.
6. **Troca de motorista em `route_planned`.** A viagem continua `route_planned`, a rota e o pedágio
   ficam de pé, o motorista novo passa a ver a viagem no PWA e o antigo recebe o aviso de que ela não
   é mais dele.
7. **Troca de veículo em `route_planned`.** A viagem volta para `draft`, as sete colunas de rota e
   pedágio ficam nulas, **as horas previstas de chegada continuam lá** (D3-bis), a viagem sai do PWA
   de todos, e "Planejar rota" reaparece no painel. Depois do replanejamento, o pedágio corresponde
   aos eixos do veículo novo.
8. **Troca de veículo pelo mesmo veículo.** Nada é apagado, o status não regride, a resposta é 200.
9. **Troca depois da separação.** Em `separating`, a troca é recusada com 409
   `TRIP_SEPARATION_STARTED`.
10. **Carga que não cabe.** Troca para um veículo de baú menor: a troca acontece, a planta nova nasce
    com notas em `unplaced`, e a fila de revisão da 148 mostra quais são.
11. **Fila offline do motorista removido.** Ação enfileirada de quem saiu da tripulação é recusada
    uma vez, sai da fila e aparece em `/fila` com texto em português, não com o código cru.

## Casos extremos

- **Viagem `awaiting_crew` cancelada** continua permitida (216 D1) — a troca não mexe nisso.
- **Viagem sem veículo e o cálculo de valoração/pedágio:** a Fase 3 da 216 está aberta, e agora passa
  a ter usuário de verdade, porque RF1 cria viagens sem veículo pelo painel. Os gaps nomeados entram
  no escopo desta spec (ver `plan.md`).
- **Duas sessões no mesmo rascunho:** a troca é `PATCH` sobre o estado inteiro da tripulação, com
  `select ... for no key update` já presente em `updateCrew` — a última escrita ganha, e o status
  derivado por D1 nunca fica inconsistente com as linhas de `trip_drivers`.
- **Rascunho local vs viagem rascunho:** o `tripAssemblyDraft` (localStorage) continua sendo o
  rascunho da _tela_, anterior à viagem. "Salvar rascunho" cria a viagem e limpa o rascunho local,
  como o botão de criar já faz. São dois rascunhos com o mesmo nome, e a UI precisa não confundi-los.

## Fora do escopo

- Push/e-mail/sino de troca de tripulação (D9).
- Troca de tripulação de `separating` em diante (D2) — inclusive "trocar o caminhão que quebrou no
  meio do carregamento", que é caso real e precisa de spec própria, com o que fazer com a separação
  já feita.
- Retorno para a casa do agregado (097 D6), que faria a rota depender do motorista e mudaria D3.
- Gate de despacho com tripulação incompleta (Fase 4 da 216): `checkTripTransition` já bloqueia tudo
  em `awaiting_crew` exceto `defineCrew` e `cancel`, e com D1 não existe mais `draft` com tripulação
  incompleta — a Fase 4 perde o caso que a motivava. Se sobrar caso, é spec própria.

## Success criteria

- Nenhuma viagem em `draft` sem motorista **e** veículo, e nenhuma em `awaiting_crew` com os dois —
  provado por teste de contrato sobre `checkDefineCrew` e por integração sobre `PATCH /crew`.
- Nenhum `planned_toll` congelado com eixo de veículo que não é mais o da viagem — provado por
  integração: trocar veículo em `route_planned` e ler a viagem devolve pedágio nulo, não o antigo.
- "Planejar rota" nunca oferecido por `allowed-actions` para viagem sem tripulação completa.
- Motorista removido da tripulação nunca vê a viagem sumir sem explicação, e nunca vê código de erro
  cru na fila.
- `make check` e `make migration-test` verdes; contratos de regressão da 081, 148, 153, 178, MDF-e e
  valoração passando.

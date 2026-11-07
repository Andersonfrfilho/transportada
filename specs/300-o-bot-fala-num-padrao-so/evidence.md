# Evidence — 300 O bot fala num padrão só

## Fase 0 — 2026-11-07

### T0.1 🧠 (executor `opus`) — decisões em `plan.md` § "Decisões da T0.1"

- Distância/tempo da lista: OSRM `table`, uma chamada, porta nova `trips/application/route-distance-table.port.ts` +
  `trips/infrastructure/osrm-route-distance-table.gateway.ts` (devolve `null`, nunca lança). Origem igual ao bloco
  (`whatsapp-stop-card.reader.ts` `resolveEtaOrigin`/`lastPointOf`, 294 RF30).
- Corte: 10 primeiras paradas + `_E mais K paradas (X a Y): responda com o número da parada ou da nota._`. Medido
  (UTF-16, pior caso, script `measure-stop-list.ts` no scratchpad da sessão): 15 completas = 4112 (passa de 4096);
  15 como o desenho = 3825; 10 + rodapé = 2842. Bloco = 299 caracteres em citação, 264 sem.
- Conversa individual: o mesmo texto do grupo por `sendText` (`describeStopChoice` → `say({ text })`); lista
  interativa da Meta não comporta (corpo 1024, título 24). `pickStopOption` passa a ler número da parada na T3.2.

### T0.2 (executor `sonnet`) — staging, só leitura

- Publicar **preserva** todo `fala_*` vivo não vazio, editado ou não: `whatsapp-bot-speech.policy.ts:52-65`
  (`preserveEditedBotSpeech`), chamado em `publish-whatsapp-flow-graph.use-case.ts:107` (prévia em `:65`).
- Staging: `meta_whatsapp.flow_graphs` chave `transportada_root`, v2, 70 nós `fala_*` (o código define 70). Histórico só
  com `source=code`; nenhum `source=panel` → **nenhum nó editado pela empresa**. 8 nós já diferem do padrão atual
  do código (texto de publicação anterior): `fala_delivery_registered`, `fala_return_registered`,
  `fala_arrival_registered`, `fala_departure_registered`, `fala_group_delivery_registered`,
  `fala_group_delivery_stop_completed`, `fala_group_delivery_trip_completed`, `fala_group_return_registered`.
- Consulta: `SELECT` em `meta_whatsapp.flow_graphs`/histórico via `railway ssh … -e staging -- bun -e`, imprimindo só
  ids. Produção não consultada.
- **Consequência para a T6.1:** trocar o padrão e republicar não leva o texto novo a nenhum nó já semeado. Proposta
  (decisão pendente, registrada em `plan.md`): a publicação regrava só o nó cujo texto vivo é igual ao da última
  versão `source=code`; nó com texto diferente disso (editado no painel) fica. Rodar em staging/produção pede aprovação.

## Fase 1

### T1.1 / T1.2 (executor `sonnet`)

- Contrato: `test/whatsapp-commands/whatsapp-message-format.contract.ts` (13 testes, texto inteiro com `toBe`), ligado em
  `test/whatsapp-commands.contract.test.ts`. Vermelho pelo motivo certo: `Cannot find module ...whatsapp-message-format.policy.js`
  (commit `df9f59317`).
- Módulo: `src/whatsapp-commands/domain/whatsapp-message-format.policy.ts` (~125 linhas). Citação `right` e `off-route` usam o
  mesmo prefixo `> ` (o `>!` laranja do desenho não existe no WhatsApp).
- Gates: o contrato novo 13 pass / 0 fail · `bun run typecheck` limpo · `bun test --timeout 120000` 14313 pass / 26 skip /
  0 fail (224 arquivos) · eslint e prettier limpos nos arquivos tocados.
- `test:integration`: **não concluído** (interrompido). Carga da máquina em ~32 (outras sessões pesadas): cada arquivo
  espera mais de 10 s só no `migrate` do banco descartável e o comando não passou do 2º arquivo em ~6 min (duas tentativas,
  a primeira morta pelo `timeout 580`). A mudança é um módulo puro novo e não toca banco nem `test/integration/**`; rodar a
  integração completa na T2.1 (que mexe na consulta) com a máquina livre.

## Fase 2

### T2.1 (executor `sonnet`)

- `WhatsAppStopCandidate` ganhou `city?`, `district?`, `coordinate?` (opcionais). Leitor novo
  `whatsapp-commands/infrastructure/whatsapp-stop-place.reader.ts` (`readStopPlaces`, `placeStops`): UMA consulta
  (`trip_documents` → `nfe_participants` papel `recipient` → `nfe_addresses`, nota não liberada, primeira nota com endereço
  por parada); a caixa vem de `formatPlaceName` (`whatsapp-stop-place.policy.ts`: "SAO JOAQUIM DA BARRA" → "Sao Joaquim da Barra",
  conectivos em minúscula, sem acento inventado). Ligado nos dois `listStops`: grupo (`whatsapp-group-stop.adapter.ts`
  `listOpenStops`) e individual (`main.ts` `listWhatsAppDriverStops`). Falha na leitura devolve as paradas como vieram.
- Integração `test/integration/whatsapp-stop-place.integration.ts` (Postgres real): nota com endereço, sem endereço, sem
  bairro; coordenada da parada (string → número) e `queryCount() === 1`. Entrou na lista do `package.json`.
- Gates: typecheck limpo · `bun test --timeout 120000` 14313 pass / 26 skip / 0 fail · eslint e prettier limpos ·
  integração: o arquivo novo 1 pass, mais os que cobrem as consultas tocadas (`whatsapp-driver-journey-group`,
  `whatsapp-driver-journey-direct`, `whatsapp-driver-flow-actions`, `driver-current-trip-query-count`) 10 pass / 0 fail no
  total. **A suíte `test:integration` completa não rodou** (carga da máquina ~30, o `migrate` por arquivo passa de 10 s);
  fica para a T6.2.

### T2.2 (executor `sonnet`)

- Porta `trips/application/route-distance-table.port.ts` (`readDistancesFrom(origin, destinations)` → um item por destino,
  `null` na parada sem estrada, `null` inteiro se o serviço falha) e adaptador
  `trips/infrastructure/osrm-route-distance-table.gateway.ts` (OSRM `/table`, `sources=0&annotations=duration,distance`, 5 s,
  resposta validada com zod, nunca lança). Leitor `whatsapp-commands/infrastructure/whatsapp-stop-list-travel.reader.ts`
  (`createWhatsAppStopListTravelReader`, devolve `{ byStopId: { distance, duration }, isLocationMissing }`); a origem é a do
  bloco (`resolveEtaOrigin` + último ponto, agora `readLastSharedPoint` exportado de `whatsapp-stop-card.reader.ts`, sem mudar
  comportamento). Formatação reaproveita o arquivo do bloco: `describeListDistance`/`describeListDuration` em
  `whatsapp-stop-card.policy.ts` ("108 km", "3,2 km", "~45 min", "~1 h 25 min"; `roundMinutes` compartilhado com
  `describeStopEta`).
- Contrato `test/whatsapp-commands/stop-list-travel.contract.ts` (7 testes, `toEqual`): com ponto (uma chamada, só paradas com
  coordenada), sem ponto (nenhuma chamada, `isLocationMissing`), OSRM fora (sem linha, sem rodapé, log sem PII), uma parada
  sem estrada, sem serviço configurado, formatação, e o gateway (URL, célula `null`, resposta malformada/HTTP/rede → `null`).
- **Ligação no `main.ts` adiada para a T3.2**: o eslint reprova `whatsappStopListTravel` sem consumidor
  (`no-unused-vars`); a T3.2 cria o primeiro consumidor (a lista) e liga `createOsrmRouteDistanceTableGateway` no mesmo
  `config.routingMatrixUrl`, `readOriginPoint` com `readLastSharedPoint(database.db, …)`.
- Gates: typecheck limpo · `bun test --timeout 120000` 14321 pass / 26 skip / 0 fail · eslint e prettier limpos.
  `test:integration` não rodou (carga ~30); a T2.2 não toca banco além da extração de `readLastSharedPoint`, sem integração
  que a cubra diretamente. Suíte completa fica para a T6.2.

## Fase 3

### T3.1 (executor `sonnet`)

- Menu do grupo (`whatsapp-group-driver-flow.service.ts`): itens com `icon` + `action`, montados por `formatOptions`; título em
  negrito, instrução `_Responda com o número._`; `↩️ Não entreguei` é a opção 4 e Ocorrência a 5 (RF8). A opção 4 (ou o nome
  "não entreguei") chama `returnFlow.begin(turn, { numbers: [] })`, o mesmo `begin` do comando escrito (que também passa
  `numbers` vazio quando não há nota); sem o fluxo de devolução montado cai na ocorrência, como as outras opções.
  `menuWithoutDelivery` continua sem "Entreguei" (agora: Saí, Cheguei, Não entreguei, Ocorrência).
- "Não entendi" padrão (`whatsapp-group-request.service.ts`, `GROUP_REQUEST_TEXT.notUnderstood`): `🤔 *Não entendi.* <Motivo>` +
  `prompt`; o motivo ganha inicial maiúscula e ponto (o que termina em `:` fica). No menu: motivo `Responda com o número da opção:` e
  prompt só com as opções. Ocupado e cancelar com o texto do desenho (`⏳ *Já tem um pedido aberto neste grupo.*…`,
  `↩️ *Pedido cancelado.* Nada foi registrado.` + próximo passo). `bot-greeting.policy.ts` não muda: "Boa noite, Anderson! 👋"
  já é o do desenho (a menção `@nome` é do envio).
- Fora da T3.1 (ficam para as tasks do fluxo): `Não entendi:` da conversa individual (`whatsapp-driver-prompts.service.ts:640,720`),
  `gaveUp` (T5.4), reasons dos outros fluxos de grupo (hoje só ganham o prefixo e a inicial maiúscula).
- Contratos: novo `test/whatsapp/group-driver-menu.contract.ts` (menu e "não entendi" do desenho com `toEqual`/`toBe`, opção 4 igual
  ao comando escrito) em `whatsapp.contract.test.ts`; atualizados `group-delivery-flow`, `group-stop-flow`, `group-request-session`,
  fixture `driver-journey-group.expected.ts` e a integração `whatsapp-driver-journey-group` para o texto novo (nenhum `toContain`).
- Gates: typecheck limpo · `bun test --timeout 120000` 14325 pass / 26 skip / 0 fail (inclui `literal-message-text`, sem exceção
  nova) · eslint e prettier limpos · integração `whatsapp-driver-journey-group` 2 pass / 0 fail. Suíte `test:integration` completa
  fica para a T6.2 (máquina carregada).

### T3.2 (executor `sonnet`)

- Módulo puro novo `whatsapp-commands/domain/whatsapp-stop-list.policy.ts` (164 linhas): `formatStopList` (título, 10 blocos com `formatStopBlock`,
  a primeira em citação com `👉 *PARADA N de M* · _próxima da rota_`, rodapé `_Responda com o número da parada ou da nota._` ou
  `_E mais K paradas (X a Y): responda …_`, e `📎 _Mande sua localização…_` por último quando falta ponto), `pickStopFromList`
  (RF5: número da parada primeiro, depois nota; fora da lista → motivo `Não achei a parada 12 nesta viagem.`, nota →
  `Não achei a nota N nesta viagem.`, texto → `Não achei essa parada na lista.`) e `describeStopListNotUnderstood`
  (`🤔 *Não entendi.* <motivo>` + `_Responda com o número da parada (3 a 7) ou da nota._`, como no desenho).
  `formatStopBlock` ganhou `otherInvoiceNumbers` (várias notas na mesma linha, ``NF `a`, `b` ``) e a linha 🧾 sem cliente quando o nome falta.
- Grupo (`whatsapp-group-stop-flow.service.ts`): `askStopText`/`pickStop` saíram; porta nova `readStopListTravel?`; o estado do passo
  guarda `sequence` por parada; `afterResolution` passou a receber um objeto (era 6 parâmetros) com `totalStops` (todas as paradas da
  viagem = o "M"). Individual (`whatsapp-driver-prompts.service.ts` → `stopChoice`/`answerStopChoice`): mesma lista por `sendText`
  (D3), `DriverPromptStopOption.sequence` persistido (pedido antigo sem `sequence` volta à posição na lista).
- Ligação no `main.ts`: `createDriverStopListTravel` (acha a viagem da parada) sobre `createWhatsAppStopListTravelReader`
  (`readOriginPoint` = `readLastSharedPoint(database.db, …)`, `table` = `createOsrmRouteDistanceTableGateway` no mesmo
  `config.routingMatrixUrl`), entregue ao `createGroupStopPorts` e ao `createWhatsAppDriverPrompts`. Falha da estrada nunca derruba a lista.
- Divergências/decisões a registrar: (1) o desenho só mostra a lista de "saí"; a de "cheguei" usa `📍 *Em qual parada você chegou?*`
  no mesmo padrão. (2) "Não entendi" de número fora da lista leva só a instrução com o intervalo (como no desenho), não a lista de novo.
  (3) `📎` fica depois da instrução (a lista "termina com" ele).
- Contratos: `test/whatsapp-commands/whatsapp-stop-list.contract.ts` (paradas 3–7 do desenho com ponto e sem ponto, OSRM fora, parada
  sem estrada, corte em 10, escolha pelo número da parada/nota, fora da lista) e `driver-stop-choice.contract.ts` (individual);
  `group-stop-flow` ganhou RF4/RF5 e perdeu os `toContain` da lista antiga; fixtures e integrações das jornadas (grupo e individual)
  atualizadas ao texto novo (e a escolha da lista agora é pelo número da parada: `3` onde era a posição `2`).
- Gates: typecheck limpo · `bun test --timeout 120000` 14341 pass / 26 skip / 0 fail (inclui `literal-message-text`, sem exceção nova) ·
  eslint e prettier limpos · integração: `whatsapp-driver-journey-group` 2 pass, `whatsapp-driver-journey-direct` 2 pass,
  `whatsapp-driver-flow-actions` 4 pass, `whatsapp-stop-place` 1 pass (uma tentativa do flow-actions estourou o timeout de 5 s do
  `migrate` sob carga e passou ao repetir com `--timeout`). Suíte `test:integration` completa fica para a T6.2.

### T3.3 (executor `sonnet`)

- Bloco único: `whatsapp-stop-block.policy.ts` (`describeStopBlock`, `describeStopDetails`, `toMessageStop`) traduz o `StopCard` para o
  `formatStopBlock`; `StopCard` ganhou `district` (o leitor do bloco ainda não o preenche: bairro só vem das candidatas da lista, o menu
  mostra a cidade do rótulo). `buildRouteOfferMapUrl` passou ao link `dir` (RF7b) em todo bloco, inclusive os antigos que a T3.4/T3.5 ainda trocam.
- Saída: fala `departureRegistered` = `🚚 *Saída registrada* · {{time}}` (a hora do WhatsApp da mensagem; `describeWhatsAppDriverEventResult` recebe `time`);
  `describeDepartureReply` = fala + bloco `card` em citação + `💰 Valor da nota` + `⏱️ Chegada prevista: *~HH:MM*` (só com estrada) + aviso de endereço sem
  localização certa (depois do bloco) + próximo passo. Pedido de localização do desenho em `LOCATION_PROMPT_TEXT` (`ask`, `askUnreliableAddress`,
  `askAgain`; o grupo junta `askAgainReason` + `askAgainHint` pelo "não entendi" padrão) e `describeLocationPrompt`.
- "Já a caminho" (RF9): `describeAlreadyDeparted(view, headline)` com a fala `stopEnRoute` (`⚠️ *Você já está a caminho da parada N.*` + instrução) e o menu
  `Cheguei na *parada N* / Abrir ocorrência / Nada por enquanto`, o mesmo `describeMenu` do repetido (294 RF28). Grupo (`alreadyDeparted`, também no ramo
  `en_route` da resolução) e individual (`repeatedEvent`, `stopChoice`) pela mesma função. Consequência: "saí 5" com outra parada a caminho agora abre o menu da
  parada a caminho (como no desenho), em vez de só avisar; o contrato `group-driver-journey` ("saí 0090003") foi atualizado.
- Menus (`describeMenu`): bloco `list` em citação + `*O que você quer fazer agora?*` + `formatOptions` (ícone + ação inteira, `Cheguei na *parada N*`,
  `Seguir para a *parada N*`; `JourneyAction` arrive/depart guardam `sequence`, `readJourneyActions` lê). Baixa pendente: `⚠️ *Falta a baixa da parada N.*` +
  `Você chegou às HH:MM…`. "Não entendi" do menu: `🤔 *Não entendi.* Responda com o número da opção:` + opções (individual: `describeJourneyNotUnderstood`;
  grupo: motivo `JOURNEY_TEXT.choiceNotUnderstood` + `describeJourneyOptions`). `Nada por enquanto`: `NOTHING_RECORDED_TEXT` (`👍 *Certo, nada foi registrado.*`, no
  módulo de formato) e próximo passo com `*foto do canhoto*` em negrito.
- Fora da rota: `OUT_OF_ORDER_TEXT.question.depart/arrive` com os dois blocos em citação (`toOrderStopLabel(stop, { total, travel })` leva o bloco; a saída
  mostra 📏/⏱️ pela porta de distância da lista, a chegada não), `describeOutOfOrderChoices`/`describeOutOfOrderNotUnderstood` (opções por extenso; o número das
  duas paradas vem da viagem de agora, sem mudar o que o pedido guarda), `OUT_OF_ORDER_TEXT.discarded` = `↩️ *Descartado.* Nada foi registrado.` (vale também para a
  entrega, que **mantém** o texto antigo da pergunta até a T4.4).
- Entram nesta task, por dividirem o mesmo código: o menu de "cheguei repetido", a chegada fora da rota e o pedido de localização de "cheguei" sem localização
  certa (T3.4 resta: chegada registrada, endereço corrigido, `fala_arrival_registered`) e as opções `Seguir para a *parada N*` da oferta (T3.5 resta: bloco da oferta,
  rota concluída).
- Divergências/decisões: (1) o desenho só mostra o pedido de localização da saída; "cheguei" com endereço certo usa o mesmo `ask`. (2) Os dois blocos de "fora da
  rota" usam o mesmo prefixo `> ` (o `>!` laranja não existe no WhatsApp, já registrado na T1.2). (3) Mensagens vivas no grafo (`fala_departure_registered`,
  `fala_stop_en_route`) mantêm o texto antigo até a regravação da T6.1.
- Contratos: novo `test/whatsapp-commands/whatsapp-stop-flow-design.contract.ts` (texto do desenho dos fluxos 2 e 3, com a fixture das paradas 3 e 7, `toBe` inteiro,
  ligado em `whatsapp-commands.contract.test.ts`); atualizados driver-journey, driver-events, driver-stop-flow-actions, out-of-order-prompt, route-offer,
  stop-location-prompt, group-stop-flow, group-driver-journey, group-route-offer, group-stop-location, group-out-of-order, audio-new-steps e as fixtures
  `driver-journey-{group,direct}.expected.ts` (gravadas com `JOURNEY_RECORD=1` e conferidas contra o desenho). Nenhum `toContain` novo para texto de mensagem inteira.
- Gates: typecheck limpo · `bun test --timeout 120000` 14351 pass / 26 skip / 0 fail (inclui `literal-message-text`, sem exceção nova) · eslint e prettier limpos ·
  integração (máquina carregada, um arquivo por vez): `whatsapp-driver-journey-group` 2 pass, `whatsapp-driver-journey-direct` 2 pass, `whatsapp-driver-flow-actions` 4 pass,
  `whatsapp-command-driver` 5 pass, `whatsapp-stop-place` 1 pass. Suíte `test:integration` completa fica para a T6.2.

### T3.4 (executor `sonnet`)

- Chegada registrada: fala `arrivalRegistered` = `📍 *Chegada registrada* · {{time}}` (a hora do WhatsApp da mensagem); `describeArrivalReply` = fala + linhas do
  `after` (endereço corrigido/sugestão) + bloco `card` em citação com `💰 Valor da nota` + `🔜 *Depois desta:* parada N · cliente – cidade` + próximo passo
  (`*foto do canhoto*`). Mesma função no grupo (`whatsapp-group-stop.adapter.ts`) e na individual (`whatsapp-driver-prompts.service.ts:recordStop`).
- `whatsapp-driver-event-speech.service.ts`: `ADDRESS_CORRECTION_TEXT.applied` = `✅ _Endereço corrigido pela sua localização._`, `.suggested` = `📬 _Enviei para o
  escritório conferir o endereço._` (a sugestão não está no desenho: mesma voz da correção).
- Leitor do bloco (`whatsapp-stop-card.reader.ts`): passa pelo mesmo `placeStops` da lista (uma consulta, melhor esforço) e o `StopCard` ganha `district` e a cidade do
  endereço do destinatário (a do rótulo é o recuo): o menu e a prévia mostram "Centro, Guaira" como a lista. `describeStopShort`/`describeArrivalDetails` saíram (sem uso).
- Já feitos na T3.3 (mesmo código): endereço sem localização certa, cheguei repetido (`A chegada na parada N já foi registrada`), "nada por enquanto" e chegada fora da rota.
- Divergência: nas fixtures das jornadas a cidade vem do endereço da nota do destinatário (todas "Ribeirao Preto" nos dados semeados), não do rótulo da parada.
- Contratos: `whatsapp-stop-flow-design.contract.ts` ganhou a chegada com endereço corrigido (texto do desenho, `toBe`); atualizados driver-journey, recorded-together-speech,
  stop-location-prompt, group-stop-location, group-out-of-order e as fixtures/integrações das jornadas (regravadas com `JOURNEY_RECORD=1` e conferidas contra o desenho).
- Gates: typecheck limpo · `bun test --timeout 120000` 14352 pass / 26 skip / 0 fail · eslint e prettier limpos · integração: `whatsapp-driver-journey-group` 2 pass,
  `whatsapp-driver-journey-direct` 2 pass, `whatsapp-driver-flow-actions` 4 pass, `whatsapp-command-driver` 5 pass. Suíte completa na T6.2.

### T3.5 (executor `sonnet`)

- Oferta da próxima (`describeNextRouteOffer(view, { asks })`, sem relógio): `➡️ *Próxima parada*` + bloco `list` em citação (bairro e cidade, `📏`/`⏱️` da estrada
  quando há ponto, `🗺️ *Como chegar:* <dir>`) + aviso de endereço sem localização certa + `*O que você quer fazer agora?*` e `Seguir para a *parada N*` / `Escolher outra da
  lista` / `Nada por enquanto` (ou só o próximo passo, sem pergunta). Sem o leitor (bloco mínimo da oferta da API), a linha do lugar traz o endereço da parada em vez de sumir.
  RF7b: o link `dir` já estava em todo bloco desde a T3.3 (`buildRouteOfferMapUrl` e `formatDirectionsUrl`).
- Recuo: `ROUTE_OFFER_TEXT.declined` e `JOURNEY_TEXT.nothingRecorded` = `👍 *Certo, nada foi registrado.*` + `➡️ _Próximo passo:_ quando for sair, mande *saí*.`
  (contrato do desenho). A pergunta legada 1/2 do passo `route.offer` (pedido aberto antes do menu de ações) segue com o texto antigo das opções.
- Rota concluída (RF12): `describeRouteCompleted({ totalStops, driverName })` = `🏁 *Rota concluída!* Todas as N paradas estão fechadas.` e, com nome, `Bom descanso,
  <primeiro nome>. 🌙` (nome em iniciais maiúsculas, sem marcador do WhatsApp; sem nome, sem a frase; sem número ou com 1 parada, `Todas as paradas estão fechadas.`).
  **De onde vem o nome:** a última baixa conclui a viagem e ela sai de `listActiveTrips`, e a baixa da API não devolve nome nem total quando a viagem fecha; foi preciso UMA
  consulta, só na rota concluída: `whatsapp-commands/infrastructure/whatsapp-route-closing.reader.ts` (`trip_drivers.driver_name` do motorista na viagem `completed` mais
  recente + `count(trip_stops)`), melhor esforço (falha → mensagem sem número e sem nome, log só com empresa e erro). Porta `readRouteClosing?` no grupo
  (`routeCompletedText`, também no "nada por enquanto" e na nota já baixada sem pendente) e `routeClosing?` na conversa individual (`buildRouteOfferReply`, `nextStepOf`); ligadas
  no `main.ts`. A frase substitui `ROUTE_OFFER_TEXT.routeCompleted` (removido).
- Divergência spec × desenho: a spec e o pedido escrevem `🏁 _Rota concluída!_` em itálico; o desenho (`conversas.html`, fluxo 4) usa negrito `*Rota concluída!*`. Segui o desenho.
  A primeira linha do desenho (`✅ *NF … entregue.* Parada concluída.`) é da entrega (T4.2): hoje a despedida segue como mensagem separada depois da fala da baixa.
- Contratos: `whatsapp-stop-flow-design.contract.ts` ganhou o fluxo 4 (oferta com estrada, recuo, rota concluída com e sem nome/total); atualizados group-route-offer,
  route-offer (com `routeClosing`/`readRouteClosing` nos dublês), driver-journey e as fixtures/integrações das jornadas (as duas já exercitam o leitor real em Postgres:
  "Todas as 3 paradas estão fechadas. Bom descanso, Motorista.").
- Gates: typecheck limpo · `bun test --timeout 120000` 14355 pass / 26 skip / 0 fail (inclui `literal-message-text`, sem exceção nova) · eslint e prettier limpos · integração:
  `whatsapp-driver-journey-group` 2 pass, `whatsapp-driver-journey-direct` 2 pass, `whatsapp-driver-flow-actions` 4 pass, `whatsapp-command-driver` 5 pass. Suíte
  `test:integration` completa fica para a T6.2.

## Fase 4

### T4.1 (executor `sonnet`)

- Escolha da nota (grupo): `GROUP_DELIVERY_TEXT.askDocument` = `✅ *Qual nota você entregou?*` + opções `🧾 NF \`n\` · *cliente* · cidade` (`formatOptions`) +
  `_Responda com o número da opção ou da nota._`; o "não entendi" repete só as opções (prompt) sob o motivo `Não achei essa nota na lista.`. A cidade vem de
  `placeStops` (mesmo leitor da lista de paradas), ligado em `whatsapp-group-delivery.adapter.ts` (`listOpenDocuments` e `findStopInProgress`);
  `GroupDeliveryDocument` e `WhatsAppStopInProgress.documents` ganharam `city`.
- Comprovante: novo `whatsapp-delivery-proof-question.policy.ts` (título em negrito por item, cliente em citação na pergunta de quem recebeu e do nome, contador RF10) e
  `whatsapp-delivery-received-by.constant.ts` (rótulos + ícones por opção, RF13; `RECEIVED_BY_LABELS` saiu do arquivo de falas). `DeliveryProofChecklist` ganhou
  `pendingItems` (tudo o que falta, sem a localização). O aviso separado `⚠️ NF X ainda não fechou. Falta: …` saiu: o contador, no rodapé de toda pergunta, o substitui.
  Desfechos RF3c: `✅ _Canhoto recebido._`, `✅ _Foto da mercadoria recebida._`, `📍 _Localização recebida._`, `👍 _Ok, sem <item>._` (por item), `👍 _Anotado: <vínculo>._`.
  "Não entendi" do quem recebeu e do nome no padrão (`formatNotUnderstood` + opções). `resumed` com a nota em crase. O cliente da pergunta vem de `ports.listStops` (melhor esforço).
- Texto da conversa individual: a pergunta e os desfechos são os mesmos (mesma `DELIVERY_PROOF_SPEECH`). A lista "Qual nota?" do individual é a lista interativa da Meta (título
  de 24 caracteres, corpo do grafo `driver_*`): fica como está, o corpo é regravado na T6.1.
- Divergências spec × desenho (segui o desenho onde ele é coerente, e registro o resto): (1) o desenho conta 3 itens na primeira pergunta (sem o nome) e não mostra contador na
  da mercadoria, mas conta 2 em "quem recebeu e o nome": incoerente. O contador aqui é um só, em toda pergunta, e conta tudo o que falta (opcional inclusive, localização fora): a
  primeira lista 4 itens e a da mercadoria também traz o contador, junto do "Se não tiver, responda pular." na mesma linha (como no nome do desenho). (2) O desfecho curto some quando
  a confirmação vem logo depois (o desenho vai direto de "João Pereira" ao "Confira a entrega": a confirmação já mostra o que foi colhido). (3) O envio já junta as falas de uma
  resposta numa mensagem só (`one-reply-one-message`), então o desfecho e a pergunta continuam elementos separados no retorno do serviço.
- Contratos: `test/whatsapp-commands/whatsapp-delivery-flow-design.contract.ts` (fluxo 5: lista de notas, canhoto, mercadoria, quem recebeu com citação, nome, "não entendi"; `toBe`
  inteiro), ligado em `whatsapp-commands.contract.test.ts`; atualizados delivery-preparation, canhoto-duplicate-prompt, audio-new-steps, group-delivery-flow, group-deliver-in-progress
  e as fixtures/integrações das jornadas (grupo e individual). Nenhum `toContain` novo.
- Gates: typecheck limpo · `bun test --timeout 120000` 14361 pass / 26 skip / 0 fail (inclui `literal-message-text`, sem exceção nova) · eslint e prettier limpos · integração:
  `whatsapp-driver-journey-group` 2 pass, `whatsapp-driver-journey-direct` 2 pass, `whatsapp-driver-flow-actions` 4 pass, `whatsapp-command-driver` 5 pass. Suíte completa na T6.2.

### T4.2 (executor `sonnet`)

- Confirmação (`whatsapp-delivery-confirm-summary.policy.ts`, `DELIVERY_PROOF_SPEECH.confirm`): `📋 *Confira a entrega da NF \`n\`*`, a nota em citação (`🏢 Contratante`, `🏪 Cliente: *…*`,
  `📍 endereço`, `💰 Valor da nota`), o colhido (`🧾 Canhoto: foto recebida ✅` / `sem foto`, `📦 Mercadoria: … ✅` / `sem foto`, `🙋 Recebido por: *nome* (vínculo)`,
  `📍 Localização: enviada ✅` / `não enviada`) e `*Confirma a entrega?*` com `✅ Sim, confirmar` / `❌ Não, cancelar` (`formatOptions`). "Não entendi" da confirmação e "cancelada"
  (`↩️ *Entrega da NF \`n\` cancelada.* …`) no padrão. `DeliveryConfirmCollected` ganhou `receiverName`.
- Registro: `groupDeliveryRegistered` = `✅ *NF \`n\` entregue.*`, `groupDeliveryStopCompleted`/`groupDeliveryTripCompleted` = `✅ *NF \`n\` entregue.* Parada N concluída.` (a rota concluída é a
  mensagem seguinte, T3.5). Valem para grupo e individual (`describeDeliveredLine`: com número da nota, os dois canais usam as mesmas chaves; sem número, a fala `deliveryRegistered` de
  antes). O número da parada é lido antes da baixa (`stopSequenceOf`, via `ports.listStops`) e vai a `describeResult` como `stopSequence` (ligado no `main.ts`); sem a lista, a frase diz
  só `✅ *NF \`n\` entregue.*`, sem inventar o número. `_Marquei a chegada junto com a entrega._` em itálico e sem repetir a nota (só para a entrega; chegada/devolução ficam como estão).
- Divergências: (1) o desenho tem "Recebido por: *João Pereira* (funcionário do local)": o nome volta na confirmação (a regra 9 da 293, "o nome não é repetido", vale só para log).
  (2) O desenho da entrega de parada com a última nota usa o mesmo `Parada N concluída.` da rota concluída, então `Viagem concluída. 🏁` saiu. (3) A linha `➡️ *Próxima parada*` e
  a linha da entrega seguem como mensagens separadas que o envio junta com linha em branco (mesmo resultado visual do desenho). (4) Mensagens vivas no grafo (`fala_group_delivery_*`,
  `fala_delivery_registered`) mantêm o texto antigo até a regravação da T6.1; a nova chave usa `{{sequence}}` e deve entrar no catálogo de variáveis então.
- Contratos: `whatsapp-delivery-flow-design.contract.ts` ganhou confirmação, "não entendi" e entrega registrada (grupo e individual iguais, `toBe`); atualizados delivery-preparation,
  driver-events, recorded-together-speech, group-deliver-in-progress e as fixtures/integrações das jornadas (que agora ligam `listStops` e `stopSequence` como o `main.ts`).
- Gates: typecheck limpo · `bun test --timeout 120000` 14364 pass / 26 skip / 0 fail (inclui `literal-message-text`, sem exceção nova) · eslint e prettier limpos · integração:
  `whatsapp-driver-journey-group` 2 pass, `whatsapp-driver-journey-direct` 2 pass, `whatsapp-driver-flow-actions` 4 pass, `whatsapp-command-driver` 5 pass. Suíte completa na T6.2.

### T4.3 (executor `sonnet`)

- Canhoto no padrão, igual no grupo e na individual (mesmas constantes): `whatsapp-canhoto-recognition-speech.constant.ts` (`confirmNote` = `📸 *Este canhoto é da NF \`n\`?*` + cliente e cidade em citação +
  `formatOptions`; `chooseNote`, `photoKind`, `cargoNoted` com `formatNextStep`, `discarded` = `DISCARDED_TEXT`, falhas com `⚠️ *…*`; o "não entendi" agora repete as opções da pergunta aberta, por tipo
  `notUnderstood[kind]`), `whatsapp-driver-canhoto.policy.ts` (repetido `🔁 *Esse canhoto já tinha chegado.*` + `NF \`n\`, entregue às HH:MM. Nada foi gravado de novo.`, troca com opções, `trocado`, `mantido`, `Li o canhoto`)
  e `GROUP_PROOF_TEXT`/`DELIVERY_PROOF_SPEECH.downloadFailed`/`duplicatePhoto` (foto que não entra: `⚠️`/`🔁` + próximo passo).
- `OpenNote` e o candidato da pergunta (jsonb, sem migration) ganharam `clientName?` e `city?` (a cidade vem da parada, a mesma de `placeStops`); pergunta antiga sem esses campos sai sem a citação.
- Divergências/decisões: (1) o desenho não mostra a lista "De qual nota é este canhoto?" nem os "não entendi" do canhoto: seguem o padrão (título `📸`, opções `🧾 NF … · *cliente* · cidade`, `🗑️ Descartar a foto`,
  instrução em itálico, como a lista de notas da T4.1). (2) `Li o canhoto da NF` e `Não consegui ler/guardar a foto` não estão no desenho: título em negrito com ícone (RF1). (3) A citação do cliente aqui é sem negrito (`> 🏪 RETA ALIMENTOS LTDA · cidade`), como no desenho.
- Contratos: `test/whatsapp-commands/whatsapp-canhoto-flow-design.contract.ts` (texto do desenho, `toBe` inteiro), ligado em `whatsapp-commands.contract.test.ts`; atualizados canhoto-recognition,
  canhoto-duplicate-prompt, delivery-preparation e group-delivery-flow (sem `toContain` de mensagem inteira).
- Gates: typecheck limpo · `bun test --timeout 120000` 14369 pass / 0 fail (`literal-message-text` verde, sem exceção nova) · eslint e prettier limpos · integração: `whatsapp-driver-journey-group` 2, `whatsapp-driver-journey-direct` 2,
  `whatsapp-driver-flow-actions` 4, `whatsapp-command-driver` 5, `whatsapp-canhoto-question-repository` pass / 0 fail. Suíte completa na T6.2.

### T4.4 (executor `sonnet`)

- Entrega fora da rota (`whatsapp-driver-order.policy.ts`, `OUT_OF_ORDER_TEXT.question.deliver`): `⚠️ *Fora da rota sugerida*` + `Você está na *parada 3*, e a NF \`n\` é da *parada 7*. Se achar melhor, pode registrar.` + o bloco da
  parada da nota em citação (`✅ *ENTREGA · PARADA 7*`, sem distância) + `Entreguei na *parada 7*` / `Foi engano, descartar` + `_A parada 3 continua aberta. Responda 1 ou 2._`. Reaproveita `describeOrderBlock`/`toOrderStopLabel` da T3.3 (a
  preparação agora passa `{ total }` para o bloco levar bairro, cidade e mapa); `stopWord`/`nameOf` saíram (sem uso). O "não entendi" da entrega repete as opções por extenso (`registrar a entrega na *parada N*` / `descartar`), pela
  mesma `describeOutOfOrderNotUnderstood` da saída/chegada (a parada vem de `stopSequenceOf`); descartar usa `DISCARDED_TEXT`.
- Nota já baixada (`describeAlreadySettled`): `⚠️ *A entrega da NF \`n\` já foi registrada* às HH:MM.` / `⚠️ *A NF \`n\` já foi baixada como não entregue* às HH:MM.` + `Nada foi gravado de novo.` O que vem depois (menu da parada que chegou,
  oferta da próxima ou rota concluída) segue como já era.
- Divergência spec × desenho: o pedido fala em "dois blocos em citação" na entrega fora da rota; o desenho (`conversas.html`, fluxo 5) tem **um** bloco (a parada da nota). Segui o desenho. O desenho mostra só as duas linhas da nota já baixada,
  e o fluxo continua oferecendo o que cabe depois (regra do fluxo não muda).
- Contratos: `test/whatsapp-commands/whatsapp-delivery-route-flow-design.contract.ts` (texto do desenho, `toBe` inteiro, fixture das paradas 3 e 7), ligado em `whatsapp-commands.contract.test.ts`; atualizados out-of-order-prompt, driver-journey
  e a fixture `driver-journey-group.expected.ts`.
- Gates: typecheck limpo · `bun test --timeout 120000` 14372 pass / 0 fail (`literal-message-text` verde) · eslint e prettier limpos · integração: `whatsapp-driver-journey-group` 2, `whatsapp-driver-journey-direct` 2,
  `whatsapp-driver-flow-actions` 4, `whatsapp-command-driver` 5 pass / 0 fail. Suíte completa na T6.2.

### T4.5 (executor `sonnet`)

- Motivo (`whatsapp-group-return-flow.service.ts`): `↩️ *Por que a NF \`n\` não foi entregue?*` + cliente e cidade em citação (`> 🏪 CLIENTE · cidade`, sem negrito, como no desenho) + motivos como opções com ícone + `_Responda com o número do motivo._`.
  O cliente e a cidade vêm de `placeStops` (mesmo leitor da lista e da T4.1), ligado em `whatsapp-group-return.adapter.ts` (`listOpenDocuments`; `GroupReturnDocument` ganhou `clientName?` e `city?`). O "não entendi" é o padrão do pedido
  (`🤔 *Não entendi.* Responda com o número do motivo:` + as opções). As opções saem de `describeReturnReasonOption` (`whatsapp-driver-flow.constant.ts`), que parte o rótulo com ícone de `DRIVER_RETURN_REASON_LABELS` (a lista da Meta da
  conversa individual continua usando o rótulo inteiro, sem mudança).
- Registro: `groupReturnRegistered` = `↩️ *NF \`{{documentNumber}}\` não entregue* · {{reason}}\nA nota volta com você para o armazém.` O motivo entra por `returnReason` na plateia (`describeReturnedLine`, mesmo padrão da entrega): grupo e individual
  (`returnReasonRouter` busca o número da nota antes da baixa) dizem o mesmo texto. Sem número ou sem motivo cai em `returnRegistered` (`↩️ *Não entrega registrada*`), sem `{{reason}}` solto. A oferta da próxima parada segue a da T3.5 (mensagem seguinte).
- Sem a nota: `↩️ *Qual nota não foi entregue?*` + `Mande *não entreguei* com o número da nota.` + `➡️ _Exemplo:_ não entreguei 899836`. `attendantUsesOffice` no mesmo padrão (`↩️` + próximo passo).
- Variável nova para o catálogo do editor (T6.1): `{{reason}}` em `fala_group_return_registered` (e `{{sequence}}` já anotada na T4.2). A T4.3 e a T4.4 não criaram variável nova.
- Armadilha: o contrato CA03 (`type-name-wall`) reprova literal igual a nome de tipo do catálogo de ocorrência ("Carga avariada", "Endereço não achado"...): por isso a opção deriva do rótulo com ícone em vez de declarar `{ icon, action }` à parte.
- Divergência: nenhuma do desenho. A conversa individual do "não entreguei" por lista da Meta (motivo) não muda de forma (título 24 caracteres); só o registro é o mesmo texto.
- Contratos: `test/whatsapp-commands/whatsapp-return-flow-design.contract.ts` (pergunta com citação, opções, registro igual nos dois canais, sem a nota; `toBe` inteiro), ligado em `whatsapp-commands.contract.test.ts`; atualizados
  group-driver-journey, driver-flow-actions, driver-events e as fixtures `driver-journey-{group,direct}.expected.ts`.
- Gates: typecheck limpo · `bun test --timeout 120000` 14376 pass / 0 fail (`literal-message-text` e CA03 verdes, sem exceção nova) · eslint e prettier limpos · integração: `whatsapp-driver-journey-group` 2, `whatsapp-driver-journey-direct` 2,
  `whatsapp-driver-flow-actions` 4, `whatsapp-command-driver` 5 pass / 0 fail. Suíte completa na T6.2.

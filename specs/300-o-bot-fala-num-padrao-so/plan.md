# Plano — 300 O bot fala num padrão só

## Ideia

Um módulo puro de formatação passa a ser a **única** forma de montar parada, opções, "não entendi" e próximo passo.
Cada fluxo troca a montagem própria por ele. O texto de cada mensagem sai de `conversas.html` e vira contrato antes do
código (critério 1). A regra de cada fluxo não muda, exceto RF8–RF12.

## Peças novas

| Peça                                | Onde                                                                                             | O que faz                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `whatsapp-message-format.policy.ts` | `apps/api-transportada/src/whatsapp-commands/domain/`                                            | Puras: `formatStopBlock({ stop, header?, detail: 'list' \| 'card', quote?: 'right' \| 'off-route' })`, `formatOptions(options)`, `formatNotUnderstood({ reason, options })`, `formatNextStep(text)`, `formatReplyHint(text)`, `formatDirectionsUrl(coordinate)`. Sem I/O, sem relógio |
| Campos novos na parada candidata    | `trips/domain/driver-stop-resolution.policy.ts` (`WhatsAppStopCandidate`)                        | `district?`, `city?`, `coordinate?` — opcionais, para dublês antigos continuarem compilando                                                                                                                                                                                           |
| Leitura de bairro/cidade/coordenada | a consulta que monta as candidatas (`listStops` do grupo e o equivalente da conversa individual) | Endereço do destinatário da nota (`nfe_addresses` via `nfe_participants` `recipient`) e coordenada da parada                                                                                                                                                                          |
| Distância e tempo da lista          | `whatsapp-commands/infrastructure/` (vizinho de `whatsapp-stop-card.reader.ts`)                  | Do último ponto compartilhado (mesma origem do bloco, 294 RF30) até cada parada da lista. T0.1 decide entre OSRM `table` (uma chamada) e `RouteGeometryPort` por parada com `Promise.allSettled` (§15: uma parada sem estrada não derruba a lista)                                    |

## O que cada fluxo troca (arquivos do levantamento de 2026-11-06)

| Fluxo (`conversas.html`) | Arquivos de texto                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Saudação e menu        | `whatsapp-group-driver-flow.service.ts` (`GROUP_DRIVER_MENU`, `menuOf`), `whatsapp-group-request.service.ts` (ocupado, cancelar, não entendi padrão), `bot-greeting.policy.ts`                                                                                                                                                                                                                                                                                           |
| 2 Saí                    | `whatsapp-group-stop-flow.service.ts` (`askStopText`), `whatsapp-driver-prompts.service.ts` (lista individual), `driver-stop-resolution.policy.ts` (`describeStopReference`), `whatsapp-driver-route-offer.policy.ts` (localização), `whatsapp-driver-order.policy.ts` (fora de ordem), `whatsapp-driver-journey.policy.ts` (repetido, baixa pendente), `whatsapp-bot-speech.constant.ts` (`fala_*` de saída registrada, já a caminho), `whatsapp-group-stop.adapter.ts` |
| 3 Cheguei                | os mesmos de 2 + `whatsapp-driver-event-speech.service.ts` (endereço corrigido)                                                                                                                                                                                                                                                                                                                                                                                          |
| 4 Próxima parada         | `whatsapp-driver-journey.policy.ts` (oferta), `whatsapp-driver-route-offer.policy.ts` (recuo, rota concluída), `whatsapp-stop-card.policy.ts`                                                                                                                                                                                                                                                                                                                            |
| 5 Entreguei              | `whatsapp-group-delivery-flow.service.ts`, `whatsapp-delivery-proof-speech.constant.ts`, `whatsapp-delivery-confirm-summary.policy.ts`, `whatsapp-driver-canhoto.policy.ts`, `whatsapp-canhoto-recognition-speech.constant.ts`, `whatsapp-group-proof-intake.service.ts`, `whatsapp-stop-in-progress.service.ts`                                                                                                                                                         |
| 6 Não entreguei          | `whatsapp-group-return-flow.service.ts`, `whatsapp-driver-flow.constant.ts` (motivos)                                                                                                                                                                                                                                                                                                                                                                                    |
| 7 Ocorrência             | `whatsapp-group-occurrence-flow.service.ts`, `whatsapp-occurrence-draft-speech.constant.ts`, `whatsapp-occurrence-draft.service.ts`, `whatsapp-driver-event-speech.service.ts` (só o app)                                                                                                                                                                                                                                                                                |
| 8 Boleto                 | `whatsapp-group-boleto-resend.service.ts`, `occurrence-conversation/infrastructure/whatsapp-group-boleto-return.support.ts`                                                                                                                                                                                                                                                                                                                                              |
| 9 Encerrar a rota        | `whatsapp-group-trip-close-flow.service.ts`, `whatsapp-attendant-flow.constant.ts`                                                                                                                                                                                                                                                                                                                                                                                       |
| 10 Tempo, áudio, erros   | `whatsapp/infrastructure/whatsapp-group-request-expiry.watcher.ts`, `whatsapp-bot-audio.service.ts`, `bot-spoken-note.policy.ts`, `whatsapp-driver-event-speech.service.ts`, `whatsapp-driver-flow.constant.ts` (bloqueios), `whatsapp-command.constant.ts`                                                                                                                                                                                                              |
| 11 Atendente             | `whatsapp-group-delivery-flow.service.ts` (lote), `register-attendant-field-flow-actions.ts`                                                                                                                                                                                                                                                                                                                                                                             |
| Conversa individual      | `whatsapp-flow-graph.constant.ts` (nós), `register-driver-flow-actions.ts`, `whatsapp-bot-speech.constant.ts` (`fala_*`)                                                                                                                                                                                                                                                                                                                                                 |

## Riscos

- **Grafo editado pela empresa.** Os `fala_*` podem ter sido editados no `FlowsWorkspace`. Trocar o padrão no código e
  republicar não pode sobrescrever o editado (`whatsapp-flow-graph-diff.policy.ts`). T0.2 mede antes de mexer.
- **Teste de arquitetura da 286 RF9.** Nada de literal dentro de `sendText`; o texto continua em constante/nó.
- **Contratos antigos que comparam texto.** Muitos `test/whatsapp-*/*.contract.ts` comparam a frase antiga: cada task
  atualiza os seus junto com o texto, nunca afrouxa para `toContain`.
- **Tamanho da mensagem.** WhatsApp corta em 4096 caracteres. Lista com muitas paradas + mapa por parada pode passar:
  T0.1 mede com 15 paradas e define o corte (ex.: as N primeiras + "e mais K: responda com o número da nota").
- **Evolution × Meta.** O grupo (Evolution) aceita a marcação inteira; a conversa individual usa lista/botões da Meta
  com limites próprios (título de linha 24, descrição 72). Na individual o bloco vai no texto da mensagem e a lista só
  carrega `PARADA N · cliente`.

## Decisões da T0.1 (2026-11-07)

### D1 — Distância e tempo da lista: OSRM `table`, uma chamada, origem do bloco

- **Decisão.** Porta nova `trips/application/route-distance-table.port.ts` (`readDistancesFrom(origin, destinations)` →
  um item por destino, `{ distanceMetres, durationSeconds } | null`, ou `null` inteiro quando o serviço falha) e
  adaptador `trips/infrastructure/osrm-route-distance-table.gateway.ts`:
  `/table/v1/driving/<origem>;<d1>;…?sources=0&annotations=duration,distance`, tempo-limite de 5 s e **falha é
  `null`, nunca exceção** (mesma postura de `osrm-route-geometry.gateway.ts:createOsrmRouteGeometryGateway`). Ligado em
  `main.ts` (`whatsappStopCards`) sob o mesmo `config.routingMatrixUrl`. O leitor ganha a leitura da lista em
  `whatsapp-commands/infrastructure/whatsapp-stop-card.reader.ts`, reaproveitando `resolveEtaOrigin` (ramo
  `AT_STOP_EVENTS`: ponto da última parada em que o motorista chegou) e `lastPointOf` — a **mesma origem** do bloco e da
  oferta da próxima (294 RF30).
- **Por quê.** RF4 pede **uma** consulta para a lista toda, e o `/table` dá exatamente isso: célula `null` por destino
  sem estrada (a parada some sozinha, a lista fica), uma falha só derruba a linha em todas, uma chamada leve. A API não
  tem cliente `table` hoje (o do worker, `worker-transportada/src/routing/infrastructure/osrm-routing-matrix.gateway.ts`,
  não pode ser importado e lança erro); o `RouteGeometryPort` por parada com `Promise.allSettled` economizaria a porta
  (~40 linhas) mas faria N chamadas `/route` com `overview=full`, `annotations=nodes` e `alternatives=true` — a geometria
  inteira de cada trecho para usar dois números — e descumpre o texto do RF4.
- **Os três casos.** Sem ponto nesta viagem (`resolveEtaOrigin` ou `lastPointOf` devolve `null`) → nenhuma chamada,
  linha some em todas e a lista termina com `📎 _Mande sua localização pelo clipe para ver distância e tempo._`. OSRM
  fora (`null` inteiro, ou sem `ROUTING_MATRIX_URL`) → linha some em todas, **sem** o rodapé, log
  `whatsapp_stop_card.eta_unavailable` só com empresa e motivo. Célula `null` ou parada sem coordenada → só aquela
  linha some. A lista nunca aparece com parada "a caminho": `whatsapp-driver-prompts.service.ts:stopChoice` desvia antes
  para "já a caminho" (RF9), então a origem da lista é sempre o ramo da última chegada.

### D2 — Corte por tamanho: 10 paradas na lista, as demais num rodapé

- **Medido** (`bun` num script descartável, pior caso: cliente com 40 caracteres, bairro e cidade com 43, `📦`,
  `📏`/`⏱️` e link `dir` com 7 casas decimais, primeira parada em citação; contagem em UTF-16, a mais conservadora):
  15 paradas = **4112** (passa de 4096); com coordenada em 5 casas = 4052; como o desenho (sem `📦` na lista) = 3825;
  sem link de mapa = 2700. Bloco: 299 em citação, 264 sem. Cabem no máximo **14** paradas no pior caso; 10 paradas +
  rodapé = **2842**, 12 = 3376.
- **Decisão.** A lista mostra as **10 primeiras** paradas pendentes na ordem da rota (a próxima em citação, RF6) e, se
  houver mais, fecha com `_E mais K paradas (X a Y): responda com o número da parada ou da nota._`. As paradas cortadas
  continuam escolhíveis pelo número da parada ou da nota (o pedido guarda todas, como hoje em `stops` do
  `DriverPrompt`). Constante em `whatsapp-message-format.policy.ts`.
- **Por quê.** 10 deixa ~1250 de folga para parada com várias notas na linha `🧾` (≈11 caracteres por nota a mais) sem
  precisar de corte por orçamento, e é o mesmo teto de linhas da lista da Meta (`WHATSAPP_CHOICE_LIMIT.listRows`).
- **Link de mapa por parada: sim.** O desenho põe `🗺️ *Como chegar:*` em todo bloco da lista (`stop()` em
  `conversas.html` sempre emite a linha). Volumes **não** aparecem na lista: `📦` só sai no bloco completo (`full`) —
  o contrato segue o desenho (critério 1).

### D3 — Conversa individual: a mesma mensagem de texto do grupo, sem lista interativa

- **Hoje.** A individual já manda a lista como **texto**: `whatsapp-driver-prompts.service.ts:describeStopChoice`
  (mesma frase de `whatsapp-group-stop-flow.service.ts:askStopText`), devolvida em `texts` por `stopChoice` e enviada
  por `register-driver-flow-actions.ts` (`say({ text })` → `sendText`). A resposta é lida como texto em
  `pickStopOption`.
- **Decisão.** Continua texto: o mesmo `formatStopBlock`/lista de D2 nos dois canais, enviado por `sendText`. Nada de
  `sendList` para esta pergunta.
- **Por quê.** Critério 5 (grupo e individual dizem o mesmo texto) sai de graça; a lista interativa não comporta o
  desenho — corpo limitado a 1024 em `whatsapp-menu.constant.ts:WHATSAPP_CHOICE_LIMIT.body`, título de linha 24 e a
  descrição de 72 não exposta pelo `ChannelAdapterInterface` (`listRowDescription`, "não usado hoje") —, e trocar
  para lista exigiria id de linha novo no despachante. O texto da Meta aceita 4096, o mesmo teto medido em D2.
- **Herança para a T3.2.** `pickStopOption` hoje lê `1`–`99` como **posição** na lista (`options[Number(digits) - 1]`);
  com RF5 o número passa a ser a **sequência** da parada, e o "não entendi" de número fora da lista vira
  `🤔 *Não entendi.* Não achei a parada N nesta viagem.` nos dois canais.

## Decisão pendente da T0.2 (para a T6.1)

Publicar o grafo preserva todo `fala_*` vivo não vazio (`whatsapp-bot-speech.policy.ts` `preserveEditedBotSpeech`),
então o texto novo não chega a nenhum nó já semeado. Proposta: regravar só o nó cujo texto vivo é igual ao da última
versão publicada com `source=code` (não editado no painel); os demais ficam. Implementar na T6.1 e **perguntar ao dono
antes de rodar em staging**.

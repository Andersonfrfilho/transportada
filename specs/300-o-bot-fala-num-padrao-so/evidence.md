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

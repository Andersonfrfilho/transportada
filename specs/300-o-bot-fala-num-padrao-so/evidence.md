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

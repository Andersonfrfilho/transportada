# Feature 254 — O motorista registra por que o envio falhou

## Problema e resultado

Em 07/10/2026 um motorista disse que o app do motorista estava "um pouco lento" para abrir, preencher
e dar baixa, e que a foto falhou num celular (memória cheia) e funcionou em outro. Medimos pelo log
da API em produção: o servidor responde em 17–33 ms (p50) e não houve erro em 482 requisições móveis.
**O defeito, se existe, está no aparelho ou entre o aparelho e o storage — e o app não deixa rastro
nenhum disso.**

O que o log mostrou num dos aparelhos: **60 `POST .../occurrence-uploads` (201) sem nenhum
`/confirm`**, em ~9 minutos. O `PUT` da foto ao storage nunca terminou, e a drenagem de 30 s repetiu o
fluxo inteiro — URL assinada nova a cada tick — sem teto de intervalo. O comportamento está provado
em `apps/frontend-driver/test/driver-trip/occurrence-upload-retry-loop.contract.ts`: rede caída ou
`503` no storage → um pedido de URL por tick, para sempre; `403`/`500` → recusa, uma tentativa.

Resultado desta feature:

1. **Rastro:** cada falha de envio e o tempo de cada passo do fluxo chegam à API como log
   estruturado, sem dado pessoal, junto com o que o aparelho diz de si (memória, núcleos, tipo de rede).
2. **Respiro:** a drenagem do temporizador deixa de refazer o envio a cada 30 s num item que falha por
   rede — o intervalo cresce até um teto, **sem nunca apagar o item** (spec 227 D1 continua valendo).

## Decisões do usuário (2026-10-07)

- **D1 — O rastro é importante** e é o item principal desta spec.
- **D2 — Não mexer na ocorrência agora** ("estamos em fase de teste"): **nenhum interruptor
  liga/desliga de ocorrência**, nenhuma mudança de regra de ocorrência. Só se observa e se espaça.
- **D3 — A hipótese do usuário** é que as 60 chamadas são o auto sync. O teste de contrato confirma
  a repetição; se ela causa o travamento percebido é o que o rastro (RF1–RF3) vai dizer.

## Decisões por delegação

- **D4 — Onde o log mora.** Não existe hoje telemetria do `frontend-driver` para a API (conferido: sem
  `sendBeacon`, sem endpoint de log de cliente na API; o `driver_legacy_served` é do painel, vai para o
  `server.ts` do próprio painel e não para a API). Logo: **endpoint novo na API**
  `POST /v1/me/client-diagnostics`, que valida e escreve **um log estruturado por evento** (`logger.info`
  via `safeLogInfo`). Sem tabela nova, sem migration: o log do Railway é o armazenamento, como já é para
  `http_request_completed`.
- **D5 — Backoff é espaçamento, não descarte.** As specs 226 e 227 puseram backoff em "Fora de escopo"
  (não o recusaram por mérito) e a 227 D1 proibiu apagar item antes de sincronizar. Esta feature
  respeita as duas: o item **nunca sai** pelo backoff; só passa a esperar mais entre tentativas.
- **D6 — Só o temporizador espaça.** `online`, `pageshow`, "Enviar agora" e a abertura do app
  continuam drenando na hora: são gestos do motorista ou volta real de sinal. O que gerou as 60
  chamadas foi o `setInterval` de 30 s.
- **D7 — As duas filas.** O contador `attempts` existe na fila de eventos (`offlineQueue.service.ts`)
  e na de anexos (`offlineAttachments.service.ts`); o espaçamento vale para as duas.
- **D8 — Espelho.** `offlineQueue`, `offlineAttachments` e `pendingQueue` são cópia por valor do painel
  (ADR-0075 §7); enquanto `VITE_DRIVER_APP_URL` estiver desligado, a correção vale nas duas apps
  (226 D4, 227 D1).

## Decisões a confirmar (padrão adotado se o usuário não mudar)

| #   | Valor                                        | Padrão                                                                 |
| --- | -------------------------------------------- | ---------------------------------------------------------------------- |
| C1  | Intervalo base e fator do backoff            | 30 s × 2 por tentativa falha (30 s, 60 s, 2 min, 4 min…)               |
| C2  | Teto do intervalo                            | **10 min** (nunca para de tentar)                                      |
| C3  | Jitter                                       | ±20 % (evita todos os aparelhos baterem juntos quando o storage volta) |
| C4  | Buffer de eventos de diagnóstico no aparelho | 50 eventos em memória, descarta o mais antigo                          |
| C5  | Limite da rota de diagnóstico                | 6 requisições/min por usuário, até 20 eventos por requisição           |

## Requisitos

**RF1 — Motivo da falha de envio.** Toda falha do fluxo de upload de foto (`occurrence-uploads` →
`PUT` → `confirm`) e do envio do relatório gera um evento `send_failed` com: passo
(`upload_slot` | `upload_put` | `upload_confirm` | `report_send`), tipo (`network` | `timeout` |
`http_status` | `identity`), `httpStatus` quando houver, número da tentativa (`attempts`), tipo do
relatório (`reportKind`) e tamanho da foto em bytes.

**RF2 — Tempo de cada passo.** O app mede com `performance.now()` e emite `step_timing` com `step` e
`durationMs` para: `trip_open` (carregar a viagem atual), `photo_reduce` (captura/redução da foto),
`upload_slot`, `upload_put`, `upload_confirm`, `report_send` e `baixa_total` (do toque em "dar baixa"
até o item sair — enviado — ou entrar na fila). Mede o app, não o servidor: o servidor já tem
`durationMs`.

**RF3 — Dados do aparelho.** Cada requisição de diagnóstico leva uma vez `device`:
`deviceMemoryGb` (`navigator.deviceMemory`, ausente no Safari), `hardwareConcurrency`,
`connection.effectiveType`, `connection.saveData`, `isStandalone` (PWA instalada) e
`appVersion`. Campo que o navegador não expõe vai **ausente**, nunca inventado.

**RF4 — Sem dado pessoal.** Nenhum nome, telefone, CPF, placa, texto de observação, coordenada, URL
assinada nem corpo de resposta. Identificadores opacos permitidos: `idempotencyKey` e `attachmentKey`
(já existem e não identificam a pessoa). A URL assinada nunca entra: tem assinatura e nome de objeto.

**RF5 — Nunca atrapalha o fluxo.** Enviar diagnóstico é melhor-esforço: não bloqueia a baixa, não
entra na fila de eventos, não conta em `attempts`, não gera aviso ao motorista, e uma falha ao enviá-lo
é engolida. Sem rede, os eventos esperam no buffer (C4) e saem no próximo contato bom com a API.

**RF6 — Rota de diagnóstico.** `POST /v1/me/client-diagnostics`: Bearer, permissão `trip.report`
(a mesma da posição ao vivo), `companyId` do contexto autenticado, nunca do corpo. Corpo `.strict()`
em Zod, todos os erros juntos, `400` com código estável; limite de requisições (C5) com `429` +
`Retry-After`. Responde `204`. Entra no OpenAPI/Scalar, com o teste "toda rota aparece no documento".

**RF7 — Log da API.** Um `logger.info` por evento, mensagem constante `driver_client_diagnostic`,
metadados: `companyId`, `membershipId`, `eventKind`, `step`, `durationMs`, `failureKind`, `httpStatus`,
`attempt`, `reportKind`, `photoBytes`, `device`. Passa pela redação do logger. Nunca grava o corpo cru.

**RF8 — Espaçamento da drenagem.** O item que falha por rede ganha `lastAttemptAt`; o temporizador de 30 s
só o drena quando `agora ≥ lastAttemptAt + backoff(attempts)` (C1–C3). Vale para a fila de eventos e
a de anexos. `online`, `pageshow`, "Enviar agora" e a abertura ignoram o espaçamento (D6). Item **nunca**
é descartado por isso (D5), e `attempts` segue só contando.

**RF9 — A tela diz a verdade.** A fila continua mostrando "falhou N vezes". Item em espera do
backoff não vira "enviado" nem "recusado"; o rótulo de estado não muda. (Mostrar "próxima tentativa em…"
fica fora: não pedido.)

**RF10 — Teste de contrato.** O `occurrence-upload-retry-loop.contract.ts` ganha o caso novo: com
backoff, 20 ticks de 30 s com rede caída resultam em número de pedidos de URL **menor** que 20 e igual
ao previsto pela fórmula; "Enviar agora" ignora o espaçamento; `403`/`500` seguem sendo recusa.

## Fora do escopo

- **Interruptor liga/desliga de ocorrência** (D2) e qualquer regra de negócio de ocorrência.
- Reaproveitar a URL assinada entre tentativas (pode virar spec própria; o `PUT` já é idempotente por
  chave de objeto, mas isso muda o contrato com o storage).
- Sentry/Datadog no `frontend-driver` e qualquer origem nova no `connect-src` (o diagnóstico vai à API,
  que já está liberada).
- Persistir o buffer de diagnóstico entre recargas: o laço das 60 chamadas acontece dentro de uma
  sessão; perda na recarga é risco aceito (ver `plan.md`).
- Painel/dashboard dos diagnósticos: nesta spec o consumo é por busca no log do Railway.
- Mudar `QUEUE_DRAIN_INTERVAL_MS` (30 s), o cão de guarda de 180 s ou a classificação
  recusa/`failed-network` da 226.
- "Próxima tentativa em…" na tela da fila; "apareceu apenas um ponto" (localização) — assunto da
  localização, não deste envio.

## Critérios de aceite

- **CA1** — Com `PUT` falhando por rede, o evento `send_failed` com `step: upload_put`,
  `failureKind: network` e `attempt` crescente chega ao log da API (teste de contrato + E2E da rota).
- **CA2** — Nenhum evento, em nenhum teste, contém URL assinada, texto de observação ou coordenada
  (teste que varre o JSON emitido).
- **CA3** — 20 ticks com rede caída fazem menos pedidos que 20, conforme a fórmula de C1–C3.
- **CA4** — `online`/"Enviar agora" drenam imediatamente com item em espera.
- **CA5** — Falha ao enviar diagnóstico não altera o resultado da baixa nem `attempts`.
- **CA6** — `make check` verde nas duas apps de front e na API; rota no documento OpenAPI.

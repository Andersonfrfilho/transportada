# Plano — Spec 254

## Contexto

Fatos conferidos contra o código (não só contra as specs):

- `attempts` só é lido para exibir "falhou N vezes" (`eventQueueView.service.ts:93`,
  `DriverEventQueue.page.tsx:118`); nenhuma decisão depende dele. Incrementa em
  `offlineQueue.service.ts:238` e `offlineAttachments.service.ts:414`.
- `failed-network` para a drenagem inteira no primeiro item que falha (`offlineQueue.service.ts:221-224`);
  hoje o item volta com `attempts + 1` e é tentado de novo no próximo tick, sem intervalo por item.
- Mapa recusa × "tente depois": `driverTripClient.service.ts:117-142` (`408/429/502/503/504` e rede e
  `IDENTITY_*` → `failed-network`; resto → recusa). **Não muda.**
- Gatilhos: `scheduleQueueDrainTriggers` (`pendingQueue.service.ts:115-174`); o `setInterval` de 30 s só
  existe com `getDrainable() > 0`.
- Sem telemetria do driver para a API; sem `performance.now` em `apps/frontend-driver/src`.
- CSP `connect-src` já inclui a API; a rota nova não pede origem nova.

## Desenho

### 1. Rota de diagnóstico (API)

`apps/api-transportada/src/trips/` (junto de `me-location.routes.ts`, mesmo molde de
`defineRoute`, `REPORT_POLICY = { permission: 'trip.report', scope: 'company' }` e balde de limite no
Postgres):

- `presentation/me-client-diagnostics.routes.ts` — `POST /me/client-diagnostics` (prefixo `/v1` do
  roteador). Corpo `.strict()`:
  ```
  { device?: {deviceMemoryGb?, hardwareConcurrency?, effectiveType?, saveData?, isStandalone?, appVersion},
    events: [{ eventKind: 'send_failed'|'step_timing', step, durationMs?, failureKind?, httpStatus?,
               attempt?, reportKind?, photoBytes?, idempotencyKey?, attachmentKey?, occurredAt }] }
  ```
  `events` 1..20; `step`, `eventKind`, `failureKind`, `reportKind`, `effectiveType` são `z.enum`;
  `durationMs` inteiro 0..600000; `httpStatus` 100..599; `attempt` inteiro 0..10000;
  `photoBytes` 0..50 MiB; `occurredAt` ISO. Chaves opacas: string UUID/limite de 128.
- `application/record-client-diagnostics.use-case.ts` — recebe `{ companyId, membershipId, device, events }`,
  emite um `logger.info('driver_client_diagnostic', …)` por evento via `safeLogInfo`. Sem repositório.
- Constantes (`trips.constant.ts`): `DRIVER_CLIENT_DIAGNOSTIC_LOG_MESSAGE`, nomes dos enums, limites
  (`MAX_DIAGNOSTIC_EVENTS_PER_REQUEST`), código `CLIENT_DIAGNOSTICS_INVALID`.
- Resposta `204`. `429` pelo limite C5. OpenAPI derivado da definição da rota.

### 2. Coletor no `frontend-driver`

`apps/frontend-driver/src/modules/driver-trip/shared/`:

- `clientDiagnostics.service.ts` — buffer em memória (C4) com `record(event)` síncrono e nunca lança;
  `flush()` envia em lote via o cliente HTTP (`createDriverTripClient`, rota nova
  `sendClientDiagnostics`) e **engole** qualquer erro, devolvendo os eventos ao buffer só se foi falha de
  rede. Sem `await` no caminho do motorista.
- `deviceProfile.service.ts` — lê `navigator.deviceMemory`, `hardwareConcurrency`, `connection`,
  `matchMedia('(display-mode: standalone)')` e `appVersion` (variável de build já existente ou
  `__APP_VERSION__`; se não houver, o campo é omitido — verificar na T3.1). Entrada injetável para teste.
- `stepTimer.service.ts` — `startStep(step)` → `{ end(outcome) }` com relógio injetável
  (`performance.now`), para os testes não dormirem.
- Pontos de instrumentação (só chamam o coletor, sem mudar regra):
  `driverTripClient.service.ts:uploadOccurrencePhoto` (slot/PUT/confirm), `send` (relatório),
  `occurrencePhotoImage.service.ts` / `proofPhotoReduction.service.ts` (`photo_reduce`),
  `useDriverTrip.hook.ts` (`trip_open`, `baixa_total`).
- Gatilho do `flush`: fim de cada drenagem, `online`, e `visibilitychange` visível. Uma requisição por
  flush, até 20 eventos; o resto no próximo.
- Privacidade: o tipo `ClientDiagnosticEvent` **não tem** campo livre de texto; só enums, números e as
  duas chaves opacas. A URL assinada nunca é parâmetro de nenhuma função do coletor.

### 3. Espaçamento da drenagem

- `QueuedReport` e o item de anexo ganham `lastAttemptAt?: string`, gravado junto do `attempts + 1`.
- Função pura `computeRetryDelayMs({ attempts })` em `retryBackoff.service.ts`:
  `min(30_000 × 2^(attempts−1), 600_000)` + jitter ±20 % por função injetável (padrão
  `Math.random`; teste fixa o jitter). `isRetryDue({ item, now })` pura.
- `drainQueue` e o equivalente de anexos recebem `origin: 'timer' | 'immediate'`. Em `'timer'`, se o primeiro item elegível tem
  `attempts > 0` e `!isRetryDue`, a drenagem **para inteira, sem contar tentativa** (T1.1: pular e seguir
  quebraria a ordem N3 — "Entreguei" não sobe antes de "Cheguei", `offlineAttachments.service.ts:367-371`).
  Em `'immediate'`, nada muda.
- `createDrainScheduler`/`scheduleQueueDrainTriggers`: o `tick` do `setInterval` chama
  `drain('timer')`; `online`, `pageshow`, visibilidade e "Enviar agora" chamam `drain('immediate')`.
  A origem atravessa `scheduleQueueDrainTriggers` → `drainRef` → `request` → `run` → `mutationFn`
  (`useDriverTrip.hook.ts`) → `drainQueueWithAttachments`. O agendador guarda a origem junto do pedido
  pendente e, ao juntar dois pedidos, **`'immediate'` vence** (`pendingQueue.service.ts:249-251`).
  O hook do painel não tem agendador: chama `drain.mutate` direto, e esse chamador é `'immediate'`.
- `lastAttemptAt` entra explicitamente na remontagem do item recusado (`offlineAttachments.service.ts:379-389`).
- Item sem `lastAttemptAt` (gravado antes da spec) é tratado como "devido" — nada trava na migração.

### 4. Espelho no painel (D8)

Os arquivos de fila **não são cópias idênticas** (T1.1): painel e driver divergem em tamanho e lógica
(`ownerSubHash`, `createDrainScheduler` com cão de guarda e `recoverProofPhotos` só existem no driver). A
mudança é **portada nas duas apps** — origem do `offlineQueue`/`offlineAttachments` é o painel; do
`pendingQueue`, o driver — sem sobrescrever arquivo. O `copy-by-value-header.contract.ts` só vigia o
cabeçalho e continua verde. O coletor de diagnóstico é só do `frontend-driver`.

## Riscos

- **Mudança de assinatura de `drain`** é o ponto mais delicado: uma chamada esquecida como `'timer'`
  deixaria "Enviar agora" respeitando o backoff. Mitigação: parâmetro obrigatório (sem padrão) e teste
  de CA4.
- **Buffer perdido na recarga**: se a falha acontece e o motorista fecha o app antes do `flush`, o rastro
  some. Aceito (Fora do escopo). Revisitar se o log mostrar buracos.
- **Ordem N3 acima do ganho de pular:** item cabeça em espera longa segura os de trás no temporizador (até
  10 min). Aceito: a alternativa reordenaria "Cheguei"/"Entreguei". Antes: `failed-network` já parava a drenagem; item cabeça em espera longa não bloqueia os de
  trás (são pulados), mas item cabeça _devido_ e falhando ainda para os de trás — comportamento atual.
- **Volume de log**: ≤ 20 eventos × 6 req/min × usuário. Em frota pequena é irrelevante; se crescer, o
  limite C5 é o freio.
- **Fingerprint**: `deviceMemory`/núcleos/rede são grosseiros e o User-Agent já é logado pelo Railway.
  Sem identificador estável de aparelho — de propósito.
- **Spec 227 D1** (não apagar até sincronizar): o desenho não remove nada; o teste de contrato afirma
  "item continua na fila após 100 ticks".

## Contrato HTTP

`POST /v1/me/client-diagnostics` — Bearer; permissão `trip.report`; corpo acima; `204` sucesso;
`400 CLIENT_DIAGNOSTICS_INVALID` com `error.details[]` `{field, message}` (todos de uma vez);
`401`/`403` padrão; `429` + `Retry-After`. Sem corpo de resposta.

## Decisão 🧠 que as demais tasks herdam

**O diagnóstico é só log, sem tabela.** Tudo o que depende do formato dos eventos (enums, limites,
nome da mensagem de log) é herdado pelas tasks da API e do coletor. Validar com `architect` (T1.1)
antes de qualquer código: se o usuário passar a querer consulta/painel dos diagnósticos, a decisão muda
para tabela e migration, e a spec precisa ser reaberta.

## Ajustes da T1.1 (architect, opus — APROVADO, só log, sem tabela)

1. Drenagem pelo temporizador **para** no primeiro item elegível não devido (N3). 2. Origem guardada no
   agendador, `'immediate'` vence. 3. Fila é **portada** nas duas apps, nunca copiada por cima. 4. O use case monta
   o log campo a campo (lista permitida), nunca `...event`. 5. Coletor: 400 descarta o lote, 429/rede devolvem ao
   buffer (teto C4), nunca instrumenta o próprio envio; publicar API → driver. Rota sem `resolveDriver` (o log leva
   `membershipId`); limite `{maxRequests: 6, windowSeconds: 60, scope: 'me-client-diagnostics', store: 'postgres'}`.

# Feature 157 — A foto obrigatória pesa na nota do motorista

## Problema e resultado

A empresa pode exigir foto do comprovante na entrega (ADR-0057, `company_delivery_proof_settings.photo
= 'required'`), mas só o canal do escritório obedece (spec 156, 422
`TRIP_DELIVERY_PROOF_PHOTO_REQUIRED`). Pelas portas do motorista — `POST
/me/trips/current/documents/:documentId/deliver` e `.../proof` — o backend aceita a entrega sem foto e
não registra nada; quem barra é só o formulário do PWA, e o botão "Entregar" nem olha a configuração.

Recusar a entrega com 422 não serve para o motorista: a entrega física já aconteceu, a fila offline do
PWA (IndexedDB) manda a entrega **antes** da foto e trava o item rejeitado, e a fila do app nativo
**descarta** qualquer 4xx. A decisão do usuário (2026-09-18) é outra:

- a entrega **sempre** é aceita; a foto obrigatória pode chegar depois, até no fim da rota, em lote;
- foto que chega **longe do local** da entrega ou **fora da janela de horas** é mau uso e **tira pontos**
  da nota do motorista; foto obrigatória que nunca chega tira mais;
- a nota **ordena a recomendação** de motoristas ao montar a viagem, aparece na **ficha do motorista** e
  no **app do motorista**.

Resultado: o motorista nunca perde uma entrega por falta de sinal, e o escritório passa a ver — e a
pesar na escolha — quem pula a foto.

## Fora do escopo

- **App nativo** (`transportada-mobile`): ainda não tem fluxo de entrega nem de comprovante (só
  ocorrências). Quando ganhar, segue o contrato desta spec — `location` no `/proof` e `proofPending` no
  snapshot. Nada muda lá agora.
- Recusar a entrega do motorista por falta de foto (422 no `/deliver`). Descartado pela decisão acima.
- Nota por qualquer outro critério (atraso de rota, ocorrência, avaliação do cliente). A nota nasce só
  da foto obrigatória; o modelo de penalidade é aberto para outros motivos depois.
- Canal do escritório (`channel = 'office'`): já exige a foto na mesma transação da baixa; a entrega
  registrada pelo escritório não entra na nota.
- Assinatura obrigatória: a regra aqui é só `photo`. `signature = 'required'` continua como está.
- Cron ou job: a nota é derivada na leitura.

## Histórias priorizadas

### P1 — A entrega sem foto obrigatória fica pendente, não recusada

**Given** a empresa com `photo = 'required'` **When** o motorista entrega a nota sem foto (online ou pela
fila offline) **Then** a API responde 201 como hoje, com `proofPending: true`, e o snapshot `GET
/me/trips/current` mostra a nota como entregue com `proofPending: true` até a foto chegar.

### P2 — A foto carrega onde e quando foi tirada

**Given** uma nota entregue **When** o motorista anexa a foto **Then** o multipart do `/proof` aceita
`latitude`, `longitude`, `accuracyMeters` e `capturedAt` (opcionais) e a API grava junto da foto se ela
foi **pontual**, **tardia** ou **longe** — e a resposta devolve essa classificação.

### P3 — Foto tardia, longe ou ausente tira pontos

**Given** o motorista com fotos obrigatórias fora da regra nos últimos 90 dias **When** o escritório ou o
motorista lê a nota **Then** ela é `100 − soma das penalidades` (mínimo 0), e cada penalidade some depois
de 90 dias.

### P4 — A nota ordena a recomendação ao montar a viagem

**Given** o escritório montando uma viagem **When** abre o seletor de motoristas **Then** vê a nota ao lado
de cada um, e a lista vem da maior para a menor nota (sem histórico por último na ordem do nome).

### P5 — A ficha do motorista mostra a nota e o porquê

**Given** o escritório na ficha do motorista **When** abre a ficha **Then** vê a nota e a lista das
penalidades vigentes (nota fiscal, data da entrega, motivo, pontos, quando expira).

### P6 — O motorista vê a própria nota e as fotos pendentes

**Given** o motorista no PWA **When** entrega sem a foto obrigatória **Then** vê o aviso de que anexar
agora, no local, evita perder pontos; **and** tem uma lista "fotos pendentes" com cada nota entregue sem
a foto obrigatória, de onde anexa em lote — e a foto entra na **fila offline**, não só no envio direto.

## Requisitos funcionais

- **RF1** `POST /me/.../deliver` nunca recusa por falta de foto. A resposta ganha `proofPending: boolean`
  = configuração resolvida da nota com `photo = 'required'` e nenhuma foto anexada ao evento de entrega.
- **RF2** O snapshot do motorista expõe por documento `proofPending: boolean` e, na raiz, `score` (a nota
  do próprio motorista, ou `null` sem histórico) e `pendingProofs` (T11): as notas que o próprio
  motorista entregou nos 90 dias, com foto obrigatória e sem foto, em qualquer viagem que o `/proof`
  alcança — **inclusive `completed`**, que some de `trips`. Vem vazio sem cadastro de motorista e
  presente mesmo sem viagem ativa. Cada item: `documentId`, `tripId`, `tripStatus`, `documentNumber`,
  `documentSeries`, `recipientName`, `deliveredAt`, `deliveryProof`.
- **RF3** `POST /me/.../proof` aceita, opcionais no multipart, `latitude`, `longitude`,
  `accuracyMeters` (0–10000) e `capturedAt` (ISO), validados por Zod como texto decimal com teto
  antes de virar número (T11). Par incompleto, fora de faixa, notação científica ou precisão acima de
  10 km → 400 `invalidRequest`.
- **RF4** Ao gravar uma foto (`kind = 'photo'`) para nota com `photo = 'required'` resolvida, a API grava a
  **pontualidade**: `on_time`, `late`, `away` ou `late_and_away`. Foto de nota sem exigência grava
  `not_required`. **Foto substituída fica com a pior pontualidade das duas** (T11, decisão D3b):
  `late` e `away` pesam igual, juntos viram `late_and_away`; `on_time` só vence `not_required`. A foto
  do escritório (`field-proof`, canal `office`) não classifica: grava `not_required` fundida com a
  anterior — preserva a pontualidade da foto do motorista e, sem foto anterior, fica `not_required`.
- **RF5** Horário de referência da foto = `capturedAt` do cliente, limitado ao intervalo
  `[max(evento de entrega − 2 min, recebimento − missingAfterHours), recebimento no servidor + 2 min]`
  (T11, decisão D3a: o relógio do aparelho só vale até `missingAfterHours` antes do recebimento; a
  folga de 2 min é a da
  `field-delivery-timing.policy.ts`); sem `capturedAt`, o recebimento no servidor. **Tardia** = referência
  mais de `proofWindowMinutes` depois de `trip_stop_events.captured_at ?? recorded_at` da entrega.
- **RF6** **Longe** = distância haversine entre a posição da foto e a da parada (`trip_stops.latitude/
longitude`) maior que `proofRadiusMeters + accuracyMeters da foto`. Parada sem coordenada usa a
  posição do evento de entrega; sem nenhuma das duas referências, não há como julgar a distância e ela
  não pesa. A precisão soma ao raio no máximo um raio (`min(accuracyMeters, proofRadiusMeters)`, T11). **Foto sem posição conta como longe** — o motorista precisa compartilhar a localização para
  provar que estava no local.
- **RF7** Parâmetros por empresa, junto da configuração do comprovante (`GET/PUT
/company-settings/delivery-proof`): `proofWindowMinutes` (padrão 60, 5–1440), `proofRadiusMeters`
  (padrão 300, 50–5000), `latePenaltyPoints` (padrão 5, 0–100), `missingPenaltyPoints` (padrão 10,
  0–100), `missingAfterHours` (padrão 24, 1–168). A exceção por CNPJ **não** carrega esses campos: são
  da empresa. No `PUT` os cinco são opcionais: o que não vem mantém o valor gravado (ou o padrão).
- **RF8** Penalidades de uma entrega do motorista com foto obrigatória, nos últimos 90 dias:
  - foto `late`, `away` ou `late_and_away` → `latePenaltyPoints` (uma vez por entrega, não soma os dois);
  - sem foto e entrega há mais de `missingAfterHours` → `missingPenaltyPoints`;
  - sem foto e dentro do prazo → nenhuma ainda (fica `proofPending`).
    Só entrega com canal `driver_app` entra (T11, decisão D2: `office` e `whatsapp` ficam fora — o
    WhatsApp ainda não será liberado; `proofPending` continua calculado para ele). O motorista da
    entrega é o do evento: `on_behalf_of_driver_id`, `reported_by_driver_id` (gravado pelo app e pelo
    WhatsApp desde a T11) ou, no evento antigo sem a coluna, o cadastro ligado a `actor_user_id`. Nota
    devolvida sem entrega não conta. O último `delivered` da nota decide; a baixa repetida do
    motorista (no-op `alreadySettled`) não grava evento novo.
- **RF9** Nota = `max(0, 100 − Σ penalidades vigentes)`; `null` quando o motorista não teve nenhuma entrega
  com foto obrigatória em 90 dias. A penalidade expira 90 dias depois da entrega. **Sem
  retroatividade** (T11, decisão D1): só conta entrega a partir de
  `company_delivery_proof_settings.score_effective_since` (instante da migration para as empresas que
  já existiam; `now()` na criação da linha; sem linha, sem corte). A lista `pendingProofs` usa o
  mesmo corte.
- **RF10** `GET /fleet/drivers` devolve `score` por motorista; `GET /fleet/drivers/:id/score` devolve a nota
  e a lista de penalidades vigentes (id do documento, número da NF-e, data da entrega, motivo, pontos,
  expira em). Permissão de leitura da frota; escopo da empresa do token.
- **RF11** Seletor de motoristas da viagem (`TripQuickCreateDialog`, `TripProposalDetail`) mostra a nota e
  ordena por nota desc, `null` por último, empate pelo nome.
- **RF12** PWA: com `photo = 'required'`, o card da parada avisa antes do "Entregar" que a foto é
  obrigatória e que tirá-la depois ou longe dali tira pontos; a entrega não é bloqueada. Tela "fotos
  pendentes" lista as notas com `proofPending`. O anexo leva a posição lida no momento da captura e
  `capturedAt`, e vai para a fila offline mesmo quando a entrega já saiu dela.

- **RF13** (T11) A posição da foto (`latitude`, `longitude`, `accuracy_meters` de
  `trip_delivery_proofs`) é apagada aos 90 dias pelo expurgo `trip.location.purge` do worker, como a
  do evento de entrega; `captured_at`, o arquivo e a pontualidade ficam.

## Requisitos não funcionais

- Nota derivada numa consulta agregada por empresa — sem N+1 ao listar motoristas (uma query para
  todos os ids da página).
- Posição da foto é dado pessoal de localização: não entra em log; o motorista só lê a própria nota;
  o escritório só lê motoristas da própria empresa (contrato negativo de tenant).
- Migration aditiva: colunas novas com default, nada de `NOT NULL` retroativo sem default.
- Dinheiro não entra; pontos são inteiros.

## Casos extremos e falhas

- Foto enviada duas vezes com a mesma `attachmentKey`: devolve a mesma, sem reclassificar.
- Foto substituída (upsert por `(evento, kind)`): fica a **pior** pontualidade das duas (T11, D3b).
- Foto do escritório sobre entrega do motorista: não penaliza nem lava (T11).
- Baixa do escritório com foto e, depois, `deliver` repetido pela fila do motorista: devolve o evento
  do escritório, sem evento novo — nada fica pendente nem penaliza (T11).
- `capturedAt` do aparelho no futuro ou antes da entrega: é limitado pela RF5, nunca recusado.
- Configuração muda de `required` para `optional` depois da entrega: a penalidade de ausência usa a
  configuração **atual**; a pontualidade já gravada numa foto não muda.
- Viagem com vários motoristas: só quem registrou a entrega é penalizado.
- Entrega repetida pela fila (mesma `Idempotency-Key`): um único evento, uma única avaliação.
- Motorista desligado ou sem cadastro: não aparece na recomendação; o histórico continua lido pela ficha.
  Desligar o acesso ao app (`fleet_drivers.membership_id = null`) não apaga o histórico das entregas
  gravadas com `reported_by_driver_id`; o evento anterior à T11 ainda depende do vínculo (limitação
  conhecida).

## Critérios de aceite

1. `/deliver` sem foto com `photo = 'required'` → 201, `proofPending: true`; com `optional` → `false`.
2. Snapshot devolve `proofPending` por documento e `score` do motorista.
3. `/proof` com posição a 100 m da parada e 10 min depois da entrega → `on_time`, sem penalidade.
4. `/proof` 2 h depois (janela 60) → `late`; a 2 km (raio 300) → `away`; sem posição → `away`.
5. Nota: uma foto `late` (5) + uma ausente há 25 h (10) → 85; ausente há 3 h → sem penalidade; entrega
   de 91 dias atrás → não conta; entrega pelo escritório → não conta.
6. `GET /fleet/drivers` traz `score`; `GET /fleet/drivers/:id/score` traz penalidades; motorista de outra
   empresa → 404.
7. Seletor ordena por nota; ficha mostra nota e penalidades; PWA mostra aviso, pendentes e nota.
8. Fila offline do PWA: foto de nota já entregue fica na fila sem rede e sobe quando a rede volta.

## Dúvidas

Nenhuma bloqueante. Números padrão (60 min, 300 m, 5 e 10 pontos, 24 h, 90 dias) foram escolhidos na
conversa da spec a partir da decisão do usuário ("geolocalização perto do local e contagem de horas",
"pontos que descem") e são configuráveis por empresa, exceto os 90 dias.

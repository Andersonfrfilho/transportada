# Feature 205 — O registro tardio pesa como foto atrasada

> Complementa a ADR-0070 (a foto obrigatória pesa na nota) e a spec 159. Não cria ADR: nenhuma regra
> nova de nota — a classificação que já existe (`late`) é reusada.

## Problema e resultado

A app do motorista (`apps/frontend-driver`) passa a exigir "Cheguei" antes de mostrar as ações de
entrega. Para quem não tocou "Cheguei" na hora, existe o **"Registrar entrega depois"**: o motorista
marca a entrega (ou a devolução) e sobe os comprovantes depois. O usuário decidiu, em 2026-09-25, que
isso **abaixa a nota** do motorista, e que o peso é **"igual a foto atrasada"**: usa a regra de
pontualidade que já existe, e o registro tardio conta como fora do horário.

Hoje a API não tem como saber: os três corpos do motorista (`/deliver`, `/return` e o multipart do
`/proof`) são validados por schema estrito, e um campo a mais é `400`.

Resultado: a API aceita `lateRegistration: boolean` (opcional) nos três, grava o fato e classifica a
foto obrigatória desse registro como `late` — a mesma penalidade `latePenaltyPoints` que a foto tirada
fora da janela já custa.

## Fora do escopo

- **Peso novo na nota.** A nota continua `100 − penalidades` (ADR-0070 §5); nenhum motivo, ponto ou
  prazo novo. O registro tardio só muda o veredito da foto obrigatória.
- **A tela da app do motorista** (`apps/frontend-driver`): outra frente liga a constante
  `LATE_REGISTRATION_FIELD_ENABLED` quando esta API estiver no ar.
- **Canal do escritório e WhatsApp**: não mandam o campo. O canhoto do escritório continua sem
  classificar (spec 159 T11).
- **Exibição visual** do registro tardio no painel: o campo sai na linha do tempo e no comprovante
  apenas como dado; nenhum rótulo novo na tela.

## Decisões

- **D1 — duas colunas, um fato em cada lugar.** A pontualidade mora em `trip_delivery_proofs`
  (coluna `punctuality`), mas a entrega e a devolução não têm linha ali — o comprovante chega depois,
  por outra rota. Então o fato fica onde cada toque grava:
  - `trip_stop_events.late_registration` — a baixa (`delivered`/`returned`) foi registrada depois;
  - `trip_delivery_proofs.late_registration` — o envio do comprovante veio pelo "registrar depois".
    Ambas `boolean not null default false`, aditivas, na mesma migration.
- **D2 — a foto obrigatória do registro tardio é `late`, seja qual for a hora ou o lugar.** Vale
  quando o próprio envio diz `lateRegistration: true` **ou** quando o evento de entrega foi gravado
  com ele (a app pode esquecer o campo no segundo toque; a entrega já disse). Dentro da regra de
  sempre: só `kind = 'photo'`, só canal do motorista, só com `photo = 'required'` resolvido — foto
  opcional grava `not_required`, exatamente como a foto atrasada opcional já grava. A fusão com a foto
  anterior (`mergeProofPunctuality`, D3b da spec 159) continua: substituir não melhora.
- **D3 — a devolução tardia não pesa.** Ela é gravada (`trip_stop_events.late_registration`) e sai na
  linha do tempo, mas a nota não a lê: a ADR-0070 (RF8 da spec 159) exclui a nota devolvida da nota, e
  não há foto obrigatória na devolução para classificar. Fazer pesar exigiria um motivo e um peso novos
  — o que esta spec proíbe.
- **D4 — entrega tardia sem foto não antecipa penalidade.** Sem foto, a entrega continua pendente
  (`proofPending`) e, passado `missingAfterHours`, pesa `missingPenaltyPoints` como hoje. O registro
  tardio pesa **quando a foto chega**, porque é nela que a classificação existe.
- **D5 — replay não reclassifica.**
  - `/deliver` e `/return` com a mesma `Idempotency-Key`: devolvem o evento já gravado, com o
    `late_registration` do primeiro toque (`recallOutcome`, sem escrita).
  - Outra chave sobre nota já entregue (`alreadySettled`): devolve o evento existente, sem gravar
    evento novo — o fato do primeiro registro vale.
  - `/proof` com a mesma `attachmentKey`: devolve a linha existente, sem recalcular (spec 159).
  - Foto substituta (outra chave): a pontualidade fica a pior das duas (D3b) e
    `late_registration` do comprovante fica `true` se qualquer um dos envios o disse — o substituto
    não lava o registro tardio.

- **D6 — a última baixa sem "Cheguei" preenche a chegada, em todo canal.** Achado na revisão da
  spec 206: no canal `driver_app`, `completeStopIfSettled` fechava a parada sem `arrived_at` e
  violava `trip_stops_completed_requires_arrived_check` — 500, e a fila da app reenviava para
  sempre. O "Registrar entrega depois" cai exatamente nesse caso. A correção é a mesma do
  escritório (spec 156 T15 C1): a chegada vazia vira a menor hora de entrega/devolução da parada.
  Vale para **todo** canal, não só com `lateRegistration`: o CHECK é invariante de qualquer baixa, e
  um motorista de app antigo, ou uma chegada perdida na fila, cairiam no mesmo 500 sem o campo.
  Nenhum evento `arrived` é inventado — a linha do tempo continua sem chegada, que é o fato. O
  parâmetro `fillMissingArrival` saiu da porta: ele valia `true` em todo caminho.

## Requisitos funcionais

- **RF1** `POST /me/trips/current/documents/:id/deliver` aceita `lateRegistration: boolean` opcional
  no corpo JSON. Ausente é `false`. Qualquer valor que não seja booleano → `400 invalidRequest`.
- **RF2** `POST /me/trips/current/documents/:id/return` aceita o mesmo campo, com a mesma regra.
- **RF3** `POST /me/trips/current/documents/:id/proof` aceita o campo de formulário
  `lateRegistration` com `true` ou `false` (texto). Ausente ou vazio é `false`; outro valor → `400`.
- **RF4** A baixa grava `trip_stop_events.late_registration` com o valor pedido; o comprovante grava
  `trip_delivery_proofs.late_registration` com o valor do envio (D1, D5).
- **RF5** A foto do motorista com `photo = 'required'` e registro tardio (D2) grava `punctuality =
'late'`; a resposta do `/proof` devolve `punctuality: 'late'`.
- **RF6** `GET /trips/:id/timeline` ganha `lateRegistration: boolean` em todo item — `true` só em
  `document.delivered`/`document.returned` gravados com o registro tardio.
- **RF7** `GET /trips/:id/documents/:documentId/proof` ganha `lateRegistration: boolean` por
  comprovante — `true` quando o envio ou a entrega a que ele pertence foi registrado depois.
- **RF8** O painel (`apps/frontend-transportada`) tolera os campos novos antes de a API subir e
  depois: `lateRegistration` opcional nos validadores da linha do tempo e do comprovante (padrão
  `hasKeys`, commit `694de05b5`).

## Casos extremos

- `lateRegistration: "true"` (texto) no JSON → `400`: o corpo JSON é tipado.
- Registro tardio com foto opcional → `not_required`, sem penalidade (igual à foto atrasada opcional).
- Registro tardio com canhoto do escritório por cima → o canhoto do escritório não classifica e é
  fundido com a foto do motorista (spec 159 T11): a foto `late` do motorista continua `late`.
- A mesma entrega registrada pelo escritório → não entra na nota (ADR-0070 §6), com ou sem o campo.

## Critérios de aceite

1. `/deliver` com `{"lateRegistration": true}` → 201 e `trip_stop_events.late_registration = true`;
   sem o campo → `false`; com `"sim"` → 400.
2. `/return` com o campo → 201 e o evento `returned` com `late_registration = true`.
3. `/proof` com `lateRegistration=true`, foto obrigatória, no local e dentro da janela → `late`.
4. Foto obrigatória no local e na hora, sem o campo no envio, mas entrega registrada tardia → `late`.
5. Nota do motorista: a entrega tardia com foto obrigatória perde `latePenaltyPoints` (5) — 95.
6. Replay do `/deliver` com a mesma chave e `lateRegistration` diferente não muda o evento.
7. A linha do tempo e o comprovante do painel mostram `lateRegistration: true` nessa entrega.
8. O painel aceita item de linha do tempo e comprovante com e sem `lateRegistration`, e recusa
   `lateRegistration` não booleano.
9. A última entrega e a última devolução de uma parada sem "Cheguei", com e sem o campo, fecham a
   parada com `arrived_at` preenchido, sem 500.

## Dúvidas

Nenhuma bloqueante. As decisões D1–D5 foram tomadas pela sessão a partir da decisão do usuário ("igual
a foto atrasada", sem peso novo) e estão justificadas acima.

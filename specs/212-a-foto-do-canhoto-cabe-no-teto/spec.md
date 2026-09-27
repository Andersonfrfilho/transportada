# Feature 212 — A foto do canhoto cabe no teto

> Registrada em 2026-09-26, a partir de um defeito P0: a foto do canhoto volta **413** em staging e
> em produção, e a prioridade nº 1 do usuário é "hoje o importante é foto do canhoto".
>
> **Numeração.** Conferida em 2026-09-26 com `git fetch && git log --all --format=%h -- 'specs/21*'`
> e `ls specs`: a 210 estava em `origin/staging` e a 211 existe na árvore (sessão concorrente). Esta
> é a **212**.

## Assunto já tratado em

- **082 / 159 / 203**: a fila offline de anexos, a drenagem e o "grava primeiro, nunca descarta".
- **156 T15 M7**: `OFFICE_PROOF_MAX_BYTES` (960 KiB) e a redução do escritório,
  `fieldDeliveryImage.service.ts` (2000 px, ~900 KiB). É a régua copiada aqui.
- **194 RF11**: o OCR do canhoto usa a imagem a 2000 px no lado maior — a mesma medida.
- **211 Q1** perguntava "reduzir também o canhoto no aparelho?". Esta spec responde sim.
- Commit `4b9afb6a9` (26/09): a primeira redução, depois de gravar, com a régua da ocorrência
  (1600 px / 400 KiB). Não fechava a corrida com a drenagem nem recuperava o que já estava preso.

## Problema, medido no código

1. `APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES = 1_048_576` (`api.constant.ts:189`) vale para toda
   requisição: `assertRequestSize` (`request-handler.service.ts`) recusa com 413 antes da rota.
2. `DELIVERY_PROOF_MAX_BYTES = 2_000_000` (`delivery-proof.policy.ts`) nunca era alcançado — o 422
   `TRIP_DELIVERY_PROOF_TOO_LARGE`, que a tela sabe explicar, não acontecia.
3. O `ProofCrop` não reduz: "Usar recorte" reencoda na resolução original, "Usar sem recorte" e
   "Anexar" mandam o arquivo da câmera (3–5 MB).
4. A causa gravada era `"413 PAYLOAD_TOO_LARGE"`. A drenagem automática pula item recusado, e depois
   de 7 dias o item é apagado (`ATTACHMENT_DISCARD_AFTER_MS`). O cartão seguia dizendo "anexada".
5. Depois do `4b9afb6a9`, a redução corria em paralelo com a drenagem: o temporizador, o `online`, o
   `visibilitychange` ou uma drenagem em curso levavam o original antes da versão leve.

## Resultado

- **D1 — Régua do canhoto.** Lado de 2000 px, alvo de ~900 KiB e teto duro de 960 KiB
  (`OFFICE_PROOF_MAX_BYTES`). Se a menor qualidade ainda passa do teto, o lado cai 20% por
  tentativa (2000, 1600, 1280, 1024…) até caber. A foto de ocorrência continua em 1600 px / 400 KiB.
- **D2 — A drenagem espera.** A foto nasce com `pendingReduction: true`. `drainQueueWithAttachments`
  pula item marcado em todo gatilho, inclusive o "Enviar agora". A redução troca o arquivo e tira a
  marca. Se falha, tira a marca e o original sobe. Nunca se perde a foto.
- **D3 — O que está preso volta sozinho.** No boot e antes de cada drenagem, a varredura reduz toda
  foto com arquivo acima de 960 KiB ou com a marca que sobrou do app fechado no meio. O arquivo é
  trocado e a `rejectionCause` sai junto, e a drenagem automática volta a levá-la. A recusa `413` e
  `TOO_LARGE` só acontece acima do teto, então o tamanho basta como critério. Foto recusada com
  arquivo pequeno tem outra causa e não é tocada. Uma redução por anexo: quem chega com a mesma
  chave espera a que já roda, e a drenagem espera todas antes de ler a fila.
- **D4 — A `/fila` explica.** `PAYLOAD_TOO_LARGE` e `TRIP_DELIVERY_PROOF_TOO_LARGE` viram "a foto
  passou do tamanho aceito pelo servidor". As outras causas seguem cruas.
- **D5 — A API volta a dizer 422.** `DELIVERY_PROOF_MAX_BYTES = OFFICE_PROOF_MAX_BYTES` (960 KiB).
  Entre 960 KiB e o corpo de 1 MiB, a resposta é 422 `TRIP_DELIVERY_PROOF_TOO_LARGE`.
- **D6 — O legado `/minha-viagem`** (painel, ainda em produção até a remoção da Fase 10 da 189) ganha
  a mesma régua, a mesma trava e a mesma recuperação. A tradução da `/fila` fica só na app nova.

## Fora do escopo

- O recorte do `ProofCrop` continua reencodando na resolução original. A redução acontece depois de
  gravar, no item da fila, de propósito (spec 203): fechar o app no meio nunca perde a foto.
- O OCR da 194 não existe na app do motorista hoje (nenhum `ocr` em `apps/frontend-driver/src`).
  Quando entrar, a régua de 2000 px daqui é a mesma do RF11 dela.

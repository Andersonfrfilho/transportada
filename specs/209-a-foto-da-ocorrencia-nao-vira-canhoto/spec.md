# Feature 209 — A foto da ocorrência não vira canhoto

- **Origem:** defeito P0 apontado pelo orquestrador em 2026-09-25. É a prioridade nº 1 do usuário:
  nada perde foto e nada pesa na nota do motorista.
- **Numeração:** conferida em 2026-09-25 com `git fetch && git log --all -- 'specs/20*'`, com
  `ls specs` e em todos os worktrees de `git worktree list`. A 203 está no histórico. A 204 a 208
  existem só como pastas não versionadas de outras sessões. A 209 estava livre.
- **Specs do mesmo assunto, lidas antes:**
  - 179: foto da ocorrência da nota por URL assinada e na fila offline;
  - 195: a mesma rota de upload por parada, planejada;
  - 203: o attach nunca descarta;
  - 204: recibo da "Cobrança inesperada". O RF5 dela é a rota que esta spec cria, com a mesma
    forma. O R6 dela é este defeito.

## Problema

A foto do "Deu problema" da parada vira **comprovante de entrega** de uma nota, qualquer que seja o
motivo.

- `DriverStopCard` manda cada foto para `onOccurrencePhoto`.
- A página chama `attachProof(kind: 'photo')` na nota que `findOccurrencePhotoDocument` escolhe: a
  primeira aberta, senão `documents[0]`.
- A causa: a rota `POST /me/trips/current/stops/:stopId/occurrences` não aceita anexo
  (`me-trip.schema.ts`, `.strict()`), e `main.ts` fixa `attachmentObjectId: null`.

Consequências:

| Caso                    | O que acontece                                                                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nota ainda não entregue | `findDeliveryEventId` exige `delivered` e responde `TripDocumentNotReachableError`. O anexo fica recusado na fila, a drenagem o pula, nunca chega ao escritório e ocupa o teto de 30 itens / 50 MB.                         |
| Parada já baixada       | A foto vira o canhoto e entra na pontualidade ("o pior vence", `delivery-proof-punctuality.policy.ts`). Pesa na nota do motorista (`drizzle-driver-score.repository.ts`). Pode preencher um canhoto `required` que faltava. |
| Foto grande             | O caminho não reduz a foto. Acima de 2 MB a API a recusa (`delivery-proof.policy.ts`).                                                                                                                                      |
| Legado `/minha-viagem`  | Mesmo defeito (`apps/frontend-transportada/src/modules/driver-trip`), ainda em produção enquanto `VITE_DRIVER_APP_URL` do painel estiver desligada.                                                                         |

## Resultado

- A foto do "Deu problema" é **anexo da ocorrência de parada**, em
  `trip_stop_occurrences.attachment_object_id`. Essa coluna já existia e nunca era preenchida.
- Nenhuma foto de ocorrência de parada entra em `trip_delivery_proofs`, na pontualidade ou na nota
  do motorista.
- A foto sai do aparelho reduzida a no máximo 512 KiB, pelo mesmo caminho da 179: URL assinada
  direto ao bucket, depois `confirm`.
- A ocorrência nunca espera a foto.

## Requisitos

- **RF1** `POST /me/trips/current/stops/:stopId/occurrence-uploads` e
  `POST .../occurrence-uploads/:uploadId/confirm`.
  - É a rota irmã, por parada, da `documents/:documentId/occurrence-uploads` da 179, sobre a mesma
    tabela `trip_occurrence_uploads` e as mesmas regras de `occurrence-attachment.policy.ts`.
  - A parada tem de ser de uma viagem **na rua** deste motorista (`TRIP_ON_ROAD_STATUSES`, o mesmo
    portão da ocorrência). Fora disso: `404 TRIP_STOP_NOT_REACHABLE`, e nada é gravado.
  - O objeto nasce escopado pela viagem que a consulta resolve, nunca por id que o cliente mande.
  - É a forma do RF5 da 204. A 195 e a 204 reaproveitam esta rota.
- **RF2** `POST /me/trips/current/stops/:stopId/occurrences` aceita `attachmentObjectId?` (uuid) em
  **qualquer** `kind`.
  - Aceito só se o upload estiver `confirmed` em `trip_occurrence_uploads` **desta empresa, desta
    viagem e deste motorista**. Fora disso: `404 TRIP_OCCURRENCE_UPLOAD_NOT_REACHABLE`, e nada é
    gravado.
  - Corpo sem o campo continua valendo igual: é o que o item enfileirado antes do deploy, o legado e
    o escritório mandam.
  - O canal do escritório (`/trips/:id/stops/:stopId/occurrences`) continua sem anexo.
- **RF3** Reenvio com a mesma `Idempotency-Key` devolve a mesma ocorrência, sem duplicar.
  - Se a ocorrência foi gravada **sem** anexo e o reenvio traz um anexo válido, o anexo é completado
    uma vez (`attachment_object_id is null`). É o que permite a foto chegar depois da ocorrência
    (D2).
  - Ocorrência que já tem anexo não é sobrescrita: o reenvio devolve a mesma, com o anexo de antes.
- **RF4** App do motorista: a foto do "Deu problema" sai da trilha de canhoto.
  - `onOccurrencePhoto` → `attachProof` deixa de existir. `findOccurrencePhotoDocument` continua só
    para a prévia do aviso.
  - A foto é reduzida no aparelho com `reduceOccurrencePhotoToJpeg`, a mesma da 179, e conferida
    contra 512 KiB (`isOccurrencePhotoWithinLimit`).
  - A foto entra na fila offline e sobe com o `uploadOccurrencePhoto` da 179, sem cópia: URL
    assinada, `PUT` sem token, `confirm`, e o `POST` da ocorrência com `attachmentObjectId`.
- **RF5** A ocorrência nunca espera a foto (D2). A foto que falha fica visível como pendente na tela
  da fila, e o "Enviar agora" a tenta de novo.
- **RF6** Fila cheia (bytes ou contagem): o relato entra **sem a foto**, e a tela avisa. É uma regra
  só, e vale também para a 195.
- **RF7** Legado `/minha-viagem`: a mesma correção (D5).

## Decisões

- **D1 — Uma foto por ocorrência.**
  - A coluna é uma só, e o reenvio completa o anexo uma vez (RF3).
  - Várias fotos virariam várias ocorrências. Cada uma dispararia um aviso no sino e uma linha no
    feed para um fato só, e o escritório leria três "Espera longa" onde houve uma.
  - A tela aceita uma foto, com "Refazer". Se o motorista precisar de outra foto, registra outra
    ocorrência.
- **D2 — A foto é um item próprio da fila, logo atrás da ocorrência.**
  - O pedido era "o item `occurrence` ganha a foto", no molde do `documentOccurrence` da 179. Não
    serve aqui: a 179 **precisa** do anexo antes do registro (tipo `required`), e esta regra diz o
    contrário.
  - Com um item só, o `send` sobe a foto antes do `POST`. Um `PUT` que falha por rede segura a
    ocorrência inteira. É o caso da origem do bucket fora da CSP, que o navegador acusa como
    `TypeError`, igual a rede caída.
  - Com dois itens:
    1. `occurrence`, sem foto, sobe primeiro;
    2. `stopOccurrencePhoto`, com a chave **própria** do item na fila e a chave **da ocorrência**
       para o reenvio, sobe depois: upload, `confirm` e o mesmo `POST` com a chave da ocorrência e
       `attachmentObjectId` (RF3).
  - Os dois entram na mesma transação do IndexedDB (`enqueueReports`).
  - A linha "ocorrência registrada · enviada" do cartão lê só a chave da ocorrência. A foto tem
    linha própria na tela da fila.
  - Se a ocorrência foi recusada e a foto não, o `POST` da foto cria a ocorrência com a foto. É a
    mesma chave e o mesmo corpo, e a ocorrência nunca fica duplicada.
- **D3 — Fila cheia derruba a foto, nunca o relato.**
  - A foto conta no teto de bytes dos anexos (`sumReportPhotoBytes`, como a 179).
  - Estourou bytes, ou os dois itens não cabem na contagem: entra só a ocorrência.
  - O aviso é `occurrencePhotoDropped`. A foto não cabe, e a tela diz isso em vez de calar.
- **D4 — Sem retroatividade no banco.**
  - Os canhotos já gravados pelo defeito ficam como estão.
  - O `evidence.md` traz uma consulta **somente leitura** para achá-los. Quem a roda é o usuário.
- **D5 — Legado com a mesma regra, pelo caminho mais curto.**
  - O painel não tem a infraestrutura da 179: redução, URL assinada, `documentOccurrence`.
  - A correção leva ao legado as mesmas peças por cópia de valor da app do motorista: o tipo
    `stopOccurrencePhoto`, a redução, o upload e o aviso de foto que não coube.

## Fora do escopo

- Valor, tipo de taxa e medição da espera: são da 204.
- Distância para `wrong_address`: é da 195.
- Anexo pelo escritório (`/trips/:id/stops/:stopId/occurrences`).
- Mostrar a foto da ocorrência de parada no feed e na linha do tempo do escritório.
  - A leitura por `GET /trip-occurrences/:id/attachments` já existe para a ocorrência da nota. A
    ocorrência de parada ainda não é lida ali.
  - Fica como pendência explícita. A foto está gravada, com dono e retenção, e a 204 prevê o
    "Ver recibo".
- `PUT` que falha por CSP. A causa é a mesma na 179 e aqui: o item parece "sem rede" e segura os
  itens de trás na drenagem. É defeito da drenagem, registrado como pendência.

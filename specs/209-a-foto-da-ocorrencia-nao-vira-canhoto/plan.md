# Plan — Spec 209 (a foto da ocorrência não vira canhoto)

## API (`apps/api-transportada`)

| Peça                                                                  | Mudança                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trips/application/request-stop-occurrence-upload.use-case.ts` (novo) | `requestStopOccurrenceUpload` e `confirmReachableStopOccurrenceUpload`. É o molde de `request-occurrence-upload.use-case.ts`, com a parada no lugar da nota, sobre `createOccurrenceUpload` e `confirmOccurrenceUpload` da 179, sem cópia. |
| `trips/application/resolve-occurrence-upload-attachment.use-case.ts`  | `driverId?` opcional. Quando vem, o upload também tem de ser deste motorista. A ocorrência da nota (179) não o manda e fica igual.                                                                                                         |
| `trips/application/report-stop-occurrence.use-case.ts`                | Nova porta opcional `attachmentUploads`. Com `attachmentObjectId`, a parada e o upload são conferidos **antes** da transação, o que vale para o registro novo e para o reenvio. Depois da transação, o anexo é completado uma vez (RF3).   |
| `trips/infrastructure/stop-occurrence-attachment.query.ts` (novo)     | `findDriverReachableStop` (viagem na rua deste motorista) e `attachUploadToStopOccurrence` (`update ... where attachment_object_id is null`).                                                                                              |
| `trips/infrastructure/drizzle-occurrence-upload.repository.ts`        | `findConfirmedUpload` filtra por `driver_id` quando o recebe.                                                                                                                                                                              |
| `trips/presentation/me-trip.schema.ts`                                | `attachmentObjectId: z.uuid().nullish()` no corpo da ocorrência de parada.                                                                                                                                                                 |
| `trips/presentation/me-trip.routes.ts`                                | As duas rotas por parada. `createOccurrenceUpload` e `confirmOccurrenceUpload` recebem `target: { documentId } \| { stopId }`: a dependência é a mesma, e nenhuma fábrica de teste de outra sessão quebra por chave nova.                  |
| `main.ts`                                                             | Fiação do alvo por parada, e `attachmentObjectId` do corpo no lugar do `null` fixo, só no canal do motorista.                                                                                                                              |

## App do motorista (`apps/frontend-driver`)

| Peça                                                      | Mudança                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `driverTrip.types.ts`                                     | Item `stopOccurrencePhoto`: `idempotencyKey` próprio, `occurrenceKey`, `stopId`, o corpo da ocorrência e `photo`.              |
| `driverTripClient.service.ts`                             | O `send` do item novo. `uploadOccurrencePhoto` da 179 passa a receber o caminho de uploads: o mesmo código para nota e parada. |
| `offlineQueue.service.ts`                                 | `sumReportPhotoBytes` conta a foto do item novo.                                                                               |
| `stopOccurrencePhoto.service.ts` (novo)                   | `buildStopOccurrenceReports`: a ocorrência e, com foto, o item da foto, amarrados pela chave.                                  |
| `useDriverTrip.hook.ts`                                   | `reportStopOccurrence`: bytes conferidos antes de gravar. Se não couber, entra só a ocorrência e volta `photo-dropped`.        |
| `eventQueueView.service.ts` e `DriverEventQueue.page.tsx` | O item novo com rótulo e foto.                                                                                                 |
| `DriverStopCard.component.tsx`                            | `onOccurrencePhoto` sai. O formulário reduz a foto (uma só) e a entrega em `onOccurrence`.                                     |
| `DriverTripWorkspace.page.tsx`                            | `reportStopOccurrence` usa o hook novo. O `attachProof` da ocorrência sai.                                                     |

## Legado (`apps/frontend-transportada/src/modules/driver-trip`)

É a mesma troca, pelas mesmas peças. O que não existia lá vem por cópia de valor da app do
motorista: a redução da foto e o upload.

## Testes

- API, contrato (sem banco): `test/trip-occurrence/stop-upload.contract.ts`, importado em
  `test/trip-occurrence.contract.test.ts`:
  - parada fora da viagem: pedido e confirmação respondem 404;
  - anexo de outra viagem, de outra empresa ou de outro motorista: 404, nada gravado;
  - `kind` qualquer com foto: grava com o anexo;
  - reenvio: devolve a mesma, e completa o anexo uma vez;
  - o schema aceita o campo;
  - `main.ts` não fixa mais `null` no canal do motorista.
- API, integração (Postgres): `test/integration/stop-occurrence-photo.integration.ts`, na lista de
  `test:integration`:
  - isolamento entre empresas;
  - objeto de outra viagem;
  - reenvio;
  - `long_wait` com foto;
  - nenhum `trip_delivery_proofs` gravado.
- App do motorista: `test/driver-trip/stop-occurrence-photo.contract.ts`, importado em
  `test/driver-trip.contract.test.ts`:
  - itens da fila;
  - `send`;
  - bytes;
  - fonte do cartão e da página, sem `attachProof` na ocorrência.

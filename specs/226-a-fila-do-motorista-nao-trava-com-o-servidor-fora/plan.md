# Plan — spec 226

Duas mudanças pequenas, sem backend e sem migration.

## Classificação (D1–D4)

`toAttachmentSendOutcome` (app novo) e `toOutcome` (legado) são o **único ponto** onde um erro de
envio vira `sent | failed-network | rejected`. Os dois passam a perguntar `isRetryableStatus(status)`
— conjunto nomeado `RETRYABLE_STATUSES` no cliente de cada app. O `request()` do cliente passa o
`status` no erro `RESPONSE_INVALID` quando `!response.ok`.

## Fila da nota (D5–D6)

`dispatchOccurrenceRegistration` deixa de ter a rota `document-direct`: tipo `flow: document` sempre
chama `enqueueDocumentOccurrence`, com `photo: draft.photo ?? null`. A página renomeia
`reportDocumentOccurrenceWithPhoto` → `reportDocumentOccurrence`. Saem: `onDocumentOccurrence` (cartão
e página), o estado `occurrenceFailed` e seu banner, `documentOccurrenceRecordedAt` (e a linha
"Ocorrência registrada às"), `client.registerDocumentOccurrence` e as chaves de locale
`documentOccurrenceFailed` e `activity.documentOccurrenceRecorded`.

## Riscos

- Um `503` prolongado repete a tentativa a cada 30 s por item parado (sem backoff) até o descarte de
  7 dias. Aceito; backoff é spec própria.
- O `Idempotency-Key` da ocorrência de nota passa a ser o do item da fila: o servidor casa o reenvio
  (`trip_field_reports`, ADR-0045 §5).

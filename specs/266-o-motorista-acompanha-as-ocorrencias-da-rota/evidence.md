# Evidência — 266 O motorista acompanha as ocorrências da rota

## Decisões do dono (chat, 2026-10-15)

- Prévia aprovada: "certo aprovado pode fazer".
- Escopo: "App-motorista + API + e o painel verifique se o painel está pronto também".
- Reabrir: "ele pode reabrir e responder e tudo registrado em evento".
- Documentos: anexos do chat + fotos do motorista.

## Levantamento contra `origin/staging` (d6459e4cd, 2026-10-15)

Feito por três buscas paralelas, só de leitura. A T0.1 confere as linhas antes de qualquer código.

### API

- A tratativa (`trip_occurrence_cases`, `trip.schema.ts:3550`) só abre com política de reentrega `allowed`/`blocked`
  (`occurrence-case.policy.ts:20`). A ocorrência de parada (`trip_stop_occurrences`, :1625) nunca abre tratativa.
- Estados: `recorded`, `under_review`, `returned_to_warehouse`, `awaiting_contractor`, `decided`, `closed`,
  `cancelled`. O terminal é protegido por `trip_occurrence_case_events_terminal_check` (:3720). Não existe
  `resolved` nem reabertura.
- "Recusada" não é estado do servidor: é a rejeição do registro na fila offline do app (246).
- Rota do motorista `GET /me/trips/current` (`me-trip.routes.ts:346`): `registeredOccurrences` só traz as que abriram
  retorno com a contratante (248); a parada não traz ocorrência.
- Foto e assinatura do motorista são servidas só ao escritório (`GET /trip-occurrences/:id/attachments`).
  `signature_object_id` é gravado e nunca lido.
- Conversa da ocorrência (183): uma por (ocorrência, participante), sempre "aberta", sem relação com a tratativa.
  O motorista não cria conversa de ocorrência (263 D4).
- Notificações: só inbox e e-mail. Nada notifica mudança de estado da tratativa
  (`occurrence-case.use-case.ts:88`).

### App do motorista

- Não existe entidade de ocorrência no cliente. `DriverRegisteredOccurrence` = `{ id, contractorReply }`
  (`driverTrip.types.ts:54`).
- "Enviada" vem de `sentReportKeys` da sessão; as chaves ficam em estado da página e se perdem ao recarregar.
- `OPENABLE_SUBJECT_TYPES = ['document','trip']` (`driverConversation.constant.ts:20`).
- O cabeçalho (`DriverShellHeader.component.tsx:40-78`) tem fila, sino e avatar. O alerta entra entre a fila e o sino.
- Faltam os ícones `share`, `paperclip` e `arrow-left`. Não há `navigator.share`; existe `saveDriverFile`.
- CSP: `frame-src 'none'`, `object-src 'none'`.

### Painel — veredito: não pronto

- A tratativa aparece só para `source === 'document'` (`TripOccurrenceDetail.page.tsx:436`,
  `TripOccurrenceTable.component.tsx:207`).
- Não há resolver com observação, reabrir ou selo de reaberta. "Fechar" não pede nota e é terminal.
- **Guardas estritos:** status desconhecido reprova `isFeedItem` e `readPage` lança `RESPONSE_INVALID` para a lista
  inteira (`tripOccurrenceFeedClient.service.ts:148,372`). Um `kind` desconhecido derruba a linha do tempo
  (`tripOccurrenceTimeline.validation.ts:49`). Daí a Fase 1 antes da API.

## Tasks

_(cada task registra aqui comando, saída resumida e commit)_

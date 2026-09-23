# Revisão de arquitetura — 23/09

Parecer do `architect` (opus) sobre T203 e T205, **antes** de escrever código. Ele desmontou três
afirmações da spec, todas verificáveis no repositório. Ficam aqui porque são o tipo de coisa que a
spec corrigida já não deixa ver — e quem vier depois precisa saber que foram erro, não escolha.

## O que a spec afirmava de errado

1. **"Miniatura gerada no servidor" (RF12/RF13 originais).** A spec 161 já entrega miniatura, e ela
   vem **do cliente**, no campo `thumbnail` do mesmo multipart, gravada como objeto próprio com
   `purpose: 'trip_occurrence_thumbnail'` (`occurrence.schema.ts:101-116`,
   `attach-occurrence-photo.use-case.ts:152-184`). Gerar no servidor seria um segundo caminho para a
   mesma ideia — o que a própria spec proíbe nos RF1/RF2.

2. **"O motivo da devolução é o motivo da ocorrência" (RF10 original).** `return_reason` não é texto
   livre: é lista fechada (`driver-return-reason.policy.ts:14-20` — `recipient_absent`,
   `recipient_refused`, `address_not_found`, `damaged_goods`, `establishment_closed`) usada como
   **chave de tradução** em `DriverStopCard.component.tsx:266` e no fluxo de WhatsApp. Gravar ali a
   `note` (texto livre, 500 chars) faria a UI procurar uma tradução inexistente.

3. **"A chave de idempotência já existente impede ocorrência duplicada".** Ela não existe nesta
   rota. `/deliver` (`me-trip.routes.ts:346-352`) e `/return` (377-385) leem a chave; a ocorrência
   (439-470) nunca leu. Sem ela, o reenvio da fila offline — que esta spec torna obrigatória —
   duplica ocorrência **e** objeto no bucket.

## O risco que a spec não tinha visto

Escrever `separation_status = 'returned'` direto marcaria a nota **sem fechar parada nem viagem**.
`report-document-delivery.use-case.ts:57-73` é uma casca fina sobre `runDocumentOutcome`, que faz
evento, `completeStopIfSettled`, `completeTripIfSettled`, `advanceTripFromSettledDocuments` e
auditoria. Contornando-o, a nota sai do fluxo e a parada fica aberta para sempre.

A redação anterior da T205 ("reaproveitando `return_reason` / `separation_status = 'returned'`")
convidava exatamente a esse erro.

## O que já está resolvido e não deve ser reescrito

- **Nota já entregue**: `trip-state.policy.ts:168-174` bloqueia com `documentAlreadyClosed`.
- **Nota já devolvida**: a mesma política devolve `unchanged` antes dos outros portões, e
  `settleAndRecordEvent` não grava evento novo. Já é idempotente.
- **Upload x transação**: `stored-object-cleanup.service.ts:24` (`runWithStoredObjectCleanup`) é a
  compensação que o storage externo ao Postgres exige — falha na transação remove o objeto do bucket
  e relança. `document-outcome.service.ts:38-48` e o lote do escritório já usam.

Ou seja: três dos "casos extremos" da spec não pedem código nenhum. Pedem **não contornar** o que
existe.

## Custo que não estava estimado

`registerDriverOccurrence` chama `repository.saveOccurrence` direto, **fora de qualquer unit of
work** (`register-driver-occurrence.use-case.ts:110-121`). A escrita única da T203 exige dar uma
unit of work a esse caminho. É o trabalho real da task.

## O que o parecer não verificou

- Não rodou teste nenhum (read-only).
- Não leu `office-multipart.schema.ts` inteiro — assumiu que os limites de tamanho e MIME são os do
  canhoto.
- Não confirmou se o repositório Drizzle do motorista aceita `attachmentObjectId` (o port do
  escritório aceita; o do motorista não tem o campo).
- Não verificou se há `return_reason` legado fora da lista fechada em produção (a migration
  `20260824200157_trip_status_machine` gravou `'migration'` em algum ponto).

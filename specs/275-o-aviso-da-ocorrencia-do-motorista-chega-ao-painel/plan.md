# Plan — 275 O aviso da ocorrência do motorista chega ao painel

Caminhos relativos a `apps/api-transportada/src/`.

## Desenho

- `trips/application/register-driver-occurrence.use-case.ts` ganha `notifier?: DriverOccurrenceNotifierPort` no input.
  Depois do commit chama `notify` com ids (empresa, viagem, nota, ocorrência, tipo), o nome do tipo e o template
  (`resolveDriverOccurrenceTemplateKey`, D3). Um `catch` cobre o notificador (D6). O app e o WhatsApp passam pelo mesmo
  caso de uso: uma ligação, dois canais.
- `trips/domain/occurrence-notification.policy.ts`: `resolveDriverOccurrenceTemplateKey` e
  `resolveDriverOccurrenceRecipients` (responsáveis ∪ despachante, ordem estável, sem duplicata).
- `trips/application/driver-occurrence-notifier.service.ts`: `createDriverOccurrenceNotifier({ logger, reader, send })`
  — lê despachante, contratante da nota, candidatos e rótulos; resolve a lista efetiva com `resolveEffectiveWatchers`
  (267, sem regra nova); envia um por destinatário com `allSettled` e `dedupeKey` D5; loga contagens.
- `trips/infrastructure/driver-occurrence-notification.query.ts`: o leitor Drizzle (`findDocumentOccurrenceSubject`,
  `loadEffectiveWatcherCandidates`, `readOccurrenceLabels`, último despacho).
- `contractor-mail/infrastructure/occurrence-watcher-candidates.query.ts`: `contractorId` aceita `null` (nota sem
  contratante cadastrada → lista da contratante vazia, tipo > empresa).
- `main.ts`: um `driverOccurrenceNotifier` montado no `bootstrap` (depois de `notifications`), usado pelo WhatsApp e
  passado a `createApplicationRoutes` para a rota `/me`. Comentário da 079 atualizado.

## Testes

- Contrato `test/trip-occurrence/driver-notification.contract.ts`: caso de uso (D1, D3, D6, WhatsApp), serviço (D2,
  D5, D6) e a ligação no `main.ts` (as duas chamadas de `registerDriverOccurrence` passam o notificador; o escritório
  continua com `occurrenceNotifier`).
- Integração `test/integration/driver-occurrence-notification.integration.ts` (Postgres + migrations do módulo):
  registro pelo caminho real grava `notification.notifications` para os destinatários esperados.

## Publicação

Só API, sem migration. Vai junto com o próximo deploy de `staging` → `main`. Efeito visível: a caixa de entrada dos
responsáveis e do despachante passa a receber avisos das ocorrências do motorista. O template
`trip.delivery-occurrence` precisa estar cadastrado na empresa (já é o caso para quem usa o aviso do escritório);
sem template o módulo recusa e o `warn` registra — o registro não é afetado.

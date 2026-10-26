# Evidência — 279

Spec escrita em 26/10/2026 a partir do código de `staging` (2ca71f2). Nada implementado ainda.

## T1 — tabela `delivery_client_emails` (26/10/2026)

- Migration `20261026193116_delivery_client_emails` (aditiva, gerada pelo `db:generate` com snapshot) e `rollback.sql`
  que **recusa** com e-mail guardado. Schema em `src/database/delivery-client-email.schema.ts`; vocabulário único em
  `src/shared/delivery-client-email.constant.ts` (`DELIVERY_CLIENT_EMAIL_PURPOSES`, limite 10 por tipo, padrão e 254 de
  `nfe_documents.recipient_email`, rótulo até 60).
- Colunas: `id, company_id, tax_id, purpose, address, label, created_by_kind ('office'|'driver'), created_by_user_id,
created_at, updated_at`. FK `(company_id, tax_id)` → `delivery_clients` (cascade), único
  `(company_id, tax_id, purpose, lower(address))`, índice `(company_id, tax_id, purpose)`. `created_by` de D1 virou
  `created_by_kind` + `created_by_user_id` (sem FK) porque D7 pede saber se foi o usuário ou o motorista.
- O tipo de D1 é a coluna `purpose`; a API (T2) expõe como `?type=`.
- CA1 no banco: `test/database-migration/delivery-client-emails.assertion.ts` (duplicata sem caixa, mesmo endereço em
  outro tipo, tipo fora do vocabulário, forma e tamanho do endereço, rótulo, autor, cliente de outra empresa pela FK,
  rollback recusado com dado, rollback vazio, reapply). O limite de 10 e a máscara são da API (T2).
- `bun test ./test/database-migration.contract.test.ts` com Postgres 16 descartável: 192 pass / 0 fail (a asserção
  conferida vermelha ao trocar a mensagem esperada). `tsc --noEmit` e `eslint` da API verdes.

## T2 — API do painel `delivery-clients/:taxId/emails` (26/10/2026)

- Rotas em `src/delivery-clients/presentation/delivery-client-email.routes.ts`: `GET ?type=` (`fleet.read`),
  `POST`, `PATCH /:emailId` (só o rótulo) e `DELETE /:emailId` (`fleet.manage`, D5). Documento fora de forma é `404`
  como em `by-tax-id`; `type` fora do vocabulário é `400`.
- Corpo do `POST`: `{ purpose, address, label? }`. Endereço aparado, até 254, sem espaço nem `,;<>` (D4). Toda resposta
  leva `addressMasked` (`maskEmailAddress`), nunca o endereço; `createdByKind` = `office`.
- Repositório (`drizzle-delivery-client-email.repository.ts`): escrita trava a linha do cliente (`FOR UPDATE`), então
  o limite de 10 por tipo (`422 DELIVERY_CLIENT_EMAIL_LIMIT_REACHED`) e a duplicata sem caixa
  (`409 DELIVERY_CLIENT_EMAIL_ALREADY_EXISTS`, com o id do existente) valem sob concorrência. Cliente de outra empresa:
  `404 DELIVERY_CLIENT_NOT_FOUND`; e-mail que não é dele: `404 DELIVERY_CLIENT_EMAIL_NOT_FOUND`.
- Auditoria (D7) na mesma transação: `delivery-client-email.{created,updated,removed}` em `audit_logs`, com endereço
  **mascarado** nos snapshots e sem o documento do cliente no metadata.
- Testes: `test/delivery-clients-http/emails.contract.ts` (rotas, validação, permissões) e
  `test/integration/delivery-client-emails.integration.ts` (CA1: adicionar, listar mascarado, editar rótulo, remover,
  limite 10 inclusive com 14 inclusões simultâneas, duplicata, outra empresa, auditoria sem endereço em claro), no
  `test:integration` da API. `bun run test` 12550 pass / 0 fail; integração com Postgres 16 descartável 4 pass;
  `tsc --noEmit` e `eslint` verdes.

## T3 — alvo `client_boleto_emails` no encaminhamento da 248 (26/10/2026)

- Alvo novo em `CONTRACTOR_REPLY_DELIVERY_TARGETS` e `CONTRACTOR_REPLY_EMAIL_TARGETS` (cópia idêntica no worker, presa pelo
  contrato de paridade), mais `CONTRACTOR_REPLY_MAIL_DELIVERY_TARGETS`. As listas SQL que eram literais
  (`('note_recipient_email', 'informed_email')` no worker e na cadeia de assunto da API) passaram a vir da constante: o
  status da entrega (`sent`/`failed`), o anexo pela entrega, o `Reply-To` e a exclusão da cadeia de `References` já valem
  para o alvo novo sem lista a esquecer.
- Migration `20261026204239_contractor_reply_client_boleto_emails`: alarga as CHECKs `target` e `address` da entrega.
  `rollback.sql` recusa com entrega gravada nesse alvo. Asserção `contractor-reply-client-boleto-emails.assertion.ts`
  (CHECKs alargadas, rollback estreita, reapply) roda antes da 276 T5, cujo rollback recria a CHECK do alvo; os rollbacks
  da 248 desfazem esta primeiro. Linha real do alvo com endereço em `occurrence-contractor-reply-rows`.
- Caso de uso: `forwardToClient` no mesmo `forward-contractor-reply-by-email` (RF3/RF4), com `emailIds`, `address` (novo)
  e `save`. Na mesma transação e com o retorno travado: `client_email_type` do tipo (`resolveClientEmailPurpose` da T3b,
  `409 OCCURRENCE_CLIENT_EMAIL_OFF`), texto do e-mail da cópia do retorno (248), anexo, cliente pelo destinatário da nota
  (`nfe_participants.role = recipient` com cadastro em `delivery_clients`), e-mails do **tipo que o tipo da ocorrência
  usa**. Um e-mail por endereço (sem repetir, sem distinguir caixa); chave de entrega por (retorno, anexo, endereço),
  então repetir com outra `Idempotency-Key` devolve `already_queued`. O teto de 5 por ocorrência conta o pedido inteiro
  (nada sai se não couber); PDF acima do limite grava `failed` por endereço.
- Guardar (D4/D7): só com `save` e `address`; trava a linha do cliente (`FOR UPDATE`, a mesma do painel da T2), não
  duplica (devolve o id existente), respeita o limite de 10 (`422 DELIVERY_CLIENT_EMAIL_LIMIT_REACHED`), grava
  `created_by_kind` (`office` pelo painel; `driver` fica para a T4) e `audit_logs` `delivery-client-email.created` com o
  endereço mascarado. Sem cadastro do cliente: `404 DELIVERY_CLIENT_NOT_FOUND` ao guardar e
  `404 DELIVERY_CLIENT_EMAIL_NOT_FOUND` para `emailId` (inclusive de outro tipo, cliente ou empresa).
- Rota do painel (RF4): o `POST /trip-occurrences/:id/contractor-reply/email-delivery` aceita `target: client_boleto_emails`
  com `emailIds` (1 a 10) e/ou `address`, e `save`; `emailIds`/`save` em outro alvo e `save` sem `address` são `400`.
  Resposta `{ results: [{ addressMasked, deliveryId, emailId, kind, reason }], savedEmailId }`, `201` se algum saiu.
  `GET .../email-options` ganhou `clientEmailType` e `clientEmails` (mascarados, por `emailId`).
- Decisão: com RF9 (T3b), quem liga o alvo do cliente é o `client_email_type` do tipo, não os modos
  `forward_to_note_recipient`/`forward_to_informed_email` da 248 (D5 os citava para o motorista antes de existir o RF9).
- Fica para depois: "Tentar de novo" de uma entrega `failed` (T6b) precisa de chave nova, porque a chave por endereço
  devolve a falha gravada.
- Testes: contrato `forward-contractor-reply-by-email.contract.ts` (19 casos da 279), integração da API
  `occurrence-contractor-reply-client-emails.integration.ts` (envio por endereço e repetição, guardar com autor e auditoria
  sem duplicar, tipo `off`, `emailId` de outro tipo e de outra empresa, leitura mascarada) no `test:integration`, e
  integração do worker `occurrence-contractor-reply-email-delivery.integration.ts` (o alvo novo sai com o PDF, sem token,
  e a entrega fecha `sent` ou `failed`). Com Postgres 16 descartável: contrato da API 12557 pass / 0 fail, migration 192
  pass, integrações tocadas verdes; `tsc --noEmit` e `eslint` da API e do worker verdes. No worker, as falhas locais são
  só de ambiente (leitor de código de barras, RabbitMQ e MinIO ausentes), nenhuma nos arquivos tocados.

## T3c — envio automático ao cliente (26/10/2026)

- Migration `20261026211723_client_email_send_mode`: coluna `client_email_send_mode` (`manual` padrão | `automatic`) em
  `company_occurrence_types` com CHECK, sem UPDATE (nenhum tipo existente liga), e o motivo `client_without_email` nas
  CHECKs de motivo da entrega e do histórico do retorno. `rollback.sql` recusa com linha gravada com esse motivo.
  Vocabulário em `CLIENT_EMAIL_SEND_MODES` (`delivery-client-email.constant.ts`); o motivo na constante espelhada do
  retorno (API = worker).
- Cadastro do tipo: `clientEmailSendMode` no `PUT` do catálogo (ausente não mexe, fora da lista é 400), devolvido na
  leitura; aba Tipos de `/ocorrencias` ganhou "Envio do boleto ao cliente" (Manual/Automático), visível só com o envio ao
  cliente ligado. `GET .../email-options` devolve `clientEmailSendMode`.
- Gatilho (RF10a): `contractor-reply-client-email-forward.support.ts`, SQL puro e byte a byte igual na API e no worker
  (entrou no contrato de paridade), chamado logo depois do automático da 248 ao cliente da nota, quando o boleto é aceito
  (`reply_received`, modo `forward_automatic`). Só age com `client_email_type <> off`, `client_email_send_mode =
automatic` e o assunto e o texto do e-mail preenchidos na cópia do retorno. Manda um e-mail a cada endereço do tipo
  configurado no cadastro do cliente (destinatário da nota), gatilho `automatic`, sem usuário (o Sistema), mensagem da
  143 + outbox + linha da entrega, no mesmo savepoint isolado da 248 (falha vira `failed / send_failed` e não desfaz o
  retorno nem a entrega ao motorista).
- Idempotência: a chave de cada endereço é a do envio manual da T3 (retorno, anexo, endereço), então o botão depois
  devolve `already_queued` para quem já recebeu. Sem e-mail do tipo (ou sem cadastro), uma linha `skipped /
client_without_email` sem endereço, por (retorno, anexo). O teto de 5 por ocorrência da 248 vale: saem os primeiros do
  cadastro até ele, o resto fica para o botão.
- Decisão: o automático segue o ponto da 248 (aceite automático). No modo com aprovação do operador nada sai sozinho,
  como o automático ao cliente da nota.
- Fica para depois: RF10(b) (e-mail digitado na conversa sai sem cartão) depende da T4b; o painel ainda não mostra as
  entregas do alvo do cliente nem o aviso "Sem e-mail do cliente para o boleto" (T5/T6b leem `client_without_email` em
  `email-options.deliveries`).
- Testes: integração da API `occurrence-contractor-reply-client-emails-auto.integration.ts` (envio por endereço do tipo
  e não do outro tipo, repetição e botão depois sem duplicar, sem e-mail e sem cadastro, `manual`/`off`/com aprovação sem
  envio, teto de 5) 5 pass; integração do worker `occurrence-contractor-reply-received.integration.ts` com dois casos
  novos, 16 pass; migration (asserção `client-email-send-mode.assertion.ts`) 192 pass com Postgres 16 descartável;
  contrato do tipo (`client-email-type-write.contract.ts`) e do painel. `bun run test`: API 12594 pass / 0 fail, painel
  8524 + 1412 pass, worker 2824 pass com as 5 falhas só de ambiente (leitor de código de barras). `tsc` e `eslint` dos
  arquivos tocados verdes nas três apps.

## T4b — e-mail digitado na conversa (26/10/2026)

- Migration `20261026221939_conversation_message_detected_email`: `detected_email varchar(254)` e
  `detected_email_sent_at` em `occurrence_conversation_messages`, com CHECK (enviado só com e-mail). `rollback.sql`
  recusa com e-mail detectado gravado.
- Domínio (`client-email-detection.policy.ts`): uma única extração, o primeiro endereço válido do texto pelo mesmo
  validador da 248 (`parseContractorReplyEmailAddress`); "1" sozinho é a confirmação do WhatsApp.
- `createDetectedClientEmailUseCase`, chamado depois do commit da mensagem do motorista (app e WhatsApp, nunca no replay
  idempotente). Só age em conversa de ocorrência com o motorista, boleto aceito (`reply_attachment_id`) e
  `client_email_type <> off`. `manual`: grava `detected_email` e, no WhatsApp, responde "Enviar o boleto para f**_@m_**.com?
  Responda a esta mensagem com 1". `automatic` (RF10b): sai na hora, sem cartão. O envio é sempre `forwardToClient` da
  T3 (chave `detected-email:<mensagem>` no automático e no "1"), e o endereço só entra no cadastro com "Enviar e guardar".
  Falha nunca derruba a mensagem; o log leva só o nome do erro e nenhum endereço sai em claro.
- Decisão: o automático e o "1" não guardam o endereço no cliente (`save:false`). Nenhum campo do tipo diz "guarda se o
  tipo permitir"; guardar fica no toque explícito do cartão.
- Limite: no WhatsApp a mensagem do motorista só chega à conversa citando uma nossa (regra atual de atribuição), então o
  "1" precisa responder ao aviso.
- Rotas: motorista `GET/POST /me/.../client-boleto-emails/detected[/:messageId/send]` (mesmo balde de rate limit);
  painel `GET/POST /trip-occurrences/:id/contractor-reply/detected-client-email[/:messageId/send]` (`WRITE_POLICY`,
  `idempotency-key`). 404 `DETECTED_CLIENT_EMAIL_NOT_FOUND`.
- Telas: `DetectedClientEmailCard` no painel (avisos da conversa do motorista) e no app (`renderSubjectCard`), com
  "Enviar" e "Enviar e guardar para o cliente", estados enviado/falhou. Prévias em
  `/mnt/project-files/previews/email-digitado-t4b/`.
- Testes: integração `detected-client-email.integration.ts` 4 pass (+ `me-client-boleto-emails` 8 pass); migration 231
  pass com Postgres 16 descartável; contratos de detecção (mensagens reais, vários endereços, mascarado/inválido), hook
  do WhatsApp, rate limit e painel/app. `bun run test`: API 12618 pass / 0 fail, painel 8551 + 1419 pass, motorista 2116
  pass. `tsc`, `eslint` e `prettier` verdes nas três apps.

## T6b — aviso "Boleto enviado para o e-mail" e estado Enviado/Falhou

- Aviso: uma mensagem por endereço, gravada pelo worker na mesma transação que marca a entrega `sent` (savepoint: se o
  aviso falhar, a entrega continua `sent`). Coluna `system_notice jsonb` (`kind`, `actorKind`, `actorName`, `deliveryId`),
  CHECK de forma e índice único por entrega (a repetição do worker não duplica). Autor: Sistema quando não há usuário
  (envio automático da T3c), senão "Sistema · nome" de quem mandou. O endereço inteiro vai só no texto da conversa e nas
  telas; log e evento seguem mascarados. O aviso não conta como "aguardando o motorista" nem como não lida.
- "Tentar de novo": só a recusa do provedor (`send_failed`); anexo grande demais não. Chave nova por tentativa
  (`<chave da T3>:retry:n`, no máximo 5), sem mexer na chave da T3/T3c. Manda só o id da entrega; a API lê endereço e anexo.
- Telas: `ClientEmailSendState` no painel (Enviado com hora, Na fila, Falhou com botão, "Sem e-mail do cliente para o
  boleto") e leitura equivalente, sem botão, na folha do motorista. Prévias em `previews/emails-cliente-t6b/`.
- Limite do SDK: sem tipo de mensagem de sistema, e o balão de saída do escritório não mostra o nome do autor; a hora
  aparece, o "Sistema · nome" aparece no app do motorista e no menu do balão.
- Testes: migração (`conversation-system-notice.assertion.ts`, `db:test` 231 pass, regenerada sobre a T3c); integração
  da API (retry, aviso, leituras, motorista com `deliveries` e o pulado); worker `occurrence-contractor-reply-email-
delivery` 13 pass; painel `bun run test` e `test:hooks` 1424 pass; motorista 2115 pass; API `bun run test` 12627 pass.
  Falha conhecida que já existia: `driver-subject-conversation` "retarget" (unique de `trip_drivers`); worker: 5 do leitor
  de código de barras, só de ambiente.

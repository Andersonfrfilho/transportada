# Evidência — Feature 317

## Etapa 2 — API (2026-11-10)

Branch `feat/317-etapa-2-api`, sobre `staging` com a Etapa 1 (migration `20261110194838_receiving_charge_to_settlements`).

### O que mudou

- **T4** `trips/domain/stop-occurrence-photo-slots.policy.ts`: o registro lê as vagas do tipo
  (`company_occurrence_type_photo_slots`) e recusa vaga desconhecida, repetida ou o mesmo upload em duas vagas (400
  `STOP_OCCURRENCE_PHOTO_SLOT_INVALID`); vaga obrigatória faltando é 422 `STOP_OCCURRENCE_PHOTO_SLOT_MISSING` com
  `slotKey`. Cada foto passa pela mesma barreira do upload da spec 209 (empresa, viagem, motorista). A coluna antiga
  `attachment_object_id` guarda a primeira foto (E2). O escritório não tem o anexo da parada, então as vagas não se
  cobram dele e o corpo do escritório não aceita `photos`.
- **T5/T5a** `trips/domain/receiving-charge.policy.ts` + `trips/infrastructure/receiving-charge.persistence.ts`: só para
  tipo do catálogo com `stop_kind = 'unexpected_charge'` (outro tipo com `receivingCharge` é 400
  `STOP_OCCURRENCE_RECEIVING_CHARGE_NOT_ACCEPTED`; o corpo antigo só com `kind` segue só relato). Nota: uma na parada é
  assumida, várias exigem a escolha (422 `STOP_OCCURRENCE_DOCUMENT_REQUIRED`), nota de outra parada é 422. Por nota: uma
  linha por nota com o valor dela; agrupada: uma linha com `grouped_documents` e as notas em `delivery_charge_documents`
  (um cliente e uma contratante, senão 422). Partes lidas da nota no servidor (destinatário → `delivery_clients`,
  emitente → `contractors`). Valor exato (`bigint`), `0` é valor. "Quem pagou?" obrigatório; `driver` exige PIX.
  Ocorrência, fotos, linhas `receiving_charge`/`recorded`/`occurrence` e a marca do cliente na **mesma transação** do
  `trip_field_reports`; reenvio pela mesma chave faz replay, e os índices únicos parciais seguram a linha
  (`ON CONFLICT DO NOTHING`). A sugestão `onDelivered` (spec 060 D4c) saiu do registro da parada (E10).
- **T5b** `POST /trip-occurrences/stop/:id/resolution` aceita `driverPayoutReceiptAttachmentId` opcional: o anexo
  tem de ser de mensagem **enviada** na conversa do motorista desta ocorrência (404
  `STOP_OCCURRENCE_PAYOUT_RECEIPT_NOT_FOUND`) e a ocorrência paga pelo motorista (422
  `STOP_OCCURRENCE_PAYOUT_NOT_APPLICABLE`). Grava `driver_payout_*` na transação da resolução. Sem o campo, concluir é
  como sempre. O envio do comprovante ao motorista é o chat que já existe.
- **T6** `GET /occurrence-charges/report` passa a listar `receiving_charge` (as sugestões antigas de parada continuam
  fora) com `tripId`, `stopOccurrenceId`, `photos[]` (`slotKey`, `label`, `url` assinada de 5 min, `expiresAt`) e
  `receivingCharge` (`paidBy`, PIX, `driverPayoutSentAt`; `trip.financials`). Marca do cliente:
  `GET`/`DELETE /delivery-clients/:id/receiving-charge-flag` (`fleet.read`/`fleet.manage` — não existe
  `delivery.manage`), rota própria para não mexer no detalhe do cliente que o painel valida por chaves exatas; limpar
  audita (`delivery-client.receiving-charge-flag.cleared`) na mesma transação.
- **T7** `PUT /company-settings/occurrence-types` recusa `emailsContractor: true` em tipo gravado com
  `stop_kind = 'unexpected_charge'` (400 `OCCURRENCE_TYPE_RECEIVING_CHARGE_CONTRACTOR_MAIL_NOT_ALLOWED`).
- **RF7**: o registro da parada não importa e-mail, portal, bot nem a sugestão (contrato estático); o aviso automático
  à contratante já respondia `not_document` para parada.

### Testes

- Contratos (`test/trip-occurrence/receiving-charge.contract.ts`, `test/delivery-clients-http/receiving-charge.contract.ts`):
  `bun --env-file=../../.env.test test ./test/trip-occurrence.contract.test.ts` → 899 pass / 0 fail;
  `./test/delivery-clients-http.contract.test.ts` → 51 pass / 0 fail.
- Suíte de contratos inteira (`bun run test`): 14844 pass / 0 fail, 228 arquivos.
- Integração nova contra Postgres 16 local (`test/integration/receiving-charge.integration.ts`, na lista do
  `package.json`): 6 pass / 0 fail — uma linha e duas fotos com reenvio, agrupada com `delivery_charge_documents`, foto
  faltando não grava nada, relatório com fotos/PIX e sem a outra empresa, comprovante do PIX só do chat do motorista,
  limpar a marca com auditoria e isolamento.
- Vizinhas: `stop-occurrence-photo`, `me-trip`, `event-location-stamp`, `delivery-charge-end-to-end`,
  `occurrence-charge`, `occurrence-charge-report`, `occurrence-resolution` verdes. `driver-stop-reminders` tem 4 falhas
  **iguais na base sem esta mudança** (conferido com `git stash`), não desta etapa.
- `tsc --noEmit` limpo; `eslint --max-warnings 0` e `prettier` nos arquivos tocados.

### ⚠️ Ordem de publicação

O painel publicado lança erro em `chargeType` desconhecido (`readChargeType` em
`frontend-transportada/src/modules/extra-charges/shared/extraChargesResponse.validation.ts`) e não conhece
`receiving_charge`. Esta API só cria linha `receiving_charge` quando um tipo `unexpected_charge` for usado pelo app
novo, então pode ir a staging antes; **o painel da Etapa 3 (com `receiving_charge` no vocabulário) vai antes de
qualquer tipo de cobrança no recebimento ser usado**, e antes desta API chegar à `main`. As chaves novas das linhas do
relatório são toleradas pelo painel publicado.

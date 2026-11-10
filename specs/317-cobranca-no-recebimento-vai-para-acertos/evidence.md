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

## Etapa 3 — Painel (2026-11-10)

Branch `feat/317-etapa-3-painel`, sobre `staging` com a Etapa 2.

### O que mudou

- **T9** `extra-charges`: `receiving_charge` entra em `DELIVERY_CHARGE_TYPES` (o `readChargeType` não lança mais na primeira
  linha); o relatório lê `photos[]`, `receivingCharge`, `tripId` e `stopOccurrenceId` com leitura tolerante (API antiga, foto
  malformada). Cada linha com detalhe ganha uma linha própria abaixo com as fotos rotuladas (`ReceivingChargeDetail`), quem pagou, o
  PIX do motorista (a tela já exige `trip.financials`) e o botão "Abrir a ocorrência". Textos em `.locale.json` (pt-BR e en).
- **T10** `delivery-clients`: `DeliveryClientReceivingChargeFlag` na ficha do cliente (selo "Possível cobrança na entrega", data,
  link da ocorrência e "Limpar a marca" só com `fleet.manage`), sobre `GET`/`DELETE /delivery-clients/:id/receiving-charge-flag`.
  `trip`: `OccurrenceResolutionPanel` oferece o "Comprovante do PIX" (opcional) nas ocorrências de parada pagas pelo motorista
  (`DriverPayoutReceiptField`, dono `extra-charges`): o arquivo sobe pelo chat do motorista que já existe
  (`sendDriverPayoutReceipt`) e o id do anexo vai em `driverPayoutReceiptAttachmentId`; se o envio falhar, a ocorrência conclui
  sem o comprovante e a tela avisa.
- **T11** prints em `prints/` (claro/escuro × desktop 1440/celular 390) de Ressarcimentos e da ficha do cliente, gerados por
  `test/spec-317-prints.smoke.spec.ts` (fora do smoke da CI).

### Limites conhecidos

- A lista de clientes não mostra o selo (a marca é lida por cliente; ler a de todos seriam N chamadas). Só a ficha mostra.
- O campo do comprovante localiza a cobrança no relatório de Ressarcimentos (primeira página de 100, filtrada por tipo): a API
  não expõe `paidBy` no detalhe da ocorrência, e linha já fechada em lote sai do relatório — nesse caso o campo não aparece e a
  conclusão segue igual.
- O campo do comprovante na tela de concluir não tem print (exige simular o detalhe da ocorrência); coberto por contrato.

### Testes

- `test/extra-charges/receiving-charge.contract.ts` (tipo e traduções, leitura tolerante, marca do cliente, envio do
  comprovante); `bun run test` do painel: 0 fail; `tsc --noEmit`, `eslint --max-warnings 0` e `prettier` limpos nos arquivos tocados.

## Etapa 4 — App do motorista (2026-11-10)

Branch `feat/317-etapa-4-app`, sobre `staging` com as etapas 1 a 3. **T14a (selo no cartão da parada e interruptor no
editor de tipos) ficou para um PR próprio**: ele atravessa API, painel e app.

### O que mudou

- **API (aditivo, RF8)**: o app só lê as vagas de foto do servidor, e a rota `GET /me/trips/current/occurrence-types`
  não as devolvia. `listOccurrenceTypes` passou a ler `company_occurrence_type_photo_slots` numa consulta só
  (`occurrence-type-photo-slots.query.ts`) e `photoSlots[]` (`slotKey`, `label`, `required`, `position`) sai no tipo
  **só quando ele tem vagas**: o corpo dos demais tipos continua byte a byte o de hoje.
- **T12** formulário (`OccurrenceReceivingChargeSection`, `useReceivingChargeForm`, `receivingCharge.service.ts`): para o
  tipo de parada `unexpected_charge` com vagas, valor (máscara de centavos da 247, `0,00` é valor), notas e modo (por nota ou
  agrupada, só com mais de uma nota na parada; uma só é assumida), "Quem pagou?", tipo e chave PIX quando foi o motorista,
  e **uma foto por vaga com o rótulo do servidor**. Só componentes do design system (rótulo em cima, `Select`, botões e
  chips padrão). "Registrar" só habilita com tudo, e a segunda trava está em `dispatchOccurrenceRegistration`.
  Limite conhecido: o PIX não vem pré-preenchido, porque o snapshot do app não traz o PIX do cadastro do motorista.
- **T13** fila: um item novo, `stopOccurrenceCharge`, com as fotos por vaga, o valor, as notas e o PIX. Não reaproveitei
  `stopOccurrencePhoto` porque a API exige todas as vagas obrigatórias **no primeiro** registro (`422
STOP_OCCURRENCE_PHOTO_SLOT_MISSING`), então a ocorrência não pode subir antes das fotos. O `send` sobe cada foto
  pela rota da parada e faz um `POST` só com `photos[{ slotKey, objectId }]` e `receivingCharge`, com a chave do
  registro (reenvio não duplica). Entra na cota de bytes das fotos, no carimbo de hora e no cancelamento da fila, e a
  fila cheia devolve o toque inteiro (foto obrigatória nunca é derrubada). A mensagem do botão diz **qual** foto falta
  ("Para registrar, falta: Foto da placa de cobrança, …"), e o chip do tipo diz "2 fotos obrigatórias".
- **T14** contrato de paridade (`test/driver-trip/receiving-charge.contract.ts`, 17 testes): nenhuma `slotKey` fixa em
  `src/` (a exigência é lida do servidor), foto faltando, valor, nota única × várias, agrupada, PIX, o item único na
  fila e o `POST` com duas subidas e a mesma chave.

### Testes

- App: `bun run test` 2296 pass / 0 fail; `eslint`, `tsc --noEmit` e `prettier --check .` limpos.
- API: `bun --env-file=../../.env.test test ./test/trip-occurrence.contract.test.ts` 923 pass / 0 fail (inclui o novo
  contrato das vagas); `tsc --noEmit` limpo.
- Não rodei a integração da API contra Postgres nesta máquina; a mudança de leitura é uma consulta de `SELECT`.

### Prints (claro/escuro, desktop 1280 px e celular 375 px)

`specs/317-*/prints/cobranca-completo-{light,dark}-{desktop,mobile}.png` e `cobranca-vazio-light-mobile.png`
(`test/spec-317-prints.smoke.spec.ts`, fora da CI). Só o caso de uma nota: o dublê do smoke tem uma nota por parada, e
o caso de várias notas está coberto por contrato.

### ⚠️ Ordem de publicação

Painel (Etapa 3, já em staging) → API (esta, aditiva) → app. O app novo com a API antiga cai no formulário de sempre, porque
sem `photoSlots` o tipo não abre a cobrança.

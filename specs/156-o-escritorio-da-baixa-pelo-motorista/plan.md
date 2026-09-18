# Spec 156 — Plano

## Onde o código está hoje

| Peça                        | Arquivo                                                                                                                                                                                                      | O que faz                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estados e ações             | `apps/api-transportada/src/trips/domain/trip-state.policy.ts`                                                                                                                                                | Ações da nota (:11) e da viagem (:20), `checkTripAcceptsDocumentWork` (:176), `checkFieldStart` (:245), `deriveTripStatus` (:356).                                                                      |
| Rotas do motorista          | `trips/presentation/me-trip.routes.ts`                                                                                                                                                                       | `/me/trips/current/...`: `confirm-load`, `start-route`, `stops/:stopId/arrive`, `stops/:stopId/occurrences`, `documents/:id/{deliver,return,proof,occurrences}`. Acha a viagem pelo motorista (:48-55). |
| Rotas do escritório         | `trips/presentation/trip.routes.ts`                                                                                                                                                                          | `/trips/:id/...`, `batch-status` (:1158) já aceita `deliver`. Ocorrência da nota (:1114), com `trip.manage`.                                                                                            |
| Casos de uso de campo       | `trips/application/start-field-trip`, `report-document-delivery`, `attach-delivery-proof`, `register-driver-occurrence`, `report-stop-occurrence`                                                            | Todos recebem `driverId` e acham a viagem atual por uma porta (`StartFieldTripPort`, `DeliveryProofPort`, `DriverOccurrencePort`...).                                                                   |
| Idempotência                | `trip_field_reports` (`database/trip.schema.ts:860`)                                                                                                                                                         | Chave do relato de campo.                                                                                                                                                                               |
| Comprovante                 | `trip_delivery_proofs` (:905), `delivery-proof.schema.ts:34-61`, `delivery-proof-storage.gateway.ts`, `delivery-proof-settings.policy.ts`                                                                    | Uma foto e uma assinatura por entrega, e a segunda substitui a primeira. As regras vêm da empresa.                                                                                                      |
| Autoria                     | `actor_user_id` em `trip_document_events` (:468), `trip_stop_events` (:676), `trip_stop_occurrences` (:793), `trip_field_reports` (:869), `trip_delivery_proofs` (:929), `trip_document_occurrences` (:1000) | Não existem canal nem "em nome de".                                                                                                                                                                     |
| Permissões                  | `identity/domain/authorization.policy.ts`                                                                                                                                                                    | `trip.report` é só de `driver` e `aggregate` (:204-207). `separator` tem `trip.manage` (:211).                                                                                                          |
| Tela da viagem              | `frontend-transportada/src/modules/trip/components/TripDetail.component.tsx`, `TripStateActions.component.tsx`, `hooks/useTripDocumentSelection.hook.ts`                                                     | Ações por nota (:220-253), ações em massa (:97-143) e seleção.                                                                                                                                          |
| Regra no cliente            | `modules/trip/shared/tripStatus.service.ts`                                                                                                                                                                  | `canReturnDocuments`/`canDeliverDocuments` divergem da API em `on_delivery_route`.                                                                                                                      |
| Câmera e leitor             | `components/ui/barcodeDecoder.service.ts`, `barcodeScanner.service.ts`, `useBarcodeScanner.hook.ts`, `barcode-scanner.tsx`                                                                                   | ZXing com Code128, que é o código da chave do DANFE.                                                                                                                                                    |
| Recorte e fila do motorista | `modules/driver-trip/components/ProofCrop.component.tsx`, `shared/offlineAttachments.service.ts`                                                                                                             | Recorte do comprovante. A fila offline **não** é reaproveitada: o escritório trabalha online.                                                                                                           |

## Desenho

### API

1. **Localizar a viagem por dois caminhos** 🧠. As portas dos casos de uso de campo deixam de receber
   `driverId` e passam a receber um alvo:

   ```ts
   type FieldTripTarget =
     | { readonly kind: 'driver'; readonly driverId: string }
     | { readonly kind: 'trip'; readonly tripId: string; readonly companyId: string }
   ```

   O repositório resolve `trip` filtrando por `companyId` e, quando não encontra, devolve `null`, que
   vira 404. O motorista da viagem sai de `trip_drivers` e vira `onBehalfOfDriverId`. Viagem sem
   motorista vinculado responde 422 `TRIP_WITHOUT_DRIVER`.

2. **Autoria**. Migration aditiva nas seis tabelas de campo: `channel varchar(16) not null default
'driver_app'` e `on_behalf_of_driver_id uuid null` (FK para `fleet_drivers`, composta com
   `company_id`). CHECK: `channel = 'office'` exige `on_behalf_of_driver_id`. O fluxo do WhatsApp
   passa a gravar `whatsapp`. Não tem backfill: o default já descreve o histórico.
3. **Rotas do escritório** (`trip-field-office.routes.ts`, arquivo novo, para o `trip.routes.ts` não
   crescer mais), todas com `trip.report-on-behalf`:

   | Método e path                                          | Caso de uso                                                                                                         |
   | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
   | POST `/trips/:id/confirm-load`                         | `start-field-trip` (passo `confirmLoad`)                                                                            |
   | POST `/trips/:id/start-route`                          | `start-field-trip` (passo `startRoute`)                                                                             |
   | POST `/trips/:id/stops/:stopId/arrive`                 | chegada                                                                                                             |
   | POST `/trips/:id/stops/:stopId/occurrences`            | `report-stop-occurrence`                                                                                            |
   | POST `/trips/:id/documents/:documentId/field-delivery` | `report-document-delivery` + `attach-delivery-proof` na mesma transação (multipart: foto, recebedor, `deliveredAt`) |
   | POST `/trips/:id/documents/:documentId/field-return`   | `report-document-delivery` (devolução)                                                                              |
   | POST `/trips/:id/documents/field-occurrences`          | ocorrência em massa: `{ documentIds[], typeCode, note, attachment? }`                                               |

   A entrega em massa **não tem rota própria**: o cliente chama `field-delivery` uma vez por nota,
   cada chamada com o seu `Idempotency-Key`. Cada nota tem sua foto, e mandar tudo num multipart só
   tornaria impossível repetir apenas a nota que falhou.

4. **`deliveredAt`** (D4). Zod na borda. O caso de uso valida contra `dispatchedAt` e o relógio, e
   os erros `DELIVERED_AT_IN_FUTURE` e `DELIVERED_AT_BEFORE_DISPATCH` ficam em
   `shared/errors/codes.ts`. O motorista continua sem mandar o campo (vale "agora").
5. **`allowedActions` em `GET /trips/:id`** (D10). A lista é calculada pela `trip-state.policy.ts`
   **e** pelas permissões do usuário, e o frontend para de reescrever essa regra.
6. **Auditoria**. Cada registro do escritório grava em `audit_logs`, com ator, alvo, IP e horário.

### Frontend

- `modules/trip/components/TripFieldActions.component.tsx`: iniciar rota e registrar chegada, na
  parada. Aparece só com `allowedActions`.
- `modules/trip/components/FieldDeliveryWizard.component.tsx` (D5): um passo por nota, com preview
  de câmera (`getUserMedia`) e, por cima dele, a faixa da nota (`FieldDeliveryNoteBanner`). Tem
  captura, conferência e pular. Também aceita **enviar arquivo** em vez da câmera, porque no desktop
  o canhoto costuma chegar escaneado.
- `modules/trip/shared/canhotoIdentification.service.ts` (D6): recebe o quadro, tenta
  `decodeBarcodeFrame`, extrai a chave de 44 dígitos e compara com as notas da seleção e da viagem.
  É uma função pura com fixture de imagem.
- `modules/trip/hooks/useFieldDelivery.hook.ts`: envia as notas com concorrência limitada (3), guarda
  o resultado de cada uma e permite repetir só as que falharam.
- `FieldOccurrenceDialog.component.tsx`: ocorrência de uma nota ou de várias (D7).
- Linha do tempo: "registrado por X (escritório) pelo motorista Y".
- Textos em `*.locale.json`. Componentes do `shadcn/ui`.

### Fase experimental — OCR do número (D6.2)

`tesseract.js` só com dígitos (`tessedit_char_whitelist`), carregado sob demanda, com o worker e o
wasm servidos pelo próprio app (a CSP já permite `wasm-unsafe-eval` desde a spec 152). O interruptor
fica em `company_delivery_proof_settings.canhoto_ocr_enabled`, desligado por padrão, e a tela mostra o
selo "Experimental". O candidato só é aceito se o número lido bater com **exatamente uma** nota da
viagem. Dependência nova: justificar em ADR (code-standart §13).

## Riscos

- **Canhoto destacado não tem código de barras.** O caso mais comum no escritório é o maço de
  canhotos soltos. Aí a identificação automática só vem com o OCR (Fase 5); até lá, a escolha é
  manual, mas com a nota esperada já sugerida pelo passo do assistente.
- **Mexer nas portas dos casos de uso do motorista** pode quebrar o PWA e o app nativo. Mitigação: os
  contratos atuais de `/me` rodam **sem alteração** antes e depois da T3.
- **"Entregue em" retroativo muda o SLA e o relatório de pontualidade.** O relatório passa a usar
  `delivered_at`, e não `recorded_at`, que é o comportamento certo, mas o número muda. Registrar essa
  mudança no `evidence.md`.

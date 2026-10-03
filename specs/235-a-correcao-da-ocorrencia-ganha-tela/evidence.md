# Evidência — spec 235, Fase 0

Ambiente: API deste worktree (`work/spec-235`) subida na porta 53091 contra o Postgres local
(127.0.0.1:55432) e o Keycloak local; token do usuário de seed `local-user` (papéis
`company-admin` + `operator`, tem `trip.manage`) obtido por authorization code + PKCE no cliente
`transportada-spa`. Token, senha e URLs assinadas: `[REDACTED]`. Dados reais do banco local
(contratante, destinatário, motorista, placa) trocados por placeholder. Nenhum arquivo de
`apps/api-transportada` foi alterado; nenhum INSERT bruto — só SELECT para achar ids e as rotas da
própria API para escrever. A API foi derrubada ao fim.

Ocorrências usadas (todas de nota, `stage=separation`, empresa de seed):

| Papel | Ocorrência                                                                   | Estado inicial                                            |
| ----- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| A     | `a4b6ef1d-0049-4814-9d39-47e21b264760` (trip `536b67aa-…`, doc `06a3f3ae-…`) | 2 itens (696, 697), sem tratativa                         |
| B     | `8bf20b6b-f798-49d3-bf88-39a2d0136848` (trip `fe7f0dbd-…`, doc `536cc86e-…`) | 1 item (3537, unidade legada `CX30`), sem tratativa       |
| C     | `feefbf9f-49d3-410e-8353-8794ed9aebeb` (trip `fe7f0dbd-…`, doc `ed1d59c8-…`) | com tratativa aberta (1 linha em `trip_occurrence_cases`) |

Todas as escritas levam `Authorization: Bearer [REDACTED]`, `Content-Type: application/json` e
`Idempotency-Key` (UUID novo por chamada, exceto onde dito). Ids de viagem/nota ficam inteiros.

## Códigos de erro estáveis (resumo)

| Situação                                     | HTTP | `error.code`                                               | Como foi obtido                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | ---- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correção com tratativa aberta                | 409  | `OCCURRENCE_CASE_ALREADY_OPEN`                             | exercitado (C1)                                                                                                                                                                                                                                                                     |
| Cancelamento com tratativa aberta            | 409  | `OCCURRENCE_CASE_ALREADY_OPEN`                             | exercitado (C2)                                                                                                                                                                                                                                                                     |
| Cancelar ocorrência já cancelada             | 409  | `OCCURRENCE_ALREADY_CANCELLED`                             | exercitado (C3)                                                                                                                                                                                                                                                                     |
| Corrigir ocorrência cancelada                | 409  | `OCCURRENCE_CANCELLED`                                     | exercitado (C4)                                                                                                                                                                                                                                                                     |
| Mesma chave, outro conteúdo                  | 409  | `TRIP_FIELD_REPORT_KEY_REUSED`                             | exercitado (W3c)                                                                                                                                                                                                                                                                    |
| Quantidade inválida/zero                     | 400  | `OCCURRENCE_ITEM_QUANTITY_NOT_POSITIVE`                    | exercitado (E1, E2)                                                                                                                                                                                                                                                                 |
| Quantidade sem unidade                       | 400  | `OCCURRENCE_ITEM_QUANTITY_UNIT_PAIRING`                    | exercitado (E3)                                                                                                                                                                                                                                                                     |
| Item fora da nota                            | 422  | `OCCURRENCE_PRODUCT_NOT_IN_DOCUMENT`                       | exercitado (E4)                                                                                                                                                                                                                                                                     |
| Sem `Idempotency-Key`                        | 400  | `INVALID_REQUEST` (`details[0].field = "idempotency-key"`) | exercitado (E5)                                                                                                                                                                                                                                                                     |
| Motivo vazio ou só espaços                   | 400  | `OCCURRENCE_CANCELLATION_REASON_REQUIRED`                  | exercitado (E6)                                                                                                                                                                                                                                                                     |
| Motivo com mais de 500 caracteres            | 400  | `OCCURRENCE_CANCELLATION_REASON_TOO_LONG`                  | exercitado (E7)                                                                                                                                                                                                                                                                     |
| Teto de um item (tipo que não aceita vários) | 422  | `OCCURRENCE_TYPE_SINGLE_ITEM`                              | **lido do código, não exercitado** — `trip.error.ts` (`OccurrenceTypeSingleItemError`, `status: 422`) e `correct-occurrence-items.use-case.ts`; os 10 tipos do banco local têm `allows_multiple_items = true`, e criar um tipo novo seria mudar dado de configuração fora do escopo |
| Ocorrência inexistente / de outra empresa    | 404  | `TRIP_OCCURRENCE_NOT_FOUND`                                | **lido do código, não exercitado** (`trip.error.ts`, `TripOccurrenceNotFoundError`)                                                                                                                                                                                                 |

Ordem de checagem no servidor (lida do código): cancelada (`OCCURRENCE_CANCELLED`) vem **antes** de
tratativa aberta; no cancelamento, já cancelada (`OCCURRENCE_ALREADY_CANCELLED`) vem antes de
tratativa aberta. O motivo do cancelamento é validado (trim, vazio, teto 500) **antes** da transação.
Correção sem mudança real não grava nada e responde 200 (W5).

## T0.1 — Escritas

#### W1 correção com dois itens

- Requisição: `PATCH /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760/items`
- Idempotency-Key: AE5CD4D7-29DC-4296-9976-42A7084400DD
- Corpo enviado: `{"items":[{"code":"696","quantity":"2","unit":"box"},{"code":"697","quantity":"5","unit":"unit"}]}`
- Status: **200**
- Resposta:

```json
{
  "data": {
    "actorName": "Operador local",
    "attachments": [
      {
        "id": "05ec9694-9a8f-4f4c-9e47-93fbddec6aa3",
        "position": 1
      }
    ],
    "cancellation": null,
    "channel": "driver_app",
    "corrections": [
      {
        "correctedAt": "2026-10-03T00:39:17.391Z",
        "correctedByName": "Operador local",
        "previousItems": [
          {
            "code": "696",
            "unit": "box",
            "quantity": "1.000"
          },
          {
            "code": "697",
            "unit": "unit",
            "quantity": "1.000"
          }
        ]
      }
    ],
    "createdAt": "2026-09-23T02:26:00.359Z",
    "id": "a4b6ef1d-0049-4814-9d39-47e21b264760",
    "note": "sdfasdfasdfasdf",
    "occurrenceTypeId": "60879fd1-0885-45ed-9dce-e52005a62bf8",
    "onBehalfOfDriverName": null,
    "productCode": "696",
    "productCodes": ["696", "697"],
    "products": [
      {
        "code": "696",
        "quantity": "2.000",
        "unit": "box"
      },
      {
        "code": "697",
        "quantity": "5.000",
        "unit": "unit"
      }
    ],
    "stage": "separation",
    "typeName": "Item avariado"
  }
}
```

#### W2 segunda correção

- Requisição: `PATCH /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760/items`
- Idempotency-Key: CF8F5688-9FAA-47D4-B84C-0A426040445A
- Corpo enviado: `{"items":[{"code":"696","quantity":"3","unit":"box"},{"code":"697","quantity":"5","unit":"unit"}]}`
- Status: **200**
- Resposta:

```json
{
  "data": {
    "actorName": "Operador local",
    "attachments": [
      {
        "id": "05ec9694-9a8f-4f4c-9e47-93fbddec6aa3",
        "position": 1
      }
    ],
    "cancellation": null,
    "channel": "driver_app",
    "corrections": [
      {
        "correctedAt": "2026-10-03T00:39:17.391Z",
        "correctedByName": "Operador local",
        "previousItems": [
          {
            "code": "696",
            "unit": "box",
            "quantity": "1.000"
          },
          {
            "code": "697",
            "unit": "unit",
            "quantity": "1.000"
          }
        ]
      },
      {
        "correctedAt": "2026-10-03T00:39:17.515Z",
        "correctedByName": "Operador local",
        "previousItems": [
          {
            "code": "696",
            "unit": "box",
            "quantity": "2.000"
          },
          {
            "code": "697",
            "unit": "unit",
            "quantity": "5.000"
          }
        ]
      }
    ],
    "createdAt": "2026-09-23T02:26:00.359Z",
    "id": "a4b6ef1d-0049-4814-9d39-47e21b264760",
    "note": "sdfasdfasdfasdf",
    "occurrenceTypeId": "60879fd1-0885-45ed-9dce-e52005a62bf8",
    "onBehalfOfDriverName": null,
    "productCode": "696",
    "productCodes": ["696", "697"],
    "products": [
      {
        "code": "696",
        "quantity": "3.000",
        "unit": "box"
      },
      {
        "code": "697",
        "quantity": "5.000",
        "unit": "unit"
      }
    ],
    "stage": "separation",
    "typeName": "Item avariado"
  }
}
```

#### W4 correção de item único (ocorrência B, unidade legada)

- Requisição: `PATCH /trips/fe7f0dbd-30eb-4c48-9b40-2678ebfee283/documents/536cc86e-8d3e-4263-af8c-42c52f916f22/occurrences/8bf20b6b-f798-49d3-bf88-39a2d0136848/items`
- Idempotency-Key: 18D1AA1F-C840-46BA-85DE-E7E014BF67B9
- Corpo enviado: `{"items":[{"code":"3537","quantity":"4","unit":"box"}]}`
- Status: **200**
- Resposta:

```json
{
  "data": {
    "actorName": "Operador local",
    "attachments": [
      {
        "id": "abd824a2-cf36-4248-8f71-2c29ac2198ed",
        "position": 1
      }
    ],
    "cancellation": null,
    "channel": "driver_app",
    "corrections": [
      {
        "correctedAt": "2026-10-03T00:40:36.021Z",
        "correctedByName": "Operador local",
        "previousItems": [
          {
            "code": "3537",
            "unit": "CX30",
            "quantity": "3.000"
          }
        ]
      }
    ],
    "createdAt": "2026-09-23T18:37:38.740Z",
    "id": "8bf20b6b-f798-49d3-bf88-39a2d0136848",
    "note": "",
    "occurrenceTypeId": "6bebcda8-7bee-4a6a-a35d-7ed31f0e1e91",
    "onBehalfOfDriverName": null,
    "productCode": "3537",
    "productCodes": ["3537"],
    "products": [
      {
        "code": "3537",
        "quantity": "4.000",
        "unit": "box"
      }
    ],
    "stage": "separation",
    "typeName": "Divergência de quantidade"
  }
}
```

#### W5 correção sem mudança real (mesmo conjunto)

- Requisição: `PATCH /trips/fe7f0dbd-30eb-4c48-9b40-2678ebfee283/documents/536cc86e-8d3e-4263-af8c-42c52f916f22/occurrences/8bf20b6b-f798-49d3-bf88-39a2d0136848/items`
- Idempotency-Key: 9539A10B-6313-4314-B665-B77F7FEA0394
- Corpo enviado: `{"items":[{"code":"3537","quantity":"4.0","unit":"box"}]}`
- Status: **200**
- Resposta:

```json
(corpo idêntico ao de W4: `corrections` continua com UMA entrada, `products[0].quantity` = "4.000" — nada novo gravado)
```

#### W3 cancelamento com motivo

- Requisição: `POST /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760/cancellation`
- Idempotency-Key: 2FE2D462-F2EE-4A64-9D10-035AC3DA8CDD
- Corpo enviado: `{"reason":"Lancada na nota errada (teste da spec 235)"}`
- Status: **200**
- Resposta:

```json
{
  "data": {
    "actorName": "Operador local",
    "attachments": [
      {
        "id": "05ec9694-9a8f-4f4c-9e47-93fbddec6aa3",
        "position": 1
      }
    ],
    "cancellation": {
      "cancelledAt": "2026-10-03T00:39:36.091Z",
      "cancelledByName": "Operador local",
      "reason": "Lancada na nota errada (teste da spec 235)"
    },
    "channel": "driver_app",
    "corrections": [
      {
        "correctedAt": "2026-10-03T00:39:17.391Z",
        "correctedByName": "Operador local",
        "previousItems": [
          {
            "code": "696",
            "unit": "box",
            "quantity": "1.000"
          },
          {
            "code": "697",
            "unit": "unit",
            "quantity": "1.000"
          }
        ]
      },
      {
        "correctedAt": "2026-10-03T00:39:17.515Z",
        "correctedByName": "Operador local",
        "previousItems": [
          {
            "code": "696",
            "unit": "box",
            "quantity": "2.000"
          },
          {
            "code": "697",
            "unit": "unit",
            "quantity": "5.000"
          }
        ]
      }
    ],
    "createdAt": "2026-09-23T02:26:00.359Z",
    "id": "a4b6ef1d-0049-4814-9d39-47e21b264760",
    "note": "sdfasdfasdfasdf",
    "occurrenceTypeId": "60879fd1-0885-45ed-9dce-e52005a62bf8",
    "onBehalfOfDriverName": null,
    "productCode": "696",
    "productCodes": ["696", "697"],
    "products": [
      {
        "code": "696",
        "quantity": "3.000",
        "unit": "box"
      },
      {
        "code": "697",
        "quantity": "5.000",
        "unit": "unit"
      }
    ],
    "stage": "separation",
    "typeName": "Item avariado"
  }
}
```

#### W3b replay da mesma chave e mesmo motivo

- Requisição: `POST /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760/cancellation`
- Idempotency-Key: 2FE2D462-F2EE-4A64-9D10-035AC3DA8CDD
- Corpo enviado: `{"reason":"Lancada na nota errada (teste da spec 235)"}`
- Status: **200**
- Resposta:

```json
(corpo idêntico ao de W3: mesma chave e mesmo motivo convergem, 200 com `cancellation` e `corrections` íntegros)
```

#### W3c mesma chave, outro motivo

- Requisição: `POST /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760/cancellation`
- Idempotency-Key: 2FE2D462-F2EE-4A64-9D10-035AC3DA8CDD
- Corpo enviado: `{"reason":"outro motivo"}`
- Status: **409**
- Resposta:

```json
{
  "error": {
    "code": "TRIP_FIELD_REPORT_KEY_REUSED",
    "correlationId": "1907a705-3a9b-44de-aded-03088ee2d74f",
    "message": "This idempotency key was already used for a different field report."
  }
}
```

## T0.1 — Recusas

#### C1 409 correção com tratativa aberta

- Requisição: `PATCH /trips/fe7f0dbd-30eb-4c48-9b40-2678ebfee283/documents/ed1d59c8-f176-41c2-80eb-2960810f16ba/occurrences/feefbf9f-49d3-410e-8353-8794ed9aebeb/items`
- Idempotency-Key: 774F6C0C-6DDE-4CEF-811E-38C669B31FDE
- Corpo enviado: `{"items":[]}`
- Status: **409**
- Resposta:

```json
{
  "error": {
    "code": "OCCURRENCE_CASE_ALREADY_OPEN",
    "correlationId": "d45081a5-4e58-4feb-8c19-ebbf2f231efa",
    "message": "This occurrence already has an open case; it can no longer be corrected or cancelled."
  }
}
```

#### C2 409 cancelamento com tratativa aberta

- Requisição: `POST /trips/fe7f0dbd-30eb-4c48-9b40-2678ebfee283/documents/ed1d59c8-f176-41c2-80eb-2960810f16ba/occurrences/feefbf9f-49d3-410e-8353-8794ed9aebeb/cancellation`
- Idempotency-Key: C271EA56-BA79-49CB-B8D0-73BFD74A9415
- Corpo enviado: `{"reason":"teste de tratativa aberta"}`
- Status: **409**
- Resposta:

```json
{
  "error": {
    "code": "OCCURRENCE_CASE_ALREADY_OPEN",
    "correlationId": "c643ddda-05f3-4034-bc41-d99cb5b5ac86",
    "message": "This occurrence already has an open case; it can no longer be corrected or cancelled."
  }
}
```

#### C3 409 já cancelada (chave nova)

- Requisição: `POST /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760/cancellation`
- Idempotency-Key: 5E489E22-E2F6-4BDA-921D-4B834FCCDF75
- Corpo enviado: `{"reason":"de novo"}`
- Status: **409**
- Resposta:

```json
{
  "error": {
    "code": "OCCURRENCE_ALREADY_CANCELLED",
    "correlationId": "716deb8e-bcbb-4162-88b7-1c753b9becd5",
    "message": "This occurrence was already cancelled."
  }
}
```

#### C4 409 correção de cancelada

- Requisição: `PATCH /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760/items`
- Idempotency-Key: 4C969631-C216-4780-BEFC-5C147C9F3827
- Corpo enviado: `{"items":[{"code":"696","quantity":"9","unit":"box"}]}`
- Status: **409**
- Resposta:

```json
{
  "error": {
    "code": "OCCURRENCE_CANCELLED",
    "correlationId": "65513543-3146-4e1d-89e2-97ebf03fb85d",
    "message": "This occurrence was cancelled and can no longer be corrected."
  }
}
```

#### E1 quantidade inválida

- Requisição: `PATCH /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760/items`
- Idempotency-Key: 7ABDEA1E-A8EB-4496-833B-559501452069
- Corpo enviado: `{"items":[{"code":"696","quantity":"abc","unit":"box"},{"code":"697","quantity":"5","unit":"unit"}]}`
- Status: **400**
- Resposta:

```json
{
  "error": {
    "code": "OCCURRENCE_ITEM_QUANTITY_NOT_POSITIVE",
    "correlationId": "9388f5a2-cf8f-4515-8870-a6a566123254",
    "message": "An item quantity must be a positive number."
  }
}
```

#### E2 quantidade zero

- Requisição: `PATCH /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760/items`
- Idempotency-Key: E6BC34C2-7A3E-4A2C-A089-9763C885B440
- Corpo enviado: `{"items":[{"code":"696","quantity":"0","unit":"box"}]}`
- Status: **400**
- Resposta:

```json
{
  "error": {
    "code": "OCCURRENCE_ITEM_QUANTITY_NOT_POSITIVE",
    "correlationId": "581eaf0d-b3d0-4787-9378-e0ad3ddb8a18",
    "message": "An item quantity must be a positive number."
  }
}
```

#### E3 quantidade sem unidade

- Requisição: `PATCH /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760/items`
- Idempotency-Key: 3E05309E-3290-4709-A9F4-D0C844BB7DBD
- Corpo enviado: `{"items":[{"code":"696","quantity":"2"}]}`
- Status: **400**
- Resposta:

```json
{
  "error": {
    "code": "OCCURRENCE_ITEM_QUANTITY_UNIT_PAIRING",
    "correlationId": "673df02a-bfbb-4d62-b1d5-4d83053f90f7",
    "message": "An item quantity must come with its unit, and a unit with its quantity."
  }
}
```

#### E4 item fora da nota

- Requisição: `PATCH /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760/items`
- Idempotency-Key: DE7FC6FA-CBB0-4235-85E5-3ACFC3AADB22
- Corpo enviado: `{"items":[{"code":"999999","quantity":"1","unit":"box"}]}`
- Status: **422**
- Resposta:

```json
{
  "error": {
    "code": "OCCURRENCE_PRODUCT_NOT_IN_DOCUMENT",
    "correlationId": "2801af5e-9738-4d07-80f6-a6353465eae7",
    "message": "The product is not part of this document."
  }
}
```

#### E5 sem Idempotency-Key

- Requisição: `PATCH /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760/items`
- Idempotency-Key: (nenhuma)
- Corpo enviado: `{"items":[{"code":"696","quantity":"3","unit":"box"}]}`
- Status: **400**
- Resposta:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "correlationId": "0fb47e73-e87a-4ab4-9d5d-51b02439b3d4",
    "details": [
      {
        "field": "idempotency-key",
        "message": "A field report requires an idempotency key."
      }
    ],
    "message": "Invalid request"
  }
}
```

#### E6 motivo vazio

- Requisição: `POST /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760/cancellation`
- Idempotency-Key: 277336D8-E8BE-44AE-A891-360EFFA69200
- Corpo enviado: `{"reason":"   "}`
- Status: **400**
- Resposta:

```json
{
  "error": {
    "code": "OCCURRENCE_CANCELLATION_REASON_REQUIRED",
    "correlationId": "a71ed0b4-ee0d-43ba-845c-a149728512ce",
    "message": "A cancellation reason is required."
  }
}
```

#### E7 motivo longo

- Requisição: `POST /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760/cancellation`
- Idempotency-Key: 8D6451EA-F7A6-42E3-A4E6-A3199D453013
- Corpo enviado: `{"reason":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx… (501 caracteres de "x", truncado aqui)"}`
- Status: **400**
- Resposta:

```json
{
  "error": {
    "code": "OCCURRENCE_CANCELLATION_REASON_TOO_LONG",
    "correlationId": "1ae42f9e-b969-4c94-a2e3-c0b1502d5210",
    "message": "The cancellation reason must be at most 500 characters."
  }
}
```

## T0.2 — Leitura depois das escritas

As três leituras que o painel usa para ocorrência de nota, chamadas depois de W1..W5 (A está
cancelada e tem 2 correções; B tem 1 correção). **Em nenhuma delas `corrections` ou `cancellation`
chega** — nem a chave, nem `null`. Elas só existem no corpo de resposta das duas escritas.

#### R1 leitura GET nota 1 (A cancelada+2 correções)

- Requisição: `GET /trips/536b67aa-3409-4ec4-b086-ca5231063edf/documents/06a3f3ae-8f0c-401c-a77b-488175b1d0b3/occurrences`
- Idempotency-Key: (nenhuma)
- Corpo enviado: `(sem corpo)`
- Status: **200**
- Resposta:

```json
{
  "data": [
    {
      "actorName": "Operador local",
      "channel": "driver_app",
      "createdAt": "2026-09-23T02:26:00.359Z",
      "id": "a4b6ef1d-0049-4814-9d39-47e21b264760",
      "note": "sdfasdfasdfasdf",
      "onBehalfOfDriverName": null,
      "occurrenceTypeId": "60879fd1-0885-45ed-9dce-e52005a62bf8",
      "productCode": "696",
      "productCodes": ["696", "697"],
      "products": [
        {
          "code": "696",
          "quantity": "3.000",
          "unit": "box"
        },
        {
          "code": "697",
          "quantity": "5.000",
          "unit": "unit"
        }
      ],
      "stage": "separation",
      "typeName": "Item avariado",
      "attachments": [
        {
          "downloadUrl": "[URL-ASSINADA-REDACTED]",
          "expired": false,
          "expiresAt": "2026-10-03T00:44:36.600Z",
          "id": "05ec9694-9a8f-4f4c-9e47-93fbddec6aa3",
          "mimeType": "image/jpeg",
          "position": 1,
          "thumbnailUrl": "[URL-ASSINADA-REDACTED]"
        }
      ]
    }
  ]
}
```

Observação: a ocorrência A, **já cancelada** (cancelled_at gravado, confirmado por SELECT), continua
saindo na lista, sem nenhum marcador.

#### R2 — `GET /trip-occurrences/a4b6ef1d-0049-4814-9d39-47e21b264760` (detalhe, spec 183; `readTripOccurrenceDetail`)

- Status: **200**. Chaves de `data` (valores identificadores trocados por placeholder): `actorName`,
  `case` (= `null`), `channel`, `createdAt`, `description`, `driverName`, `hasAttachment`, `id`,
  `invoiceNumber`, `invoiceSeries`, `notifies`, `onBehalfOfDriverName`, `source`, `stage`,
  `stopLabel`, `tripId`, `typeName`, `vehiclePlate`, `conversation`, `document`, `driver`, `items`.
- **Não há `corrections` nem `cancellation`.**
- `items` já reflete a última correção: `[{ code: "696", description: "…", quantity: "3.000", unit: "box" }, { code: "697", description: "…", quantity: "5.000", unit: "unit" }]`.

```json
{
  "data": {
    "actorName": "Operador local",
    "case": null,
    "channel": "driver_app",
    "createdAt": "2026-09-23T02:26:00.359Z",
    "description": "sdfasdfasdfasdf",
    "driverName": "[MOTORISTA]",
    "hasAttachment": true,
    "id": "a4b6ef1d-0049-4814-9d39-47e21b264760",
    "invoiceNumber": "[NF]",
    "invoiceSeries": "2",
    "notifies": false,
    "onBehalfOfDriverName": null,
    "source": "document",
    "stage": "separation",
    "stopLabel": "[ENDEREÇO]",
    "tripId": "536b67aa-3409-4ec4-b086-ca5231063edf",
    "typeName": "Item avariado",
    "vehiclePlate": "[PLACA]",
    "conversation": { "contractorState": "none", "driverUnreadCount": 0 },
    "document": {
      "contractor": { "contractorId": "[ID]", "name": "[CONTRATANTE]", "taxId": "[CNPJ]" },
      "destination": {
        "city": "[CIDADE]",
        "label": "[ENDEREÇO]",
        "origin": "recipient",
        "postalCode": "[CEP]",
        "recipientName": "[DESTINATARIO]",
        "state": "SP"
      },
      "nfeDocumentId": "12b2d7e4-f2a4-41a1-a1ba-922829083f66",
      "totalValue": "6805.4800",
      "tripDocumentId": "06a3f3ae-8f0c-401c-a77b-488175b1d0b3"
    },
    "driver": {
      "driverId": "[ID]",
      "email": "[EMAIL]",
      "name": "[MOTORISTA]",
      "phone": "[TEL]",
      "picturePath": null,
      "whatsappPhone": null
    },
    "items": [
      { "code": "696", "description": "SUCO CONC … CAJU", "quantity": "3.000", "unit": "box" },
      { "code": "697", "description": "SUCO CONC … MAR", "quantity": "5.000", "unit": "unit" }
    ]
  }
}
```

#### R3 — `GET /trip-occurrences` (feed, `?` sem filtros)

- Status: **200**, `data` + `pagination: { nextCursor: null, perPage: 25 }`.
- Chaves de cada item: `actorName`, `case`, `channel`, `createdAt`, `description`, `driverName`,
  `hasAttachment`, `id`, `invoiceNumber`, `invoiceSeries`, `notifies`, `onBehalfOfDriverName`,
  `source`, `stage`, `stopLabel`, `tripId`, `typeName`, `vehiclePlate`, `conversation`, `document`.
- Nenhum item traz `cancellation` ou `corrections` (`ABSENT` nos cinco primeiros, incluindo A e B).
- A ocorrência A (cancelada) **continua no feed** — a lista não filtra cancelada.
- Confirmação por SELECT (banco local): `trip_document_occurrences.cancelled_at` de A está
  preenchido e `cancellation_reason` = "Lancada na nota errada (teste da spec 235)".
- Código: `cancelled_at` só é lido em `drizzle-occurrence-correction.repository.ts`; nenhuma
  query de feed, detalhe ou lista da nota o lê.

## Validação do painel contra a resposta real de escrita

Rodado em `bun` (script fora do repositório) com a resposta real de W4:

- `isTripOccurrence` aceita o corpo de `data` (sem `attachments`): **sim**. Os campos novos
  `corrections` e `cancellation` (inclusive `null`) são aceitos como opcionais, e
  `hasExactKeys` de `OccurrenceCorrection` (`correctedAt`, `correctedByName`, `previousItems`) e de
  `OccurrenceCancellation` (`cancelledAt`, `cancelledByName`, `reason`) casa chave a chave com W1,
  W2, W3.
- `createTripResponseAdapters().registeredOccurrenceFromApi(data)`: **`TRIP_RESPONSE_INVALID`**
  (rejeita). Motivo: o adaptador exige `email` (aceita só `null`/objeto com `subject` e `body`), e a
  resposta das duas rotas da 167 **não traz `email` nem `autoDispatch`**.

## Divergências entre API e tipos do painel

1. **Leitura não publica `corrections` nem `cancellation`.** Detalhe (`GET /trip-occurrences/:id`),
   feed (`GET /trip-occurrences`) e lista da nota (`GET /trips/:id/documents/:documentId/occurrences`)
   não devolvem nenhum dos dois campos, nem `null`. Os tipos `corrections?`/`cancellation?` do
   painel (`trip.types.ts:195-197`, validador `tripResponse.validation.ts:1398-1443`) estão
   corretos para a resposta das **escritas**, mas a tela de detalhe nunca os receberia numa leitura.
   Consequência direta nas tarefas: RF5 (histórico de correções no detalhe), RF6 (marca de
   cancelada no detalhe, feed e linha do tempo) e CA06 **não são alcançáveis só com frontend** —
   exigem que o feed/detalhe da API publiquem os dois campos (mudança em `apps/api-transportada`,
   fora do escopo declarado desta spec). A leitura "pós-escrita" só funciona se o painel usar o corpo
   devolvido pela própria escrita (e perde o histórico no reload).
2. **Cancelada continua visível e indistinguível.** A ocorrência cancelada continua na lista, no
   feed e no detalhe, sem marcador, `case` etc. (a intenção da 167 de tirá-la das contas/listagens
   ativas não está nas queries de leitura do feed/detalhe).
3. **`registeredOccurrenceFromApi` não serve às duas rotas novas.** Exige `email`, que as escritas
   não enviam. O cliente novo (T1.1) precisa de adaptador próprio: `isTripOccurrence` sobre
   `data` sem `attachments`, e os anexos no formato estreito `{ id, position }` (é o que a escrita
   devolve, diferente do `attachments` completo — `downloadUrl`, `thumbnailUrl`, `expiresAt`… — da leitura).
4. **Forma da resposta das escritas:** `{ data: ocorrência }` com `cancellation` sempre presente
   (`null` quando não cancelada) e `corrections` sempre presente (`[]` ou lista, **mais antiga
   primeiro**: W2 mostra a correção das 00:39:17.391Z antes da das 00:39:17.515Z). O painel os
   declara opcionais — compatível, mas o validador não distingue "ausente" de "vazio".
5. **Datas:** `correctedAt` e `cancelledAt` chegam como ISO-8601 UTC com milissegundos
   (`2026-10-03T00:39:36.091Z`); o painel tipa como `string` — compatível.
6. **Nulabilidade:** `cancellation: null` quando não cancelada (painel: `null | OccurrenceCancellation`,
   compatível). `onBehalfOfDriverName` e `actorName` iguais ao que o painel já aceita.
7. **Unidade:** a API devolve `unit` como texto livre; ocorrência B tem unidade legada `"CX30"` em
   `previousItems` (o painel tipa `OccurrenceQuantityUnit = string`, então não quebra), enquanto o
   conjunto novo só aceita as unidades da política (testado com `box`/`unit`). A tela de correção
   deve pré-preencher unidade legada sem assumir `box|unit`.
8. **Quantidade** é string decimal com 3 casas (`"3.000"`), nunca número; enviar `"4.0"` é aceito
   e normalizado para `"4.000"` (W5 prova que `"4.0"` e `"4.000"` são o mesmo conjunto).
9. **Códigos de erro:** nenhum código da 167 existe hoje nas traduções/constantes do painel; os
   quatro de RF7 são os da tabela acima (`OCCURRENCE_CASE_ALREADY_OPEN`,
   `OCCURRENCE_ALREADY_CANCELLED`, `OCCURRENCE_CANCELLED`, `OCCURRENCE_TYPE_SINGLE_ITEM` — este
   último só lido do código). Nota: o cancelamento de uma ocorrência com tratativa aberta e a
   correção com tratativa aberta devolvem o **mesmo** código (`OCCURRENCE_CASE_ALREADY_OPEN`),
   com a mesma mensagem ("…can no longer be corrected or cancelled").
10. **Erro de chave de idempotência reutilizada** com corpo diferente: 409
    `TRIP_FIELD_REPORT_KEY_REUSED` (W3c) — código a mapear no painel; chave ausente é 400
    `INVALID_REQUEST` com `details[0].field = "idempotency-key"`.

# Evidência — spec 235, Fase 0.5

## T0.3 — Testes primeiro, vermelhos

Arquivo novo: `apps/api-transportada/test/integration/trip-occurrence-correction-read.integration.ts`
(entrou na lista explícita do `test:integration` no `package.json`). Prova por **comportamento**,
contra Postgres descartável: semeia, pelos próprios casos de uso da 167 (`correctOccurrenceItems`,
`cancelOccurrence`), uma ocorrência corrigida duas vezes, uma cancelada e uma intocada na mesma nota,
e lê pelas três consultas reais (`findTripOccurrenceDetail`, `listTripOccurrences`,
`listTripOccurrenceFeed`). Cobre: `corrections` mais antiga primeiro, `cancellation` com as três
chaves do formato das escritas, cancelada **continua listada** nas três, e outra empresa não lê nada.

```bash
cd apps/api-transportada
bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-occurrence-correction-read.integration.ts
```

Execução vermelha (antes da implementação): **1 pass, 4 fail** — o único verde é o isolamento entre
empresas. Trecho:

```text
expect(detail?.cancellation).toBeNull()      Received: undefined
expect(detail?.corrections).toEqual([])      Received: undefined
expect(byId.get(correctedId)?.corrections).toHaveLength(2)
                                             Received value does not have a length property: undefined
expect(byId.get(cancelledId)?.cancellation?.reason).toBe(...)   Received: undefined
(fail) ... detalhe: duas correções, mais antiga primeiro, e cancellation nulo
(fail) ... detalhe: a cancelada continua lida, com cancellation preenchido
(fail) ... lista da nota: corrections e cancellation por ocorrência, cancelada incluída
(fail) ... feed: cancellation na cancelada e nulo nas demais; a cancelada continua listada
 1 pass / 4 fail / 0 skip
```

Os campos chegam `undefined` e não `null`/`[]`: a falha é a divergência 1 da Fase 0, não defeito de
semeadura (a lista e o feed achavam as três ocorrências).

## T0.4 — Implementação

Só leitura, sem migration, sem rota, sem mudança nas escritas da 167. O novo
`src/trips/infrastructure/occurrence-correction-read.query.ts` concentra a leitura em lote
(`listOccurrenceCorrectionsByIds`, `listOccurrenceCancellationsByIds`: uma consulta para todos os ids,
agrupada em `Map`, `companyId` do contexto em toda condição, mais antiga primeiro com desempate por
`id`). A conta que antes morava em `drizzle-occurrence-correction.repository.ts`
(`listOccurrenceCorrections` e os joins de cancelamento de `readOccurrenceView`) foi **movida** para
lá — a resposta das escritas e as três leituras agora leem pelo mesmo ponto, então o formato é o
mesmo por construção. Consumidores: `listTripOccurrences` (lista da nota: `corrections` +
`cancellation`), `findTripOccurrenceDetail` (`corrections`; `cancellation` herdado da linha do feed) e
`toFeedItems` do feed (`cancellation`; parada sempre `null`). A cancelada continua nas três leituras.
`test/integration/trip-occurrence-detail.integration.ts` ganhou a asserção de `corrections` (a linha
do detalhe deixou de ser igual ao item do feed só nesse campo) e o contrato
`test/trip-http/occurrence-detail.contract.ts` ganhou o caso de publicação com duas correções e
cancelamento.

```bash
cd apps/api-transportada
bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-occurrence-correction-read.integration.ts ./test/integration/trip-occurrence-correction.integration.ts ./test/integration/trip-occurrence-detail.integration.ts
```

Verde: **18 pass, 0 fail, 0 skip** (5 novos + 5 da 167 + 8 do detalhe). `bun run typecheck` da app limpo.

## T0.5 — Gates da API

Todos em primeiro plano, de dentro de `apps/api-transportada`, `--env-file=../../.env.test`
(Postgres de teste em 127.0.0.1:65432).

| Gate                                                   | Resultado                                                                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun --env-file=../../.env.test test --timeout 120000` | contrato: **8897 pass, 23 skip, 0 fail** (193 arquivos)                                                                                                            |
| `bun --env-file=../../.env.test run test:integration`  | rodada em 5 blocos do mesmo arquivo da lista do `package.json` (10 min por chamada em primeiro plano): **883 pass, 8 skip, 0 fail**, 154 arquivos (detalhe abaixo) |
| `bun run typecheck` (raiz, as 7 apps)                  | limpo                                                                                                                                                              |
| `bun run lint` (raiz)                                  | **0 erros**, 16 avisos `react-hooks/exhaustive-deps` em `apps/frontend-transportada` (nenhum em arquivo tocado)                                                    |

Blocos da integração (`bun test` sobre fatias contíguas da lista): 138/0 skip/0 fail ·
244/0/0 · 189 pass, **7 skip**, 0 fail · 157 pass, **1 fail** · 154 pass, **1 skip**, 0 fail.
O 1 fail do quarto bloco foi o timeout de 60 s de
`camera-measurement-flag.integration.ts` ("sem linha em company_cargo_settings…"), sob carga da
rodada longa; o arquivo sozinho passou **4/4, 0 fail**, e ele não toca ocorrência. Os **8 skips**
são de `test/integration/migration-completeness.integration.ts` (3) e
`test/database-migration.contract.test.ts` (4) — migration, coberta por `make migration-test`, não
rodado aqui — e `trip-occurrence-upload-confirm.integration.ts` (1, sonda de S3). Nenhum dos três
arquivos novos/tocados por esta fase pulou: os 3 de ocorrência (leitura nova, correção da 167,
detalhe) deram **18 pass, 0 skip** na T0.4.

OpenAPI: **não existe geração** nesta API (`docs/ai-context/api-transportada.md`, módulo
contractor-mail: "não existe geração desse tipo neste repo"; busca por `openapi` em `src/` sem
resultado) — não há schema de resposta declarado a atualizar. O contrato publicado são os tipos
`TripOccurrenceFeedItem`/`TripOccurrenceDetail`, provados pelos testes acima. Nota adicionada em
`docs/ai-context/api-transportada.md` ("Spec 235 — as leituras publicam a correção e o
cancelamento").

# Evidência — spec 235, Fase 1

## T1.1 — O cliente das duas escritas

`tripClient.service.ts` ganhou `correctTripOccurrenceItems` (`PATCH .../occurrences/:id/items`, corpo
`{ items }`, o conjunto inteiro) e `cancelTripOccurrence` (`POST .../occurrences/:id/cancellation`,
corpo `{ reason }`), as duas com `Idempotency-Key` recebida do chamador (a mutação da T1.4 gera uma
por tentativa). `registeredOccurrenceFromApi` **não** serve: exige `email`, que as escritas não
devolvem. O adaptador novo, `occurrenceWriteResultFromApi` (`tripResponse.validation.ts`), valida o
corpo com `isTripOccurrence` e aceita o anexo no formato estreito `{ id, position }`. Os códigos
estáveis ficam em `OCCURRENCE_CORRECTION_ERROR` (`occurrence.constant.ts`). O painel não tem
`getApiErrorCode()` — o cliente da viagem lança `Error` cujo `message` é o código e cujo `status` é
o HTTP (`requestError`); é esse o contrato afirmado.

Contrato: `test/trip/occurrence-correction-client.contract.ts` (importado por
`test/trip.contract.test.ts`, que já está na lista do `package.json`). Usa a resposta **real** de W1
e W3 da Fase 0, caminho/método/corpo/cabeçalho de cada chamada e os 11 códigos com o status real.

```bash
bun run --cwd apps/frontend-transportada test      # 6458 pass, 0 fail (32 arquivos); demais lotes do script 0 fail
cd apps/frontend-transportada && bun test ./test/trip.contract.test.ts -t "cliente HTTP: corrigir|cliente HTTP: cancelar a ocorr|códigos de recusa"   # 17 pass, 0 fail
bun run typecheck                                  # limpo
bun run lint                                       # 0 erros, 16 avisos preexistentes
```

## T1.2 — Quando Corrigir e Cancelar agem, e o texto de quando não

`resolveOccurrenceCorrectionActions(input, t)` em `tripOccurrenceDetail.service.ts`: função pura que
devolve, para cada botão, `hidden`, `enabled` ou `disabled` com o `reason` já traduzido. Espelha o
servidor (`correct-occurrence-items.use-case.ts`, `cancel-occurrence.use-case.ts`,
`drizzle-occurrence-correction.repository.ts#hasOpenOccurrenceCase`):

- sem `trip.manage`: os dois `hidden`, sem texto (CA02);
- ocorrência cancelada vence qualquer tratativa (`OCCURRENCE_CANCELLED`/`OCCURRENCE_ALREADY_CANCELLED`
  vêm antes de `OCCURRENCE_CASE_ALREADY_OPEN` nos dois casos de uso);
- **qualquer** linha em `trip_occurrence_cases` fecha a janela — `hasOpenOccurrenceCase` só testa se a
  linha existe, sem olhar `status`. Os estados da tratativa só mudam o **texto**;
- sem itens: Corrigir `hidden` (RF10), Cancelar segue a mesma regra.

Textos em `occurrenceDetail.correction.unavailable.*` (pt-BR e en). Texto exato por estado, afirmado
pelo contrato `test/trip/occurrence-correction-actions.contract.ts` (importado por
`test/trip.contract.test.ts`):

| Estado                                                        | Texto (pt-BR)                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| tratativa `recorded` / `under_review` / `awaiting_contractor` | A tratativa está aberta: depois que ela abre, a ocorrência já vale dinheiro e não pode mais ser corrigida nem cancelada.             |
| `decided` + `redelivery_authorized`                           | A tratativa foi decidida com reentrega autorizada; a reentrega parte desta ocorrência e ela já não pode ser corrigida nem cancelada. |
| `decided` + `goods_paid`                                      | A tratativa foi decidida com mercadoria paga; o acerto nasce desta ocorrência e ela já não pode ser corrigida nem cancelada.         |
| `decided` + `other`                                           | A tratativa foi decidida por outro caminho, com nota do escritório; a ocorrência já não pode ser corrigida nem cancelada.            |
| `closed`                                                      | A tratativa foi fechada; a ocorrência virou histórico e já não pode ser corrigida nem cancelada.                                     |
| `returned_to_warehouse`                                       | A mercadoria já voltou ao barracão por esta tratativa; a ocorrência já não pode ser corrigida nem cancelada.                         |
| tratativa `cancelled`                                         | A tratativa foi cancelada; a ocorrência segue com o histórico dela e já não pode ser corrigida nem cancelada.                        |
| ocorrência cancelada                                          | Esta ocorrência já foi cancelada e não pode mais ser corrigida nem cancelada.                                                        |

```bash
bun run --cwd apps/frontend-transportada test   # 6475 pass, 0 fail (32 arquivos); lote restante 327 pass, 0 fail
bun run typecheck                               # limpo
cd apps/frontend-transportada && bun run lint   # 0 erros, 16 avisos preexistentes
```

## T1.3 — Mutação: arrancar a condição de tratativa aberta

Mutação aplicada em `resolveUnavailableReason` (`tripOccurrenceDetail.service.ts`): a linha
`if (caseView === null) return null` virou `if (caseView !== null) return null` — a tratativa passa a
ser ignorada e a janela nunca fecha por causa dela. Nada além dessa linha mudou
(`git diff` = 1 linha acrescentada).

```bash
bun run --cwd apps/frontend-transportada test
```

Execução **vermelha**: `6463 pass, 12 fail` (`Ran 6475 tests across 32 files`). Trecho real:

```text
error: expect(received).toBe(expected)
Expected: "disabled"
Received: "enabled"
(fail) Corrigir e Cancelar: ... > sem itens e com tratativa aberta: Corrigir segue ausente e Cancelar explica
error: expect(received).toEqual(expected)
- Expected  - 4
+ Received  + 2
(fail) Corrigir e Cancelar: ... > o motivo desabilitado, em texto, por estado > tratativa registrada: os dois botões desabilitados com o texto exato
(fail) ... > tratativa em análise: os dois botões desabilitados com o texto exato
(fail) ... > tratativa aguardando o contratante: os dois botões desabilitados com o texto exato
(fail) ... > decidida com reentrega: os dois botões desabilitados com o texto exato
(fail) ... > decidida com mercadoria paga: os dois botões desabilitados com o texto exato
(fail) ... > decidida de outro jeito: os dois botões desabilitados com o texto exato
(fail) ... > fechada: os dois botões desabilitados com o texto exato
(fail) ... > devolvida ao barracão: os dois botões desabilitados com o texto exato
(fail) ... > tratativa cancelada: os dois botões desabilitados com o texto exato
 6463 pass
 12 fail
```

Os 12 que caem: o caso "sem itens e com tratativa aberta", os 9 estados da tratativa, a prova de
que cada estado tem texto próprio e o caso em inglês. Restaurado com `git checkout` do arquivo;
`bun run --cwd apps/frontend-transportada test` voltou a **6475 pass, 0 fail** (lote restante 327
pass, 0 fail).

## T1.4 — As mutações de dados, com invalidação

`src/modules/trip/queries/useOccurrenceCorrection.query.ts`: `useCorrectOccurrenceItems` e
`useCancelOccurrence` (TanStack `useMutation` sobre `getTripClient()`), cada tentativa com a própria
`Idempotency-Key` (`crypto.randomUUID()` dentro da `mutationFn`). `onSettled` invalida:

- `[trip-occurrence-feed]` — prefixo do feed, do detalhe (`[…, 'detail', …]`) e da linha do tempo da
  ocorrência (`[…, 'timeline', …]`);
- `[trips, tripId, 'timeline']` — a linha do tempo da viagem e a de cada nota, que mora debaixo dela.

`onSettled` e não `onSuccess`: o `409` de tratativa que abriu entre carregar a tela e clicar também
pede o estado novo (spec.md, casos extremos). Contrato
`test/trip-hooks/occurrence-correction-mutations.contract.ts` (importado por
`test/trip-hooks.contract.test.ts`, que roda pelo `test:hooks` dentro do `test` da app): semeia
detalhe, feed, linha do tempo da ocorrência, da viagem e da nota mais uma chave alheia e prova que as
cinco caem e a alheia não, em corrigir, em cancelar e no `409`; e que quatro tentativas levam quatro
chaves distintas. As duas chamadas do `FakeTripClient` (`test/fixtures/tripAssemblyHooks.fixture.ts`)
entraram na fixture.

Vermelho antes da implementação (módulo inexistente):

```text
error: Cannot find module '@/modules/trip/queries/useOccurrenceCorrection.query' from '.../test/trip-hooks/occurrence-correction-mutations.contract.ts'
 0 pass
 1 fail
```

Verde depois:

```bash
bun run --cwd apps/frontend-transportada test      # 6475 pass, 0 fail (32 arquivos); test:hooks 331 pass, 0 fail
bun run test:hooks -t "mutações de correção"       # 4 pass, 0 fail
bun run typecheck                                  # limpo
cd apps/frontend-transportada && bun run lint      # 0 erros, 16 avisos preexistentes
```

## T2.1 — O botão Corrigir no detalhe

`OccurrenceCorrectionActions.component.tsx` (autocontido, recebe `occurrence` e `permissions`; a página
já tinha as permissões de `useAuthMeQuery`) decide por `resolveOccurrenceCorrectionActions`. Habilitado:
`aria-disabled="false"`. Desabilitado: o botão **não** usa `disabled` (sairia da ordem de tabulação sem
explicar), leva `aria-disabled="true"` e `aria-describedby` apontando ao parágrafo com o motivo em
texto. CSS: `.ui-button[aria-disabled='true']` entrou na regra de `.ui-button:disabled`
(`src/styles/index.css`). Sem `trip.manage`, sem itens ou ocorrência de parada, o componente devolve
`null` (nada na árvore). Cancelar **não** é renderizado aqui (T3.1, junto do diálogo). Nesta task o
clique em Corrigir só alterna `aria-expanded`; o formulário chega na T2.2.

Leitura (parte da T2.1): `TripOccurrenceFeedItem.cancellation?` e `TripOccurrenceDetail.corrections?`
tipados; o cliente de leitura valida com os mesmos guards das escritas (`isOccurrenceCancellation`,
`isOccurrenceCorrection`, agora exportados de `tripResponse.validation.ts`). Ausente vira
`cancellation: null` / `corrections: []` (API anterior); presente e malformado reprova a leitura —
tratar cancelamento torto como "não cancelada" habilitaria botões que o servidor recusa.

Contratos: `test/trip/occurrence-correction-button.contract.tsx` (CA02: markup vazio sem `trip.manage`;
CA03: texto renderizado do motivo ligado por `aria-describedby`, cancelada vence tratativa, sem itens e
parada sem botão) e `test/trip/occurrence-read-correction.contract.ts` (as quatro leituras acima, e o
feed marcando a cancelada). Ambos importados por `test/trip.contract.test.ts`. O contrato existente
`occurrence-detail.contract.ts` passou a esperar `cancellation: null, corrections: []` na leitura.

```bash
bun run --cwd apps/frontend-transportada test   # 6486 pass, 0 fail (32 arquivos); test:hooks 331 pass, 0 fail
bun run typecheck                               # limpo
cd apps/frontend-transportada && bun run lint   # 0 erros, 16 avisos preexistentes
```

## T2.2 — O formulário de correção

`TripOccurrenceCorrectionForm.component.tsx`, aberto por Corrigir (`OccurrenceCorrectionActions`).
**Reaproveitamento sem duplicar:** o seletor de itens e o campo de quantidade/unidade que moravam
dentro de `TripOccurrences` (o registro) foram extraídos para `OccurrenceProductSelect.component.tsx` e
`OccurrenceItemQuantities.component.tsx`, e o registro passou a consumi-los — mesmas chaves de locale
(`occurrence.*`), mesmo JSX, mesmo comportamento. O tipo `OccurrenceQuantitiesByCode` entrou em
`occurrenceProductSelection.service.ts`. Única diferença de comportamento, aditiva: o campo de
unidade acrescenta à frente a unidade que a ocorrência já gravou quando ela não está nas opções (a
`CX30` legada da Fase 0, divergência 7) — no registro isso nunca acontece, porque a unidade sempre
sai das opções.

Pré-preenchimento e corpo em funções puras: `resolveOccurrenceItemSelectionFromDetail` (itens do
detalhe → códigos + mapa de quantidade/unidade, unidade legada preservada) e
`buildOccurrenceCorrectionItems` (`{ code }` sem contagem, `{ code, quantity, unit }` com — nunca
`quantity` sem `unit`). A tela envia o **conjunto inteiro** por `useCorrectOccurrenceItems` e não
decide se algo mudou. Os itens da nota vêm de `useOccurrenceDocumentProducts`
(`readTripDocumentProducts`, a mesma leitura do registro). Sucesso fecha o formulário; a invalidação do
`onSettled` (T1.4) recarrega o detalhe.

Contratos: `test/trip-hooks/occurrence-correction-form.contract.ts` (DOM, API dublada, **CA01**:
reabre com `3.000`, edita para `4`, salva e a chamada leva
`[{ code: '696', quantity: '4', unit: 'box' }, { code: '697' }]` com `tripId`/`documentId`/`occurrenceId`;
o detalhe da API dublada passa a listar `696:4`; Descartar fecha sem chamar a API) e
`test/trip/occurrence-correction-items.contract.ts` (as duas funções puras, e que registro e correção
usam os dois componentes sem `<MultiSelect` próprio). Os contratos de parede
`occurrence-catalog.contract.ts` e `occurrence-item-quantity-field.contract.ts` liam o fonte de
`TripOccurrences` e passaram a ler os componentes extraídos, com as mesmas asserções.

```bash
bun run --cwd apps/frontend-transportada test   # 6489 pass, 0 fail (32 arquivos); test:hooks 333 pass, 0 fail
bun run typecheck                               # limpo (raiz, 7 apps)
cd apps/frontend-transportada && bun run lint   # 0 erros, 16 avisos preexistentes
```

## T2.3 — As mensagens de erro por código estável

O painel **não tem** `getApiErrorCode()`, mas já tem o equivalente: o cliente da viagem lança `Error`
com `message` = código, e `resolveTripFeedbackKey` (`tripFeedback.service.ts`) o traduz por
`TRIP_FEEDBACK_KEY_BY_ERROR` para uma chave de `feedback.*`, com `serverRefused` como genérico. Não
criei helper novo: os oito códigos entraram nesse mapa (`trip.constant.ts`, chaves computadas a partir
de `OCCURRENCE_CORRECTION_ERROR`) e o formulário mostra `t('feedback.<chave>')` num `role="alert"`.

Textos exatos (pt-BR; os de inglês estão em `trip.en.locale.json`, `feedback.*`):

| Código                                        | Chave                               | Texto                                                                                                                                                    |
| --------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OCCURRENCE_CASE_ALREADY_OPEN` (409)          | `occurrenceCaseAlreadyOpen`         | A tratativa desta ocorrência já foi aberta, e ela não pode mais ser corrigida nem cancelada. Nada foi gravado; a tela foi atualizada com o estado atual. |
| `OCCURRENCE_ALREADY_CANCELLED` (409)          | `occurrenceAlreadyCancelled`        | Esta ocorrência já foi cancelada e não pode ser cancelada de novo. Nada foi gravado; a tela foi atualizada com o estado atual.                           |
| `OCCURRENCE_CANCELLED` (409)                  | `occurrenceCancelled`               | Esta ocorrência foi cancelada e não pode mais ser corrigida. Nada foi gravado; a tela foi atualizada com o estado atual.                                 |
| `OCCURRENCE_TYPE_SINGLE_ITEM` (422)           | `occurrenceTypeSingleItem`          | Este tipo de ocorrência aceita um item só. Deixe apenas um item e salve de novo.                                                                         |
| `OCCURRENCE_ITEM_QUANTITY_NOT_POSITIVE` (400) | `occurrenceItemQuantityNotPositive` | A quantidade de cada item precisa ser maior que zero. Corrija e salve de novo.                                                                           |
| `OCCURRENCE_ITEM_QUANTITY_UNIT_PAIRING` (400) | `occurrenceItemQuantityUnitPairing` | Quantidade e unidade andam juntas: informe as duas ou nenhuma. Corrija e salve de novo.                                                                  |
| `OCCURRENCE_PRODUCT_NOT_IN_DOCUMENT` (422)    | `occurrenceProductNotInDocument`    | Um dos itens escolhidos não está nesta nota. Escolha só itens da nota e salve de novo.                                                                   |
| `TRIP_OCCURRENCE_NOT_FOUND` (404)             | `occurrenceNotFound`                | Esta ocorrência não foi encontrada. Volte à lista de ocorrências e tente de novo.                                                                        |
| qualquer outro                                | `serverRefused`                     | O servidor recusou esta operação. Nada foi gravado — tente de novo e, se repetir, avise o suporte com o horário.                                         |

Recarga após o 409: o `onSettled` da mutação (T1.4) invalida detalhe, feed e linha do tempo mesmo no
erro; o contrato conta as leituras do detalhe depois do `409` de tratativa e vê pelo menos uma nova.

Contrato: `test/trip-hooks/occurrence-correction-errors.contract.ts` (DOM, API dublada rejeitando com
cada código; afirma o **texto renderizado** do alerta, que não é o genérico; desconhecido cai no
genérico; as oito mensagens são distintas; inglês existe e difere do português). O detalhe dublado, o
clique e a digitação foram para `test/trip-hooks/occurrenceCorrectionHarness.helper.ts`, dividido com o
contrato do formulário.

```bash
bun run --cwd apps/frontend-transportada test   # 6489 pass, 0 fail (32 arquivos); test:hooks 345 pass, 0 fail
bun run typecheck                               # limpo (raiz, 7 apps)
cd apps/frontend-transportada && bun run lint   # 0 erros, 16 avisos preexistentes
```

## T2.4 — Mutação: a mensagem do 409 de tratativa vira a genérica

Mutação aplicada em `src/modules/trip/locales/trip.locale.json`: o texto de
`feedback.occurrenceCaseAlreadyOpen` foi trocado, nada mais, pelo de `feedback.serverRefused`
(`git diff --stat` = 1 linha). É o que "trocar a mensagem do 409 pela genérica" quer dizer na tela: o
código continua mapeado, mas o operador lê o texto que não diz nada sobre a tratativa.

```bash
bun run --cwd apps/frontend-transportada test
```

Execução **vermelha**: lote principal `6489 pass, 0 fail`; lote de DOM (`test:hooks`) `344 pass, 1 fail`
(`Ran 345 tests across 1 file`) e o script sai com código 1. Trecho real:

```text
error: expect(received).toBe(expected)

Expected: "A tratativa desta ocorrência já foi aberta, e ela não pode mais ser corrigida nem cancelada. Nada foi gravado; a tela foi atualizada com o estado atual."
Received: "O servidor recusou esta operação. Nada foi gravado — tente de novo e, se repetir, avise o suporte com o horário."

      at <anonymous> (.../test/trip-hooks/occurrence-correction-errors.contract.ts:99:21)
(fail) mensagens de erro da correção, por código estável (spec 235 T2.3, CA05) > tratativa aberta (409): OCCURRENCE_CASE_ALREADY_OPEN mostra a mensagem própria, e não a genérica
 344 pass
 1 fail
```

Só o caso do código mutado cai: os outros sete e o genérico seguem verdes, que é o que se espera de
um contrato caso a caso. Restaurado com `git checkout` do arquivo; `bun run --cwd
apps/frontend-transportada test` voltou a **6489 pass, 0 fail** (lote principal) e **345 pass, 0 fail**
(`test:hooks`).

## T3.1 — O diálogo de cancelamento

`TripOccurrenceCancelDialog.component.tsx`: o `Dialog` da app não é um primitivo de `components/ui`;
o padrão em uso (`TripReasonDialog`, `TripCancelDialog`, `CanhotoRejectDialog`) é portal +
`useModalDialog` (foco preso, Escape, foco devolvido ao elemento que o tinha ao abrir) +
`mdfeGateOverlay`/`mdfeGateDialog`. Reaproveitado sem criar primitivo novo. O motivo é um `<textarea>`
com `<label htmlFor>` associado, `maxLength` 500 (`OCCURRENCE_CANCELLATION_REASON_MAX_LENGTH`), confirmar
`disabled` com motivo vazio ou só com espaços, e o motivo sai com `trim` por `useCancelOccurrence`.
Os dois códigos novos (`OCCURRENCE_CANCELLATION_REASON_REQUIRED` / `..._TOO_LONG`) entraram em
`TRIP_FEEDBACK_KEY_BY_ERROR` e em `feedback.*` (pt-BR e en); o alerta mostra a mensagem por código.

`OccurrenceCorrectionActions` ganhou **Cancelar ocorrência** (`aria-disabled` + `aria-describedby` no
mesmo parágrafo de motivo do Corrigir, `aria-haspopup="dialog"`), com a mesma guarda: parada ou sem
`tripDocumentId` não renderiza nada; sem itens, só Cancelar aparece (RF10).

Textos novos (pt-BR): botão "Cancelar ocorrência"; título "Cancelar esta ocorrência"; rótulo "Motivo do
cancelamento"; confirmar "Confirmar cancelamento"; "Voltar"; erros "Escreva o motivo do cancelamento
para confirmar." e "O motivo do cancelamento passa de 500 caracteres. Encurte o texto e confirme de
novo."

Contrato DOM `test/trip-hooks/occurrence-cancel-dialog.contract.ts` (via `test:hooks`, 9 casos): rótulo
associado + modal nomeado + `maxlength=500`; CA04 vazio/espaços desabilitado e habilita com texto;
chamada com motivo trimado e uma vez; nada de motivo em console (`debug/error/info/log/warn`); os dois
códigos do servidor viram a mensagem própria e o diálogo segue aberto; Voltar e Escape devolvem o foco ao
botão que abriu; Tab no último controle volta ao primeiro (foco preso). O happy-dom permitiu todos —
nenhuma limitação. Único cuidado: o diálogo aberto precisa ser fechado dentro do teste (um `afterEach`
fora do `act` derruba `removeChild`), então cada caso fecha o seu. O contrato do botão
(`occurrence-correction-button.contract.tsx`) passou a afirmar que sem itens só há Cancelar, e ganhou
CA02/CA03 do Cancelar.

```bash
bun run --cwd apps/frontend-transportada test   # 6491 pass, 0 fail (lote principal); test:hooks 354 pass, 0 fail
bun run typecheck                               # limpo (raiz)
cd apps/frontend-transportada && bun run lint   # 0 erros, 16 avisos preexistentes
```

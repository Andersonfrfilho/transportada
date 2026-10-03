# Evidência — spec 235, Fase 0

## Índice (task → commit → evidência)

| Task       | Commit                                  | Evidência (seção abaixo)                                                                         |
| ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| T0.1, T0.2 | `d653d1570`                             | T0.1 — Escritas / Recusas; T0.2 — Leitura depois das escritas (a leitura não devolvia os campos) |
| T0.3       | `6952f9eda`                             | T0.3 — Testes primeiro, vermelhos                                                                |
| T0.4       | `3a307bbf3`                             | T0.4 — Implementação                                                                             |
| T0.5       | `d8d7b27a2`                             | T0.5 — Gates da API                                                                              |
| T1.1       | `dc33d02a3`                             | T1.1 — O cliente das duas escritas                                                               |
| T1.2       | `cda66c6db`                             | T1.2 — Quando Corrigir e Cancelar agem                                                           |
| T1.3       | `449709816`                             | T1.2/T1.3 — mutação vermelha registrada                                                          |
| T1.4       | `d9ff8b763`                             | T1.4 — As mutações de dados, com invalidação                                                     |
| T2.1       | `9d3359924`                             | T2.1 — O botão Corrigir no detalhe                                                               |
| T2.2       | `639e38e26`                             | T2.2 — O formulário de correção                                                                  |
| T2.3       | `24977faa5`                             | T2.3 — As mensagens de erro por código estável                                                   |
| T2.4       | `96626a4d5`                             | T2.3/T2.4 — mutação vermelha registrada                                                          |
| T3.1       | `df8893cee`                             | T3.1 — O diálogo de cancelamento                                                                 |
| T3.2a      | `9ca78e561` (spec), `93f260e4d`         | T3.2a — As duas linhas do tempo publicam o cancelamento                                          |
| T3.2       | `c1eb0dc17`                             | T3.2 — A marca de cancelada                                                                      |
| T4.1       | `4f774cdab`                             | T4.1 — A lista de correções no detalhe                                                           |
| T4.2       | `c87378075`                             | T4.2 — Duas correções seguidas                                                                   |
| T5.0       | `09d6be608`                             | Fase 5, T5.0 — `correctedByName` nulo                                                            |
| T5.1       | `4953d4026`                             | Fase 5, T5.1 — Revisão de design e usabilidade, 21 prints em `prints/`                           |
| T5.2       | `68319e473`                             | Fase 5, T5.2 — `tasks.md` da 167 conferido                                                       |
| T5.3, T5.4 | commit de fechamento (este arquivo)     | Fase 5, T5.3 — Gates; Fase 5, T5.4 — Pendências                                                  |
| T6.1       | `8ac9b5caf`                             | T6.1 — Ordem de publicação (etapa: nenhuma, procedimento + contrato do painel)                   |
| T6.2       | `e52eb1b9f`                             | T6.2 — Lista da nota invalidada (etapa 1, painel)                                                |
| T6.3       | `0c4371283`                             | T6.3 — Nota inteira na correção (etapa 1, painel)                                                |
| T6.4       | `0939db332`                             | T6.4 — Critério de Corrigir; **parte do tipo parada** (etapa 1, painel)                          |
| T6.5       | `871188e8f`                             | T6.5 — `openUntil` fecha no cancelamento (etapa 2, API)                                          |
| T6.6       | `41fd6c766` (painel), `711ec6a9d` (API) | T6.6 — Baixos da revisão (etapas 1 e 2)                                                          |
| T6.7       | commit de fechamento da Fase 6          | T6.7 — Gates finais e pendências depois da Fase 6                                                |
| Decisões   | `246f12a83`                             | `spec.md` § Decisões de 2026-10-03 e `tasks.md` Fase 6                                           |

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

## T4.1 — A lista de correções no detalhe

⚠️ **A correção não publica o conjunto que passou a valer.** `corrections[]` traz `previousItems` — o
que valia **antes** de cada correção (formato real em W1/W2, Fase 0); não existe `nextItems`. O conjunto
que passou a valer numa correção é derivado: o `previousItems` da correção seguinte (a API entrega mais
antiga primeiro) ou, na última, os itens atuais do detalhe. A conta é uma função pura,
`resolveOccurrenceCorrectionHistory` (`tripOccurrenceDetail.service.ts`); sem API nova.

`OccurrenceCorrectionHistory.component.tsx`, no painel do detalhe logo abaixo de Corrigir/Cancelar: título
"Correções"; por correção "Corrigida por {nome} em {data/hora}" (`useMomentFormatter`, a utilidade de data
do detalhe) e "Passou a valer: 696 · 3 box, 697" (mesma formatação de quantidade dos itens atingidos —
`formatOccurrenceQuantity` saiu da página para o service, para ter uma cópia só). Sem correção (lista vazia
ou chave ausente), nada é renderizado — o detalhe não mostra seções vazias.

Contrato `test/trip/occurrence-correction-history.contract.tsx` (importado por `test/trip.contract.test.ts`):
afirma o texto renderizado (autor, data/hora formatada, conjunto vigente, e que o conjunto anterior não
aparece), item sem quantidade só pelo código, e vazio/ausente sem markup.

```bash
bun run --cwd apps/frontend-transportada test   # 6495 pass, 0 fail (lote principal); test:hooks 354 pass, 0 fail
bun run typecheck                               # limpo (raiz)
cd apps/frontend-transportada && bun run lint   # 0 erros, 16 avisos preexistentes
```

## T4.2 — Duas correções seguidas

Mesmo arquivo do T4.1, `describe` próprio: duas correções (Ana às 09:15Z, Bruno às 14:40Z, a mais antiga
primeiro como a API devolve; `previousItems` e itens atuais sintéticos). O contrato prova pelo texto
renderizado que as duas aparecem na ordem certa (índice do autor/hora da primeira < o da segunda) e que
cada uma leva o seu conjunto: a primeira "Passou a valer: 696 · 2 box, 697 · 5 unit" (o `previousItems` da
segunda), a segunda "Passou a valer: 696 · 3 box, 697 · 5 unit" (os itens atuais). A função pura é afirmada
em separado.

```bash
bun run --cwd apps/frontend-transportada test   # 6497 pass, 0 fail (lote principal); test:hooks 354 pass, 0 fail
bun run typecheck                               # limpo (raiz)
cd apps/frontend-transportada && bun run lint   # 0 erros, 16 avisos preexistentes
```

## T3.2a — As duas linhas do tempo publicam o cancelamento

Só leitura: nenhuma migration, rota, regra nova; escritas da 167 intactas; a cancelada continua
listada. Testes entraram em arquivos já listados (`trip-occurrence-correction-read.integration.ts` no
`test:integration`, `test/trip-occurrence/timeline.contract.ts` via `trip-occurrence.contract.test.ts`).

Execução **vermelha** (antes da implementação), de dentro de `apps/api-transportada`:

```bash
bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-occurrence-correction-read.integration.ts ./test/trip-occurrence.contract.test.ts
```

```text
(fail) ... linha do tempo da viagem: document.occurrence leva cancellation ...   Expected: "registrada na nota errada" Received: undefined
(fail) ... linha do tempo da ocorrência: o evento occurrence.cancelled só existe na cancelada   Expected length: 1 Received length: 0
(fail) o cancelamento na linha do tempo da ocorrência > no mesmo instante o cancelamento vem por último
 324 pass / 3 fail
```

Implementação: `TripTimelineOccurrenceReference.cancellation` (`trip-timeline.types.ts`);
`listDocumentOccurrenceRows` chama `listOccurrenceCancellationsByIds` uma vez por página
(`companyId` do contexto; sem N+1); `stop.occurrence` leva `cancellation: null`;
`occurrence-timeline.policy.ts` ganha o kind `occurrence.cancelled` (`reason`, prioridade 5) e
`trip-occurrence-timeline.query.ts` o monta a partir do `cancellation` do item do feed (ator
`operation`, nome = `cancelledByName`, data = `cancelledAt`). Catálogo de kinds da 183 é a própria
união `OccurrenceTimelineSource`/`KIND_PRIORITY` — o kind novo entrou nos dois.

Gates (primeiro plano, `--env-file=../../.env.test`, Postgres 127.0.0.1:65432):

| Gate                                                                                              | Resultado                                                                                                                                     |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| alvo: correction-read + occurrence-timeline + trip-timeline integração + contrato trip-occurrence | **372 pass, 0 fail, 0 skip**                                                                                                                  |
| `bun --env-file=../../.env.test test --timeout 120000` (contrato)                                 | **8899 pass, 23 skip, 0 fail** (193 arquivos)                                                                                                 |
| `test:integration` em 6 fatias contíguas da lista (154 arquivos)                                  | 83 · 245 · 105 · 186 (7 skip) · 135 · 131 (1 skip) = **885 pass, 8 skip, 0 fail**; os 8 skips são os mesmos da T0.5 (migration e sonda de S3) |
| `bun run typecheck` (app)                                                                         | limpo                                                                                                                                         |

## T3.2 — A marca de cancelada

Uma função pura, `resolveOccurrenceCancellationMark` (`trip/shared/occurrenceCancellation.service.ts`),
decide "cancelada + texto" a partir de `cancellation` (`null`/ausente → nenhuma marca); o componente
`OccurrenceCancellationMark` a usa em todos os lugares. Lugares: detalhe (cabeçalho, `notice`), feed
(selo na tabela e no cartão, `notice` na linha expandida), lista da nota (`TripOccurrences`, selo),
linha do tempo da viagem (`TripTimelineEntry`, `notice` sempre à vista) e linha do tempo da
ocorrência (evento `occurrence.cancelled`, lido pela mesma função via `toOccurrenceCancellation`).
Marca com texto ("Cancelada"); motivo, autor e hora em texto, nunca só cor.

Textos novos (pt-BR, com par em inglês): `occurrenceCancellation.label` "Cancelada",
`.authorship` "Cancelada por {{name}} em {{moment}}", `.authorshipUnknown` "Cancelada em {{moment}}",
`.reason` "Motivo: {{reason}}", `.summary` "{{authorship}}. {{reason}}" (texto lido por leitor de tela
no selo), `occurrenceTimeline.event.cancelled` "Ocorrência cancelada".

Validação: `cancellation` na linha do tempo da viagem — ausente → `null`, `null` e válido passam,
malformado reprova a página; `cancelledByName` passou a `null | string` (a API publica `null`);
`occurrence.cancelled` entrou no guard estrito da linha do tempo da ocorrência (exige `reason`).

Contagens de ativas: busca ampla em `apps/frontend-transportada/src` por contagem de ocorrência
(`occurrenceCount`, `occurrencesCount`, `openOccurrence`, `hasOccurrence`, `countDocumentsWith…`) —
**não existe contador de ocorrências ativas** no painel. O marcador da spec 173
(`occurrenceMarker.service.ts`, `countDocumentsWithOpenOccurrence`) conta notas com **tratativa
aberta** a partir do `openOccurrenceCase` que a API publica por nota, não ocorrências; a conta é da API
(`occurrence-case-marker.query.ts`, que não filtra cancelada) e o painel só lê o booleano. Nada a
ajustar no painel; ver relatório.

Contrato: `test/trip/occurrence-cancellation.contract.tsx` (entrou em `test/trip.contract.test.ts`),
renderiza cada lugar com cancelada e com ativa e afirma o texto renderizado (autoria com a hora
formatada pelo mesmo formatador, motivo, selo para leitor de tela).

Mutação (execução vermelha, depois restaurado): remover a marca do detalhe, do selo do feed, da
linha do tempo da viagem e do motivo da linha do tempo da ocorrência deixou **4 testes vermelhos**,
um por lugar (`o detalhe…`, `o feed…`, `a linha do tempo da viagem…`, `a linha do tempo da ocorrência…`).

| Gate                                            | Resultado                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `bun run --cwd apps/frontend-transportada test` | contratos **6515 pass, 0 fail**; lote DOM (`test:hooks`) **354 pass, 0 fail**; 0 skip     |
| `bun run lint` (cwd da app)                     | 0 erros, 16 avisos `react-hooks/exhaustive-deps` já existentes (nenhum em arquivo tocado) |
| `bun run typecheck` (raiz)                      | limpo                                                                                     |
| `bun run format:check` (raiz)                   | limpo                                                                                     |

## T3.2 — PARADA anterior (histórico; resolvida pela T3.2a acima e pela T3.2 abaixo)

A API não publica a marca de cancelada na **linha do tempo**: nem a da nota/viagem
(`GET /trips/:id/timeline`, item `document.occurrence`, montado em `trip-timeline-document.query.ts` com
`occurrence: { attachmentCount, note, typeName }`) nem a da ocorrência (spec 183,
`trip-occurrence-timeline.query.ts`, eventos `occurrence.recorded|photo`, `case.transition`,
`contractor.mail.*`). Nenhum dos dois lê `cancelled_at`/`cancellation`. Detalhe e feed já publicam
`cancellation` (Fase 0.5) — só a linha do tempo falta. Task parada conforme a instrução; nada commitado.

# Evidência — spec 235, Fase 5

## T5.0 — `correctedByName` nulo

A API publica `correctedByName` como `null | string` (`occurrence-correction.port.ts:28`; nulo quando o
vínculo de quem corrigiu já não está ativo), mas o guard `isOccurrenceCorrection` e o tipo
`OccurrenceCorrection` exigiam `string`: uma correção assim reprovaria a leitura do detalhe inteiro.
Mesmo defeito, mesma correção que `cancelledByName` (T3.2).

Execução **vermelha** (contratos escritos antes do ajuste), `bun run --cwd apps/frontend-transportada test`:
`6515 pass / 2 fail` — `aceita a correção sem autor (correctedByName nulo)` (guard lança
`TRIP_RESPONSE_INVALID`) e `correção sem autor (vínculo inativo) diz só quando foi corrigida` (o
histórico renderizava "Corrigida por null").

Ajuste: tipo `OccurrenceCorrection` e `OccurrenceCorrectionHistoryEntry` com `null | string`, guard com
`isNullableString`, `OccurrenceCorrectionHistory` com a chave `occurrenceDetail.corrections.entryUnknown`
("Corrigida em {{moment}}" / "Corrected on {{moment}}") quando nulo. Verde: `6517 pass, 0 fail` +
lote DOM `354 pass, 0 fail`; `bun run typecheck` limpo.

## T5.1 — Revisão de design e usabilidade (CA07)

Ambiente: API deste worktree na porta 53091 (`APP_PORT=53091`, cwd `apps/api-transportada`, Postgres local
55432), Vite da app (`apps/frontend-transportada/node_modules/.bin/vite`) na 53090 com
`VITE_SMOKE_AUTH_BYPASS=true`, e um proxy descartável (fora do repositório) na 53092 que troca o
`Authorization` pelo token real do usuário de seed `local-user` (authorization code + PKCE, como na Fase 0).
Motivo: a 53000 é do Vite de **outra sessão** (`lsof`: cwd em
`.claude/worktrees/…/reconcile-spec-145/apps/frontend-transportada`) e o client `transportada-spa` do Keycloak
só aceita callback nas origens fixas do realm, então o login do painel numa porta alternativa não é possível sem
alterar o realm — o bypass de smoke (`isSmokeAuthBypassEnabled`, só `localhost`/`127.0.0.1`) lê o `/auth/me` real
da API do `sessionStorage`. Senha e token: `[REDACTED]`. Nada foi escrito no banco nesta task: o diálogo foi aberto
e fechado sem confirmar e o formulário não foi salvo (conferido depois por SELECT: A segue cancelada com 2
correções, B íntegra com 1). Vite, proxy e API foram derrubados ao fim (`lsof` nas três portas: vazio).

Dados: A `a4b6ef1d-…` (cancelada, duas correções), B `8bf20b6b-…` (íntegra, sem tratativa, uma correção), C
`feefbf9f-…` (tratativa aberta). Verificação por texto/geometria com `read_page`/`get_page_text`/`javascript_tool`
no navegador embutido (detalhe de B: botões, histórico; C: `aria-disabled="true"` + `aria-describedby` apontando
o motivo) e, para os PNGs, Chromium do Playwright da própria app (o navegador embutido não grava arquivo)
dirigindo o mesmo Vite, com medição no DOM por largura.

Prints (`specs/235-a-correcao-da-ocorrencia-ganha-tela/prints/`, `NN-descricao-LARGURA.png`, larguras `desktop`
1280, `tablet` 768, `mobile` 375): `01-detalhe-habilitado` · `02-dialogo-cancelamento` ·
`03-formulario-correcao` · `04-desabilitado-motivo` · `05-cancelada-detalhe-topo` · `06-cancelada-historico` ·
`07-feed-cancelada` — 21 arquivos.

| Verificação                                                       | desktop 1280                                                                   | tablet 768      | mobile 375               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------- | ------------------------ |
| Rolagem horizontal da página (detalhe, diálogo, formulário, feed) | nenhuma                                                                        | nenhuma         | nenhuma                  |
| Altura dos botões Corrigir/Cancelar/Salvar/Confirmar              | 38px                                                                           | 38px            | **44px** (alvo de toque) |
| Largura do fechar do diálogo                                      | 28px → **38px**                                                                | 28px → **38px** | **20px → 44px**          |
| Foco por teclado em Corrigir                                      | contorno 2px cobre                                                             | idem            | idem                     |
| Foco ao fechar o diálogo (Esc)                                    | volta ao botão                                                                 | idem            | idem                     |
| Confirmar cancelamento com motivo vazio                           | `disabled`                                                                     | idem            | idem                     |
| Motivo do estado desabilitado                                     | texto à vista + `aria-describedby`, 12,8px, contraste 5,7:1                    | idem            | idem                     |
| Selo "Cancelada" no feed                                          | vermelho, contraste ≥ 4,5:1 (4,53 sobre a linha destacada, 5,08 sobre o fundo) | idem            | idem                     |

Console: só `404` de miniatura de foto — o MinIO local (`:59000`) não estava no ar (`compose.yaml` puxa imagem
privada do GHCR); ruído de ambiente, nenhum erro de script. Rede: nenhuma chamada da tela com status de erro.

Achados e destino:

1. **Defeito desta spec, corrigido.** O botão fechar do `TripOccurrenceCancelDialog` (`.iconAction` num cabeçalho
   flex) era comprimido pelo título: 28px de largura no desktop e **20px no celular**, abaixo do alvo de 44px.
   `trip.module.css`: `.iconAction` ganhou `flex-shrink: 0` e, sob `@media (pointer: coarse)`,
   `min-width`/`min-height: var(--touch-target)`. Contrato `test/trip/occurrence-dialog-touch-target.contract.ts`
   (entrou em `test/trip.contract.test.ts`): **vermelho antes** (`2 fail`, na lista de 2413 do lote `trip`),
   verde depois — app `6519 pass, 0 fail`, lote DOM `354 pass, 0 fail`, `typecheck` limpo, lint 0 erros
   (16 avisos antigos). Medido de novo: fechar 38/38/44px.
2. **Não é desta spec (registrado).** `"{{count}} itens escolhidos"` (`trip.locale.json:1127`,
   `occurrence.productSummary`, spec 161) diz "1 itens escolhidos" no seletor do formulário de correção — vem do
   formulário de registro reaproveitado, não ganhou plural.
3. **Observações sem ação.** O diálogo abre com o foco no contêiner, não no campo do motivo (foco preso e devolvido
   conforme RF/CA04; autofocus no campo seria melhoria de usabilidade, não defeito). O rótulo "Item da nota" do
   formulário (16px) é mais pesado que o texto de ajuda acima dele (12,8px) — herdado do formulário de registro. No
   feed, o motivo da cancelada só aparece na linha expandida e no resumo lido por leitor de tela; o selo "Cancelada"
   fica sempre à vista (decisão da T3.2). Ao lado de "Cancelar ocorrência", a ocorrência com tratativa aberta mostra
   também "Cancelar tratativa" (bloco da tratativa, outra ação, outra spec): nomes parecidos para coisas
   diferentes; não alterado.

## T5.2 — `tasks.md` da spec 167 conferido contra o código

Só marcação em `specs/167-correcao-da-ocorrencia-registrada/tasks.md` (a spec não foi reescrita). Cada task foi
conferida contra o código deste worktree, contra o `evidence.md` da 167, contra a T0.1 desta spec e contra os
contratos e a integração existentes.

**Marcadas (15):**

| Task             | Prova                                                                                                                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T101             | `apps/frontend-transportada/test/trip/occurrence-history-tolerance.contract.ts` (roda no lote `trip`); commit `7709ea673` em `origin/staging`                                                                                                                                          |
| T102             | `corrections` e `cancellation` em `TRIP_OCCURRENCE_OPTIONAL_KEYS` (`trip.constant.ts`), guards `isOccurrenceCorrection`/`isOccurrenceCancellation`                                                                                                                                     |
| T201             | `drizzle/20260928010022_occurrence_correction_and_cancellation/` com `migration.sql`, `rollback.sql`, `snapshot.json` e o CHECK `trip_document_occurrences_cancellation_presence_check`; `make migration-test` na evidência da 167                                                     |
| T202, T203       | `occurrence-correction.policy.ts` e `occurrence-cancellation.policy.ts`; `test/trip-domain/occurrence-correction.contract.ts` e `occurrence-cancellation.contract.ts`                                                                                                                  |
| T301, T302, T303 | os dois casos de uso reaproveitam `resolveOccurrenceItemQuantities`/`resolveOccurrenceProductSelection`; a leitura da tratativa mora na unidade de trabalho da escrita; os `409` e o `200` sem mudança estão em W1–W5 e C1–C4 da T0.1 e em `trip-occurrence-correction.integration.ts` |
| T305             | as duas rotas respondem com `trip.manage` e `Idempotency-Key` (T0.1: E5 sem chave = 400), balde de taxa em `rate-limited-routes.contract.test.ts`                                                                                                                                      |
| T306             | **só a partir da 235**: a T0.2 provou que nenhuma leitura publicava os campos; a Fase 0.5 (T0.3–T0.5) fez detalhe, lista da nota e feed publicarem, com `trip-occurrence-correction-read.integration.ts`                                                                               |
| T309             | `test/integration/trip-occurrence-correction.integration.ts` e `-read.integration.ts`, ambos executados nas Fases 0.5 e 3 desta spec                                                                                                                                                   |
| T401, T402, T404 | 235 T2.1/T2.2 (Corrigir reabre o formulário com o conjunto atual), T3.1 (diálogo com motivo obrigatório), T3.2 (marca de cancelada na lista)                                                                                                                                           |
| T502             | 235 T5.1 (esta fase), com os prints                                                                                                                                                                                                                                                    |

**Deixadas desmarcadas (7), com o motivo:**

| Task | Motivo                                                                                                                                                                                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T103 | "confirmar o bundle servido" é um fato de publicação que não dá para provar daqui; só se sabe que o commit está em `origin/staging`                                                                                                                                                |
| T304 | só a parte da tratativa tem prova (`hasOpenCase` trava correção e cancelamento, integração da 167); "fora de contagem, listagem de ativas e e-mail" não foi verificado — o painel não tem contador de ocorrências ativas e o marcador da 173 não filtra cancelada (não verificado) |
| T307 | a 235 só acrescentou o `occurrence.cancelled`; não existe evento de **correção** em nenhuma das duas linhas do tempo                                                                                                                                                               |
| T308 | não há aviso de correção no código; a dúvida do e-mail continua aberta e fora de escopo                                                                                                                                                                                            |
| T403 | a tela mostra o conjunto vigente em cada correção (derivado de `previousItems`), mas nunca o conjunto **original** (o `previousItems` da primeira correção), então "o que era" não aparece                                                                                         |
| T501 | `make migration-test` não foi repetido na 235 e o carimbo provisório da migration foi tratado na T503; os gates da API e do painel foram, mas a task cobre mais                                                                                                                    |
| T503 | a migration foi renumerada depois do rebase (`1ef417b8c`) e está em `origin/staging`, mas o `db:generate` até `no_changes` não está registrado como execução                                                                                                                       |

## T5.3 — Gates (primeiro plano, worktree `work/spec-235`)

| Comando                                                                                                        | Resultado                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                                                                | `Checked 788 installs across 921 packages (no changes)`                                           |
| `bun run typecheck` (raiz)                                                                                     | limpo, sem saída de erro                                                                          |
| `cd apps/frontend-transportada && bun run lint`                                                                | 0 erros, 16 avisos `react-hooks/exhaustive-deps` já existentes (nenhum em arquivo tocado)         |
| `bun run --cwd apps/frontend-transportada test`                                                                | contratos **6519 pass, 0 fail** (32 arquivos); lote DOM `test:hooks` **354 pass, 0 fail**; 0 skip |
| `bun run format:check` (raiz), depois de `prettier --write` nos `.md` da spec                                  | `All matched files use Prettier code style!`                                                      |
| `cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000` (contrato, regressão final) | **8899 pass, 23 skip, 0 fail** (193 arquivos)                                                     |

Integração da API **não repetida**: já foi executada em blocos nas Fases 0.5 e 3 (T0.5 e T3.2a) e a Fase 5 não
tocou a API — só `apps/frontend-transportada` e `specs/`. `make migration-test` **não se aplica**: nenhuma
migration nesta spec (`git diff --stat origin/staging...HEAD -- apps/api-transportada/src/database
apps/api-transportada/drizzle` sai vazio; as mudanças da API são só as leituras da Fase 0.5 e da T3.2a).

## T5.4 — Pendências honestas (o que ficou fora ou diverge da spec)

1. **A janela de correção fecha com qualquer tratativa**, não só com a aberta: é o que o servidor faz
   (`correct-occurrence-items.use-case.ts`), e a função pura do painel espelha. O texto distingue os estados.
2. **O histórico mostra o conjunto vigente**, derivado de `previousItems` (o da correção seguinte, e na última os
   itens atuais). O conjunto **original** — o `previousItems` da primeira correção — não aparece; a 167 T403 ("o
   que era e o que passou a ser") fica desmarcada por isso.
3. **Corrigir só existe com itens**; **Cancelar e Corrigir só existem para ocorrência de nota** (a de parada é
   outra tabela e fora de escopo).
4. **`occurrence.cancelled` não é evento-chave** e não fecha `openUntil` na linha do tempo da ocorrência.
5. **O marcador da 173 não filtra cancelada** — não verificado: a conta é da API
   (`occurrence-case-marker.query.ts`) e o painel só lê o booleano; também não existe contador de ocorrências
   ativas no painel (T3.2).
6. **A Fase 0.5 e a T3.2a estenderam a API só em leitura**, por decisão do usuário em 2026-10-02: sem migration,
   sem rota, sem regra nova, sem mudar as escritas da 167.
7. **"Prorrogação" não existe no catálogo de tipos** (`occurrence-type-catalog.constant.ts` só tem "segunda via do
   boleto"); cadastro de tipo é da 234/208 — fora de escopo.
8. **A correção não reenvia e-mail** ao contratante; a dúvida herdada da 167 segue aberta e o comportamento é o de hoje.
9. **Não existe evento de correção nas linhas do tempo** (167 T307 desmarcada) nem aviso de correção (T308).
10. **Ambiente da revisão de design:** MinIO local fora do ar (miniaturas de foto dão 404 no console) e o painel
    foi exercitado com o bypass de smoke contra a API real, por a 53000 ser de outra sessão e o Keycloak local só
    aceitar callback nas origens fixas do realm. Os PNGs vêm do Chromium do Playwright, não do navegador embutido
    (que não grava arquivo); a verificação por texto e geometria usou os dois.
11. **Achados de design fora desta spec**, registrados na T5.1: "1 itens escolhidos" (plural do seletor de
    produtos da 161), foco inicial do diálogo no contêiner e não no campo do motivo, e os nomes parecidos
    "Cancelar ocorrência" / "Cancelar tratativa".

## T6.1 — Ordem de publicação (ADR-0081 §9: painel tolerante primeiro)

A API desta branch passa a publicar `corrections`, `cancellation` e o evento `occurrence.cancelled`, e
`cancelledByName`/`correctedByName` podem ser `null`. Os guards do painel têm lista fechada de chaves:
**API nova diante de um painel antigo derruba a resposta inteira** (a tela disse que a foto falhou sobre uma
escrita que tinha acontecido — spec 166, medido em 22/09). Por isso a ordem é obrigatória:

1. **Etapa 1 — painel** (`apps/frontend-transportada`): aceita as chaves novas, `null` nos dois nomes e a
   ausência de tudo isso (API anterior). Publicar, **esperar o deploy e o `autoUpdate` do PWA** chegar às abas
   abertas.
2. **Etapa 2 — API** (`apps/api-transportada`): só depois. Inclui a T6.5 (`occurrence.cancelled` fecha
   `openUntil`).

Não publicar nada nesta task. Como publicar por etapas (a branch mistura as duas apps e mistura `specs/`):

- **Staging:** `git fetch && git rebase origin/staging && git push origin HEAD:staging` só com gates verdes e
  `bun install --frozen-lockfile` + typecheck depois do rebase. Para separar as etapas, uma branch por etapa a
  partir de `origin/staging` com `git cherry-pick` dos SHAs da lista (ordem cronológica), gates, push; a
  etapa 2 só depois do deploy da 1.
- **Produção:** PR `staging` → `main` (`main` é protegida), conferindo no merge que a lista de commits é só
  esta — e **cada etapa vira o seu PR**, porque o painel precisa estar em produção antes da API.
- Commits que tocam as duas coisas (`specs/` + código) levam o `evidence.md`/`tasks.md` junto: no
  cherry-pick, conflito em `evidence.md` se resolve ficando com a versão da branch inteira. Os commits só de
  `specs/` podem ir em qualquer etapa; vão na 2.

Divisão (commits de código; os `docs(specs)` seguem a regra acima):

| Etapa       | SHAs (ordem cronológica)                                                                                                                                                                                                                                                                                   | Onde mexem                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1 — painel  | `dc33d02a3` T1.1, `cda66c6db` T1.2, `d9ff8b763` T1.4, `9d3359924` T2.1, `639e38e26` T2.2, `24977faa5` T2.3, `df8893cee` T3.1, `4f774cdab` T4.1, `c87378075` T4.2, `c1eb0dc17` T3.2, `09d6be608` T5.0, `4953d4026` T5.1, **Fase 6:** `e52eb1b9f` T6.2, `0c4371283` T6.3, `0939db332` T6.4, `41fd6c766` T6.6 | `apps/frontend-transportada` (+ `docs/ai-context/frontend-transportada.md`) |
| 2 — API     | `6952f9eda` T0.3, `3a307bbf3` T0.4, `d8d7b27a2` T0.5, `93f260e4d` T3.2a, **Fase 6:** `871188e8f` T6.5, `711ec6a9d` T6.6                                                                                                                                                                                    | `apps/api-transportada` (+ `docs/ai-context/api-transportada.md`)           |
| só `specs/` | `4e7f04184`, `d653d1570`, `fbb46f0f4`, `7df76a06d`, `449709816`, `96626a4d5`, `9ca78e561`, `68319e473`, `001bfe770`, `246f12a83`                                                                                                                                                                           | evidência, spec 167                                                         |

Os `docs(specs)` da Fase 6 (`246f12a83`, `8ac9b5caf` T6.1 e o de fechamento) vão na etapa 2.

**O painel desta branch contra a API antiga** (campos ausentes → `null`/`[]`, nunca resposta inválida) — já
havia contrato para três dos quatro leitores e a T6.1 acrescentou o que faltava:

| Leitor                                                                | Contrato                                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| detalhe (cliente)                                                     | `occurrence-read-correction.contract.ts`: "API anterior, sem os campos: não cancelada e sem correções"  |
| feed                                                                  | `occurrence-read-correction.contract.ts` (feed marca a cancelada, demais `null`)                        |
| linha do tempo da viagem                                              | `occurrence-cancellation.contract.tsx`: "campo ausente (API anterior) lê como null"                     |
| linha do tempo da ocorrência                                          | `occurrence-cancellation.contract.tsx`: sem o evento, nada de cancelamento                              |
| lista da nota + **tela do detalhe renderizada** com a resposta antiga | **novo** `occurrence-old-api-tolerance.contract.tsx` (2 testes; entra por `test/trip.contract.test.ts`) |
| chaves novas e `null` nos dois nomes                                  | `occurrence-history-tolerance.contract.ts`                                                              |

Execução do contrato novo: `bun test ./test/trip/occurrence-old-api-tolerance.contract.tsx` → 2 pass, 0 fail.

## T6.2 — Corrigir e cancelar invalidam também a lista de ocorrências da nota

A lista da nota mora em `[trips, companyId, tripId, 'occurrences', documentId]`
(`useTripWorkspace.hook.ts`); as mutações não conhecem a empresa, então a invalidação usa predicado pela
viagem (`useOccurrenceCorrection.query.ts`). O segmento `'occurrences'` virou
`TRIP_OCCURRENCES_KEY_SEGMENT` (`trip.constant.ts`), usado nas quatro chaves do hook e na invalidação.

Contrato `test/trip-hooks/occurrence-correction-mutations.contract.ts`: a chave da lista da nota entra em
`AFFECTED_KEYS`, e a lista de **outra viagem** entra nas não afetadas.

- **Vermelho antes** (`bun test --preload ./test/trip-hooks/dom.preload.ts ./test/trip-hooks/occurrence-correction-mutations.contract.ts`):
  `1 pass, 3 fail` (corrigir, cancelar e o 409).
- **Verde depois:** `4 pass, 0 fail`; `bun run typecheck` limpo.

## T6.3 — Nota inteira na correção (decisão a)

O formulário já aceitava a lista vazia — o seletor tem "A nota inteira" como escolha de primeira classe,
igual ao registro — e a API também: `correctOccurrenceItemsSchema` (`occurrence.schema.ts`) tem
`items: ….default([])` e `resolveOccurrenceProductSelection` devolve `scope: 'document'` para a lista
vazia. O que faltava era (i) um contrato que prendesse isso e (ii) o histórico, que mostraria
"Passou a valer:" sem nada.

- `OccurrenceCorrectionHistory.component.tsx`: conjunto vigente vazio mostra "a nota inteira"
  (`occurrenceDetail.corrections.wholeDocument`, pt-BR e en); o texto de ajuda do formulário passa a dizer
  que sem itens a ocorrência vale para a nota inteira.
- Contrato do histórico (`occurrence-correction-history.contract.tsx`): **vermelho antes** (`7 pass, 1 fail`),
  verde depois (`8 pass, 0 fail`).
- Contrato do formulário (`test/trip-hooks/occurrence-correction-form.contract.ts`): limpar os itens e salvar
  manda `items: []` e o detalhe fica sem itens — `3 pass, 0 fail`. Esse teste **nunca esteve vermelho**
  para a parte do envio (o formulário já mandava `[]`); a parte que ficava vermelha — Corrigir sumir depois
  de salvar a nota inteira — é da T6.4.

## T6.4 — Critério de Corrigir por itens ou tipo (decisão b)

**Parte do tipo: parada, sem inventar regra.** A decisão pede "Corrigir existe quando a ocorrência tem itens
OU quando o tipo carrega itens". Procurado o sinal de tipo que o detalhe/feed publicam ou que o registro usa:

| Onde                                                             | O que existe                                                                                                   | Serve?                                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Detalhe e feed (`TripOccurrenceDetail`/`TripOccurrenceFeedItem`) | só `stage` (`separation`/`delivery`) e `typeName` (texto renomeável); **nem o id do tipo**                     | não: grupo e nome não dizem se carrega itens                                                       |
| `company_occurrence_types` (`trip.schema.ts`)                    | `allows_multiple_items`, `leaves_document_behind`, `attachment_mode`, `redelivery_policy`, `flow`, `stop_kind` | não: `allows_multiple_items` é "um ou vários", não "carrega itens"; nenhuma coluna diz "sem itens" |
| Registro (`TripOccurrences.component.tsx`)                       | o seletor de produtos aparece para **todo** tipo de nota, com "A nota inteira" como escolha                    | não: o registro não distingue tipos com e sem itens                                                |
| Catálogo (`occurrence-type-catalog.constant.ts`)                 | só "segunda via do boleto"; "prorrogação" não existe                                                           | não há tipo sem itens para testar                                                                  |

Distinguir "avaria sem itens gravados (WhatsApp, nota inteira)" de "prorrogação/segunda via sem itens" exige
um campo novo na API (flag no tipo e id do tipo no detalhe), o que a regra da spec proíbe (só leitura de coluna
que já existe). **Parte parada; relatada ao usuário.** Efeito hoje: ocorrência de nota **sem itens gravados e
nunca corrigida** (a avaria registrada sobre a nota inteira, a do WhatsApp) continua só com Cancelar.

**O que a decisão (a) já obriga e foi feito:** "Corrigir continua disponível depois" de salvar a nota inteira.
`resolveOccurrenceCorrectionActions` ganhou `wasCorrected` (`corrections.length > 0`): Corrigir existe com
itens **ou** se a ocorrência já foi corrigida; some só sem itens e sem correção. Sinal já publicado (RF9),
sem campo novo.

- Contratos: `occurrence-correction-actions.contract.ts` (sem itens e corrigida: Corrigir segue; com itens,
  com ou sem correção antes), `occurrence-correction-button.contract.tsx` (idem no botão) e
  `occurrence-correction-form.contract.ts` (depois de salvar a nota inteira, o botão Corrigir continua;
  o duplo do servidor passou a registrar a correção).
- **Vermelho antes:** `actions` `18 pass, 1 fail`; formulário `BUTTON_NOT_FOUND:Corrigir` depois de salvar
  a lista vazia.
- **Verde depois:** actions + botão `28 pass, 0 fail`; formulário/erros/diálogo `24 pass, 0 fail`;
  `bun run typecheck` limpo.

## T6.5 — `occurrence.cancelled` fecha `openUntil` (decisão c; **etapa 2, API**)

`resolveTimings` (`apps/api-transportada/src/trips/domain/occurrence-timeline.policy.ts`): `openUntil` é o
mais cedo entre o terminal da tratativa (`cancelled`/`closed`/`returned_to_warehouse`) e o evento
`occurrence.cancelled`. Só leitura; `driverReleasedAt` não muda.

- **Vermelho antes** (`bun --env-file=../../.env.test test ./test/trip-occurrence/timeline.contract.ts`):
  `13 pass, 1 fail` ("o cancelamento da ocorrência fecha o relógio no instante dele").
- **Verde depois:** `14 pass, 0 fail`. Integração
  (`trip-occurrence-correction-read.integration.ts`, o cenário da cancelada e o da ocorrência comum): o
  `openUntil` da cancelada é o `cancelledAt` do detalhe e o da comum é `null`.
- `cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000` (contrato completo):
  **8901 pass, 23 skip, 0 fail** (193 arquivos).
- Integração (`bun --env-file=../../.env.test test --timeout 120000 ./test/integration/<arquivo>`, um por vez,
  Postgres local em 65432 do `.env.test`, nenhum pulado): `trip-occurrence-correction-read` 7 pass,
  `trip-occurrence-correction` 7, `trip-occurrence-detail` 6, `trip-occurrence-timeline` 3,
  `trip-occurrence-feed-document` 6, `trip-occurrence-feed-case` 2, `trip-occurrence-case` 4 — todos 0 fail, 0 skip.
- `docs/ai-context/api-transportada.md` § Spec 235 atualizada.

## T6.6 — Baixos da revisão

Dois commits, não um, por causa da T6.1: os itens 6 e 10 são da API (`apps/api-transportada`, **etapa 2** —
dependem do leitor em lote que só a etapa 2 traz) e o resto é do painel (**etapa 1**). Um commit só misturaria
as etapas e quebraria o cherry-pick separado.

| Item | O que foi feito                                                                                                                                                                                                                                                                                               | Prova                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1    | `withOccurrenceCancellation` subiu para antes do JSDoc da 158 de `isTimelineItem` (`tripResponse.validation.ts`)                                                                                                                                                                                              | typecheck; `occurrence-cancellation.contract.tsx` verde                          |
| 2    | `TripOccurrenceCorrectionForm`: `useId()` no lugar do id fixo, foco no título ao abrir, `id` recebido do botão; `OccurrenceCorrectionActions`: `aria-controls` no Corrigir (só com o formulário aberto) e foco devolvido ao botão ao descartar **e** ao salvar                                                | `occurrence-correction-form.contract.ts`: dois testes novos, **vermelhos antes** |
| 3    | `TripOccurrenceCancelDialog`: com a mutação pendente Escape e X não fecham (o X fica `disabled`, e `handleClose` recusa); foco inicial no motivo por `useEffect` no próprio diálogo — `useModalDialog` é compartilhado e não ganhou `initialFocus` (o efeito do diálogo roda depois do dele)                  | `occurrence-cancel-dialog.contract.ts`: dois testes novos, **vermelhos antes**   |
| 4    | **Não feito, relatado.** O detalhe não publica o id do tipo nem `allowsMultipleItems` (só `typeName` e `stage`); casar pelo nome seria inventar regra (nome é renomeável). O formulário segue com `allowsMultipleItems` fixo e a API responde `OCCURRENCE_TYPE_SINGLE_ITEM` (422), que já tem mensagem (T2.3) | —                                                                                |
| 5    | aceito, sem ação                                                                                                                                                                                                                                                                                              | —                                                                                |
| 6    | Prova por mutação do `companyId` dos leitores em lote (abaixo)                                                                                                                                                                                                                                                | `trip-occurrence-correction-read.integration.ts`, teste novo                     |
| 7    | Cabeçalho de copyright em `useOccurrenceCorrection.query.ts` e `useOccurrenceDocumentProducts.query.ts`; `companyId` na chave (`[trips, companyId, tripId, 'document-products', documentId]`), passado do detalhe até o formulário                                                                            | `occurrence-correction-form.contract.ts` confere a chave no cache                |
| 8    | `key` do histórico é `índice:hora` (duas correções no mesmo instante não colidem)                                                                                                                                                                                                                             | sem teste próprio: a renderização estática não avisa chave duplicada             |
| 9    | Prova por leitura de código, abaixo                                                                                                                                                                                                                                                                           | —                                                                                |
| 10   | `findTripOccurrenceDetail` só chama `listOccurrenceCorrectionsByIds` quando `source === 'document'` (`trip-occurrence-detail.query.ts`); a de parada devolve `corrections: []` sem consulta                                                                                                                   | `trip-occurrence-detail` e `-correction-read` integrações verdes (14 pass)       |

**Vermelho dos itens 2 e 3** (componentes e consulta do painel revertidos para o HEAD, contratos novos mantidos;
`bun test --timeout 5000 --preload ./test/trip-hooks/dom.preload.ts ./test/trip-hooks/occurrence-correction-form.contract.ts ./test/trip-hooks/occurrence-cancel-dialog.contract.ts`):
`11 pass, 5 fail` — os quatro novos, mais o "Descartar fecha o formulário", arrastado pelo formulário que o
teste anterior deixou aberto. **Verde depois:** hooks `359 pass, 0 fail`, lote `trip` `2421 pass, 0 fail`,
typecheck limpo, lint 0 erros. (As primeiras tentativas de vermelho travaram: `expect(document.activeElement).toBe(...)`
imprime o documento inteiro do happy-dom ao falhar; os contratos comparam `=== ` com `toBe(true)`.)

**Item 6, mutação real** (`apps/api-transportada`, `occurrence-correction-read.query.ts`, teste
`os leitores em lote respeitam a empresa`, com `companyId` aleatório e os ids da empresa verdadeira):

| Mutação                                                                                            | Resultado                                              |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| nenhuma                                                                                            | `8 pass, 0 fail`                                       |
| `eq(tripDocumentOccurrenceCorrections.companyId, …)` arrancado de `listOccurrenceCorrectionsByIds` | `7 pass, 1 fail`                                       |
| `eq(tripDocumentOccurrences.companyId, …)` arrancado de `listOccurrenceCancellationsByIds`         | `7 pass, 1 fail`                                       |
| fonte restaurada                                                                                   | `8 pass, 0 fail` (`git status`: só o teste modificado) |

**Item 9 — a cancelada nunca entra no marcador da 173 nem na cobrança da 164.** A tratativa só nasce no registro
da ocorrência e o cancelamento exige não haver nenhuma:

- A tratativa é aberta em um único lugar: `openOccurrenceCase` (`apps/api-transportada/src/trips/infrastructure/drizzle-occurrence-case.repository.ts:66-84`),
  chamada só de `saveTripOccurrence` (`delivery-proof-read.support.ts:547`), na transação do registro.
- O cancelamento recusa se existir **qualquer** linha de tratativa, em qualquer estado:
  `cancel-occurrence.use-case.ts:43-48` (`hasOpenCase` → `OccurrenceCaseAlreadyOpenError`), e
  `hasOpenOccurrenceCase` (`drizzle-occurrence-correction.repository.ts:130-144`) só pergunta se a linha existe.
- Logo, ocorrência cancelada **não tem linha em `trip_occurrence_cases`**. O marcador da 173
  (`occurrence-case-marker.query.ts:33-45`) é um `innerJoin` com `tripOccurrenceCases`: sem linha, sem marcador.
  A cobrança da 164 nasce do acerto da tratativa (`record-occurrence-settlement.use-case.ts:22-43`, chaveado por
  `caseId`): sem tratativa, sem acerto e sem cobrança. A ordem inversa (cancelar e depois abrir tratativa) não
  existe: a tratativa só abre no registro, e a cancelada já foi registrada.
- Corrige a pendência 5 da T5.4 ("o marcador da 173 não filtra cancelada — não verificado"): **verificado**,
  não precisa filtrar.

## T6.7 — Gates finais (primeiro plano, worktree `work/spec-235`)

| Comando                                                                            | Resultado                                                                    |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                                    | `Checked 788 installs across 921 packages (no changes)`                      |
| `bun run typecheck` (raiz)                                                         | limpo                                                                        |
| `cd apps/frontend-transportada && bun run lint`                                    | 0 erros, 16 avisos `react-hooks/exhaustive-deps` já existentes               |
| `bun run --cwd apps/frontend-transportada test`                                    | contratos **6525 pass, 0 fail** (32 arquivos); lote DOM **359 pass, 0 fail** |
| `bun run format:check` (raiz), depois de `prettier --write` nos `.md` da spec      | `All matched files use Prettier code style!`                                 |
| `cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000` | **8901 pass, 23 skip, 0 fail** (193 arquivos)                                |

Integração da API, um arquivo por vez (`bun --env-file=../../.env.test test --timeout 120000 ./test/integration/<arquivo>`,
Postgres local do `.env.test`), todos os arquivos `*occurrence*` e `trip-timeline`, **0 fail**:
`occurrence-automatic-mail` 4, `occurrence-case-closure` 1, `occurrence-charge-report` 3, `occurrence-charge` 1,
`occurrence-settlement-charge-bridge` 3, `occurrence-type-catalog-seed` 1, `occurrence-type-leaves-document-behind` 4,
`stop-occurrence-photo` 8, `trip-detail-occurrence-marker` 1, `trip-occurrence-attachment` 6,
`trip-occurrence-case-write-guard` 3, `trip-occurrence-case` 4, `trip-occurrence-correction-read` 8,
`trip-occurrence-correction` 7, `trip-occurrence-detail` 6, `trip-occurrence-feed-case` 2,
`trip-occurrence-feed-document` 6, `trip-occurrence-item-quantity` 5, `trip-occurrence-settlement` 7,
`trip-occurrence-timeline` 3, `trip-occurrence-upload-confirm` 3 pass + **1 skip**, `trip-timeline` 42, e os nove
`occurrence-conversation-*` (3, 2, 1, 3, 6, 2, 2, 2, 4).

O único pulado é `testWithStorage` de `trip-occurrence-upload-confirm` (linha 73: pula quando o MinIO local não
responde, e ele está fora do ar — a imagem é do GHCR privado). **Pulado não é verde**: esse teste não rodou; ele
cobre a confirmação de upload de foto, que nenhuma task da 235 toca. `make migration-test` não se aplica
(nenhuma migration na Fase 6).

## Pendências depois da Fase 6 (corrige a T5.4)

- **Pendência 3 da T5.4, revista:** Corrigir existe com itens **ou** se a ocorrência já foi corrigida (T6.4).
  A ocorrência de nota **sem itens e nunca corrigida** (avaria sobre a nota inteira, a do WhatsApp) continua só
  com Cancelar: o sinal de "tipo que carrega itens" **não existe** sem campo novo na API (T6.4). Decisão
  pendente do usuário: autorizar um campo no detalhe (id do tipo, ou a flag no tipo) ou aceitar a regra por itens.
- **Pendência 4 resolvida:** `occurrence.cancelled` fecha `openUntil` (T6.5). Continua não sendo evento-chave.
- **Pendência 5 resolvida:** o marcador da 173 e a cobrança da 164 não precisam filtrar a cancelada (T6.6, item 9).
- **Novas:** o item 4 da T6.6 (`allowsMultipleItems` do tipo no formulário de correção) não foi feito, pelo mesmo
  motivo do tipo; "nota inteira" salva uma correção cujo "conjunto original" (167 T403) continua sem aparecer.
- **Publicação:** nada foi publicado. Etapa 1 (painel) antes da etapa 2 (API); ver T6.1.

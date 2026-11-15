# API de integração — cotação e pedido de coleta/entrega

> **Status: contrato proposto (spec 340), ainda não publicado.** As rotas abaixo são as únicas que o parceiro
> precisa. Trocas de nome ou campo antes da publicação serão avisadas aqui. O cálculo da cotação (`calculateFreightQuote`)
> e o pedido de coleta (spec 339) já existem no sistema; falta a porta de entrada com chave de API.

## 1. Acesso

- **Base:** `https://<api-da-transportadora>/v1/integration` (um endereço por transportadora: cada uma tem a sua instalação).
- **Autenticação:** `Authorization: Bearer <chave>`. A chave é criada pela transportadora em Configurações → Integração,
  aparece **uma única vez** e pode ser revogada a qualquer momento. Ela só permite cotar e pedir coleta.
- **Formato:** JSON UTF-8. Dinheiro e peso são **strings decimais** (`"1234.5600"`), nunca número de ponto flutuante.
  Datas civis são `AAAA-MM-DD`; instantes são ISO 8601 em UTC.
- **Idempotência:** `POST` que cria algo exige `Idempotency-Key` (16 a 256 caracteres: letras, números, `. _ : -`). Repetir
  a mesma chave devolve o mesmo resultado, sem duplicar.
- **Limites:** por chave, 60 cotações e 10 pedidos por hora. Passou do limite: `429` com `Retry-After`.
- **Correlação:** toda resposta traz `x-correlation-id`; informe-o ao suporte quando houver problema.

## 2. Rotas

### 2.1 `POST /freight-quotes` — cotar o frete

Corpo:

| Campo                   | Tipo           | Obrigatório | Observação                                               |
| ----------------------- | -------------- | ----------- | -------------------------------------------------------- |
| `distanceKm`            | string decimal | sim         | distância da coleta ao destino                           |
| `axles`                 | inteiro 2–9    | sim         | eixos do conjunto                                        |
| `cargoType`             | inteiro        | sim         | código do tipo de carga da ANTT (tabela no §4)           |
| `cargoValue`            | string decimal | não         | valor da mercadoria; base do ad valorem e do GRIS        |
| `tollAmount`            | string decimal | não         | pedágio estimado; padrão `"0"`                           |
| `shareOfVehiclePercent` | string decimal | não         | fração do veículo ocupada, `0 < x ≤ 100`; padrão `"100"` |
| `highPerformance`       | booleano       | não         | carga de alto desempenho (piso ANTT); padrão `false`     |

Resposta `200`:

```json
{
  "data": {
    "total": "4493.4600",
    "validUntil": "2026-11-22",
    "currency": "BRL"
  }
}
```

O parceiro vê **só o total e a validade**. Custo, margem e composição **não** são devolvidos. O total já respeita o piso
mínimo da ANTT vigente. Validade padrão: 7 dias corridos.

### 2.2 `POST /pickup-requests` — pedir coleta ou entrega

Cabeçalho `Idempotency-Key` obrigatório. Corpo:

| Campo                               | Tipo                          | Obrigatório | Observação                                             |
| ----------------------------------- | ----------------------------- | ----------- | ------------------------------------------------------ |
| `kind`                              | `pickup` \| `delivery`        | sim         | coleta ou entrega                                      |
| `requesterName`                     | string ≤ 120                  | sim         |                                                        |
| `requesterTaxId`                    | string (CPF/CNPJ, só dígitos) | sim         | liga o pedido ao cadastro                              |
| `requesterEmail` / `requesterPhone` | string / E.164                | um dos dois | para avisar da decisão                                 |
| `origin`, `destination`             | endereço (abaixo)             | sim         |                                                        |
| `windowStart`, `windowEnd`          | data                          | sim         | janela desejada, a partir de hoje                      |
| `cargoDescription`                  | string ≤ 500                  | sim         |                                                        |
| `volumes`                           | inteiro > 0                   | sim         |                                                        |
| `weightKg`                          | string decimal > 0            | sim         | até 3 casas                                            |
| `note`                              | string ≤ 1000                 | não         |                                                        |
| `quote`                             | `{ total, validUntil }`       | não         | cotação que o cliente aceitou                          |
| `callbackUrl`                       | URL https                     | não         | webhook deste pedido (§3); senão o cadastrado na chave |

Endereço: `street`, `number`, `complement?`, `district`, `city`, `cityIbgeCode` (7 dígitos), `state` (UF), `postalCode` (8 dígitos).

Resposta `201` (`200` se for repetição): `{ "data": { "id": "…", "status": "requested", "expiresAt": "…" } }`.

### 2.3 `GET /pickup-requests/{id}` — consultar

Devolve `id`, `status`, `kind`, janela pedida, `acceptedWindowStart/End` (quando aceito), `decisionNote` (só se recusado),
`scheduled` (a coleta já entrou numa viagem) e `expiresAt`. Pedido de outra chave responde `404`.

Estados: `requested` → `accepted` | `refused` | `canceled` | `expired` → `scheduled` → `done`.
Sem decisão em 7 dias o pedido vira `expired`.

### 2.4 `POST /pickup-requests/{id}/cancel` — cancelar

Só enquanto `requested`. Depois disso, `409 PICKUP_REQUEST_INVALID_TRANSITION`.

## 3. Aviso por webhook (opcional)

Se informado `callbackUrl`, enviamos `POST` com JSON a cada mudança relevante:

```json
{
  "event": "pickup_request.accepted",
  "id": "…",
  "status": "accepted",
  "occurredAt": "2026-11-16T12:00:00Z"
}
```

Eventos: `pickup_request.accepted`, `.refused`, `.scheduled`, `.expired`. O corpo é assinado:
`X-Signature: sha256=<hmac>` — HMAC-SHA256 do corpo cru com o segredo mostrado ao criar a chave. Responda `2xx` em até
10 s; senão repetimos com espera crescente por até 24 h. O webhook traz só o estado; **detalhes saem pelo `GET`**.

## 4. Erros

Formato: `{ "error": "CODIGO", "message": "…", "details": [{ "field": "…", "message": "…" }] }`.

| HTTP | Código                              | Quando                                                    |
| ---- | ----------------------------------- | --------------------------------------------------------- |
| 400  | `INVALID_REQUEST`                   | campo inválido ou desconhecido (lista todos em `details`) |
| 401  | `UNAUTHORIZED`                      | chave ausente, inválida ou revogada                       |
| 404  | `PICKUP_REQUEST_NOT_FOUND`          | pedido inexistente ou de outra chave                      |
| 409  | `PICKUP_REQUEST_INVALID_TRANSITION` | estado não permite a ação                                 |
| 422  | `PICKUP_REQUEST_WINDOW_INVALID`     | janela no passado ou além de 180 dias                     |
| 422  | `FREIGHT_QUOTE_FUEL_PRICE_MISSING`  | transportadora sem preço de diesel configurado            |
| 429  | `RATE_LIMITED`                      | limite por chave                                          |

## 5. Tipos de carga (`cargoType`)

Códigos da tabela de pisos mínimos da ANTT (Res. 6.084/2026):

| Código | Tipo                                 |
| ------ | ------------------------------------ |
| 1      | Granel sólido                        |
| 2      | Granel líquido                       |
| 3      | Frigorificada ou aquecida            |
| 4      | Conteinerizada                       |
| 5      | Carga geral                          |
| 6      | Neogranel                            |
| 7      | Perigosa (granel sólido)             |
| 8      | Perigosa (granel líquido)            |
| 9      | Perigosa (frigorificada ou aquecida) |
| 10     | Perigosa (conteinerizada)            |
| 11     | Perigosa (carga geral)               |
| 12     | Carga granel pressurizada            |

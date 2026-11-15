# API de integração — cotação e pedido de coleta/entrega

> **Status: spec 341, implementada e ainda não publicada em produção.** São quatro rotas, as únicas que o parceiro
> precisa. O aviso por webhook **não faz parte desta versão**: o parceiro acompanha o pedido consultando-o (§2.3).

## 1. Acesso

- **Base:** `https://<api-da-transportadora>/v1/integration` (um endereço por transportadora: cada uma tem a sua instalação).
- **Autenticação:** `Authorization: Bearer tms_…`. A chave é criada pela transportadora (`POST /v1/integration-keys`,
  permissão `settings.manage`), aparece **uma única vez** e pode ser revogada a qualquer momento. Cada chave leva só as
  capacidades marcadas na criação: `quote` (cotar) e/ou `pickup` (pedir coleta). Chave ausente, errada ou revogada
  responde o mesmo `401`; chave sem a capacidade da rota responde `403 INTEGRATION_SCOPE_FORBIDDEN`.
- **Formato:** JSON UTF-8. Dinheiro e peso são **strings decimais** (`"1234.5600"`), nunca número de ponto flutuante.
  Datas civis são `AAAA-MM-DD`; instantes são ISO 8601 em UTC.
- **Idempotência:** `POST` que cria algo exige `Idempotency-Key` (16 a 256 caracteres: letras, números, `. _ : -`). Repetir
  a mesma chave devolve o mesmo resultado, sem duplicar.
- **Limites** (por chave e por minuto, além de um teto por IP): 120 cotações, 30 criações ou cancelamentos de pedido e 120
  consultas. Passou do limite: `429 TOO_MANY_REQUESTS` com `Retry-After`. Precisa de mais? Peça à transportadora.
- **Correlação:** toda resposta traz `x-correlation-id`; informe-o ao suporte quando houver problema.

## 2. Rotas

### 2.1 `POST /freight-quotes` — cotar o frete

Endereço completo: `POST /v1/integration/freight-quotes`.

Corpo:

| Campo                   | Tipo           | Obrigatório | Observação                                                        |
| ----------------------- | -------------- | ----------- | ----------------------------------------------------------------- |
| `origin`                | endereço       | sim         | onde a carga é retirada (formato do §2.2; `postalCode` e `state`) |
| `destination`           | endereço       | sim         | onde a carga é entregue                                           |
| `axles`                 | inteiro 2–9    | sim         | eixos do conjunto (define o pedágio)                              |
| `vehicleType`           | texto          | não         | `truck` (padrão), `toco`, `three_quarter`, `vuc`, `tractor_unit`… |
| `cargoType`             | inteiro        | sim         | código do tipo de carga da ANTT (tabela no §5)                    |
| `cargoValue`            | string decimal | não         | valor da mercadoria; base do ad valorem e do GRIS                 |
| `shareOfVehiclePercent` | string decimal | não         | fração do veículo ocupada, `0 < x ≤ 100`; padrão `"100"`          |
| `highPerformance`       | booleano       | não         | carga de alto desempenho (piso ANTT); padrão `false`              |

**A distância e o pedágio não são informados por você.** A transportadora localiza os dois endereços, mede a estrada de
verdade e soma o pedágio de cada praça do caminho, pelo número de eixos, com o diesel do dia, o piso da ANTT, o ad valorem,
o GRIS e a margem. Mandar `distanceKm` ou `tollAmount` é recusado (`400`).

A cotação **nunca é estimada**. Se não der para calcular com certeza, a resposta é um erro, e não um preço aproximado:

| Situação                                              | Resposta                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| Endereço não localizado com precisão de rua ou de CEP | `422 FREIGHT_QUOTE_ADDRESS_NOT_LOCATED` (`details` diz qual)       |
| Estrada não pôde ser medida agora                     | `503 FREIGHT_QUOTE_ROUTE_UNAVAILABLE` (tente de novo)              |
| Pedágio da rota não é totalmente conhecido            | `422 FREIGHT_QUOTE_TOLL_UNKNOWN` (peça a cotação à transportadora) |
| Sem preço de diesel disponível                        | `422 FREIGHT_QUOTE_FUEL_PRICE_MISSING`                             |

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

Endereço completo: `POST /v1/integration/pickup-requests`.

Cabeçalho `Idempotency-Key` obrigatório. Corpo:

| Campo                                           | Tipo                          | Obrigatório | Observação                                |
| ----------------------------------------------- | ----------------------------- | ----------- | ----------------------------------------- |
| `kind`                                          | `pickup` \| `delivery`        | sim         | coleta ou entrega                         |
| `requesterName`                                 | string ≤ 120                  | sim         |                                           |
| `requesterTaxId`                                | string (CPF/CNPJ, só dígitos) | sim         | liga o pedido ao cadastro                 |
| `requesterEmail` / `requesterPhone`             | string / `+5516999999999`     | um dos dois | a transportadora avisa a decisão por aqui |
| `origin`, `destination`                         | endereço (abaixo)             | sim         |                                           |
| `windowStart`, `windowEnd`                      | data                          | sim         | janela desejada, a partir de hoje         |
| `cargoDescription`                              | string ≤ 500                  | sim         |                                           |
| `volumes`                                       | inteiro > 0                   | sim         |                                           |
| `weightKg`                                      | string decimal > 0            | sim         | até 3 casas                               |
| `note`                                          | string ≤ 1000                 | não         |                                           |
| `originContactName`, `destinationContactName`   | string ≤ 120                  | não         | quem atende na retirada / na entrega      |
| `originContactPhone`, `destinationContactPhone` | string (10–15 dígitos)        | não         | telefone do contato                       |
| `accessNotes`                                   | string ≤ 500                  | não         | horário e restrições de acesso            |
| `cargoValue`                                    | string decimal (`"1500.00"`)  | não         | valor da mercadoria, em reais             |
| `quote`                                         | `{ total, validUntil }`       | não         | cotação que o cliente aceitou             |

Endereço: `street`, `number`, `complement?`, `district`, `city`, `cityIbgeCode?` (7 dígitos; opcional, o escritório completa), `state` (UF), `postalCode` (8 dígitos, só números). `requesterTaxId` é CPF (11) ou CNPJ (14) só com dígitos. Campo desconhecido é recusado.

Resposta `201` (`200` se for repetição da mesma `Idempotency-Key`): o mesmo objeto do §2.3, com `status: "requested"`.

O pedido entra na mesma fila do escritório, que aceita ou recusa. Aceitar **não cria viagem**: o escritório encaixa o pedido
numa viagem depois, e só então `scheduled` fica `true`. O cliente só entra no cadastro da transportadora quando o pedido é aceito.

### 2.3 `GET /pickup-requests/{id}` — consultar

Endereço completo: `GET /v1/integration/pickup-requests/{id}`.

Devolve `id`, `status`, `kind`, janela pedida, `acceptedWindowStart/End` (quando aceito), `decisionNote` (só se recusado),
`scheduled` (a coleta já entrou numa viagem) e `expiresAt`. Pedido de outra chave responde `404`.

Estados: `requested` → `accepted` | `refused` | `canceled` | `expired` → `scheduled` → `done`.
Sem decisão em 7 dias o pedido vira `expired`.

### 2.4 `POST /pickup-requests/{id}/cancel` — cancelar

Endereço completo: `POST /v1/integration/pickup-requests/{id}/cancel`.

Só enquanto `requested`. Depois disso, `409 PICKUP_REQUEST_INVALID_TRANSITION`.

## 3. Acompanhar o pedido (sem webhook)

Nesta versão não há webhook: consulte `GET /pickup-requests/{id}`. Um pedido sem decisão por 7 dias vira `expired`; a
transportadora é lembrada após 1 dia útil. Consultar a cada poucos minutos é suficiente (limite no §1). Um webhook assinado
(`X-Signature`, HMAC-SHA256) está planejado para uma próxima versão.

## 4. Erros

Formato: `{ "error": { "code": "CODIGO", "correlationId": "…", "message": "…", "details": [{ "field": "…", "message": "…" }] } }`.

| HTTP | Código                              | Quando                                                    |
| ---- | ----------------------------------- | --------------------------------------------------------- |
| 400  | `INVALID_REQUEST`                   | campo inválido ou desconhecido (lista todos em `details`) |
| 401  | `UNAUTHORIZED`                      | chave ausente, inválida ou revogada                       |
| 403  | `INTEGRATION_SCOPE_FORBIDDEN`       | a chave não tem a capacidade desta rota                   |
| 404  | `PICKUP_REQUEST_NOT_FOUND`          | pedido inexistente ou de outra chave                      |
| 409  | `PICKUP_REQUEST_INVALID_TRANSITION` | estado não permite a ação                                 |
| 422  | `PICKUP_REQUEST_WINDOW_INVALID`     | janela no passado ou além de 180 dias                     |
| 422  | `FREIGHT_QUOTE_FUEL_PRICE_MISSING`  | transportadora sem preço de diesel configurado            |
| 429  | `TOO_MANY_REQUESTS`                 | limite por chave ou por IP; veja `Retry-After`            |

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

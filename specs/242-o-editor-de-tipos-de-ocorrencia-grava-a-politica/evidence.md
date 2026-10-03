# Evidência — spec 242

## Ordem de publicação

API primeiro é seguro: o painel atual já manda `redeliveryPolicy` em toda gravação, e o campo novo
na resposta do GET é tolerado por `toOccurrenceType` (`tripResponse.validation.ts`).

## Vermelho (antes da correção)

Contrato — `cd apps/api-transportada && bun --env-file=../../.env.test test ./test/trip-occurrence.contract.test.ts`:

```text
(fail) o cadastro do tipo aceita "redeliveryPolicy" (spec 242) > allowed é aceito e chega ao resultado
(fail) o cadastro do tipo aceita "redeliveryPolicy" (spec 242) > blocked é aceito e chega ao resultado
(fail) o cadastro do tipo aceita "redeliveryPolicy" (spec 242) > unset é aceito e chega ao resultado
(fail) PUT /company-settings/occurrence-types com o corpo do painel (spec 242) > 200 e o campo chega ao caso de uso
 326 pass
 4 fail
```

(causa: `ApiError` 400 `INVALID_REQUEST` vindo de `parseAgainstSchema`.)

Integração — `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-redelivery-policy.integration.ts`:

```text
error: expect(received).toBe(expected)
Expected: "allowed"
Received: undefined
(fail) "redeliveryPolicy" do tipo de ocorrência contra o Postgres (spec 242) > grava, ausente não altera, e o GET devolve o campo
error: expect(received).toBe(expected)
Expected: "unset"
Received: undefined
(fail) "redeliveryPolicy" do tipo de ocorrência contra o Postgres (spec 242) > criação sem o campo usa o padrão da coluna (unset)
 0 pass
 2 fail
```

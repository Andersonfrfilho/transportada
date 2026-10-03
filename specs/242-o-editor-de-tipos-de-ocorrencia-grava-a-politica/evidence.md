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

## Verde e mutações

Após a correção: contrato `trip-occurrence.contract.test.ts` 330 pass / 0 fail; integração nova 2 pass / 0 fail.

Mutações (cada uma com o arquivo restaurado por `git checkout` e verde depois):

- (a) retirar `redeliveryPolicy` do schema: contrato `326 pass / 4 fail` (`allowed`/`blocked`/`unset` aceitos e a rota PUT com 400).
- (b) voltar `redeliveryPolicy: input.redeliveryPolicy ?? 'unset'` em `values`:
  `Expected: "allowed" / Received: "unset"`, integração `1 pass / 1 fail`.
- (c) tirar a coluna do `select` de `listOccurrenceTypes`:
  `Expected: "allowed" / Received: undefined` e `Expected: "unset" / Received: undefined`, integração `0 pass / 2 fail`.

Sem migration: `git diff --stat origin/main` não toca `apps/api-transportada/drizzle` nem `src/database`.

## Gates

- `bun run typecheck` (raiz): limpo nas sete apps.
- `bun run format:check`: limpo.
- API, `bun --env-file=../../.env.test test --timeout 120000`: 8555 pass / 23 skip / 0 fail (192 arquivos).
- Integração `occurrence-type-{redelivery-policy,leaves-document-behind,catalog-seed}`: 7 pass / 0 fail / 0 skip (Postgres de teste).
- Painel, `bun run --cwd apps/frontend-transportada test`: 6328 pass / 0 fail (+ 280 pass / 0 fail na segunda suíte).
- `frontend-driver` usa `/me/trips/current/occurrence-types`, outra rota; `frontend-client` não lê esta.

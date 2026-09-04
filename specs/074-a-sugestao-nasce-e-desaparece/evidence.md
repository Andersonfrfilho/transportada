# Evidência — 074

## T001 — O teste que reprova o código atual (2026-09-02)

Acrescentado a `test/integration/multi-vehicle-suggestion.integration.ts`, que já rodava contra
Postgres e já estava na lista — mas exercitava só o **aceite**, com a sugestão semeada por `insert`
direto (linha 287). `create` nunca era chamado ali.

Contra o código de antes:

```
error: multi vehicle suggestion vanished after insert
  at drizzle-multi-vehicle-suggestion.repository.ts:70:41
2 pass · 1 fail
```

Os dois testes do aceite continuaram passando. Só a criação falhava — que é exatamente o recorte do
defeito.

## T003 — A correção

`createDrizzleRouteSuggestionRepository(transaction)`, dentro da transação, no lugar do repositório
construído com a conexão de fora. `3 pass · 0 fail`.

## T005 — O erro tipado, e a volta atrás no desenho

Os dois `throw new Error(...)` viraram `MultiVehicleSuggestionWriteFailedError`.

⚠️ **A primeira versão dela estendia `ApiError` com status 500 — e estava errada.** Assim a mensagem
viajaria **na resposta ao cliente**, que é o que a `security.md` §3 proíbe. Ela passou a ser um erro
comum, para cair no ramo de erro desconhecido: 500 genérico ao cliente, mensagem no log do servidor.

## T006/T007 — O log, e a política que me corrigiu

O descritor omitia **toda** mensagem, com o comentário dizendo _"nunca a mensagem, o stack ou
parâmetro de query"_.

Minha primeira implementação passou a logar a mensagem de **qualquer** `Error`. Três contratos
existentes reprovaram, e estavam certos:

- `digital-certificates-http/idempotency-and-errors.contract.ts` monta
  `new Error('pfx password envelope keyId fingerprint cnpj private-provider')` e exige que **nenhuma**
  dessas palavras alcance o log;
- `fleet-infrastructure/fipe-catalog-gateway.contract.ts` fixa a metadata por `toEqual`;
- `http.contract.test.ts` guarda o 500 seguro da autenticação.

A política não era omissão: mensagem de erro arbitrário pode carregar segredo. **A regra passou a ser
nominal:** só `DiagnosableError` (`src/shared/diagnosable.error.ts`) tem a mensagem registrada.
Herdar dela é uma afirmação de quem escreve — "esta mensagem é minha e não interpola dado".

Com isso, os três contratos passam **sem alteração**, porque todos usam `Error` comum.

Contrato novo em `test/observability/error-descriptor-message.contract.ts`, cinco casos: a mensagem
marcada entra; a de `Error` comum não; a do Postgres não; a de um `DiagnosableError` que **envolve**
erro do Postgres também não (a causa aninhada vence); e não-`Error` não quebra.

## T009 — A borda que estava atrás do 500

Nota já vinculada a viagem responde **409** com o id no `details`. A recusa existia no caso de uso e
era inalcançável na prática: toda chamada morria antes. `4 pass · 0 fail`.

## Suíte

```
bun test (API)   3896 pass · 23 skip · 0 fail · 15026 expect()
integração       4 pass · 0 fail  (multi-vehicle)
```

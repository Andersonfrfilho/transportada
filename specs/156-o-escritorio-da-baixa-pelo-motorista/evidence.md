# Spec 156 — Evidências

## T1

Arquivos alterados:

- `apps/frontend-transportada/src/modules/trip/shared/tripStatus.service.ts` — `canReturnDocuments`
  passou a delegar para `isTripDispatched` (que já inclui `on_delivery_route`), excluindo
  `completed` (terminal), em vez de aceitar só `dispatched`/`in_transit` na mão.
- `apps/frontend-transportada/test/trip/trip.fixture.ts` — `TripStatusContract` ganhou
  `on_delivery_route`.
- `apps/frontend-transportada/test/trip/state-gates.contract.ts` — nova linha em
  `GATES_BY_STATUS` para `on_delivery_route` (`editable: false, return: true, separateOrLoad:
false`), exercitada pelo teste já existente `every trip status opens exactly the gates the
domain opens` (e, por composição, por `delivering opens exactly where returning opens`, já que
  `canDeliverDocuments` delega em `canReturnDocuments`).

Nenhum arquivo de teste novo — os dois arquivos de teste tocados já estavam na lista de
`test/trip.contract.test.ts` (via import), que já consta no `package.json` da app.

### Teste falhando antes da correção

Comando: `bun test test/trip.contract.test.ts` (dentro de `apps/frontend-transportada`), com a
regra antiga (`status === 'dispatched' || status === 'in_transit'`) e a fixture/gate já
alterados para exigir `on_delivery_route`:

```
test/trip.contract.test.ts:
55 |           separateOrLoad: canSeparateOrLoadDocuments(status as TripStatusContract),
56 |         },
57 |       ]),
58 |     )
59 |
60 |     expect(actual).toEqual(GATES_BY_STATUS)
                        ^
error: expect(received).toEqual(expected)

@@ -33,3 +33,3 @@
      "editable": false,
-     "return": true,
+     "return": false,
      "separateOrLoad": false,

- Expected  - 1
+ Received  + 1

      at <anonymous> (.../test/trip/state-gates.contract.ts:60:20)
(fail) trip state gates mirror the backend transition policy > every trip status opens exactly the gates the domain opens [1.81ms]

 903 pass
 1 fail
 17708 expect() calls
Ran 904 tests across 1 file. [582.00ms]
```

### Teste passando depois da correção

Mesmo comando, após trocar `canReturnDocuments` para `isTripDispatched(status) && status !==
'completed'`:

```
bun test v1.3.14 (0d9b296a)

 904 pass
 0 fail
 17708 expect() calls
Ran 904 tests across 1 file. [548.00ms]
```

### Gates (raiz do monorepo)

- `bun run typecheck` → exit 0, `0` ocorrências de "error" no log (6 subprojetos: api, worker,
  cron, frontend-transportada, frontend-client, frontend-landing — todos `tsc --noEmit` limpo).
- `bun run lint` → exit 0, `0` ocorrências de "error" no log (mesmos 6 subprojetos, `eslint
--max-warnings=0`).
- `bun run --cwd apps/frontend-transportada test` → exit 0, `4237 pass`, `0 fail`, `36833
expect() calls`, 29 arquivos de teste. (Avisos de `standardFontDataUrl` do pdf.js em
  `document-intake.contract.test.ts` são pré-existentes, não relacionados a esta task.)

### Nada estranho encontrado

A política da API (`checkTripAcceptsDocumentWork`) já cobria `on_delivery_route` desde que a
lista `TRIP_DISPATCHED_STATUSES`/`isTripDispatched` foi centralizada — o frontend apenas nunca
foi atualizado para delegar a ela em vez de repetir a condição à mão. `canDeliverDocuments` já
delegava corretamente em `canReturnDocuments`, então corrigir uma função corrigiu as duas, como o
comentário da função já previa.

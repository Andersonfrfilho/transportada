# 047 — Evidências

## T001 — Contrato do formulário de zona

Vermelho registrado antes da implementação:

```
error: Cannot find module '../../src/modules/fleet/shared/freightRegionForm.service'
 0 pass · 1 fail · 1 error
```

Verde depois de `shared/freightRegionForm.service.ts` e `shared/regionCityName.service.ts`:

```
bun test ./test/fleet/freight-region-form.contract.ts
 11 pass · 0 fail · 17 expect() calls
```

Suíte da frota inteira e typecheck da app:

```
bun run typecheck                      → tsc --noEmit, sem saída
bun test ./test/fleet.contract.test.ts → 220 pass · 0 fail · 3339 expect() calls
```

O contrato fixa o que a tela **não** manda para a API: célula vazia e célula zerada não viram linha
de preço — a mesma regra do parser de importação (`if (Number(value) === 0) continue`), que é o que
faz a coluna UTILITÁRIO da tabela real do cliente ficar fora do banco em vez de entrar como viagem
de graça. E fixa que o corpo tem exatamente `cities`, `code`, `name`, `rates`: o `strict()` de
`createRegionSchema` recusa qualquer chave a mais, e `status`/`expectedVersion` só existem no `PUT`.

## T002 — Cliente HTTP

**Vermelho** — `bun test ./test/fleet/freight-region-write.contract.ts`

```
TypeError: client.importFreightRegions is not a function.
 0 pass
 6 fail
```

**Verde** — mesmo comando

```
 6 pass
 0 fail
 16 expect() calls
```

**Suíte da frota** — `bun test ./test/fleet.contract.test.ts`

```
 226 pass
 0 fail
 3355 expect() calls
```

**Typecheck** — `bun run typecheck` (`tsc --noEmit`) sem saída.
**Lint** — `bun run lint` (`eslint .`) sem achado.
**Formato** — `bun run format:check` na raiz: _All matched files use Prettier code style!_

### O que a implementação obrigou a mexer

- `authorizedRequest` passou a aceitar `DELETE`, e `requestJson` ganhou o caminho de **corpo
  vazio**: `DELETE /freight-regions/{id}` responde `204` com `new Response(null, …)`, e o
  `JSON.parse` incondicional derrubava o apagar que tinha dado certo. Corpo vazio com resposta
  não-ok continua sendo `FLEET_REQUEST_FAILED`.
- `freightRegionFromApi` e `freightRegionImportSummaryFromApi` entraram em
  `fleetResponse.validation.ts`; o resumo é guardado por `hasOnlyKeys`/`hasEveryKey` mais
  `isUnsignedIntegerNumber`, então `{created: '29'}` é recusado como `FLEET_RESPONSE_INVALID`.
- `expectedVersion` e `status` só saem no `PUT`. O `POST` manda exatamente
  `['cities','code','name','rates']` — o `strict()` da rota recusaria o resto.

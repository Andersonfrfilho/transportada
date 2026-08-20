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

# Evidência 101 — O roteiro proposto diz quanto rende

Plano ultragoal: `.omc/ultragoal/plans/spec-101/`.

## Por task

| task | evidência                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | `valuationOf` → `buildValuationFromContext` (`read-trip-valuation.use-case.ts:309`), dois call sites internos. Sem mudança de comportamento; nenhum teste alterado. |
| T2   | `routing/domain/suggestion-valuation.policy.ts`, puro. 10 testes. Contrato escrito **antes**, verificado falhando por ausência do módulo.                           |
| T3   | `readVehicleRoads` + `suggestion-vehicle-road.query.ts`. Contrato de isolamento compila o SQL e afirma `company_id`, `suggestion_id` e `vehicle_id is not null`.    |
| T4   | `read-suggestion-valuation.use-case.ts` + `GET /route-suggestions/:id/valuation` (`trip.financials`). 6 testes, incluindo a guarda da D1.                           |
| T5   | `TOLL_NOT_AVAILABLE_IN_SUGGESTION` + `tollUnavailableReason`. 3 testes.                                                                                             |
| T6   | Serviço, validação, query e `SuggestionVehicleValuation.component.tsx`. 12 testes.                                                                                  |
| T7   | `SuggestionValuationReport.component.tsx`. 7 testes de tela, por texto de fonte.                                                                                    |
| T8   | Rótulos pt/en em `routing`, `trip` e `tripFinancials`.                                                                                                              |

## Gates

```
apps/api-transportada     bun run typecheck   limpo
apps/api-transportada     bunx eslint         limpo
apps/api-transportada     bun test            4814 pass · 0 fail · 23 skip
apps/frontend-transportada bun run typecheck  limpo
apps/frontend-transportada bunx eslint        limpo (nos caminhos tocados)
apps/frontend-transportada bun run test       3079 pass · 0 fail
raiz                      bunx prettier --check .   limpo
```

## Defeitos que os contratos e o typecheck pegaram

1. **T2** — o helper de teste usava `?? 1_000`, então o `null` explícito (o caso sob teste) virava
   1000 calado. O teste afirmava o oposto do que o nome dele dizia.
2. **T3/T4** — o typecheck apontou três duplos de teste incompletos assim que a porta ganhou método,
   e a composição errada do adaptador (`findApplicableRule` faltando).
3. **T5** — `valuation-gap-labels.contract.ts` ficou vermelho na hora, cobrando os quatro rótulos.
4. **T8** — a chave de plural estava como `deliveries`; o i18next 25 resolve por `_one`/`_other`, e
   a chave sem sufixo **não é consumida** — a tela mostraria o nome da chave.

## Desvios do plano, e por quê

- **T3 ficou menor.** `readGroups` já entregava notas, motorista e ordem por veículo com `company_id`
  no `where`. Escrever repositório paralelo criaria uma segunda verdade sobre o mesmo agrupamento.
- **A guarda da D1 virou estrutural.** A porta não expõe geometria: a decisão passou a ser visível em
  revisão, não só afirmada por teste.
- **`buildValuationSteps` não subiu** para `modules/shared/` (decisão aberta na T7): o relatório tem
  forma própria — totais do conjunto, não parcelas —, e mover o serviço seria mexer em código alheio
  sem consumidor novo.

## ⚠️ `make check` está vermelho, por causa alheia a esta feature

`format:check` **passou** depois de `.claude/worktrees` entrar no `.prettierignore`: aquele diretório
já é ignorado pelo git (`.git/info/exclude`) e 103 arquivos de um worktree obsoleto reprovavam o gate
do repositório inteiro.

`lint` continua reprovando com **três erros pré-existentes**, todos em arquivos commitados em
`a1d5dda2` e nenhum tocado por esta feature:

| arquivo                                             | erro                                           |
| --------------------------------------------------- | ---------------------------------------------- |
| `fleet/components/DriverHomeMap.component.tsx:11`   | `resolveBasemapOutline` importado e não usado  |
| `shared/vectorBasemap.service.ts:13`                | `import/no-unresolved` — regra não configurada |
| `test/fleet/driver-home-coordinates.contract.ts:31` | `async` sem `await`                            |

Não os corrigi: o primeiro pode estar **mascarando uma feature incompleta** — alguém importou a
função e não a usou —, e apagar o import esconderia isso em vez de resolver. O terceiro é config de
eslint, não código. Corrigir por conta própria seria mexer em trabalho de outra pessoa sem saber a
intenção dela.

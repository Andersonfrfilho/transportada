# Tasks

> 🤖 Modelo: `sonnet` — mudança de tela pequena, sem task 🧠.

## Fase 1 — O selo na lista de opções

- [x] T001 Contrato de `resolveRouteOptionSummaries` com `isNoToll` — `test/trip/assembly-route-options.contract.ts` (CA01, CA03)
- [x] T002 `isNoToll` em `RouteOptionSummary` — `src/modules/trip/shared/assemblyRouteOptions.service.ts` (RF1)
- [x] T003 Selo `sem pedágio` na lista e textos pt/en — `TripAssemblyMap.component.tsx`, `trip.locale.json`, `trip.en.locale.json` (RF2, RF3, RF6, CA02)

## Fase 2 — A frase do bloco de pedágio

- [x] T004 Contrato de render — `test/trip/route-toll-no-toll-route.contract.tsx`, entrada no `package.json` e em `test/trip.contract.test.ts` (CA04, CA05, CA06)
- [x] T005 `isNoTollRoute` em `RouteTollSummary` e nos dois chamadores, com os textos pt/en — `RouteTollSummary.component.tsx`, `TripAssemblyMap.component.tsx`, `TripRouteMap.component.tsx`, locales (RF4, RF5, RF6)

## Fase 3 — Fechamento

- [x] T006 Gates (`lint`, `typecheck`, testes do frontend) e evidência em `evidence.md`
- [x] T007 Revisão de design e usabilidade da caixa de opções, com print da tela (web.md §15)

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos
arquivos. Marque como concluída apenas após registrar evidência.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/165-rotulo-da-rota-sem-pedagio/ (leia spec.md,
plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 1 e 2 → executor model=sonnet · revisão final → code-reviewer model=opus.
Cada task fecha com typecheck + testes do frontend + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```

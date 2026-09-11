# Tarefas — spec 129

> 🤖 Modelo: `sonnet` em todas — sem task 🧠.

- [x] T1 — `TripCostParcelBasis['driver'].tie` (API), cru, opcional.
- [x] T2 — `trip-driver-cost.policy.ts`: `buildTieBasis` + `tieDriverNameDetail`; `buildRateDetail`
      sem o ramo de empate.
- [x] T3 — Atualizar `driver-route-tie.contract.ts` e `driver-route-vote.contract.ts` (API) para o
      dado cru.
- [x] T4 — `tripCostParcelDetail.service.ts` (frontend), `composeCostParcelDetail`.
- [x] T5 — `ValuationLedger.component.tsx` e `SuggestionVehicleValuation.component.tsx` usam o
      serviço compartilhado.
- [x] T6 — `TripValuationCostParcelBasis`/`readBasis` (frontend) leem `tie`.
- [x] T7 — Locale pt/en: `ledger.tieCityCount_one/_other`, `ledger.tieNoPrice`.
- [x] T8 — Novo contrato `driver-route-tie-detail.contract.ts` (pt/en + fallback ao texto cru).
- [x] T9 — `bun run typecheck` nas duas apps; `bun test` das suítes afetadas.
- [ ] T10 — `make check` na raiz do worktree; publicar se verde.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/129-empate-de-rota-dado-cru/ (leia spec.md, plan.md
e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: todas as fases → executor model=sonnet.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```

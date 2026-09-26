# Evidence — Spec 193 (o comprovante diz quem recebeu)

Sessão de 2026-09-25, branch `work/driver-app`, worktree `pensive-borg-f59971`. Rodada 1: Fases 1,
2 e 3 (inclusive a T3.1). A Fase 4 fica para a próxima rodada.

## Ordem 193 → 194 invertida (decisão do orquestrador)

O `tasks.md` e o `plan.md` pedem P0, depois a 194 fases 1–3, e só então a Fase 4 da 193. Nesta
rodada a ordem entre 193 e 194 foi **invertida por decisão do orquestrador, a pedido do usuário, que
quer ver o select**. O P0 já está na branch (spec 203, commit `1e512a9b9`, "o attach nunca
descarta"). Consequência combinada: a 194 faz rebase sobre a 193 e, se as migrations de
`trip_delivery_proofs` colidirem, **quem chega depois regenera a sua** (`db:generate` → `no_changes`).
A T4.0 (P0 e 194 em `origin/staging`) fica para a próxima rodada.

## Fase 1 — A fila no cabeçalho

### T1.1 — testes antes (vistos falhar)

Arquivos: `apps/frontend-driver/test/driver-trip/queue-header.contract.ts` (importado em
`test/driver-trip.contract.test.ts`) e o caso novo em `test/shared/touch-target.contract.ts`.

```
$ bun test ./test/driver-trip/queue-header.contract.ts ./test/shared/touch-target.contract.ts
SyntaxError: Export named 'formatQueueBadge' not found in module '.../pendingQueue.service.ts'.
(fail) alvo de toque ... > o botão da fila no cabeçalho tem o alvo do sino (spec 193 D13)
 3 pass, 2 fail, 1 error

$ bun test test/driver-trip.contract.test.ts test/shared.contract.test.ts
 60 pass, 2 fail, 1 error   (o import quebrado derruba o entrypoint inteiro do driver-trip)
```

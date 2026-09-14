# Spec 138 — Evidência

## Testes

```
bun run --cwd apps/frontend-transportada test
```

3316 pass / 0 fail (33648 expect() calls), incluindo os testes novos e alterados de
`test/trip/proposal-actions.contract.ts` e `test/suggestion-valuation/response.contract.ts`.

## Typecheck

```
bun run --cwd apps/frontend-transportada typecheck
```

`tsc --noEmit` — sem erros.

## Lint

```
bun run lint
```

Limpo nas seis apps (`api-transportada`, `worker-transportada`, `cron-transportada`,
`frontend-transportada`, `frontend-client`, `frontend-landing`).

## Formatação

```
bun run format:check
```

"All matched files use Prettier code style!"

## Gate completo

```
make check
```

`[exited with code 0]` — format, lint, typecheck, testes (todas as apps) e build passaram.
`frontend-transportada`: 3316 pass / 0 fail. Aviso pré-existente do Vite sobre chunk >500 kB
(`pdf.worker.min` 1,26 MB) não é desta spec.

## Contrato de `formatDuration` (spec 138)

- `29h47` (107 220 s) → `"1 d 5 h 47 min"`
- `5h47` (20 820 s) → `"5 h 47 min"`
- `0` → `"0min"` (saída de sempre, preservada)
- `48h00` (172 800 s) → `"2 d"`
- `2d 0h 3min` (172 980 s) → `"2 d 3 min"` (hora zerada no meio omitida)

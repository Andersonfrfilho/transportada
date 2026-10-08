# Evidência — 257

## T0.1 / T1.1

- Spec 102 (cancelar libera) e 249 (molde) conferidas contra o código: `markCancelled` é o único caminho de cancelamento e libera tudo com `delivered_at is null`.
- `TRIP_STATUSES_BEFORE_DISPATCH` deixou de derivar de `checkTripAcceptsLinkage`; `checkTripAcceptsLinkageAfterDispatch` é a janela D1.
- `bun test ./test/trip-domain.contract.test.ts` → 518 pass / 0 fail; `bun run typecheck` limpo.

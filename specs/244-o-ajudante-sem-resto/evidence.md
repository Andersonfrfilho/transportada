# Evidência — Spec 244

## T1 — `pendingProofs` vazio sem `trip.report` (D2)

- Regra no caso de uso: `findCurrentDriverTrip` recebe `canReportProofs` (ausente = `true`, preserva os outros chamadores);
  com `false` o repositório de pendências nem é consultado. A rota `GET /me/trips/current` calcula o booleano de
  `context.scope.permissions.has('trip.report')`.
- Contrato vermelho antes do código (3 falhas), verde depois: `test/driver-trip/current-trip.contract.ts` (caso de uso) e
  `test/driver-trip/me-routes.contract.ts` (ajudante → `false`, motorista → `true`).
- Integração em Postgres 18 nativo descartável: `test/integration/me-trip.integration.ts` — quem entregou como motorista e
  só tem `trip.read` recebe `[]`; com `trip.report` recebe a fila; viagens iguais nos dois casos.
- Mutação: `shouldListPendingProofs = true` e `canReportProofs: true` fixos → 2 falhas no contrato e 1 na integração;
  restaurado, `cmp` idêntico.
- Contrato completo da API: 9299 pass / 0 fail. Integrações me-trip, me-trip-departure e
  current-driver-trip-concluded-window: 37 pass / 0 fail / 0 skip.

## T2 — O cartão de consentimento some com 403 (D1)

- `useLocationConsent` expõe `isApplicable`: `false` quando a leitura responde 403 (sem retry); `setConsent` vira no-op e
  `isFailed` não acende. Erro de rede e 5xx seguem como antes. `DriverLocationConsentCard` devolve `null` sem `isApplicable`.
  O `useSyncExternalStore` do hook ganhou o `getServerSnapshot` (necessário para o contrato renderizar no servidor).
- Contrato `apps/frontend-driver/test/driver-trip/location-consent-applicability.contract.tsx` (na lista
  `driver-trip.contract.test.ts`), por `renderToStaticMarkup` sobre um `QueryClient` com a leitura já resolvida:
  403 → HTML vazio, hook `isApplicable: false` e zero mutações; consentimento lido → cartão com o interruptor;
  500 e falha de rede → cartão com `role="alert"` e o texto de `loadFailed`.
- Mutação: `isApplicable = true` fixo → 2 falhas (cartão e hook); sem o `return null` do cartão → 1 falha; sem o
  `return` de `setConsent` → 1 falha. Restaurado, `cmp` idêntico.
- `bun run test` da app: 1198 pass / 0 fail.

## T3 — O zero vive nos três campos de diária (D3)

- Conversor novo `toTypedAmountKeepingZero` em `apps/frontend-transportada/src/modules/shared/decimalAmount.service.ts`
  (`0.0000` → `0,00`; o resto delega a `toTypedAmount`). Usado só em `helperDailyRate` e `dailyAllowanceAmount`
  (`fleetForm.service.ts`) e na diária geral (`crewSettingsForm.service.ts`). `toTypedAmount` não mudou.
- `parseTypedAmount` já aceitava zero: `0`, `0,0` e `0,00` → `0.0000`; vazio segue `null` (nenhuma correção no parse).
- Contratos: `test/shared/decimal-amount.contract.ts` (conversor; `toTypedAmount` continua `''` para zero),
  `test/fleet/driver-daily-allowance.contract.ts` (ficha: `0.0000` → `0,00` → corpo `0.0000`; `0`/`0,0`/`0,00`; vazio `null`;
  positivo inalterado) e `test/fleet/driver-crew-settings-panel.contract.tsx` (diária geral). Vermelhos antes do código.
- Mutação: conversor sem a linha do zero → 3 falhas; restaurado, `cmp` idêntico.
- `bun run test` do painel: 6672 pass / 0 fail.

# Spec 157 — Evidência

## T1 — ADR-0068

Arquivo `docs/adr/0068-a-foto-obrigatoria-do-motorista-pesa-na-nota.md` já existia no worktree antes
desta sessão (aceita, cita ADR-0057 e ADR-0067 §5 emenda 2). Marcada como concluída junto do commit
da T2.

## T2 — `classifyProofPunctuality`

Arquivos:

- `apps/api-transportada/src/trips/domain/delivery-proof-punctuality.policy.ts` (novo)
- `apps/api-transportada/test/trip-delivery-proof/punctuality.contract.ts` (novo, 13 casos)
- `apps/api-transportada/test/trip-delivery-proof.contract.test.ts` (import adicionado)

Assinaturas exportadas: `PROOF_PUNCTUALITY` (const object), `ProofPunctuality`, `ProofPosition`,
`ClassifyProofPunctualityParams`, `classifyProofPunctuality(params): ProofPunctuality`.

Comandos e resultado:

```
$ bun run typecheck                                            # raiz, todas as apps — 0 erros
$ bun run lint                                                  # raiz, todas as apps — 0 erros
$ bun test ./test/trip-delivery-proof.contract.test.ts
 57 pass / 0 fail / 80 expect() calls
```

Casos cobertos: aceite 3 (100 m/10 min → on_time), aceite 4 (2h → late; 2 km → away; sem posição →
away), combinação `late_and_away`, `capturedAt` no futuro e antes da entrega (ambos limitados pela
folga de 2 min de `field-delivery-timing.policy.ts`), parada sem coordenada usa o evento, sem
referência nenhuma de local a distância não julga, precisão soma ao raio, `not_required` para
`optional`/`off`.

## T3 — `computeDriverScore`

Arquivos:

- `apps/api-transportada/src/fleet/domain/driver-score.policy.ts` (novo)
- `apps/api-transportada/test/fleet-domain/driver-score.contract.ts` (novo, 8 casos)
- `apps/api-transportada/test/fleet-domain.contract.test.ts` (import adicionado)

Assinaturas exportadas: `DRIVER_SCORE_WINDOW_DAYS = 90`, `DRIVER_SCORE_MAXIMUM = 100`,
`DRIVER_PENALTY_REASON` (const object), `DriverPenaltyReason`, `DriverScoreSettings`,
`DriverScoreDelivery`, `DriverPenalty`, `ComputeDriverScoreParams`, `DriverScoreResult`,
`computeDriverScore(params): DriverScoreResult`.

Comandos e resultado:

```
$ bun run typecheck                                            # raiz, todas as apps — 0 erros
$ bun run lint                                                  # raiz, todas as apps — 0 erros
$ bun test ./test/fleet-domain.contract.test.ts
 107 pass / 0 fail / 300 expect() calls
```

Casos cobertos: aceite 5 (late 5 + ausente 25h 10 → 85), ausente dentro do prazo não penaliza (sem
penalidade, nota 100), fora da janela de 90 dias não conta (`null`), sem nenhuma entrega avaliável
(`null`), nota nunca abaixo de 0, penalidade única por entrega mesmo com `late_and_away`, modo atual
`optional` não penaliza ausência (configuração mudou depois da entrega), foto `on_time`/`not_required`
não penaliza.

## Suíte completa da API (gate de regressão)

```
$ bun run --cwd apps/api-transportada test
 6521 pass / 32 skip / 0 fail / 22681 expect() calls — 180 arquivos
```

## Desvios da spec

Nenhum. `classifyProofPunctuality` e `computeDriverScore` seguem exatamente as assinaturas e regras
descritas no `plan.md` (RF4-RF9). Tipos ficaram inline no próprio `.policy.ts` (sem `.types.ts`
separado) — é o padrão da maioria dos arquivos de `trips/domain/` e `fleet/domain/` hoje
(`daily-allowance.policy.ts`, `delivery-proof-settings.policy.ts`, `driver-home-geocoding.policy.ts`),
reservando `.types.ts` só para módulos com tipos muito extensos (`cargo-layout-hash.types.ts`).

T4 em diante (migration, `/proof`, `/deliver`, snapshot, consulta da nota, rotas da frota, telas) não
fazem parte desta sessão.

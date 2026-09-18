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

## T4 — Migration aditiva + settings

Arquivos:

- `apps/api-transportada/src/database/trip.schema.ts` — `tripDeliveryProofs` ganha `latitude`,
  `longitude` (numeric 10,7), `accuracyMeters` (numeric 10,2), `capturedAt` (timestamptz), todos
  nulos, e `punctuality varchar(16) not null default 'not_required'` com CHECK contra
  `TRIP_DELIVERY_PROOF_PUNCTUALITIES` (nova const, duplicada de `PROOF_PUNCTUALITY` do domínio pelo
  mesmo motivo de `TRIP_FIELD_CHANNELS` — importar `trips/domain` no schema puxaria a árvore do
  módulo para dentro do fechamento de imports do pre-deploy). CHECKs de par de coordenada e faixa
  (-90..90/-180..180), mesmo molde de `trip_stops`.
- `apps/api-transportada/src/database/company-delivery-proof-settings.schema.ts` —
  `companyDeliveryProofSettings` ganha `proofWindowMinutes` (int, padrão 60, CHECK 5–1440),
  `proofRadiusMeters` (padrão 300, CHECK 50–5000), `latePenaltyPoints` (padrão 5, CHECK 0–100),
  `missingPenaltyPoints` (padrão 10, CHECK 0–100), `missingAfterHours` (padrão 24, CHECK 1–168).
  `deliveryProofSettingOverrides` **não** ganhou esses campos, como pedido.
- `apps/api-transportada/drizzle/20260918105116_delivery_proof_punctuality/` (novo) —
  `migration.sql` gerado por `bun run db:generate --name delivery_proof_punctuality`,
  `rollback.sql` escrito à mão (sem guarda de dado: migration puramente aditiva, nenhum dado de
  negócio depende das colunas novas), `snapshot.json` gerado junto.
- `apps/api-transportada/src/trips/domain/delivery-proof-settings.policy.ts` — `DeliveryProofFieldSettings`
  intacto; novo `DeliveryProofPunctualitySettings` (os cinco parâmetros) +
  `DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS`, e `CompanyDeliveryProofSettings` (os dois tipos
  combinados) + `DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS` para a configuração geral.
- `apps/api-transportada/src/trips/presentation/delivery-proof-settings.schema.ts` — novo
  `deliveryProofPunctualitySettingsSchema` (faixas do painel, `int().min().max()`) e
  `companyDeliveryProofSettingsSchema` (os quatro modos + os cinco parâmetros, `.strict()`); o
  schema de exceções continua só com `deliveryProofSettingsSchema` (os quatro modos).
- `apps/api-transportada/src/trips/infrastructure/drizzle-delivery-proof-settings.repository.ts` —
  `readSettings`/`saveSettings` leem/gravam os nove campos da configuração geral; ausência de linha
  cai em `DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS`. `listOverrides`/`replaceOverrides` inalterados.
- `apps/api-transportada/src/trips/presentation/delivery-proof-settings.routes.ts` — `GET`/`PUT
/company-settings/delivery-proof` tipados em `CompanyDeliveryProofSettings`, `PUT` valida com
  `companyDeliveryProofSettingsSchema`.
- `apps/api-transportada/test/trip-delivery-proof/punctuality-settings.contract.ts` (novo, 9 casos):
  defaults por `GET` sem linha, round-trip `PUT`→`GET`, faixa de cada um dos cinco campos (400 fora),
  inteiro não aceita fração, corpo de exceção continua recusando os campos de pontualidade.
- `apps/api-transportada/test/trip-delivery-proof.contract.test.ts` — import do arquivo acima.
- `apps/api-transportada/test/database-migration/static-migration.contract.ts` — lista estática de
  diretórios de migration ganhou `20260918105116_delivery_proof_punctuality`.

Comandos e resultado:

```
$ bun run db:generate --name delivery_proof_punctuality   # apps/api-transportada
{"status":"ok", ...}
$ bun run db:check                                        # apps/api-transportada
Everything's fine
$ bun run typecheck                                        # raiz, todas as apps — 0 erros
$ bun run lint                                              # raiz, todas as apps — 0 erros
$ bun test ./test/trip-delivery-proof.contract.test.ts     # apps/api-transportada
 65 pass / 0 fail / 99 expect() calls
$ bun test                                                  # apps/api-transportada, suíte completa
 6529 pass / 32 skip / 0 fail / 22700 expect() calls — 180 arquivos
$ make migration-test                                       # raiz — contra o Postgres do docker-compose (transportada-local-postgres-1, saudável)
 97 pass / 0 fail / 1368 expect() calls — inclui a migration nova aplicada em `database-migration.contract.test.ts`
```

Banco usado na integração: Postgres do `docker-compose.yml` da raiz (`transportada-local-postgres-1`,
porta 65432), já saudável neste worktree — não foi preciso o contorno do Postgres Homebrew descrito
no prompt. Nenhum teste pulou.

Desvio da spec: nenhum. `TRIP_DELIVERY_PROOF_PUNCTUALITIES` duplica os valores de `PROOF_PUNCTUALITY`
(T2) em vez de importar — decisão de camada preexistente no arquivo (ver comentário de
`TRIP_FIELD_CHANNELS`), não um desvio do RF4.

# Evidência — Spec 215

## Fase A (2026-09-26)

Branch `work/spec-215-fase-a`, a partir de `origin/staging` (`5a8019e8c`).

### T1 — o contrato que reprova a volta das colunas

`apps/api-transportada/test/trip-schema/dead-coordinate-columns.contract.ts`, importado pelo
entrypoint `test/trip-schema.contract.test.ts` (já na lista do `package.json`). Vermelho antes da T2,
como manda o TDD:

```text
Expected to not contain: "latitude"
Received: [ …, "latitude", "longitude", "geocoding_precision", … ]
(fail) trip_stops esqueceu as colunas de coordenada mortas (spec 215 CA2)
 7921 pass / 23 skip / 1 fail
```

### T2 — o schema esquece as colunas

- `src/database/trip.schema.ts`: saíram `latitude`, `longitude`, `geocodingPrecision` e os quatro
  `check`s (`coordinates`, `latitude_range`, `longitude_range`, `geocoding_precision`), mais o import
  órfão de `geocoding.schema.js`. **Ficaram** `estimated_arrival_at`, `distance_from_previous_meters`,
  `duration_from_previous_seconds` (a 207 grava) e o `trip_stops_leg_check`, e nada da 206
  (`en_route_*`, seu check e seu índice parcial).
- Migration `drizzle/20260926205700_trip_stops_forget_dead_coordinates/`, encadeada na
  `20260926140647_stop_departure` da 206 (`prevIds` = `ec822dfa…`, o `id` dela). `migration.sql` **sem
  efeito no banco**, com o motivo escrito; `rollback.sql` remove a própria linha do journal com
  `ROW_COUNT`.

**Achado que a spec não previa:** `test/routing-schema/trip-stop-coordinates.contract.ts` (spec 058
RF-3) afirmava o oposto — que as seis colunas existem — e provava, no mesmo arquivo, três colunas que
**ficam**. Ele foi dividido em vez de apagado: as três de coordenada e o `trip_stops_coordinates_check`
saíram, o roteiro (previsão de chegada e perna, com o `trip_stops_leg_check`) continua provado ali, e
o cabeçalho aponta para o contrato novo.

**Segundo achado:** o contrato `static-migration.contract.ts` exige que todo `rollback.sql` apague a
própria linha do journal e confira `ROW_COUNT` — a primeira versão do rollback (um no-op) reprovou
nele. É a trava escrita depois de dois deploys vermelhos em 2026-09-02, e pegou o defeito aqui.

### T3 — os comentários

`trip.port.ts`, `drizzle-trip.repository.ts`, `drizzle-current-driver-trip.repository.ts` e
`trip-stop-coordinates.support.ts` deixaram de dizer "existem e nunca são escritas" e passam a dizer
que a coordenada da parada só existe em `geocoded_addresses` pela `address_key`.

### T4 — gates

| Gate                                                         | Resultado                  |
| ------------------------------------------------------------ | -------------------------- |
| `bun run typecheck` (raiz)                                   | exit 0                     |
| `bun run lint` (raiz)                                        | exit 0                     |
| `bun --env-file=../../.env run db:generate`                  | `no_changes`               |
| `bun --env-file=../../.env.test test --timeout 120000` (API) | 7921 pass, 23 skip, 0 fail |
| `bun --env-file=../../.env.test run test:integration` (API)  | 708 pass, 7 skip, 0 fail   |
| `make migration-test`                                        | 112 pass, 0 fail           |

**Renumeração no rebase.** Entre o commit e o push, outras sessões publicaram
`20260926195419_trip_vehicle_optional` e `20260926202337_trip_awaiting_crew_status`, e o
`snapshot.json` desta migration deixou de encadear. Ela foi regerada como
`20260926214201_trip_stops_forget_dead_coordinates` a partir da base nova (`prevIds` = o `id` da
`trip_awaiting_crew_status`), com o mesmo SQL sem efeito e o rollback apontando para o nome novo.
Depois disso: `db:generate` = `no_changes`, contratos 7934 pass / 0 fail, `make migration-test`
112 pass / 0 fail.

⚠️ **Contenção do Postgres local, não regressão.** A primeira execução da integração completa teve 6
falhas, todas `timed out after 5000ms` em `company-user-fleet-link` e `company-user-listing`, sem
nenhuma asserção falhando. As duas suítes juntas passam 16/16 em ~25 s nesta branch (duas rodadas), e
o mesmo par em `origin/staging` puro, num worktree separado, também dá 16/16 em 25 s. O `test:integration`
roda sem `--timeout`, então vale o padrão de 5 s do Bun, e cada um dos 135 arquivos cria um banco e
aplica as 249 migrations.

A prova de que não é desta spec: **o mesmo comando em `origin/staging` puro**, num worktree separado,
também reprova por tempo — `1 fail`, `(unnamed) [5001.07ms]`, 710 pass, em 861 s. Na branch da fase A
o resultado alternou entre `708 pass / 0 fail` e conjuntos diferentes de estouros de 5 s a cada
rodada, sempre sem nenhuma asserção falhando, e cada suíte acusada passa sozinha (`me-trip`, 13/13
com o caso da coordenada; `company-user-*`, 16/16 em ~25 s, igual ao baseline). Quem decide é a CI,
que roda num Postgres só dela.

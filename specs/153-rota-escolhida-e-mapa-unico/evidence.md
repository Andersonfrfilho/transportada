# Evidência — 153

Registro por task: comando, resultado e commit.

## T001 — OSRM aceita `exclude=toll` ✅

OSRM `v6.0.0`, algoritmo **MLD**, perfil `/opt/car.lua` padrão da imagem
`ghcr.io/project-osrm/osrm-backend:v6.0.0`, sobre o extract real `ribeirao.osrm`
(`deploy/osrm/data`, processado com `osrm-extract -p /opt/car.lua` + `osrm-partition` +
`osrm-customize`) — o mesmo pipeline do `deploy/osrm/Dockerfile`.

```bash
docker run -d --name osrm-spike-153 -p 53105:5000 \
  -v "$PWD/deploy/osrm/data:/data:ro" \
  ghcr.io/project-osrm/osrm-backend:v6.0.0 \
  osrm-routed --algorithm mld --max-table-size 2000 -i 0.0.0.0 -p 5000 /data/ribeirao.osrm
```

Rota Ribeirão Preto → Franca (`-47.8103,-21.1767;-47.3925,-20.5386`), com
`overview=false&alternatives=false&annotations=nodes`:

| Chamada        | `code` | Distância | Duração | Nós anotados |
| -------------- | ------ | --------- | ------- | ------------ |
| sem `exclude`  | `Ok`   | 89.301 m  | 4.186 s | 1.139        |
| `exclude=toll` | `Ok`   | 95.969 m  | 6.486 s | 1.486        |

Controle, para provar que o servidor **valida** a classe em vez de ignorar o parâmetro:

```bash
curl -s '.../route/v1/driving/...?exclude=banana'
{"message":"Exclude flag combination is not supported.","code":"InvalidValue"}
```

**Conclusão:** `exclude=toll` é aceito e muda a rota de verdade — 6,7 km a mais, 38 min a mais e
traçado diferente (contagem de nós distinta). A classe inválida é recusada, então o `Ok` do `toll`
é suporte real, não parâmetro engolido. **D1 confirmado**: a chamada com `exclude=toll` pode
alimentar a opção "sem pedágio" do seletor.

⚠️ O suporte vem do `excludable` do `car.lua` e é **assado no dataset** pelo `osrm-partition` —
dataset processado com perfil sem `excludable` recusaria a chamada. O caso extremo já previsto na
spec (falha isolada, `warn` uma vez por processo) continua valendo para instalação com perfil próprio.

## T101 — Migration aditiva do RF1 + schema Drizzle + rollback ✅

Colunas novas em `trips` (RF1): `planned_route` (jsonb), `planned_distance_meters`,
`planned_return_distance_meters`, `planned_duration_seconds` (`bigint`, `mode: 'number'`, precedente
`route-suggestion.schema.ts`), `planned_route_frozen_at`. `planned_toll`/`planned_toll_frozen_at`
(spec 090 T11) não mudam — a migration não os menciona.

Dois CHECKs, na forma de `trips_planned_toll_check` (D4 — a rota nasce inteira numa escrita, mesmo
`frozen_at`): `trips_planned_route_check` (as quatro colunas nascem e morrem com
`planned_route_frozen_at`) e `trips_planned_route_metrics_check` (as três colunas numéricas nunca são
negativas — `planned_return_distance_meters = 0` continua legal para `end_policy = 'last_stop'`).

Pasta `apps/api-transportada/drizzle/20260916174951_trip_planned_route/` (`migration.sql`,
`rollback.sql`, `snapshot.json`, gerada com `bun run db:generate --name trip_planned_route`).

### Contrato vermelho, antes de implementar

```bash
cd apps/api-transportada && bun test test/database-migration.contract.test.ts
```

```
54 pass
4 skip
2 fail
680 expect() calls
Ran 60 tests across 1 file. [2.19s]
```

Falhando: a asserção nova em `static-migration.contract.ts` (pasta `*_trip_planned_route` inexistente
na lista exaustiva de `directories`) e o teste novo em `trip-constraints.assertion.ts` (colunas e
CHECKs ainda não existem no schema).

### Verde, depois de implementar

```bash
cd apps/api-transportada && bun test test/database-migration.contract.test.ts
```

```
56 pass
4 skip
0 fail
728 expect() calls
Ran 60 tests across 1 file. [2.19s]
```

### Gates

```bash
bun run typecheck   # raiz do worktree — api, worker, cron, 3 frontends
```

6 `tsc --noEmit` limpos, sem erro.

```bash
bun run lint        # raiz do worktree
```

6 `eslint --max-warnings=0` / `eslint .` limpos, sem erro nem warning.

```bash
cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
```

```
6086 pass
23 skip
0 fail
21465 expect() calls
Ran 6109 tests across 177 files. [10.92s]
```

```bash
make config && make migration-test
```

```
 96 pass
 0 fail
 1288 expect() calls
Ran 96 tests across 8 files. [29.72s]
```

Migration e rollback aplicados de verdade num Postgres descartável — inclui as asserções reais de
CHECK em `trip-constraints.assertion.ts` (meia-escrita rejeitada, `planned_return_distance_meters = 0`
aceito, métricas negativas rejeitadas).

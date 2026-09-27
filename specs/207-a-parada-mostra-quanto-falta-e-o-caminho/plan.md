# Plano técnico — Feature 207 (revisão 3)

> Revisão 3 (2026-09-26): ajustada ao que a **T0.1 mediu**. As mudanças são o P0 do ETA (é a spec
> 210, já em staging), o `vertexCount` (leitura própria do `annotation.nodes` cru, sem a dedup do
> gateway) e o CAS (fora desta spec: a coluna é da 192). A fonte é a § `T0.1` do `evidence.md`.

## Contexto e premissas

1. **Base.**
   - `work/driver-app` está no HEAD `b36b0aea1` e não está em `origin/staging`.
   - Falta a 199 (`cc3495272`), que já está em staging.
   - A implementação nasce de `origin/staging` com `git status --short` vazio. A T0.1 confere as duas
     condições.
2. **A 207 chega antes da 192, e por isso CRIA a trava** (medido na T0.1: `lockTripForStopOrder` tem
   **0 ocorrências** em `apps/`, nesta árvore e em `origin/staging`; a 192 tem **0 de 16** tasks
   feitas). A 207 entrega a função pura, o formato e a trava:
   - `lockTripForStopOrder` com a assinatura de `specs/192-.../plan.md:74-79`
     (`trip_stops FOR UPDATE ORDER BY id` → `trips FOR NO KEY UPDATE`);
   - escrita dentro da transação recebida;
   - **sem CAS.** `stop_order_version` **não existe**, a migration que a criaria é da 192 e a 207
     proíbe migration. O CAS entra com a 192, que herda a trava sem reescrevê-la.
3. **As colunas de perna de `trip_stops` estão mortas hoje.** Ninguém as escreve: o único caminho que
   escreve em `trip_stops` depois do planejamento é `writeEstimatedArrivals`
   (`drizzle-trip-route.repository.ts:225-260`), que grava **só** `estimated_arrival_at` (`:241`), e
   as colunas de perna escritas são as de `route_suggestion_stops`, pelo worker
   (`drizzle-route-optimization.repository.ts:268-269`). Consequência para os testes: `kept_previous`
   segue correto como invariante, mas **nenhum caminho de produção produz o valor anterior** — o
   contrato monta o estado anterior **à mão**.
4. **A 206 é dona de "a caminho".**
   - Na API: `trip_stops.en_route_since`.
   - Na app: `resolveEnRouteStopId`, que ignora os `rejected`, e `findCurrentStop`.
   - No snapshot: `enRouteTappedAt`, a hora do toque.
   - As partes da 207 que dependem disso estão nas tasks T1.3b e T2.2b, bloqueadas até a 206 chegar a
     `origin/staging`.
   - **A `206/spec.md:427` está desatualizada** ao dizer que a 207 recua por `enRouteSince`. Vale a
     regra da 207 (D5): o recuo é a hora local do item na fila, nunca hora de servidor. A 207 não
     edita spec irmã — quem executar a 206 tem de ser avisado, e a T2.2b recusa o recuo por
     `enRouteSince`.
5. **ETA multi-veículo: corrigido, sem bloqueio.** O `clockSeconds` por veículo era a spec **210**,
   com 4/4 tasks e em `origin/staging` (`9f4ad2009`; `route-optimization.effect.ts:343`, dentro do
   laço de `:330`). `estimatedArrivalAt` é confiável e a **T2.8 roda na Fase 2**, sem espera.
6. **198, 202 e 196 não têm código** (zero `[x]` nos `tasks.md`). A 207 não depende delas. Só o
   degrau 3 da âncora espera a 196.
7. **Não há migration, e isso é o que tira o CAS da spec.**
   - As colunas `distance_from_previous_*` e `duration_from_previous_*` existem
     (`trip.schema.ts:575-576`), com o CHECK em `:634`.
   - `stop_order_version` **não** existe, e criá-la seria migration: fora desta spec (premissa 2).
   - `tracedStopIds` e `legPointStarts` são chaves novas no jsonb, lido de forma defensiva
     (`parse-planned-route.policy.ts:24-40`).
   - `requiresScheduling` e `isDiverged` são só leitura.
8. **O `/me` não tem schema Zod de resposta.** O contrato é o teste de rota sobre o corpo HTTP.
9. **A ordem de trava nova não fecha ciclo.** A T0.1 levantou todo `.for(...)` de
   `apps/api-transportada/src/trips/infrastructure/**`: os 12 pontos travam **só `trips`**, e nenhum
   trava linha de `trip_stops` — a chegada
   (`drizzle-driver-field-report.repository.ts:458`) lê `trip_stops` **sem** `FOR UPDATE` e só depois
   trava `trips` (`:471`). Logo `trip_stops` → `trips` é segura e **nenhum caller precisa ser
   convertido nesta spec**.

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`)

| Arquivo                                                              | Mudança                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/trips/infrastructure/osrm-route-geometry.gateway.ts`            | `toLegs` (`:175-188`) lê `annotation.nodes.length − 1` → `vertexCount` por perna, em **leitura própria do campo cru** (`annotations=nodes` já vai na URL, `:45`). **Proibido reaproveitar `toNodeIdsByLeg` (`:123-152`)**, que deduplica — ver § Riscos |
| `src/trips/application/read-route-geometry.use-case.ts`              | Simplifica **por perna** (`:425`, 5 m) e devolve `legPointStarts`                                                                                                                                                                                       |
| `src/trips/domain/stop-leg-assignment.policy.ts` (novo)              | `assignLegsToStops({ legs, leadingLegs, tracedStopIds })` → `{ stopId, fromStopId, distanceMeters, durationSeconds }[]`                                                                                                                                 |
| `src/trips/infrastructure/trip-stop-coordinates.support.ts`          | Devolve também `stopId` (`:24-39`), para compor `tracedStopIds`                                                                                                                                                                                         |
| `src/trips/application/freeze-trip-planned-route.use-case.ts`        | `toFrozenRoute` (`:141-172`) grava `tracedStopIds` e `legPointStarts` no jsonb                                                                                                                                                                          |
| `src/trips/infrastructure/drizzle-trip-planned-route.repository.ts`  | `writePlannedRoute` escreve as pernas dentro de `lockTripForStopOrder` e da transação recebida                                                                                                                                                          |
| `src/trips/infrastructure/drizzle-trip-route.repository.ts`          | `lockTripForStopOrder` **novo** — não existe em lugar nenhum (T0.1) —, com a assinatura de `192/plan.md:74-79`                                                                                                                                          |
| `src/trips/domain/parse-planned-route.policy.ts`                     | Lê `tracedStopIds` e `legPointStarts` opcionais                                                                                                                                                                                                         |
| `src/trips/domain/driver-leg.policy.ts` (novo)                       | Quem recebe `leg` e quem recebe `path` (D4a); `sliceLegPath` com teto de 200, 5 casas, sem o ponto do barracão                                                                                                                                          |
| `src/trips/infrastructure/drizzle-current-driver-trip.repository.ts` | `listStops` + `estimatedArrivalAt` + as colunas de perna; `listDocuments` + `leftJoin delivery_clients`; `listSchedules` + `divergedAt`; `listLegRoutes` em lote; `captured_at` dos desfechos                                                           |
| `src/trips/application/find-current-driver-trip.use-case.ts`         | Tipos (`:63-76`)                                                                                                                                                                                                                                        |

### App (`apps/frontend-driver`)

| Arquivo                                                                 | Mudança                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `shared/driverTrip.types.ts`, `shared/driverTripResponse.validation.ts` | Campos novos, com leitura defensiva                                                  |
| `shared/approachEstimate.service.ts` (novo)                             | Perna válida (D4), âncora (D5) com os itens da fila, estimativa                      |
| `shared/localPosition.service.ts` (novo)                                | `createLocalPositionController` (D7), no molde de `createLocationSharingController`  |
| `shared/nowClock.service.ts` (novo)                                     | `createNowClock` (30 s)                                                              |
| `shared/locationSharing.service.ts`                                     | `onLocalPosition` opcional: o último ponto sai para a tela, nunca para o `send`      |
| `hooks/useLocalPosition.hook.ts`, `hooks/useNow.hook.ts` (novos)        | Só cola com `useSyncExternalStore`                                                   |
| `shared/approachPath.service.ts` (novo)                                 | `projectApproachPath`                                                                |
| `shared/schedulingBadge.service.ts` (novo)                              | `resolveSchedulingBadge`, a fonte única do selo e da hora marcada                    |
| `shared/scheduleAlert.service.ts` (novo)                                | `resolveScheduleAlert`, `resolveTripScheduleBanner`, `SCHEDULE_ALERT_MARGIN_MINUTES` |
| `components/DriverApproachPreview.component.tsx` (novo)                 | SVG                                                                                  |
| `components/DriverScheduleBanner.component.tsx` (novo)                  | `role="status"` estável, com `<button>` dentro                                       |
| `components/DriverStopCard.component.tsx`                               | Só composição: o selo substitui `:323-330`; linha de status; corpo                   |
| `pages/DriverTripWorkspace.page.tsx`                                    | Troca a leitura única (`:161-169`) pelo controlador; monta a faixa                   |
| `styles/driverTrip.module.css`, `src/styles/index.css`                  | Estilos e o token `--color-caution: #f2c14e`                                         |
| `locales/driverTrip*.locale.json`                                       | Blocos `approach.*`, `scheduling.*`, `scheduleAlert.*`                               |
| `scripts/driver-preview-api.ts`                                         | Versionar, se a T5.0 da 196 ainda não o fez                                          |

`DriverStopCard.component.tsx` já tem 1173 linhas. Por isso ele só compõe. A lógica fica nos
serviços puros, e a interface nova em componentes próprios.

## Contratos/API/eventos

Só o `GET /me/trips/current`, e de forma aditiva.

```ts
type DriverTripStop = {
  // …campos de hoje (e enRouteSince/enRouteTappedAt, da 206)…
  estimatedArrivalAt: string | null
  requiresScheduling: boolean
  schedule: {
    protocol: string
    scheduledAt: string | null
    status: string
    isDiverged: boolean
  } | null
  leg: {
    fromStopId: string // id da parada, ou 'depot'
    distanceMeters: number
    durationSeconds: number
    originOutcomeCapturedAt: string | null
    path: readonly (readonly [number, number])[] | null
  } | null
}
type DriverTrip = { /* … */ startRouteCapturedAt: string | null }
```

Não há rota, evento, fila nem job novos.

## Dados, migration e rollback

- **Sem migration.**
- **Rollback.**
  - `git revert`.
  - Se a 192 **não** estiver no ar, zerar as colunas que a 207 escreveu, porque ninguém mais as lê:
    `UPDATE trip_stops SET distance_from_previous_meters = null, duration_from_previous_seconds = null`,
    num script de runbook com aprovação humana. Não é migration.
  - Se a 192 estiver no ar, as colunas são dela e ficam.
  - As chaves novas do jsonb são ignoradas pelo parser antigo.
- **Rotas antigas não têm `tracedStopIds` e não mostram perna** até recongelar. Não há backfill.
  - Recongelar depois do despacho é bloqueado, porque `checkTripAcceptsLinkage`
    (`trip-state.policy.ts:128-131`) recusa vínculo em viagem despachada. A exceção é a reordenação
    da 192.
  - Inventar `tracedStopIds` a partir do jsonb antigo seria adivinhar quais paradas estavam no traço.

## Segurança e tenant

- Todo `where` começa em `trip_stops.company_id` do contexto.
- `delivery_clients` casa por `(company_id, tax_id)`, e `trip_stop_schedules` por `company_id`.
- `geocoded_addresses` não tem tenant, de propósito (ADR-0044, 199).
- Contratos de tenant:
  - o caso "a viagem de uma empresa não alcança o motorista de outra" de `me-trip.integration.ts`,
    com uma nota de outra empresa com o mesmo `tax_id` e `requires_scheduling` diferente;
  - os contratos `tenant-safety` citados pela 199 (CA2).
- O corpo não leva `taxId`.
- A posição do motorista **não** entra no servidor por esta spec (D7). Três contratos vigiam isso:
  - o de import (`localPosition.service.ts` não importa cliente HTTP nem fila);
  - o do `onLocalPosition` (o ponto compartilhado vai para a tela, nunca para o `send`);
  - o smoke, com filtro de rede.
- `path` sai sem o ponto do barracão (D8a) e nunca vai para log. **Medido na T0.1: o logger não redige
  array de pares `[lat, lng]`** — `DEFAULT_REDACTED_KEYS` não tem `path`, `coordinates`, `geometry`
  nem `lat`/`lng`; `redactNumber` devolve fracionário cru; array é mapeado sem contexto de chave. Logo
  a **T1.4 entrega a redação**, por `extraKeys` na chamada de redação (`path`, `points`, `geometry`,
  `coordinates`), no molde de `sentry.service.ts:23`, e não por disciplina de call site — é o que a
  `security.md` §1 manda. A T3.4 confere.

## Idempotência e concorrência

- **Trava: uma só, criada pela 207 no molde da 192.** `lockTripForStopOrder` trava
  `trip_stops FOR UPDATE ORDER BY id` e depois `trips FOR NO KEY UPDATE`.
  - É a ordem declarada pela 192 (`specs/192-.../plan.md:238-239`).
  - A escrita das pernas acontece dentro dela, na transação recebida.
  - A revisão 1 deste plano dizia "`trips` antes de `trip_stops`", e estava **errado**.
  - **Sem ciclo com o que existe.** Nenhum caminho de hoje trava linha de `trip_stops` (premissa 9):
    os 12 pontos de `.for(...)` travam só `trips`. Nada precisa ser convertido.
- **CAS: fora desta spec.** `stop_order_version` não existe e criá-la seria migration. Quando a 192
  a criar, a escrita passa a ser `UPDATE … WHERE stop_order_version = $v`, com zero linhas afetadas
  igual a `superseded` — **isso é task da 192**, não da 207.
- **OSRM fora.** O resultado é `kept_previous` (192): nada é zerado, e a leitura decide pela D4. Como
  nada escreve as colunas de perna hoje (premissa 3), o teste **monta o valor anterior à mão**.
- **Prova.** A integração da T1.2 congela a viagem numa conexão enquanto outra registra uma chegada
  na mesma viagem. Nenhuma das duas pode dar `40P01`, e o estado final tem que ser consistente. É
  **rede de segurança** — a T0.1 já mostrou que o ciclo não existe —, não correção de defeito atual.
- A leitura não guarda estado. O cache do `path` é em memória, com chave
  `(tripId, stopId, plannedRouteFrozenAt)`: a rota recongelada muda a chave.

## Observabilidade

- `warn` sem PII quando `annotation.nodes` falta ou não soma com a geometria. O `path` sai `null`, e o
  log leva só `tripId` e a contagem.
- **Medição pendente, na T1.5.** A T0.1 **não** mediu a taxa num lote real (≥ 20 viagens): faltou
  credencial do banco de staging. O que houve foi proxy sintético (25 requisições, 30 rotas, **0
  falhas**) mais **34 rotas reais a favor** de `sum(nodes.length − 1) === coordinates.length − 1`. A
  T1.5, com a API já em staging, lê as coordenadas de ≥ 20 viagens planejadas, repete o laço contra o
  `/route` e registra a taxa no `evidence.md`. **Nenhum número é assumido.** Se vier acima de zero, o
  caminho é o `path: null` que a spec já prevê — não há decisão nova pendente.
- O logger da API **não** redige array de pares `[lat, lng]` (T0.1: `redact.ts:15-41`, `:76-83`,
  `:130-132`, `:151`). A condicional da T1.4 está **acionada**: a redação entra lá.

## Estratégia de testes

| Nível      | Onde                                                                                                                                                                                                                           | O que prova                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Contrato   | API `test/trip-application/stop-leg-assignment.contract.ts` (nova), no `test/trip-application.contract.test.ts`                                                                                                                | CA02                                                             |
| Contrato   | API `test/trip-application/route-geometry.contract.ts` (existe)                                                                                                                                                                | `vertexCount` e simplificação por perna; `legPointStarts` exatos |
| Contrato   | API `test/trip-application/freeze-trip-planned-route.contract.ts` (existe)                                                                                                                                                     | `tracedStopIds`/`legPointStarts` no jsonb; `kept_previous`       |
| Contrato   | API `test/trip-application/driver-leg.contract.ts` (nova), mesmo entrypoint                                                                                                                                                    | Quem recebe `leg`/`path`, fatia, teto, barracão                  |
| Contrato   | API `test/driver-trip/current-trip.contract.ts` e `me-routes.contract.ts`, no `test/driver-trip.contract.test.ts`                                                                                                              | CA01                                                             |
| Integração | `test/integration/freeze-trip-planned-route.integration.ts`                                                                                                                                                                    | CA03, inclusive as duas conexões                                 |
| Integração | `test/integration/me-trip.integration.ts`                                                                                                                                                                                      | CA04, com contagem de consultas e tenant                         |
| Contrato   | App: `approach-estimate`, `approach-path`, `scheduling-badge`, `schedule-alert`, `local-position`, `now-clock` (novas); `schedule.contract.ts` e `stop-distance.contract.ts` (existem), no `test/driver-trip.contract.test.ts` | CA05, CA06                                                       |
| Smoke      | App `test/driver-app.smoke.spec.ts`                                                                                                                                                                                            | CA07                                                             |
| Build      | App `test/dist.contract.test.ts`                                                                                                                                                                                               | CA08, sem mudança no teste                                       |

Os dois comandos da API, de dentro de `apps/api-transportada`:

```bash
bun --env-file=../../.env.test test --timeout 120000
bun --env-file=../../.env.test run test:integration
```

## Riscos

| Risco                                                                    | Mitigação                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A simplificação por perna muda o traçado que o painel desenha            | A tolerância continua 5 m; o contrato de `route-geometry` compara o total de pontos e o desvio                                                                                                                                                                                                                                                            |
| `annotation.nodes` ausente em alguma resposta do OSRM                    | `legPointStarts` fica ausente, `path: null` e `warn`; a perna (números) continua                                                                                                                                                                                                                                                                          |
| **`vertexCount` tirado do `nodeIdsByLeg` deduplicado — erro silencioso** | Leitura própria do `annotation.nodes` cru (`nodes.length − 1`). Medido: a dedup soma **2643** contra **2702** segmentos, porque remove repetições **internas** à perna, e o nó da parada **não** se repete nos limites (3 de 3 medidos). Reaproveitar desalinharia `path` em dezenas a centenas de pontos por perna **sem nada falhar**. Contrato em CA02 |
| Perna de 0 m tratada como 0 vértices                                     | Medido: `nodes: [a, b]` distintos → contribui **1**. `legPointStarts` avança 1; caso de contrato (CA02)                                                                                                                                                                                                                                                   |
| 192, 198 e 207 no mesmo congelamento                                     | § Interseções da spec; a T0.1 lê o `git log`; quem chegar por último concilia                                                                                                                                                                                                                                                                             |
| 206 muda `enRouteTappedAt` ou `resolveEnRouteStopId` na revisão dela     | T0.1 conferiu a revisão 3 da 206: os dois nomes e a assinatura `resolveEnRouteStopId({ stops, queueView })` **não mudaram**. T1.3b e T2.2b seguem bloqueadas até a 206 estar em staging; conferir de novo na hora                                                                                                                                         |
| A 206 for executada assumindo recuo por `enRouteSince`                   | Premissa 4: vale a regra da 207 (hora local da fila). A T2.2b **recusa** o recuo por `enRouteSince`; avisar quem executar a 206, porque a 207 não edita spec irmã                                                                                                                                                                                         |
| Muitos cartões mexidos por 204, 205 e 206                                | Só composição no cartão; `git log` antes de cada task                                                                                                                                                                                                                                                                                                     |
| Motorista lê "chega ~" como promessa                                     | "~", "sem trânsito", "previsto ~ (há N min)"                                                                                                                                                                                                                                                                                                              |
| Relógio de outro aparelho (D5)                                           | Limite declarado                                                                                                                                                                                                                                                                                                                                          |
| Âmbar novo destoando do design system                                    | Token único em `index.css`; a revisão de design mede o contraste                                                                                                                                                                                                                                                                                          |

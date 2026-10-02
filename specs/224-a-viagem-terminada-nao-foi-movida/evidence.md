# Evidência — spec 224

## T1.1 — Qual coluna marca a conclusão

Lido em `apps/api-transportada/src/database/trip.schema.ts`. A tabela `trips` tem três candidatas:

| coluna                          | linha | quem escreve                                                                                                                          |
| ------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `closedAt`                      | 280   | **só** o encerramento do escritório (spec 156/ADR-0067), junto de `closedByUserId` e `closeReason` — `drizzle-trip.repository.ts:224` |
| `updatedAt`                     | 299   | toda escrita na linha, inclusive a transição de status do motorista                                                                   |
| `trip_status_events.occurredAt` | 487   | `recordTripStatusChange`, chamado nos dois caminhos                                                                                   |

**Escolha: `updatedAt`.**

- `closedAt` **não serve**: é `null` quando o motorista conclui pelo app. O caminho do motorista
  (`drizzle-current-driver-trip.repository.ts:218`) faz `.set({ status, updatedAt: sql'now()' })` e
  não toca `closedAt` — ele nasce com `closedByUserId`, que pressupõe ator do escritório. Usar
  `closedAt` cobriria só a baixa do escritório, que é justamente o caso que a decisão da spec quis
  **não** deixar de fora.
- `trip_status_events.occurredAt` é o dado **exato** (a hora da transição, por qualquer caminho), e
  foi recusado por custo: obrigaria subconsulta num endpoint que cada motorista chama a cada 30 s,
  para ganhar precisão que não muda nada visível.
- `updatedAt` tem uma imprecisão conhecida: edição posterior numa viagem já concluída recoloca a
  linha na janela. **Com RF2 a consequência é invisível** — a viagem reaparece na lista, não é
  eleita, e `hasReassignedTrip` vê uma viagem _aparecendo_ (nunca sumindo), que não gera aviso. Fica
  registrado para não ser redescoberto como defeito.

**Janela: 15 minutos**, como a spec propôs, em constante nomeada.

## T1.2 — Quem consome `GET /me/trips/current`

Varredura em `apps/*/src/`:

| chamador                                                  | o que faz com a lista                     |
| --------------------------------------------------------- | ----------------------------------------- |
| `apps/frontend-driver`                                    | `resolveSelectedTrip` (RF2 conserta aqui) |
| `apps/frontend-transportada` → `src/modules/driver-trip/` | ⚠️ **`snapshot?.trips[0]` cru**           |

⚠️ **Achado que amplia o escopo.** O painel ainda tem o módulo `driver-trip` (o caminho de transição
da ADR-0075 §6, drenado mas não removido — remoção é a Fase 10 da 189, sob aprovação humana) e ele
pega a viagem **sem seletor e sem filtro**, em dois lugares:

- `apps/frontend-transportada/src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx:140`
- `apps/frontend-transportada/src/modules/driver-trip/pages/DriverProfile.page.tsx:43`

Com RF1 e sem conserto aqui, um motorista servido pelo painel veria **a viagem concluída como
ativa** por 15 minutos. Não está exposto em staging nem em produção (`VITE_DRIVER_APP_URL` está
definida nos dois, `.railway/railway.ts:679-680`, então o painel redireciona), mas o interruptor
pode ser desligado e o código continua lá.

Entra como **T1.11**, duas linhas, mesmo filtro. Não é a remoção do módulo — essa segue pendente de
aprovação.

## T1.3 — Teste de integração antes da implementação (vermelho)

`apps/api-transportada/test/integration/current-driver-trip-concluded-window.integration.ts`, na
lista de `test:integration` do `package.json` (logo depois de `me-trip-departure`). Molde de
montagem: `me-trip-departure.integration.ts` (banco descartável, empresa, conta, motorista, veículo,
viagem e tripulação reais). Chama `findCurrentDriverTrip` com os repositórios Drizzle — o caso de
uso que `GET /me/trips/current` executa — e o `updatedAt` é posto com `now() - make_interval(...)`,
o relógio do banco, o mesmo que a janela vai usar.

Quatro casos: concluída dentro da janela (5 min) aparece com `completed`; cancelada dentro da janela
aparece com `cancelled`; concluída fora da janela (120 min) não aparece; ativa antiga (`on_delivery_route`,
120 min) continua aparecendo.

⚠️ O worktree do Claude não tem `.env.test` (o link de `make worktree` não existe aqui), então o
`--env-file` apontou para o `.env.test` do checkout principal (Postgres de teste em 65432, de pé):

```bash
cd apps/api-transportada
bun --env-file=/Users/anderson.filho/Documents/personal/transportada/.env.test test --timeout 120000 \
  ./test/integration/current-driver-trip-concluded-window.integration.ts
```

Resultado: **2 pass, 2 fail**, 4 expect() — os dois que falham são exatamente os que dependem da
implementação, e pelo motivo certo (a consulta filtra a viagem concluída para fora, devolve `[]`):

```text
(fail) ... > concluída dentro da janela aparece com o status real
  - [ { "id": "36458233-...", "status": "completed" } ]
  + []
(fail) ... > cancelada dentro da janela aparece com o status real
  - [ { "id": "6c839b2d-...", "status": "cancelled" } ]
  + []
```

Os dois que passam (fora da janela não aparece; ativa continua) são o contrato que a implementação
**não pode** quebrar.

## T1.4 — A consulta aceita ativo ou concluído na janela (verde)

`apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts`: a
constante `RECENTLY_CONCLUDED_TRIP_WINDOW_MINUTES = 15` nasce ao lado de
`CURRENT_DRIVER_TRIP_STATUSES`, e o `where` de `listActiveTrips` passa a
`status ativo OR (status em TRIP_TERMINAL_STATUSES AND updated_at >= now() - make_interval(mins => 15))`.
Os status concluídos vêm de `TRIP_TERMINAL_STATUSES` (`database/trip.schema.ts:99`) — a constante
que já existia; nada foi redeclarado.

**Os dois usos de `inArray(trips.status, CURRENT_DRIVER_TRIP_STATUSES)`** no arquivo:

| método                         | quem consome                                                                | muda?   |
| ------------------------------ | --------------------------------------------------------------------------- | ------- |
| `listActiveTrips` (linha ~264) | `findCurrentDriverTrip` → `GET /me/trips/current` e o fluxo de WhatsApp     | **sim** |
| `readCurrent` (linha ~176)     | `startFieldTrip` — a viagem que os dois toques do campo alcançam (ADR-0058) | **não** |

`readCurrent` decide a qual viagem o motorista aplica "iniciar trajeto"/despacho; com a concluída
dentro dele, o toque poderia mirar uma viagem terminada. Fica só com o ativo.

⚠️ **Efeito colateral achado e tratado.** `findCurrentDriverTrip` não serve só ao endpoint: o fluxo
de WhatsApp do motorista (`register-driver-flow-actions.ts`, `currentTrip` e `findTripById`) o usa
com `result.trips[0]`. Sem tratamento, o WhatsApp passaria a oferecer a viagem concluída como "em
andamento" por 15 minutos. O fluxo agora descarta viagem em `TRIP_TERMINAL_STATUSES` antes de
escolher (contrato novo em `test/whatsapp-commands/driver-flow-actions.contract.ts`; reprova sem o
filtro — mutação feita à mão: 25 pass / 1 fail).

**Dois testes antigos afirmavam o estado que a spec 224 muda** e foram ajustados, não os
contornados: `me-trip.integration.ts` ("a última entrega conclui a viagem…", `trips` deixa de ser
`[]` e passa a ser `['completed']`) e `whatsapp-driver-flow-actions.integration.ts` (idem, o lookup
direto do use case).

Comandos (de `apps/api-transportada`; o `.env.test` é o link simbólico da raiz do worktree):

| comando                                                                                                                       | resultado                      |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/current-driver-trip-concluded-window.integration.ts` | **4 pass, 0 fail** (era 2/2)   |
| `bun --env-file=../../.env.test test --timeout 120000` (contrato)                                                             | **8490 pass, 23 skip, 0 fail** |
| `test:integration`, lista inteira do `package.json` (146 arquivos) em 3 lotes em primeiro plano                               | **800 pass, 8 skip, 0 fail**   |
| `bunx tsc --noEmit`                                                                                                           | exit 0                         |
| `bunx eslint` nos 6 arquivos tocados, `--max-warnings=0`                                                                      | limpo                          |

A lista de integração foi partida em três (48 + 49 + 49 arquivos, 292 + 272 + 236 pass) só porque
o primeiro plano tem teto de 10 min; os três saíram da própria lista de `test:integration`. Os 8
skips estão fora dos arquivos tocados (os três arquivos de integração tocados: 24 pass, 0 skip).

## T1.5 — Contrato do seletor antes da implementação (vermelho)

`apps/frontend-driver/test/driver-trip/trip-selection.contract.ts`: bloco novo `viagem concluída
nunca é a eleita (spec 224 RF2)`, com `it.each(['completed', 'cancelled'])` nos casos (a) escolhida
por `selectedTripId` e (c) fallback `trips[0]` (à frente de uma `route_planned`, e sozinha na lista),
mais o caso misto (concluída + `in_transit` → a `in_transit`, com e sem a concluída escolhida) e a
lista só com a concluída (`undefined`). O caminho (b), "em rota", só olha `in_transit` e
`on_delivery_route`: não alcança concluída por construção, e é o caminho que o caso misto exercita.

Comando, de `apps/frontend-driver` (`bun run test`, nunca `bun test` cru): **942 pass, 8 fail**
(950 testes, 3 arquivos). Os 8 são exatamente os do bloco novo, pelo motivo certo — a função devolve
a concluída:

```text
(fail) ... > a escolhida pelo motorista, se já está completed, não vale
(fail) ... > a escolhida pelo motorista, se já está cancelled, não vale
(fail) ... > o fallback trips[0] pula uma completed que está à frente da lista
(fail) ... > o fallback trips[0] pula uma cancelled que está à frente da lista
(fail) ... > o fallback trips[0] não devolve uma completed, nem sozinha na lista
(fail) ... > o fallback trips[0] não devolve uma cancelled, nem sozinha na lista
(fail) ... > uma concluída e uma em rota na lista: vale a em rota, mesmo com a concluída escolhida
(fail) ... > lista só com a concluída: nenhuma viagem
  Expected: undefined
  Received: { id: "a", status: "completed", ... }
```

## T1.6 — `resolveSelectedTrip` descarta a concluída (verde)

`apps/frontend-driver/src/modules/driver-trip/shared/driverTripSelection.service.ts`: a função filtra
`trips` com `isConcludedTripStatus` (importado de `./tripSnapshot.service`, nenhuma lista redeclarada)
e os três caminhos (escolhida, "em rota", `trips[0]`) passam a operar sobre a lista aberta.

**Seletor da interface.** `DriverTripSelector.component.tsx` recebia `snapshot?.trips` cru: com a
janela, uma concluída ao lado de uma ativa apareceria como **opção escolhível** (e `trips.length < 2`
contaria a concluída, mostrando um seletor de uma opção só). O componente agora filtra as concluídas
antes de contar e de montar os botões. `describeTripSelectorPath` só é chamado com a viagem já
eleita (`DriverTripWorkspace.page.tsx:701`) ou dentro do seletor, então ficou coberto.
`useLocationSharing(snapshot?.trips)` não precisa de filtro: `shouldShareLocation` só olha
`ON_ROAD_TRIP_STATUSES`.

**Tela com `trip === undefined`** (`DriverTripWorkspace.page.tsx`): `enRouteStopId`, `currentStopId`
e o `DriverLoadSheet` já guardam `trip === undefined`; a lista de paradas renderiza
`<p>{t('noTrip')}</p>`, exceto quando `snapshot.isRegisteredDriver === false` (nada). O seletor
retorna `null`, e o aviso de troca automática não aparece (`resolveTripSwitch` só marca
`autoSwitchedTripId` quando `resolvedTrip !== undefined`).

De `apps/frontend-driver`:

| comando                                                            | resultado                    |
| ------------------------------------------------------------------ | ---------------------------- |
| `bun run test`                                                     | **950 pass, 0 fail** (era 8) |
| `bunx tsc --noEmit`                                                | exit 0                       |
| `bunx eslint <3 arquivos tocados> --max-warnings=0` (app como cwd) | exit 0                       |

## T1.7 — O caso inalcançável sai, a sequência real entra

`apps/frontend-driver/test/driver-trip/trip-reassignment.contract.ts`. **Saíram** (substituídos, não
somados) os dois casos que montavam `previousTrips` com `completed`/`cancelled` e `currentTrips`
vazio como **única** prova do "não é aviso": estado que o endpoint não produzia, e por isso o defeito
passou. **Entraram**, cada um com `it.each(['completed', 'cancelled'])`:

1. lista anterior com `on_delivery_route`, leitura nova com a **mesma** viagem em `completed`/`cancelled`
   → sem aviso (a viagem segue na lista);
2. lista anterior já com `completed`/`cancelled`, leitura nova sem a viagem (a janela fechou) → sem
   aviso (o status terminal já foi visto).

O segundo tem a mesma forma do caso removido, mas agora é a **segunda** leitura de uma sequência que o
servidor de fato produz, e vem precedido do primeiro. **Mantidos sem mudança:** `in_transit` →
ausente avisa, `route_planned` → ausente avisa (troca de veículo, D3), nenhuma sumiu, snapshot
anterior vazio. `hasReassignedTrip` não mudou: já tratava os dois passos, o que faltava era o teste
da sequência real.

De `apps/frontend-driver`: `bun run test` → **952 pass, 0 fail** (950 + 4 casos novos − 2 removidos);
eslint do arquivo com `--max-warnings=0` → exit 0.

## T1.11 — A cópia legada do painel não exibe a concluída

`DriverTripWorkspace.page.tsx:140` e `DriverProfile.page.tsx:43` pegavam `snapshot?.trips[0]`. O
painel **não tinha** equivalente de `isConcludedTripStatus` (o módulo `driver-trip` dele é cópia por
valor do app do motorista, ADR-0075 §7), então nasceu
`apps/frontend-transportada/src/modules/driver-trip/shared/driverTripCurrent.service.ts`, com o
cabeçalho de cópia por valor no formato dos vizinhos: `isConcludedTripStatus` (`completed`,
`cancelled`) e `findCurrentDriverTrip(snapshot)`, a primeira viagem da lista que não terminou. As duas
páginas passam a chamá-la. Outros usos de `.trips` no módulo (`driverTripView.service.ts:94`, a
etiqueta de prova pendente) varrem as viagens atrás de um documento e **não** elegem viagem para a
tela, então ficam como estão.

Contrato: `apps/frontend-transportada/test/driver-trip/current-trip.contract.ts` (concluída/cancelada
sozinha → `undefined`; à frente de uma aberta → a aberta; sem snapshot → `undefined`; aberta → ela).
Entrou na lista pelo caminho que esta app tem: o `import` em `test/driver-trip.contract.test.ts`, que
já está no script `test` do `package.json` (a lista do `package.json` não muda).

De `apps/frontend-transportada`:

| comando                                                                                             | resultado                                                  |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `bun run test` (script do `package.json`)                                                           | **6172 pass, 0 fail** (31 arquivos) + 180 pass, 0 fail (1) |
| `bunx tsc --noEmit`                                                                                 | exit 0                                                     |
| `bunx eslint <5 arquivos tocados> --max-warnings=0` (app como cwd)                                  | exit 0                                                     |
| mutação: `find(...)` trocado por `at(0)` no serviço, `bun test ./test/driver-trip.contract.test.ts` | **4 fail** (as concluídas), restaurado em seguida          |

## T1.8 — Prova por mutação (CA5)

Cada metade desfeita isoladamente, o teste rodado, e a árvore restaurada em seguida
(`git status --short` vazio ao fim de cada uma). Verde na íntegra: 952 pass no motorista, 6172 + 180
no painel, 8490 contratos da API e 24 pass nos três arquivos de integração tocados.

| mutação                                            | como                                                                   | resultado                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| T1.6 desfeita (filtro do seletor)                  | `git checkout 44aa800b7^ -- driverTripSelection.service.ts`            | 944 pass, **8 fail** — os oito casos da T1.5           |
| T1.4 desfeita (janela na consulta)                 | `git checkout 60677afe0^ -- drizzle-current-driver-trip.repository.ts` | 2 pass, **2 fail** — os dois casos de dentro da janela |
| guard de concluída removido de `hasReassignedTrip` | `perl -0pi` tirando `&& !isConcludedTripStatus(trip.status)`           | 950 pass, **2 fail**                                   |

A terceira mutação é a que reproduz o defeito relatado: sem o guard, caem os dois casos da
sequência "a viagem já estava terminal e saiu da lista". Os outros dois casos novos (a viagem
**aparece** com status terminal) continuam passando, e isso é correto — eles são protegidos pela
presença na lista (`currentTripIds.has`), não pelo guard. As duas metades do teste cobrem coisas
diferentes, e a mutação mostrou qual é qual.

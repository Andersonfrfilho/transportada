# Feature 200 — O motorista vê a carga

Spec irmã da 192. Separada na revisão de 2026-09-25 (decisão D15 da primeira versão da 192, mostrada
ao usuário). **Abre agora e publica depois da 192**: lê a planta fixada por cópia e a matriz de
bloqueio que a 192 cria (ADR-0077 §7–§8). Sem ADR própria: a cópia por valor segue a ADR-0075 §7.

## Problema e resultado

O usuário perguntou "onde está o mapa da carga" na app do motorista. Medido em 25/09/2026:

- **A app do motorista não recebe planta.**
  - `GET /me/trips/current` não a devolve (`find-current-driver-trip.use-case.ts:90-96`;
    `driverTripResponse.validation.ts:131-149`).
  - A única leitura dedicada é `GET /trips/cargo-layouts/:layoutId`, com `trip.manage`
    (`trip.routes.ts:1085-1110`).
- **O desenho do painel é SVG isométrico, sem 3D.**
  - `components/ui/cargo-isometric.tsx`: 563 linhas + 198 de CSS.
  - Com `stopColor.service.ts`, `stopFocus.service.ts` e `cargoComplement.service.ts`.
  - `TripCargoLayers` tem 928 linhas; pesado demais para copiar.
- **Os motivos das caixas vêm do carregamento.** A precedência entre eles é
  `overEarlierDelivery > needsRehandling > outOfReach` (`cargoComplement.service.ts:30-35`; specs 120 e
  148 D5). Depois que o motorista muda a ordem, essas marcas descrevem a ordem antiga.
- **O IndexedDB da app está na versão 3, sem migração** (`indexedDbQueue.service.ts:37`, :44).

**Resultado:** cada parada ganha "Ver na carga". O botão abre o baú com três camadas de destaque:

- a carga daquela parada em destaque;
- a carga que a bloqueia agora em contorno;
- o resto esmaecido.

Uma lista em texto diz o mesmo. O mapa abre sem rede se já foi aberto com rede naquela viagem.

## Fora do escopo

- Girar, fatiar por camada e imprimir (tudo o que o `TripCargoLayers` do painel faz).
- Editar ou remarcar caixa.
- Recalcular a planta.
- Planta antes do despacho.

## Histórias priorizadas

### P1 — Onde está a carga desta parada

**Given** uma viagem despachada com planta fixada **When** o motorista toca "Ver na carga" na Parada
3 **Then** vê onde estão as caixas da Parada 3, quais paradas estão na frente ou em cima delas pela
ordem atual, e a mesma informação em texto.

### P2 — Sem rede

**Given** o mapa já aberto com rede **When** ele o reabre sem rede **Then** o mapa aparece, com o
aviso "mostrando a última versão".

## Requisitos funcionais

- **RF1 — `GET /me/trips/current/stops/:stopId/cargo-plan`** (`trip.read`).
  - A posse é conferida pela parada, como na 192.
  - Devolve a cópia fixada da viagem daquela parada, filtrada das notas liberadas e remapeada para a
    ordem atual.
  - Formato:
    `{ layoutId, bed, loadingAccess, boxes[], stops[{ stopId, sequence, label }], focusStopId, blockedBy: { fromOrderChange, fromLoading } }`.
  - Sem cópia, responde `404 CARGO_PLAN_NOT_AVAILABLE`.
- **RF2 — Validador da app.**
  - Motivo de caixa desconhecido é tolerado, como no painel (spec 120 `spec.md:56-59`).
  - Os campos novos do snapshot são opcionais (078 D2).
- **RF3 — Cópia por valor, com o cabeçalho da ADR-0075 §7** e entrada no mapa de
  `copy-by-value-header.contract.ts`:
  - `cargo-isometric.tsx` e o CSS dele;
  - `stopColor.service.ts`;
  - `stopFocus.service.ts`;
  - `cargoComplement.service.ts`.
- **RF4 — `DriverCargoPlan.page.tsx`** em `/carga/:stopId` (`driverRoute.service.ts`).
  - Três camadas: destaque, contorno (quem bloqueia **pela ordem atual**) e esmaecido.
  - As marcas `overEarlierDelivery`/`needsRehandling` aparecem com o rótulo "marca da ordem do
    carregamento".
  - Lista em texto equivalente, com o número de caixas por parada e quem bloqueia.
  - "Voltar" retorna à lista da viagem.
- **RF5 — Botão "Ver na carga"** no `DriverStopCard`, só com `hasLoadedCargoPlan`.
- **RF6 — Cache sem rede.**
  - A última resposta por `(subHash, layoutId, stopOrderVersion)` é gravada.
  - Mesmas regras de dono, validade (24 h) e descarte do snapshot da viagem
    (`tripSnapshot.service.ts`).
  - Se precisar de object store novo, a versão do IndexedDB sobe de 3 para 4 com **migração aditiva**:
    `onupgradeneeded` cria só o store novo, e os itens da fila v3 sobrevivem (contrato).

## Requisitos não funcionais

- O `dist` fica dentro do orçamento de precache, 1,5 MiB (`dist.contract.test.ts`).
- Alvos ≥ 44 px em 375 px.
- O desenho tem alternativa textual, e o SVG tem `role="img"` com `aria-label`.

## Casos extremos e falhas

- **Planta `queued` no despacho, ainda não fixada:** o botão não aparece.
- **Parada concluída:** o botão some. As caixas dela saem do desenho; as devolvidas ficam, como "sai no
  depósito".
- **~1.400 caixas:** o desenho continua fluido em aparelho médio. A medição da T2.3 decide se precisa
  agrupar.

## Critérios de aceite

- **CA01** — A rota devolve a cópia filtrada e remapeada. Planta sem cópia: `404`. Outra empresa ou
  outro motorista: `404`.
- **CA02** — Motivo desconhecido não derruba o validador da app.
- **CA03** — Destaque, contorno e esmaecido batem com `blockedBy` numa fixture com bloqueio
  `fromOrderChange` e outro `fromLoading`.
- **CA04** — Abrir sem rede depois de ter aberto com rede funciona. Outro `sub` não vê o cache.
  Depois de 24 h, o cache é descartado.
- **CA05** — Migração v3→v4, se houver, preserva a fila.
- **CA06** — O `dist` fica no orçamento, e o smoke roda em 375 px.
- **CA07** — Prints 375 e 768 vistos pelo usuário no preview antes de staging.

## Dúvidas

Nenhuma bloqueante.

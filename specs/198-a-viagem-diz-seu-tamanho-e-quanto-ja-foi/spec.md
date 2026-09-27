# Feature 198 — A viagem diz seu tamanho e quanto já foi

> Registrada em 2026-09-25 a partir de quatro pedidos do usuário, olhando a app do motorista
> (`apps/frontend-driver`): "adicione nos itens de viagem a duração total", "e quantos kms de
> distância", "e cadê o início e fim do trajeto?" e "cadê a porcentagem da viagem?".
>
> Revisada no mesmo dia, depois de duas respostas do usuário (Q1 e Q2) e da crítica (opus). A
> spec já se chamou "a viagem diz quanto falta"; o nome mudou porque "quanto falta em km/tempo"
> está fora do escopo.

## Problema e resultado

O motorista abre a app e não sabe o tamanho da viagem, de onde ela parte, onde termina nem quanto
já fez. O sistema congela a rota no planejamento, mas nada disso chega a ele.

Medido no código em 2026-09-25:

1. **A rota congelada existe e é completa** (spec 153 D4, `apps/api-transportada/src/database/trip.schema.ts:224-236`).
   - `trips` guarda quatro campos: `planned_distance_meters`, `planned_duration_seconds`,
     `planned_return_distance_meters` e `planned_route` (jsonb).
   - O CHECK `trips_planned_route_check` (:316-322) obriga os quatro a serem nulos juntos.
   - A escrita é uma só, em `writePlannedRoute` (`drizzle-trip-planned-route.repository.ts:85-111`).
   - `summarizeRoadDistance` (`planned-road-distance.policy.ts:36-65`) **soma todas as pernas**:
     a saída do barracão, as entregas e a volta.
   - `planned_return_distance_meters` é **uma parte** dessa soma, e vale `0` com `end_policy =
'last_stop'`.
   - **Não existe duração da volta separada.** Ela só pode ser derivada da última perna de
     `planned_route.legs`.
2. **O jsonb sabe de onde a rota parte, mas não onde ela termina.** `planned_route.depot` é um
   `RouteGeometryDepot` (`read-route-geometry.use-case.ts:136-163`) com seis campos: `absence`,
   `description`, `leadingLegs`, `origin`, `originSource` e `trailingLegs`.
   - `description` traz `tradeName`, `legalName`, `address` e `phone` **da empresa**.
   - A política de fim é lida na montagem, mas **não é gravada**: `depot`, `address` ou
     `last_stop` (`route-suggestion.schema.ts:245-248`), resolvida por `resolveRouteEndAddressKey`
     (`route-depot.policy.ts:114-128`).
   - O repositório lê `depot` com um _cast_ cego (`drizzle-trip-planned-route.repository.ts:160-165`).
3. **A origem configurada não tem endereço escrito.** `resolveDepotOrigin`
   (`depot-origin.policy.ts:33-45`) devolve só uma chave com coordenada.
   - A ADR-0044 recusa geocodificação reversa, e `depot-description.policy.ts:9-14` registra por
     isso que o rótulo nomeia **a empresa**.
   - O endereço fiscal só descreve de fato a partida quando `originSource` é `company_address`.
4. **Parada sem geocódigo sai do traçado sem aviso.**
   - `listTripStopCoordinates` (`trip-stop-coordinates.support.ts:24-35`) usa `innerJoin` com
     `geocoded_addresses`. A rota congelada, então, não passa pelas paradas sem coordenada.
   - Isso contradiz o caso extremo da 153 ("parada sem coordenada → sem rota; nunca rota parcial"),
     e nada registra quais paradas ficaram de fora.
5. **`GET /me/trips/current` não leva nada disso.** Por viagem, a resposta traz só
   `{ id, manifest, status, stops, vehiclePlate }` (`me-trip.routes.ts:204-214`;
   `find-current-driver-trip.use-case.ts:90-96`).
   - A leitura já é em lote, sem N+1 (`listActiveTrips`,
     `drizzle-current-driver-trip.repository.ts:205-277`).
   - As colunas `trip_stops.distance_from_previous_*` e `duration_from_previous_*`
     (`trip.schema.ts:575-576`) nunca são escritas. Esta spec não as usa.
6. **A coordenada da parada chega vazia ao motorista.** É um defeito conhecido, **corrigido fora
   desta spec** (sessão "Fix driver app stop distance always empty").
   - `listStops`/`toDriverStop` leem `trip_stops.latitude`/`longitude`, que nunca são escritas.
   - A 198 não depende disso: km, início e fim vêm da rota congelada, que lê `geocoded_addresses`.
   - **É proibido tocar `listStops`/`toDriverStop` aqui** (M1 da crítica).
7. **Na app, nem o seletor nem o cabeçalho dizem tamanho ou progresso.**
   - `DriverTripSelector.component.tsx:26` só aparece com 2 ou mais viagens. Mostra o caminho
     "primeira → última · N paradas" (`describeTripSelectorPath`,
     `driverTripSelection.service.ts:49-60`) e a placa.
   - O cabeçalho (`DriverTripWorkspace.page.tsx:373-378`) diz só "Minha viagem" e "Veículo …".
   - A barra `DriverTripProgress` é por parada (`specs/082-o-campo-ganha-fila-visivel-e-assinatura/`,
     D1; `driverTripProgress.service.ts`). O número dela existe só no `aria-label`.
8. **O painel calcula uma porcentagem por parada e não a exibe.**
   - `resolveTripProgress` (`apps/frontend-transportada/src/modules/trip/shared/tripProgress.service.ts:41-78`,
     spec 079) faz `Math.round(completedStops / totalStops * 100)`.
   - `TripDetail.component.tsx:803` o passa a `TripProcessFlow`, que usa só
     `estimatedCompletionAt`. Nenhum arquivo do painel lê `percent`.
   - O que o painel mostra hoje é o fluxo por nota (`buildTripProcessFlow`).
9. **O tempo de parada medido foi decidido e nunca foi alimentado.**
   - A 058 D6 (`specs/058-o-roteiro-se-sugere-sozinho/spec.md:172-197`; T014 em `tasks.md:216-225`)
     decidiu: padrão → medido, **mediana** por cliente quando há amostra suficiente e por empresa
     quando não há, janela de 90 dias e mínimo configurável.
   - A peça pura existe: `resolveServiceTime`
     (`apps/api-transportada/src/routing/domain/service-time.policy.ts:31-51`, contrato
     `test/routing-domain/service-time.contract.ts`).
   - O mínimo e o padrão existem na configuração da empresa: `service_time_minimum_samples` (5) e
     `default_service_time_seconds` (600) (`route-suggestion.schema.ts:289-298`).
   - **Ninguém lê amostra nenhuma.** O worker grava sempre `serviceTimeSource: 'default'`
     (`apps/worker-transportada/src/routing/infrastructure/drizzle-route-optimization.repository.ts:275-276`,
     :550, :961).
10. **Os eventos para medir já existem.**
    - `trip_stop_events` guarda `arrived`, `delivered` e `returned` (`trip.schema.ts:986`).
    - Cada evento traz `recorded_at` (servidor, `defaultNow()`, :1028), `captured_at` (aparelho,
      :1006, só quando o toque leva posição) e `channel`.
    - Há índice `(company_id, stop_id, created_at)`.
    - ⚠️ `trip_stops.arrived_at`/`completed_at` recebem o `now` do caso de uso
      (`report-stop-arrival.use-case.ts:79-83`, `document-outcome-steps.service.ts:161-166`). No app,
      esse `now` é a hora do servidor no recebimento. Com a fila offline, chegada e entrega drenadas
      juntas ficam a segundos uma da outra. Medir por essas colunas, como a 058 T014 escreveu,
      aprenderia a latência da drenagem.

**Resultado.** Na app do motorista, cada viagem passa a mostrar:

- a **distância** prevista, com a volta incluída e dita;
- a **duração total** = tempo de estrada (com a volta) **+** tempo nas paradas. O tempo nas paradas
  é aprendido dos eventos que o motorista já registra. Sem amostra suficiente, aparece só a estrada,
  com "tempo nas paradas ainda sendo medido";
- o **início e o fim** do trajeto;
- quantas paradas ficaram **fora da conta** por falta de geocódigo;
- a **porcentagem**, contada por nota.

Isso aparece no seletor (2 ou mais viagens) e num quadro no cabeçalho da viagem ativa (sempre).

**No painel**, a porcentagem passa a contar notas e a aparecer, com a mesma regra da app.

Viagem sem roteiro planejado diz "Sem roteiro planejado". Ela nunca mostra zero nem número estimado
na hora.

## Pré-requisito de base

A 198 **começa depois que `work/driver-app` chegar a `origin/staging`**.

- Em 2026-09-25, `work/driver-app` estava 27 commits à frente, e `describeTripSelectorPath` e
  `shortStopLabel` só existem nela.
- A T0.1 confere com `git merge-base --is-ancestor <commit do seletor> origin/staging` e **para** se
  não tiver chegado.
- A branch da 198 nasce de `origin/staging`, na própria árvore (`git switch -c work/spec-198
origin/staging`), nunca por `make worktree`, que não roda em worktree do Claude.

## Decisões

Detalhe e alternativas na **ADR-0083**.

- **D1 — A estrada vem da rota congelada, sem nada recalculado na leitura.** O snapshot ganha
  `route` por viagem, com as colunas `planned_*` e o que o jsonb registra (`depot`, a última perna e
  as paradas de fora), e sem OSRM. O tempo nas paradas é a exceção declarada (D4, D16).
- **D2 — Sem dinheiro.** Pedágio, custo, combustível e frete não saem (153 D10). Km e tempo "aparecem
  para todos" (153 D9).
- **D3 — A volta está incluída e é dita.**
  - A distância e o tempo de estrada são os da rota inteira.
  - Com `trailingLegs = 1`, o quadro mostra quanto disso é o último trecho (distância e duração
    derivadas da última perna).
  - O texto do último trecho depende do fim: com `depot`, "Inclui a volta"; com `address`, "Inclui
    o trecho até o término".
- **D4 — Duração total = estrada + paradas** (usuário, 2026-09-25: "vamos coletando, conforme o
  espaço entre os eventos registrados").
  - Na tela: "1 h 12 min de estrada + ~40 min em 3 paradas", e o total "~1 h 52 min". O "~" marca a
    parte aprendida.
  - Sem medição suficiente: só "X de estrada" e "Tempo nas paradas ainda sendo medido".
  - **Nunca** usa o `default_service_time_seconds`. Os 600 s são palpite do solver (058 D6), e
    mostrados ao motorista seriam número inventado.
- **D5 — O início sai do congelado.**
  - Com `leadingLegs = 1`, o início é o **barracão**, com o nome de `description.tradeName`. O
    endereço só aparece com `originSource = 'company_address'` (ADR-0044).
  - Com `leadingLegs = 0` (barracão ausente, 097 D2), o início é a **primeira parada medida**, com o
    aviso de que a saída do barracão ficou de fora.
- **D6 — O fim passa a ser gravado no congelamento.** `planned_route.depot` ganha
  `endKind?: 'depot' | 'address' | 'last_stop'`, na mesma escrita da 153 D4, sem migration.
  - Ausente = rota congelada antes da 198. Com volta, sai como `unspecified` ("com volta", sem
    nomear o destino).
  - Barracão ausente = `last_stop`.
  - O fim `address` não tem endereço escrito (mesma razão da D5): o texto é "término cadastrado pela
    empresa".
  - O fim `last_stop` nomeia a última parada medida.
- **D7 — A porcentagem conta notas, na app e no painel** (usuário, 2026-09-25, Q2).
  - A conta é `delivered` + `returned` sobre o total de notas da viagem, **arredondada para baixo**.
    Então 100% só aparece com tudo resolvido, e o painel troca o `Math.round` por essa regra.
  - Viagem sem nota não tem porcentagem.
  - A barra segmentada da app **continua por parada** (082 D1), com legenda visível ("1 de 3
    paradas"), porque é o portão que o motorista lê.
  - O texto sempre diz a unidade ("3 de 6 notas").
  - A **emenda à 079** fica registrada na T4.1: o RF4 dela ("progresso derivado do estado das
    notas") passa a valer também para a porcentagem.
- **D8 — Onde aparece.** No seletor (2 ou mais viagens), cada item ganha "Início · Fim" e
  "km · duração · %". No cabeçalho entra o quadro `DriverTripRouteSummary`, também com uma viagem
  só. No painel, a porcentagem aparece junto da previsão no `TripProcessFlow`.
- **D9 — Formatação igual à que a app já usa.**
  - Km: a mesma do cartão, uma casa com vírgula
    (`driverStopDistance.service.ts:59`, `toFixed(1).replace('.', ',')`), sem o piso de 0,1 do
    cartão.
  - Duração: o `formatDuration` da spec 138
    (`apps/frontend-transportada/src/modules/routing/shared/suggestionValuation.service.ts:149`),
    trazido por **cópia por valor** com o cabeçalho da ADR-0075 §7, com as unidades do locale.
  - Porcentagem: inteiro seguido de "%".
- **D10 — Sem roteiro não vira número.**
  - `route: null` → "Sem roteiro planejado".
  - `route` ausente (snapshot gravado antes do deploy) → o quadro esconde as linhas de rota.
  - A porcentagem aparece nos dois casos.
- **D11 — Sem rede.** Os campos viajam no snapshot de 24 h (ADR-0075 §8). A porcentagem usa o que o
  servidor confirmou, como a barra.
- **D12 — Compatibilidade.**
  - Os campos são aditivos, e o validador da app descarta o que não conhece.
  - A ordem de deploy é API → app.
  - O módulo legado `/minha-viagem` do painel não ganha a feature (ADR-0075).
- **D13 — As paradas fora do traçado são ditas, não escondidas.** O congelamento grava
  `planned_route.excludedStopIds`: as paradas da viagem sem coordenada no momento do congelamento.
  - A leitura expõe `route.excludedStopCount`, e a tela diz "N paradas fora da conta".
  - Rota congelada antes da 198 (chave ausente) → `excludedStopCount: null`, sem aviso.
  - A 198 **não** muda o congelamento para recusar rota parcial: isso mudaria a conta prevista e é
    decisão da 153.
- **D14 — A amostra é o espaço entre os eventos da parada.** Uma parada concluída (`completed_at`
  não nulo) dá **uma** amostra:
  - **Início:** o maior entre dois instantes: o primeiro `arrived` da parada e o último desfecho de
    uma **irmã** (outra parada da mesma viagem, com o mesmo `address_key`) que caia dentro da janela
    desta parada.
    - Quando o motorista toca os dois "Cheguei" no portão, a segunda irmã não herda o atendimento da
      primeira.
    - A consulta seleciona `trip_id` e `address_key` para isso.
  - **Fim:** o último `delivered`/`returned` das notas da parada.
  - **Canal:** só `channel = 'driver_app'` nos dois extremos (`TRIP_FIELD_CHANNELS`,
    `trip.schema.ts:50-56`). `office` (baixa retroativa da 156) e `whatsapp` ficam fora.
  - **Relógio:** os dois extremos têm de usar o **mesmo** relógio. Há duas formas válidas:
    - os dois com `captured_at` (hora do aparelho);
    - os dois sem, usando `recorded_at`.

    Amostra com relógio **misto** fica fora, porque compararia duas bases de tempo diferentes.
    - `captured_at` só existe quando o toque leva posição
      (`drizzle-driver-field-report.repository.ts:576`).
    - `recorded_at` é a hora em que a fila drenou.
    - O expurgo de 90 dias zera `captured_at` (worker
      `trip-location-purge/infrastructure/drizzle-trip-location.repository.ts:34`). Na borda da
      janela, uma amostra pode virar mista.

  - **Fica fora também:**
    - parada sem `arrived`;
    - duração < **30 s** (mesmo toque, ou a fila drenada junta);
    - duração > **2 h** (parada esquecida aberta).
  - O piso e o teto são constantes nomeadas (`STOP_SERVICE_SAMPLE_BOUNDS`), e a Q3 manda
    conferi-los contra a distribuição medida.
  - O `debug` do recálculo conta os descartes por motivo: canal, relógio misto, piso, teto e sem
    chegada.

- **D15 — O agregado é o da 058 D6, sem decisão nova.**
  - A regra: `resolveServiceTime`, mediana, 90 dias e mínimo `service_time_minimum_samples` (5 sem
    linha de configuração). `source: 'default'` é lido como "não medido".
  - **Identidade do cliente:** sempre o CNPJ/CPF do destinatário (`nfe_participants.tax_id`, papel
    `recipient`), normalizado por `normalizeTaxId` (`src/shared/tax-id.service.ts`).
    - Vale nas amostras e nas paradas atuais. As paradas atuais já trazem `recipientTaxId` em
      `listDocuments` (`drizzle-current-driver-trip.repository.ts:697`).
    - A amostra conta para o cliente só quando **todas** as notas da parada são dele. Parada mista, ou
      com nota sem documento, conta só para a empresa.
    - **Não** se usa a `recipient_key` da 197: a D22/RF15 dela zera a chave quando a viagem conclui,
      e as amostras vêm justamente de viagens concluídas.
  - **Cada parada da viagem** usa a mediana do cliente, senão a da empresa, senão fica sem medição.
    A mediana da empresa cobre qualquer parada, então nunca há soma parcial.
  - **`stopCount`:** conta **todas** as paradas da viagem, inclusive as fora do traçado (D13) e as
    sem endereço localizado. É o que o motorista vai visitar. A soma do tempo usa o mesmo conjunto.
    É duração total, não o que falta.
- **D16 — Calculado na leitura, com cache por empresa, sem tabela nova, e nunca derruba o GET.**
  - É uma consulta por empresa, guardada em memória por 1 h (`SERVICE_TIME_CACHE_TTL_MS`), atrás de
    `StopServiceTimeEstimatePort`.
  - Leituras simultâneas dividem a mesma `Promise` em voo.
  - O GET de 30 s da app não consulta o banco.
  - **Valor vencido serve enquanto recalcula:** passado o TTL, a leitura devolve o valor antigo e
    dispara o recálculo em segundo plano.
  - **Falha é fallback gracioso** (code-standart §7, catch local permitido):
    - a consulta roda com `statement_timeout` próprio (`SERVICE_TIME_QUERY_TIMEOUT_MS`, 2 s);
    - se ela falhar ou estourar o tempo, o adaptador loga `warn` (sem CNPJ), tira a `Promise`
      rejeitada do mapa e devolve o valor antigo, se houver, ou "indisponível";
    - com "indisponível", o `stopTime` **é omitido** da viagem, e a app mostra só a estrada, sem
      aviso.
    - A próxima leitura tenta de novo.
  - As réplicas podem divergir por até 1 h, e isso é aceito.
- **D17 — Tempo de operação, nunca de motorista** (LGPD, ADR-0070).
  - A consulta não seleciona ator nem motorista.
  - O valor não entra na nota do motorista nem vira ranking.
  - O snapshot leva só o total da viagem, sem mediana de cliente e sem chave de cliente.

## Convivência com outras specs

**Verificação objetiva.** A T0.1 e cada push rodam `git diff --name-only origin/staging...HEAD`,
cruzam o resultado com a tabela abaixo e anotam no `evidence.md` o que já chegou de cada spec
irmã.

| Arquivo                                                              | 192 | 193 | 196 |             197             |         Fix coordenada         |
| -------------------------------------------------------------------- | :-: | :-: | :-: | :-------------------------: | :----------------------------: |
| `apps/api-transportada/src/trips/presentation/me-trip.routes.ts`     |  ✓  |  ✓  |  ✓  |                             |                                |
| `.../trips/application/find-current-driver-trip.use-case.ts`         |  ✓  |     |     |              ✓              |                                |
| `.../trips/infrastructure/drizzle-current-driver-trip.repository.ts` |  ✓  |     |     |              ✓              | ✓ (`listStops`/`toDriverStop`) |
| `.../trips/infrastructure/drizzle-trip-planned-route.repository.ts`  |  ✓  |     |     |         ✓ (:74-78)          |                                |
| `.../trips/infrastructure/trip-stop-coordinates.support.ts`          |     |     |     | ✓ (RF10: irmãs com perna 0) |                                |
| `.../trips/application/freeze-trip-planned-route.use-case.ts`        |  ✓  |     |     |                             |                                |
| `apps/frontend-driver/.../shared/driverTrip.types.ts`                |  ✓  |  ✓  |  ✓  |              ✓              |                                |
| `.../shared/driverTripResponse.validation.ts`                        |  ✓  |  ✓  |     |              ✓              |                                |
| `.../pages/DriverTripWorkspace.page.tsx`                             |  ✓  |  ✓  |  ✓  |              ✓              |                                |

Contagem feita em `specs/19{2,3,6,7}-*/*.md` em 2026-09-25. A 198 acrescenta campos diferentes nesses
arquivos: o conflito é de texto e se resolve no rebase. Onde a 198 toca o mesmo ponto que outra,
**quem chega depois se ajusta ao que já está em `origin/staging`**.

- **192 (o motorista muda a ordem).**
  - Antes do despacho, OSRM fora **apaga** a rota: `osrm-route-geometry.gateway.ts:51-74` devolve
    `null`, e `writePlannedRoute({ route: null })` grava nulo. A 198 mostra "Sem roteiro planejado".
  - Depois do despacho, a 192 D7 mantém a rota anterior e grava `route_recomputed = false` no
    evento. **Sinal da 198 (RF9):** o último `trip_stop_order_events` da viagem tem
    `route_recomputed = false` → `route.isFromPreviousStopOrder = true`.
  - Implementa a RF9 quem chegar por último a `origin/staging`.
  - Quando a 192 recongela, `endKind` e `excludedStopIds` vêm junto. O fim `last_stop` segue a nova
    última parada medida.
  - A porcentagem por nota não muda com a ordem.
- **197 (a parada é do cliente).**
  - A porcentagem por nota não muda quando uma parada vira duas. Por parada, cairia de 67% para 50%
    sem nenhuma entrega nova.
  - **Condicional à 197:** irmãs continuam dois pontos com perna de 0 m / 0 s entre elas (197
    revisada, sem colapsar nada). A estrada não muda. Sem a 197, cada parada é um ponto, como hoje.
  - `excludedStopIds` guarda ids de parada e vale igual com ou sem irmãs.
  - **Tempo de parada:** com uma chegada por cliente (197 D3), a parada passa a ser de um cliente só,
    e toda amostra conta para ele pelo CNPJ/CPF (D15).
  - Irmãs cujos "Cheguei" são tocados juntos no portão não se contaminam (D14, início da amostra).
  - O contador "N paradas" do seletor sobe, e deve subir.
- **193 e 196.** Tocam os mesmos arquivos da app e `me-trip.routes.ts` (ver a tabela). Não há decisão
  cruzada.
  - A API de demonstração do preview é **versionada pela T5.0 da 196**, em
    `apps/frontend-driver/scripts/driver-preview-api.ts`. A T3.1 desta spec edita esse arquivo
    depois da T5.0, e o do scratchpad antes dela.
- **Fix da coordenada da parada (outra sessão).** A 198 não toca `listStops`/`toDriverStop`. A T0.1
  anota o resultado de
  `git log origin/staging --oneline -S geocodedAddresses -- apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts`.

## Fora do escopo

- **Quanto falta em km e em tempo.** A soma das pernas depois da parada atual mente quando o
  motorista entrega fora de ordem (`drizzle-driver-field-report.repository.ts:277`).
- A coordenada da parada no snapshot (Problema item 6) e o mesmo defeito na prova de entrega.
- O solver e o ETA usarem o tempo medido: a 058 T014 segue aberta, e a porta desta spec é o caminho.
- Painel de cliente com a mediana dele (058 D6, 060). Qualquer medida por motorista (D17).
- Recusar rota parcial no congelamento (D13), mapa na app, pedágio ou valor (D2) e o `/minha-viagem`
  legado.

## Preview

Largura de celular, cerca de 40 colunas (375 px). Os dados são os da API de demonstração (T3.1).

### 1. Seletor de viagens (2 ou mais viagens)

```text
Suas viagens
┌──────────────────────────────────────┐
│▌Praça da Sé, 100 → Rua Vergueiro,    │  ← escolhida
│▌3000 · 3 paradas                     │
│▌Início barracão · Fim barracão       │
│▌38,6 km · ~1 h 52 min · 50%          │
│▌GCQ8E47                              │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│ Av. Brasil, 500 → Rua Augusta, 90 ·  │  ← sem barracão,
│ 2 paradas                            │    sem medição,
│ Início 1ª parada · Fim última        │    1 parada fora
│ 12,4 km · 31 min de estrada · 0%     │
│ 1 parada fora da conta               │
│ DKT4F19                              │
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│ Av. Cruzeiro do Sul, 2000 · 1 parada │  ← sem roteiro
│ Sem roteiro planejado · 0%           │
│ FXY2B31                              │
└──────────────────────────────────────┘
```

A primeira linha é o caminho de hoje (`describeTripSelectorPath`). Ela quebra linha e não é cortada.

### 2. Cabeçalho da viagem ativa (também com uma viagem só)

```text
Minha viagem
Veículo GCQ8E47
┌──────────────────────────────────────┐
│ ◉ Início                             │
│   Transportes Exemplo (barracão)     │
│   Rua do Galpão, 10 · Centro ·       │
│   São Paulo/SP · 01000-000           │
│ ◎ Fim                                │
│   Volta ao barracão                  │
│ ──────────────────────────────────── │
│ 38,6 km             ~1 h 52 min      │
│ distância           duração total    │
│ 1 h 12 min de estrada                │
│ + ~40 min em 3 paradas               │
│ Inclui a volta: 9,4 km · 18 min      │
│ ──────────────────────────────────── │
│ 50% da viagem                        │
│ 3 de 6 notas resolvidas              │
└──────────────────────────────────────┘
 ████████████ ▒▒▒▒▒▒▒▒▒▒▒ ░░░░░░░░░░░
 1 de 3 paradas
```

A barra é a de hoje, com um segmento por parada. A novidade é a legenda visível.

Variantes:

```text
│ 12,4 km             31 min           │  ← sem medição
│ distância           de estrada       │    de parada (D4)
│ Tempo nas paradas ainda sendo        │
│ medido.                              │
```

```text
│ ◉ Início                             │  ← sem barracão
│   1ª parada · Av. Brasil, 500        │    (D5), fim na
│   A saída do barracão não entrou     │    última (D6), e
│   na conta.                          │    parada fora
│ ◎ Fim                                │    do traçado
│   Última parada · Rua Augusta, 90    │    (D13)
│ ⚠ 1 parada fora da conta: sem        │
│   endereço localizado.               │
```

```text
│ ◎ Fim                                │  ← fim `address`
│   Término cadastrado pela empresa    │
│ ...                                  │
│ Inclui o trecho até o término:       │
│ 6,1 km · 11 min                      │
```

### 3. Viagem sem roteiro planejado

```text
Minha viagem
Veículo FXY2B31
┌──────────────────────────────────────┐
│ Sem roteiro planejado                │
│ Distância e tempo aparecem quando o  │
│ escritório planejar a rota.          │
│ ──────────────────────────────────── │
│ 0% da viagem                         │
│ 0 de 1 nota resolvida                │
└──────────────────────────────────────┘
 ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
 0 de 1 parada
```

Snapshot anterior ao deploy (`route` ausente): só o bloco da porcentagem.

### 4. Painel — detalhe da viagem (D7)

```text
Separada ─ Carregada ─ Em rota ─ Entregue
  6 de 6    6 de 6     6 de 6     2 de 6
1 devolvida
50% da viagem · 3 de 6 notas resolvidas
Previsão de término: 16:40
```

Só a linha "50% da viagem" é nova. O resto é o `TripProcessFlow` de hoje.

## Histórias priorizadas

### P1 — O motorista vê o tamanho da viagem

**Given** uma rota congelada barracão → 3 entregas → barracão, com 38,6 km, 1 h 12 min e volta de
9,4 km/18 min, e uma empresa com mediana medida de 13 min 20 s.
**When** ele abre a app.
**Then** vê "38,6 km", "~1 h 52 min", "1 h 12 min de estrada + ~40 min em 3 paradas" e "Inclui a
volta: 9,4 km · 18 min", sem pedágio nem valor.

### P1 — Sem medição, o tempo de parada não é inventado

**Given** uma empresa com menos amostras válidas que o mínimo.
**When** o motorista abre a viagem.
**Then** vê "1 h 12 min de estrada" e "Tempo nas paradas ainda sendo medido", sem total e sem os
600 s.

### P1 — O motorista vê de onde sai e onde termina

**Given** a origem vinda do endereço da empresa.
**When** ele abre a app.
**Then** vê "Início: Transportes Exemplo (barracão)" com o endereço e "Fim: Volta ao barracão". Com
a origem configurada à parte, vê o nome sem o endereço.

### P1 — Parada fora do traçado é dita

**Given** uma viagem congelada com uma parada sem geocódigo.
**When** ele abre a app.
**Then** vê "1 parada fora da conta". O início e o fim nomeiam paradas medidas.

### P1 — A porcentagem, igual na app e no painel

**Given** 6 notas: 2 entregues, 1 devolvida e 3 pendentes.
**When** o motorista abre a app, e o escritório abre o detalhe.
**Then** os dois leem "50% da viagem · 3 de 6 notas resolvidas". A barra da app tem a legenda "1 de
3 paradas".

### P1 — Viagem sem roteiro não inventa número

**Given** uma viagem sem `planned_route`.
**When** ele abre a app.
**Then** vê "Sem roteiro planejado", e a porcentagem continua.

### P2 — Duas viagens, cada item diz o seu tamanho

Cada item do seletor mostra o caminho, "Início · Fim", "km · duração · %", as paradas fora da conta
(quando houver) e a placa.

### P2 — Sem rede

O snapshot com `route`/`stopTime` reabre com os mesmos números. O snapshot anterior ao deploy mostra
só a porcentagem.

## Requisitos funcionais

### API

- **RF1** `GET /me/trips/current` acrescenta por viagem:

  ```text
  route: null | {
    distanceMeters, durationSeconds,          // total congelado, volta incluída
    lastLegDistanceMeters, lastLegDurationSeconds,  // 0 sem trecho final; duração null se
                                              // as pernas não casarem com trailingLegs
    origin: { kind: 'depot', name: string | null, address: string | null }
          | { kind: 'first_stop', stopId: string },
    end:    { kind: 'depot' | 'address' | 'unspecified' }
          | { kind: 'last_stop', stopId: string },
    excludedStopCount: number | null,
    isFromPreviousStopOrder?: boolean         // RF9, só com a 192
  }
  stopTime: null
    | { status: 'measured', estimatedSeconds: number, stopCount: number }
    | { status: 'measuring', stopCount: number }
    // omitido quando a medição está indisponível (D16)
  // stopCount = todas as paradas da viagem, inclusive fora do traçado (D15)
  ```

- **RF2** `route` é `null` em três casos:
  - `planned_route_frozen_at` nulo;
  - `planned_route` recusado por `parsePlannedRoute`;
  - `depot` recusado por `parsePlannedRouteDepot`.

  Uma última perna malformada torna `lastLegDurationSeconds` `null`, sem derrubar a rota. Não existe
  rota parcial.

- **RF3** `origin.address` só vem com `originSource = 'company_address'` e `description` presente.
  `origin.name` = `description.tradeName` (ou `null`).
- **RF4** `end.kind` segue esta ordem:
  - `trailingLegs = 0` ou barracão ausente → `last_stop`;
  - `trailingLegs = 1` com `endKind` → o gravado;
  - `trailingLegs = 1` sem `endKind`, ou com valor fora da lista → `unspecified`.

  `first_stop`/`last_stop` apontam a primeira e a última parada **fora** de `excludedStopIds`, em
  `sequence`.

- **RF5** O congelamento grava duas chaves. Isso vale em todas as portas de `freezeTripPlannedRoute`
  (a composição `tripRouteTollFreezer`, `main.ts:1921`, usada em :1951, :2003, :2152, :2625 e
  :3721):
  - `planned_route.depot.endKind` vem da chave de fim resolvida por `readDepot`
    (`route-depot.query.ts:78-148`): igual à origem → `depot`; outra → `address`; sem trecho final
    → `last_stop`.
  - `planned_route.excludedStopIds` vem do leitor de coordenadas, que passa a devolver também as
    paradas sem coordenada (`trip-stop-coordinates.support.ts`).

  O `GET .../route-geometry` do painel ganha `depot.endKind`, e o type guard do painel ignora campo
  a mais.

- **RF6** A resposta **não** traz pedágio, custo, coordenada do barracão, telefone, `points`, `legs`,
  mediana por cliente nem chave de cliente.
- **RF7** Leitura em lote e sem N+1. Do jsonb saem só `-> 'depot'`, `-> 'excludedStopIds'` e
  `-> 'legs' -> -1`, **nunca** `points`. Cada pedaço passa por um parser defensivo
  (`parsePlannedRouteDepot`, `parseRouteLeg`, `parseStopIdList`).
- **RF8** O escopo não muda: `trip.read`, o motorista pelo vínculo e o `companyId` do contexto.
- **RF9** _(convivência com a 192; implementa quem chegar por último.)_ Se o último
  `trip_stop_order_events` da viagem tem `route_recomputed = false`, então
  `route.isFromPreviousStopOrder = true`. É uma consulta em lote para todas as viagens.
- **RF10** Tempo de parada:
  - `stop-service-sample.policy.ts` (D14) e `trip-stop-time.policy.ts` (D15, sobre
    `resolveServiceTime`), as duas puras;
  - `drizzle-stop-service-samples.query.ts`, uma consulta por empresa. Ela seleciona
    `trip_id`, `address_key`, os eventos (tipo, canal, `captured_at`, `recorded_at`) e o
    `tax_id` do destinatário das notas. Não seleciona ator nem motorista;
  - o adaptador com cache atrás de `StopServiceTimeEstimatePort`: valor vencido serve enquanto
    recalcula, `statement_timeout`, e a falha vira `warn` com o `stopTime` omitido (D16).

  `stopTime` é `null` quando `route` é `null`, e é omitido quando a medição está indisponível.

### App do motorista

- **RF11** O validador lê `route` e `stopTime` em três estados: ausente → chave omitida; `null` →
  `null`; objeto → validado campo a campo. Objeto malformado → chave omitida, sem derrubar a viagem.
- **RF12** `computeDocumentProgress(trip)` conta as notas do snapshot, onde a nota liberada
  (`released_at`) já não vem, e devolve `{ settledCount, totalCount, percent }`. `percent` é o
  piso, ou `null` sem nota. Usa `isDocumentSettled`.
- **RF13** `driverRouteFormat.service.ts` traz dois formatadores:
  - `formatRouteDistance`, com a regra do cartão;
  - `formatDuration`, cópia por valor da 138 com o cabeçalho da ADR-0075 §7, registrada no mapa de
    `test/driver-trip/copy-by-value-header.contract.ts`.
- **RF14** `driverTripRouteView.service.ts` tem duas funções:
  - `describeRouteEnds` usa o `shortStopLabel` exportado, sem cópia;
  - `buildTripRouteSummaryView` monta início e fim, a estrada, o tempo de parada, o total, o
    último trecho, as paradas fora da conta e a porcentagem.
- **RF15** `DriverTripRouteSummary.component.tsx`, declarativo, entra no cabeçalho da viagem ativa.
- **RF16** O seletor ganha as linhas novas por item.
- **RF17** A barra por parada ganha legenda visível.
- **RF18** Textos em `driverTrip.locale.json` e `.en`, com plural. Nada de texto hardcoded.

### Painel

- **RF19** `resolveTripProgress` passa a calcular `percent` por nota, com piso. **Nota liberada
  (`released_at` não nulo) não conta**, como na app: o snapshot já filtra
  (`drizzle-current-driver-trip.repository.ts:723`).
  - Entram as notas vinculadas da viagem, o mesmo conjunto de `buildTripProcessFlow`: a T0.1
    confere qual é.
  - `completedStops`/`totalStops` e o ritmo da previsão (`estimatedCompletionAt`) continuam por
    parada: o ritmo mede o tempo entre portões.
- **RF20** `TripProcessFlow` exibe "N% da viagem · X de Y notas resolvidas" junto da previsão, com
  chaves em `trip.locale.json` e `.en`.

## Requisitos não funcionais

- **Tempo de operação, nunca de pessoa** (D17). Um contrato negativo cobre a consulta e a resposta.
- **LGPD.** O barracão é dado da empresa. `docs/SECURITY.md` ganha uma linha: o snapshot leva nome e
  endereço fiscal da empresa, e quando a empresa é ME ou empresário individual o endereço fiscal
  pode ser a casa do titular. Nenhum dado de cliente novo.
- **Offline:** as regras de dono e validade do snapshot não mudam.
- **Acessibilidade:** o quadro é `section` com título, os números têm rótulo, o contraste vale nos
  dois estados do botão, e os alvos têm ≥ 44 px.
- **Layout:** sem rolagem horizontal em 375 px. Texto longo quebra, não corta.
- **Precache:** nenhuma dependência nova.
- **Tokens:** o CSS novo usa só `var(--…)` do design system. Um contrato varre as classes novas do
  módulo e reprova cor literal (`#`, `rgb(`, `hsl(`) e `px` fora de `0`/`1px` (CA17).

## Casos extremos e falhas

| Caso                                                                   | Comportamento                                                                                                                           |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `planned_route` nulo (nunca planejada, ou OSRM fora antes do despacho) | "Sem roteiro planejado"                                                                                                                 |
| jsonb malformado                                                       | `route: null` (RF2); última perna malformada → `lastLegDurationSeconds: null`                                                           |
| barracão ausente (097 D2)                                              | início na 1ª parada medida + aviso; fim `last_stop`                                                                                     |
| `description` nulo                                                     | início "Barracão", sem nome e sem endereço                                                                                              |
| `originSource = 'route_settings'`                                      | nome, sem endereço                                                                                                                      |
| rota congelada antes da 198 com volta                                  | fim "com volta" (`unspecified`), `excludedStopCount: null`                                                                              |
| viagem despachada congelada antes da 198                               | **não recongela** (vínculo bloqueado, `trip-state.policy.ts:128-131`): fica "com volta" até fechar, e só a reordenação da 192 recongela |
| parada sem geocódigo no congelamento                                   | "N paradas fora da conta"; início e fim pulam essa parada                                                                               |
| todas as paradas fora                                                  | não acontece: sem pontos não há rota (`plan.stops.length < 2`), e a viagem cai em "Sem roteiro"                                         |
| fim `address`                                                          | "Término cadastrado pela empresa" / "Inclui o trecho até o término"                                                                     |
| empresa abaixo do mínimo de amostras                                   | `measuring` → só estrada + "ainda sendo medido"                                                                                         |
| consulta de amostras falha ou estoura o tempo                          | `warn`; valor antigo, ou `stopTime` omitido → só "X de estrada"; GET segue `200`                                                        |
| relógio misto (um extremo com `captured_at`, outro sem)                | fora da amostra, contado no `debug`                                                                                                     |
| duas irmãs com "Cheguei" juntos no portão                              | a segunda começa no último desfecho da primeira                                                                                         |
| cliente abaixo do mínimo, empresa acima                                | a parada dele usa a mediana da empresa                                                                                                  |
| parada com dois destinatários (antes da 197)                           | a amostra conta só para a empresa                                                                                                       |
| chegada e entrega drenadas juntas, sem `captured_at`                   | < 30 s → fora da amostra                                                                                                                |
| parada aberta de um dia para o outro                                   | > 2 h → fora                                                                                                                            |
| baixa pelo escritório                                                  | `office` → fora                                                                                                                         |
| viagem sem nota                                                        | sem porcentagem, na app e no painel                                                                                                     |
| 1 de 3 notas                                                           | 33%, pelo piso                                                                                                                          |
| snapshot anterior ao deploy                                            | só a porcentagem                                                                                                                        |
| 192: reordenação sem OSRM depois do despacho                           | números da ordem anterior, com "prevista para a ordem anterior" (RF9)                                                                   |

## Critérios de aceite

- **CA01** O contrato da API é visto vermelho antes da implementação, com `route` e `stopTime` nos
  estados da RF1.
  - O **negativo** roda em `test/driver-trip/me-routes.contract.ts`, sobre o corpo HTTP, e na
    integração.
  - Ele varre **só dentro de `route` e `stopTime`** e reprova qualquer destas chaves: `toll`,
    `plannedToll`, `cost`, `phone`, `points`, `legs`, `latitude`, `longitude`, `taxId`,
    e `median`.
- **CA02** `origin` e `end` têm uma linha de contrato por variante da RF3/RF4, inclusive `endKind`
  ausente, barracão ausente e paradas excluídas nas pontas.
- **CA03** Integração com o banco.
  - Congelar grava `endKind = 'depot'` e `excludedStopIds` (uma parada sem geocódigo), testado em
    `freeze-trip-planned-route.integration.ts`.
  - O `endSource` de `readDepot` é testado em `route-depot-query.integration.ts`.
  - `GET /me/trips/current` devolve `end.kind = 'depot'` e `excludedStopCount = 1`, e a outra
    empresa não aparece.
- **CA04** Os contratos do painel sobre `route-geometry` continuam verdes.
- **CA05** O validador da app, em `test/driver-trip/route-response.contract.ts`: ausente, `null`,
  objeto e malformado.
- **CA06** Porcentagem, **a mesma tabela nos dois apps**: 3/6 → 50; 1/3 → 33; 6/6 → 100; 0 → `null`;
  `returned` conta.
- **CA07** Formatadores:
  - 105500 m → "105,5 km";
  - 12000 s → "3 h 20 min";
  - 2700 s → "45 min";
  - 93900 s → "1 d 2 h 5 min";
  - o total "~1 h 52 min" e "+ ~40 min em 3 paradas", com plural.

  O contrato de cópia por valor reconhece o `formatDuration` copiado.

- **CA08** O quadro aparece com **uma** viagem, e as variantes do § Preview são cobertas.
- **CA09** O seletor mostra as linhas novas. O CA12 da 189 (`driver-app.smoke.spec.ts:562-608`)
  casa por substring: conferir antes de mexer, e só mexer se quebrar, sem afrouxar.
- **CA10** Smoke em 375 px, sem rolagem horizontal, com alvos ≥ 44 px.
- **CA11** O snapshot reabre sem rede com os mesmos números.
- **CA12** 👤 Prints de 375 e 768 px no preview (53200 + 53901) e do painel, e o **"pode subir"** do
  usuário no `evidence.md`, antes de qualquer push de front.
- **CA13** `make check` verde e os dois comandos de teste da API. Deploy na ordem API → app → painel.
- **CA14** Amostra e agregado (D14/D15):
  - vai do primeiro `arrived` ao último desfecho;
  - **mesmo relógio:** os dois com `captured_at`, ou os dois com `recorded_at`. A amostra mista fica
    fora e é contada no descarte;
  - **irmãs:** duas paradas da mesma viagem e do mesmo `address_key`, com os dois "Cheguei" juntos.
    A amostra da segunda começa no último desfecho da primeira;
  - ficam fora: `office`, `whatsapp`, < 30 s, > 2 h e parada sem `arrived`;
  - o cliente é o CNPJ/CPF normalizado, e só conta com todas as notas dele;
  - a escala é cliente → empresa → `measuring`, com a soma de todas as paradas;
  - 91 dias fica fora da janela, e o mínimo vem da configuração (5 sem linha).
- **CA15** Integração com o banco:
  - 5 paradas medidas → `measured`, e a outra empresa → `measuring`;
  - os eventos são gravados pelo caso de uso do app com `location.capturedAt` **espaçado** (por
    exemplo, 10 min entre chegada e entrega). Com `recorded_at` em `defaultNow`, toda amostra cairia
    no piso de 30 s;
  - uma segunda leitura na mesma hora não consulta o banco.
- **CA15a** Falha da consulta (contrato do adaptador, com porta falsa):
  - rejeição ou timeout → `warn`, `stopTime` omitido e GET `200`;
  - com valor antigo em cache, ele é servido;
  - a `Promise` rejeitada sai do mapa, e a leitura seguinte tenta de novo;
  - vencido o TTL, o valor antigo sai na hora e o recálculo roda em segundo plano.
- **CA16** Privacidade: a consulta de amostras não seleciona `actor_user_id`,
  `reported_by_driver_id` nem `on_behalf_of_driver_id`.
- **CA17** Contrato de CSS: as classes novas do quadro e do seletor usam só `var(--…)`.
- **CA18** Painel: `resolveTripProgress` com a tabela do CA06, e o `TripProcessFlow` exibe a linha
  nova.

## Dúvidas

Nenhuma bloqueante.

- **Q1 — respondida (usuário, 2026-09-25):** a duração é estrada + paradas medidas pelos eventos (D4,
  D14–D17).
- **Q2 — respondida (usuário, 2026-09-25):** a porcentagem é por nota, na app e no painel (D7,
  RF19–RF20).
- **Q3 — o piso de 30 s e o teto de 2 h (D14)** foram escolhidos sem dado de produção. A T0.1 mede a
  distribuição em staging e anota. Se descarga longa de verdade for comum, o teto sobe antes da T1.5.

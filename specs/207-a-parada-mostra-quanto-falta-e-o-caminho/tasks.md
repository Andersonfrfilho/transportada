# Tasks — Spec 207 (revisão 3)

> Revisão 3 (2026-09-26): a **T0.1 rodou**. Três premissas caíram, e as tasks abaixo já refletem isso.
> A § `T0.1` do `evidence.md` é a fonte — não remeça.
>
> - **T2.8 não está mais bloqueada:** o P0 do ETA é a spec **210**, 4/4 tasks, em `origin/staging`
>   (`9f4ad2009`).
> - **T1.1:** `vertexCount` é leitura própria do `annotation.nodes` cru; **não** usar `toNodeIdsByLeg`.
> - **T1.2:** entrega **só a trava** (criada por esta spec). O CAS é da 192.

**👤 = ação humana.** O executor para, descreve o passo exato, espera o "feito" e confere o efeito.
**🧠 = task que sobe para `opus`** dentro de uma fase mais barata.

## Base

A 207 começa quando três condições estiverem valendo:

- `work/driver-app` e a 199 (`cc3495272`) estão em `origin/staging`;
- `git status --short` está vazio;
- a T0.1 passou.

A branch nasce na própria árvore, com `git switch -c work/spec-207 origin/staging`. Nada de
`make worktree` nem `git stash`.

## Bloqueios declarados

| Task               | Depende de                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1.3b, T2.2b       | 206 em `origin/staging` (`en_route_since`, `enRouteTappedAt`, `resolveEnRouteStopId`). **Único bloqueio por spec irmã que resta.**                                                                                     |
| degrau 3 da âncora | a 196 (`start-route` com `captured_at`); até lá, `startRouteCapturedAt` sai `null`                                                                                                                                     |
| ~~T2.8~~           | **Desbloqueada.** O P0 do ETA multi-veículo é a spec **210**, com 4/4 tasks e em `origin/staging` (`9f4ad2009`; `clockSeconds` dentro do laço de veículos, `route-optimization.effect.ts:343`). A T2.8 roda na Fase 2. |

O CAS por `stop_order_version` **não é bloqueio**: ele saiu do escopo desta spec (a coluna é da 192,
que precisa de migration). Ver T1.2.

## Como cada task fecha

Toda task de comportamento começa pelo contrato ou teste, **visto vermelho**. Ela fecha com:

- `bun run typecheck`, `bun run lint` e os testes da app tocada;
- na API, os **dois** comandos, de dentro de `apps/api-transportada`:
  - `bun --env-file=../../.env.test test --timeout 120000`;
  - `bun --env-file=../../.env.test run test:integration`, sempre que tocar `test/integration/**`,
    uma query ou um repositório. Sem o `--env-file` a integração **pula**, e pular não é passar;
- a suíte nova importada no **entrypoint nomeado**:
  - API: `test/trip-application.contract.test.ts` e `test/driver-trip.contract.test.ts`;
  - app: `test/driver-trip.contract.test.ts`.

  Um `*.contract.test.ts` novo, se houver, entra no script `test` do `package.json`;

- evidência no `evidence.md`, com comando, contagem e trecho;
- commit isolado, com `--no-verify` e caminhos explícitos.

## Proibido nesta spec

- **Migration.** Se alguma task concluir que precisa de uma, **pare e pergunte**. Se autorizada, ela
  entra só aditiva, com `rollback.sql` e na lista do `static-migration.contract.ts`.
- **CAS por `stop_order_version`.** A coluna não existe e criá-la é migration da 192 — logo o CAS está
  **fora desta spec** (T1.2). Não inventar coluna, nem tocar na 192.
- **Reaproveitar `toNodeIdsByLeg` (gateway `:123-152`) para `vertexCount`.** Ele deduplica e o número
  sai errado **em silêncio** (2643 contra 2702 na medição). A leitura é própria, do `annotation.nodes`
  cru (T1.1).
- **Editar specs irmãs** (192, 196, 198, 199, 204, 205, 206).
- **Criar função própria para escolher a parada a caminho.** Isso é da 206.
- **`recorded_at` como âncora.** Mandar a posição do motorista ao servidor. Usar o ponto local como
  carimbo de toque.
- **Dependência nova na app.** `maplibre` e `pdfjs` seguem proibidos pelo `dist.contract`.
- **Zerar colunas de perna em código.** Com OSRM fora vale `kept_previous`, da 192.

**Tela nova roda primeiro no preview local** e só sobe depois do **"pode subir"**. Ordem de deploy:
API e depois app.

## Fase 0 — Base, ADR e medição

> 🤖 Modelo: `opus` (fase inteira 🧠: arquitetura e ADR)

- [x] **T0.1** 🧠 Base e premissas contra o código. Tudo vai para o `evidence.md` (§ `T0.1`, já
      escrita — é a fonte da verdade desta revisão).
  - **Resultado:** três premissas da revisão 2 caíram (T2.8 não bloqueada; `vertexCount` não sai do
    `nodeIdsByLeg`; CAS fora do escopo), mais três achados dobrados (ordem de trava sem ciclo;
    `kept_previous` sem produtor em produção; divergência com a 206 em `206/spec.md:427`). A § "Base"
    abaixo **continua não valendo**: `work/driver-app` não está em `origin/staging` e
    `git status --short` tem 17 arquivos de WIP de outras sessões. A T0.1 **não libera a Fase 1** —
    quem abrir `work/spec-207` confere as três condições de novo.
  - **Medição que ficou pendente:** a taxa de limites que não fecham num **lote real** (≥ 20 viagens)
    não foi medida, por falta de credencial do banco de staging. Passou para a **T1.5**.
  - **Base.**
    - `git merge-base --is-ancestor cc3495272 origin/staging`.
    - `work/driver-app` está em `origin/staging`.
    - `git status --short` está vazio.
    - Se faltar qualquer um dos três, **pare e avise**.
  - **192.** Já chegou? Conferir:
    - `lockTripForStopOrder`, o CAS e o `kept_previous`;
    - quem escreve `distance_from_previous_*`.

    Registrar se a 207 vai criar `lockTripForStopOrder` (no molde do `plan.md` da 192) ou usar o que
    existe.

  - **206.** Os nomes finais de `enRouteTappedAt` e `resolveEnRouteStopId`, e o estado dela em
    staging.
  - **P0 do ETA.** O número da spec e o estado dela.
  - **OSRM.** Uma resposta real de staging do `/route` com `annotations=nodes`.
    - `sum(nodes.length − 1)` bate com `geometry.coordinates.length − 1`? **Sim, em 34 de 34 rotas.**
    - ~~Medir num lote real (≥ 20 viagens) a taxa em que os limites não fecham~~ → **passou para a
      T1.5** (sem credencial do banco de staging aqui).
  - **Logger.** O logger da API redige um array de pares `[lat, lng]`? **Não** — a T1.4 entrega a
    redação.

- [ ] **T0.2** 🧠 ADR-0087 passa a "aceita" depois da segunda rodada do `critic` (`opus`).
  - Se a revisão pedir a opção (b) do mapa, **pare e pergunte ao usuário** (Q1).

## Fase 1 — API

> 🤖 Modelo: `sonnet` (T1.1 e T1.2 são 🧠 `opus`, validadas por `architect` antes de implementar)

- [ ] **T1.1** 🧠 Limites de perna no gateway (D3a, RF4).
  - Primeiro o contrato, em `test/trip-application/route-geometry.contract.ts`, que já existe:
    - `vertexCount` por perna, como `annotation.nodes.length − 1`, lido **do campo cru**;
    - **um caso que prova que a contagem deduplicada não é a usada**: com uma resposta que tenha
      repetições consecutivas internas à perna, `vertexCount` conta os nós repetidos, e a soma bate
      com `coordinates.length − 1` — o número do `nodeIdsByLeg` (menor) reprova;
    - **perna de 0 m com dois nós distintos contribui 1**, e `legPointStarts` avança 1, não 0;
    - a simplificação por perna mantém cada limite;
    - `legPointStarts` exato;
    - resposta sem `annotation`, que dá `legPointStarts` ausente.
  - Depois, `osrm-route-geometry.gateway.ts` (`toLegs`, `:175-188`) e
    `read-route-geometry.use-case.ts:425`.
  - ⚠️ **Não reaproveitar `toNodeIdsByLeg` (`gateway.ts:123-152`) para `vertexCount`.** Ele deduplica,
    e a premissa do comentário de `:115-118` ("o OSRM repete o nó da parada no fim de um trecho e no
    começo do seguinte") foi **medida como falsa** em rota real de staging: nos três limites de uma
    rota de 5 paradas **nenhum** nó se repete. O que a dedup remove são repetições **internas** à
    perna (15, 0, 37 e 11 nós), e por isso a soma dela dá **2643** contra **2702** segmentos de
    geometria. Usá-la desalinharia a fatia de `path` em dezenas a centenas de pontos por perna **sem
    nada falhar** — é o tipo de erro que só aparece no desenho torto. A leitura do `vertexCount` é
    **própria**, sobre `annotation.nodes` cru.
  - A dedup em si **não** se mexe aqui: o achado de que ela pode subcontar praça de pedágio é da 090 e
    pede spec própria.
  - O painel continua desenhando com tolerância de 5 m, e o contrato compara o desvio.
- [ ] **T1.2** 🧠 Perna por parada e escrita sob a trava que **esta spec cria** (D3, D4, RF3).
  - **Escopo medido na T0.1, e menor do que a revisão 2 dizia:**
    - `lockTripForStopOrder` **não existe** em `apps/`, nem nesta árvore nem em `origin/staging` — só
      em prosa da 192. A 207 o **cria**, com a assinatura de `specs/192-.../plan.md:74-79`, e a 192
      herda;
    - **sem CAS.** `stop_order_version` não existe e a migration é da 192 (0/16 tasks). A 207 proíbe
      migration, então a T1.2 entrega **só a trava**. Se algo aqui parecer exigir a coluna, **pare e
      pergunte**;
    - **nenhum caller precisa ser convertido.** Nenhum caminho de hoje trava linha de `trip_stops`:
      os 12 `.for(...)` de `src/trips/infrastructure/**` travam só `trips`, e a chegada
      (`drizzle-driver-field-report.repository.ts:458`) lê `trip_stops` **sem** `FOR UPDATE` antes de
      travar `trips` (`:471`). A ordem nova `trip_stops` → `trips` **não fecha ciclo**;
    - **`kept_previous` não tem produtor.** Ninguém escreve `trip_stops.distance_from_previous_*`
      hoje: `writeEstimatedArrivals` (`drizzle-trip-route.repository.ts:225-260`) grava só
      `estimated_arrival_at` (`:241`), e as colunas de perna escritas são as de
      `route_suggestion_stops`, pelo worker. Logo o **teste monta o estado anterior à mão** — um teste
      que só chame o caminho de produção passa sem provar nada.
  - Primeiro o contrato `test/trip-application/stop-leg-assignment.contract.ts`, no entrypoint
    `test/trip-application.contract.test.ts` (CA02), cobrindo:
    - `leadingLegs` 0 e 1;
    - parada excluída no meio;
    - perna de 0 m, com `legPointStarts` avançando **1**;
    - `kept_previous`, com o **estado anterior montado à mão**;
    - despacho forçado que apaga parada (`drizzle-trip-route.repository.ts:753-823`);
    - parada geocodificada depois do congelamento.
  - O `test/trip-application/freeze-trip-planned-route.contract.ts`, que já existe, ganha
    `tracedStopIds`, `legPointStarts` e o caso "OSRM fora não zera".
  - A escrita fica em `writePlannedRoute`, **dentro de `lockTripForStopOrder`**
    (`trip_stops FOR UPDATE ORDER BY id` → `trips FOR NO KEY UPDATE`), na transação recebida. **Sem
    CAS.**
  - Integração em `test/integration/freeze-trip-planned-route.integration.ts` (CA03):
    - a escrita;
    - OSRM fora mantém o anterior, com o anterior **montado à mão**;
    - **congelamento concorrente com uma chegada, em duas conexões**: sem `40P01` e com estado final
      consistente. Isso é **rede de segurança**, não correção de defeito existente — a T0.1 já mostrou
      que nenhum caminho de hoje trava `trip_stops`, então o `40P01` é improvável. O teste fica para o
      dia em que um caller passar a travar a tabela.
- [ ] **T1.3a** Perna e `path` no snapshot, com os degraus 2 e 3 da âncora (D4a, D5, D8a, RF2, RF5,
      RF6).
  - Primeiro o contrato `test/trip-application/driver-leg.contract.ts`, cobrindo:
    - `leg` em toda pendente com `fromStopId` em `tracedStopIds`;
    - `path` só nas duas primeiras pendentes;
    - a fatia por `legPointStarts`;
    - o teto de 200 e as 5 casas;
    - sem o primeiro ponto na perna de saída;
    - o cache por `(tripId, stopId, plannedRouteFrozenAt)`;
    - `originOutcomeCapturedAt` só com `captured_at`, e **nunca** `recorded_at`.
  - Depois, `driver-leg.policy.ts` e `listLegRoutes` em lote. `startRouteCapturedAt` sai `null` até
    a 196.
- [ ] **T1.3b** _(bloqueada: 206 em `origin/staging`)_ `path` também na parada com `en_route_since`,
      quando ela estiver fora das duas primeiras. O contrato vem antes, na mesma suíte. A âncora do
      degrau 1 é o `enRouteTappedAt` da 206, que a 207 **não** serializa.
- [ ] **T1.4** ETA, agendamento e divergência (RF1, D9, D10).
  - `listStops` ganha `estimatedArrivalAt` e as colunas de perna.
  - `listDocuments` ganha `leftJoin delivery_clients` por `(company_id, tax_id)`, sem consulta extra.
  - `listSchedules` ganha `divergedAt`.
  - Os tipos mudam em `find-current-driver-trip.use-case.ts:63-76`.
  - **A redação entra aqui, sem condicional.** A T0.1 mediu: o logger **não** redige array de pares
    `[lat, lng]` (`redact.ts:15-41` sem `path`/`coordinates`/`geometry`/`lat`/`lng`; `:76-83` devolve
    fracionário cru; `:130-132` mapeia array sem contexto de chave). A forma é `extraKeys` na chamada
    de redação, com `path`, `points`, `geometry` e `coordinates`, no molde de `sentry.service.ts:23` —
    no logger, não em disciplina de call site (`security.md` §1).
  - Contratos vermelhos antes em `test/driver-trip/current-trip.contract.ts` e `me-routes.contract.ts`
    (CA01), incluindo os negativos.
  - Integração em `test/integration/me-trip.integration.ts` (CA04):
    - `leg` e `path`;
    - `requiresScheduling` com cliente que exige, que não exige e parada misturada;
    - `isDiverged`;
    - **tenant**: outra empresa com o mesmo `tax_id` e `requires_scheduling` diferente;
    - **contagem de consultas por GET**.
- [ ] **T1.5** Publicar a API em staging. **Aceite em staging:**
  - a app de staging continua abrindo, porque ignora chave a mais;
  - o `GET /me/trips/current` de staging, com o motorista de teste, traz `estimatedArrivalAt`,
    `requiresScheduling`, `schedule.isDiverged` e `leg`;
  - `leg` não é nulo numa viagem planejada depois do deploy.

  O corpo vai para o `evidence.md` sem coordenada e sem nome.
  - **Medição que a T0.1 não pôde fazer, e que fecha aqui:** a taxa de limites de perna que **não
    fecham** num **lote real**, ≥ 20 viagens. A T0.1 só teve proxy sintético (25 requisições, 30
    rotas, **0 falhas**) mais 34 rotas reais a favor de
    `sum(nodes.length − 1) === coordinates.length − 1`; faltou credencial do banco de staging para ler
    coordenadas de paradas reais. Com a API já em staging: ler as coordenadas de ≥ 20 viagens
    planejadas por `GET` autenticado (ou consulta de **leitura** ao Postgres de staging), repetir o
    laço contra o `/route` e registrar a taxa no `evidence.md`. **Não assumir número.**
    - Se a taxa vier **acima de zero**, o caminho já está previsto: `path: null` com `warn` sem PII
      (RF4, § Riscos do plano). Não há decisão nova — a perna (os três números) continua valendo.
    - Nada de escrita em staging.

## Fase 2 — App do motorista

> 🤖 Modelo: `sonnet` (T2.6 → `haiku`)

- [ ] **T2.1** Tipos e validação (RF9).
  - Os casos entram nas suítes de `toDriverTripSnapshot` que já existem: `schedule.contract.ts` para
    `isDiverged` e `requiresScheduling`.
  - `leg` e `path` vão numa suíte nova, `trip-response-leg.contract.ts`.
  - Cobrir API antiga, `leg` malformado e `path` com 1 ponto.
- [ ] **T2.2a** Chegada estimada, com os degraus 2 e 3 (RF10, D4, D5, D6).
  - Primeiro o contrato `test/driver-trip/approach-estimate.contract.ts`, cobrindo:
    - perna válida só com `fromStopId` igual à última concluída, ou `'depot'`;
    - o desfecho ainda na fila vale pela hora local;
    - sem `captured_at` o degrau não vale;
    - `upcoming` e `overdue`;
    - a fronteira em que `now` é igual a `arrivalAt`.
  - A parada mostrada é a de `findCurrentStop` (da 206), **sem editá-la**.
- [ ] **T2.2b** _(bloqueada: 206 em `origin/staging`)_ A parada a caminho passa a ser a de
      `resolveEnRouteStopId`. O degrau 1 é `enRouteTappedAt`, ou o `depart` na fila e não
      `rejected`. O contrato vem antes, na mesma suíte.
  - Os nomes foram conferidos na T0.1 contra a revisão 3 da 206: `enRouteTappedAt` e
    `resolveEnRouteStopId({ stops, queueView })` **não mudaram**.
  - ⚠️ **Recuo por `enRouteSince` é recusado aqui.** A `206/spec.md:427` diz que a 207 usa
    `enRouteTappedAt` "e `enRouteSince` quando ele for nulo"; **vale a regra da 207** — o recuo é a
    **hora local do item na fila**, porque `enRouteSince` é hora de servidor e cai na proibição desta
    spec. A frase da 206 está desatualizada; a 207 **não edita spec irmã**, então **quem executar a
    206 tem de ser avisado desta divergência** (registrada em `evidence.md` § T0.1 e em `spec.md` D5).
    Se a 206 chegar com o recuo por `enRouteSince`, esta task o recusa e o contrato prova.
- [ ] **T2.3** Posição local e relógio (RF11, RF12, D7, D17).
  - Primeiro os contratos `test/driver-trip/local-position.contract.ts` e `now-clock.contract.ts`,
    com dublês de `geolocation`, `permissions`, `setInterval`, `clearInterval` e visibilidade:
    - `granted`, `prompt`, `denied` e API ausente;
    - só lê em `granted`;
    - o gesto "Mostrar distância" pede a permissão;
    - `enableHighAccuracy: false` e `timeout: 8000`;
    - 60 s só com a tela visível;
    - reusa o ponto do compartilhamento;
    - descarta precisão acima de 1000 m;
    - um temporizador só no relógio.
  - Contrato de import: `localPosition.service.ts` não importa `driverTripClient.service.ts` nem a
    fila.
  - O `locationSharing.service.ts` ganha `onLocalPosition`. O contrato prova que o ponto não passa
    pelo `send`.
  - Troca a leitura única de `DriverTripWorkspace.page.tsx:161-169`.
- [ ] **T2.4** Selo e alerta (RF15, RF16, D9, D12–D16).
  - Primeiro os contratos `test/driver-trip/scheduling-badge.contract.ts` e
    `schedule-alert.contract.ts`, com a **tabela de casos**:
    - `tight`, `late` e `past`;
    - sem risco, sem selo;
    - as fronteiras: folga igual à margem, estimativa igual ao limite, `now` igual ao limite;
    - estimativa vencida vira "sem estimativa";
    - sem estimativa, perto e longe do limite;
    - com chegada;
    - hora marcada e janela ao mesmo tempo;
    - janela só com início;
    - agendamento divergente;
    - a faixa com a seguinte na sequência.
  - `estimatedArrivalAt` ainda **não** alimenta o alerta nesta task: o parâmetro existe e fica
    desligado. É só sequência de tasks — a **T2.8 liga na mesma fase**, sem esperar spec nenhuma (o
    P0 do ETA é a 210, já em `origin/staging`).
- [ ] **T2.5** O desenho (RF14, D8, D8a). Primeiro o contrato
      `test/driver-trip/approach-path.contract.ts`, cobrindo:
  - proporção;
  - latitude média;
  - ponto fora da área, que encosta na borda com seta;
  - trecho degenerado.

  Depois, `DriverApproachPreview.component.tsx`, com `role="img"` e `aria-label`, só com tokens.

- [ ] **T2.6** Textos (RF13, RF17).
  - Blocos em pt-BR e en.
  - "{{km}} km em linha reta" e "a distância usa sua posição só no aparelho".
  - "fora da área do desenho".
  - A parada concluída não mostra km: o `stop-distance.contract.ts` é atualizado antes.
- [ ] **T2.7** Montar no cartão e na viagem (D9, D10, D15, D16).
  - O selo substitui a linha "Hora marcada" (`DriverStopCard:323-330`).
  - Token `--color-caution: #f2c14e`.
  - `DriverScheduleBanner` como `role="status"` estável envolvendo um `<button>`.
  - Conferir o `git log` do cartão antes de editar.
  - Smoke (CA07) com permissão, geolocalização e `page.clock` fixos, e filtro de rede sem coordenada.
  - `bun run build` com o `dist.contract.test.ts` intacto, e o precache anotado (CA08).
- [ ] **T2.8** Ligar `estimatedArrivalAt` como estimativa do alerta e da faixa nas paradas que não
      estão a caminho. O contrato vem antes, na tabela da T2.4.
  - **Não está bloqueada.** O P0 do ETA multi-veículo é a spec **210**, com 4/4 tasks e em
    `origin/staging` (`9f4ad2009`); o `clockSeconds` nasce dentro do laço de veículos
    (`route-optimization.effect.ts:343`, laço de `:330`), logo o ETA do escritório não sai mais inflado
    a partir do 2º veículo.
  - Fica de pé, e **fora do escopo da 207**, o achado aberto da própria 210: as pausas de jornada
    (`sinceBreakSeconds`, `route-fitness.policy.ts`, T004 da 210).

## Fase 3 — Preview, design, docs e publicação

> 🤖 Modelo: `sonnet` (T3.4 → `code-reviewer` `opus`)

- [ ] **T3.1** API de demonstração **versionada** em `apps/frontend-driver/scripts/driver-preview-api.ts`.
  - Se a T5.0 da 196 ainda não a versionou, esta task versiona e aponta o `.claude/launch.json`
    (`motorista-api-demo`, 53901) para ela.
  - Cenários:
    - **A**: parada 2 com `leg` válido, `path` de ~40 pontos e hora confirmada, com `?clock=` para os
      estados sem selo, `tight`, `late` e `past`;
    - **B**: parada 4 `requested`, parada 5 confirmada e divergente;
    - **C**: fora de ordem, com `fromStopId` que não casa, e "Sem agendamento";
    - **D**: rota antiga, sem `tracedStopIds`;
    - `?permission=prompt`;
    - `?legacy=1`.
- [ ] **T3.2** 👤 **Preview local antes de staging.**
  - Subir `motorista-api-demo` (53901) e `motorista-local` (53200).
  - Prints em **375 e 768 px**: A em cada estado, aberto e fechado, a faixa, B, C, D, `prompt` e
    `legacy`.
  - O usuário diz **"pode subir"**. Anotar no `evidence.md` (CA09), com as respostas a Q1, Q3 e Q4.
- [ ] **T3.3** Revisão de design (web.md §15), no **tema escuro**, o único que existe.
  - Contraste do âmbar, do vermelho e da tinta `#10222c` sobre o vermelho.
  - Alerta legível sem cor.
  - 44 px na faixa.
  - 375 px.
  - Leitor de tela no desenho e na faixa (o texto estável não se repete).
  - Achado é corrigido na mesma task ou vira pendência explícita.
- [ ] **T3.4** Revisão final com `code-reviewer` (`opus`) e auditoria do §15:
  - N+1, pela contagem da T1.4;
  - logs sem coordenada;
  - 500 sem stack;
  - `Set`/`Map` nas junções em lote;
  - trava e CAS da T1.2.
- [ ] **T3.5** Documentação viva, com prettier nos `.md`:
  - `apps/frontend-driver/CLAUDE.md`: distância local e permissão, `leg`, desenho, selo, alerta,
    faixa, relógio e `--color-caution`;
  - `apps/api-transportada/CLAUDE.md` e `docs/ai-context/*.md`: `tracedStopIds`, `legPointStarts`,
    a escrita sob `lockTripForStopOrder`, `requiresScheduling`, `isDiverged`;
  - `docs/SECURITY.md`: `path` sem o barracão, e a posição que fica no aparelho.
- [ ] **T3.6** Publicar a app em staging, **só depois da T3.2**. A sequência é `git fetch`, rebase
      sobre `origin/staging`, `bun install --frozen-lockfile`, os gates e `push`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/207-a-parada-mostra-quanto-falta-e-o-caminho/ (leia
spec.md, plan.md, tasks.md e docs/adr/0087-a-parada-mostra-quanto-falta-e-o-caminho.md antes de
começar; leia também apps/frontend-driver/CLAUDE.md, apps/api-transportada/CLAUDE.md e as specs
192 e 206). Uma task por vez, na ordem do tasks.md.
T0.1 JÁ RODOU: comece pela T0.2. A seção "## T0.1" do evidence.md é a FONTE das premissas — não
remeça o que está lá.
BASE: só comece se work/driver-app e cc3495272 (spec 199) estiverem em origin/staging e
git status --short estiver vazio; na medição da T0.1 duas dessas três condições NÃO valiam, então
confira de novo e, se faltar alguma, pare e avise. Branch na própria árvore:
git switch -c work/spec-207 origin/staging. Nada de make worktree nem git stash.
BLOQUEIOS: só T1.3b e T2.2b, que esperam a 206 em origin/staging; pule-as e siga, registrando no
evidence.md. A T2.8 NÃO está bloqueada — o P0 do ETA é a spec 210, 4/4 tasks e em origin/staging
(9f4ad2009) — e roda na Fase 2. O CAS por stop_order_version saiu do escopo (coluna da 192, pede
migration): a T1.2 entrega só a trava lockTripForStopOrder, que esta spec CRIA.
PREMISSAS MEDIDAS que mudam a implementação: (1) vertexCount sai do annotation.nodes CRU
(nodes.length − 1), em leitura própria — NUNCA do toNodeIdsByLeg do gateway, que deduplica e somou
2643 contra 2702 segmentos; perna de 0 m contribui 1, não 0; (2) ninguém escreve
trip_stops.distance_from_previous_* hoje, então o teste de kept_previous monta o estado anterior à
mão; (3) nenhum caminho de hoje trava linha de trip_stops, então a ordem trip_stops → trips não fecha
ciclo e o teste de duas conexões é rede de segurança, não correção; (4) o logger NÃO redige [lat,lng],
logo a redação entra na T1.4 sem condicional; (5) a 206/spec.md:427 está desatualizada ao dizer que a
207 recua por enRouteSince — vale a regra da 207 (hora local da fila), e quem executar a 206 tem de
ser avisado.
Modelos: T0.2 → opus (com critic opus) · Fase 1 → executor model=sonnet (T1.1 e T1.2 🧠 →
opus, validadas por architect opus antes) · Fase 2 → executor model=sonnet (T2.6 → haiku) · Fase 3 →
executor model=sonnet (T3.4 → code-reviewer opus).
Cada task: contrato/teste antes (visto vermelho), typecheck + lint + testes da app; na API os DOIS
comandos (bun --env-file=../../.env.test test --timeout 120000 e
bun --env-file=../../.env.test run test:integration); suíte nova no entrypoint nomeado; evidência em
evidence.md; commit isolado com --no-verify e caminhos explícitos.
PROIBIDO: migration (se precisar, pare e pergunte) — e por isso NADA de CAS por stop_order_version
nem de tocar na 192; editar specs irmãs; reaproveitar toNodeIdsByLeg para vertexCount; criar função
própria de "parada a caminho" (é da 206); recorded_at ou enRouteSince como âncora; posição do
motorista no servidor ou como carimbo; dependência nova na app; zerar colunas de perna (vale o
kept_previous da 192). A escrita das pernas é sempre dentro de lockTripForStopOrder (trip_stops FOR
UPDATE ORDER BY id → trips FOR NO KEY UPDATE), que esta spec cria.
REGRA DO USUÁRIO: tela nova roda primeiro no PREVIEW — motorista-local 53200 + motorista-api-demo
53901 — com prints 375 e 768, e só sobe depois do "pode subir". Ordem de deploy: API (T1.5, com
aceite em staging) → app (T3.6).
Sem dado, nada: sem perna, sem "chega ~"; sem risco, sem selo; sem permissão, sem km.
Publicar: git fetch && git rebase origin/staging && bun install --frozen-lockfile && gates && push.
MEDIÇÃO PENDENTE: a taxa de limites que não fecham num lote REAL (≥ 20 viagens) fecha na T1.5, com a
API em staging, por leitura apenas. A T0.1 só teve proxy sintético (25 requisições, 30 rotas, 0
falhas) mais 34 rotas reais a favor. Não assuma número; se vier acima de zero, o caminho é o
path: null que a spec já prevê.
Pare e pergunte antes de: deploy em produção, qualquer migration (inclusive para o CAS), divergência
das premissas medidas na T0.1 (192, 206, 210, annotation.nodes, logger), pedido de mapa com ruas (Q1),
qualquer [NEEDS CLARIFICATION].
```

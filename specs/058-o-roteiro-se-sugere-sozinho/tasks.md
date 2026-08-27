# 058 — O roteiro se sugere sozinho · tasks

> **Ordem de trabalho:** a Fase 0 antes de qualquer linha de código. As fases 1–3 são as três camadas
> da spec, e a terceira só é tão boa quanto a segunda — **não se começa o solver antes da matriz
> existir de verdade**. As fases 4 e 5 compilam sobre elas.

## Estado das dependências (verificado no código, 2026-08-26)

| Dependência                          | Estado          | Consequência para esta spec                                                                                             |
| ------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **056** paradas                      | ✅ implementada | `trip_stops` existe com `address_key`, `sequence`, janela e eventos. É a base.                                          |
| **057** viagem no bolso do motorista | ⛔ só spec      | `arrived_at`/`completed_at` **já são colunas** de `trip_stops` — a mediana de D6 compila hoje, com base vazia.          |
| **060** cliente tem hora e preço     | ⛔ só spec      | Janela vem de `trip_stops.delivery_window_start/end`, que já existe. Taxa de entrega fica zero (RF-8 prevê a ausência). |

**Isto não bloqueia a 058.** A spec já declara que a ausência de cadastro é o caso normal (RF-8), e a
medição de D6 degrada para o padrão por empresa enquanto não houver amostra. O que se constrói aqui
nasce pronto para os dados das 057/060 quando eles vierem, sem migration futura.

## Fase 0 — Decisão registrada

> 🤖 Modelo: `opus` 🧠

### T001 🧠 ✅ — ADR-0044: a pilha tem três camadas, e a matriz é nossa

Registra: por que geocodificação e matriz de estrada são camadas separadas e por que pular para
haversine falha (D1); por que o OSRM é hospedado em vez de API paga por elemento (D1); a exceção de
licença do Google **por extenso** — o que os termos dizem, o que foi decidido, o risco nomeado
(suspensão de chave, não multa) e as três mitigações (D2b); e por que o mapa com rua **não**
contradiz a 047 (D6c) — a razão da 047 era não mandar dado nosso a terceiro, e PMTiles do bucket
próprio a preserva.

- **Arquivos:** `docs/adr/0044-o-roteiro-se-sugere-sozinho.md`, `docs/adr/0047-*` (nota de que a
  D6c não a revoga), `docs/SECURITY.md` (§ endereço saindo para geocodificador é tratamento de PII)
- **Aceite:** revisão humana
- **Verificação:** —

## Fase 1 — O modelo

> 🤖 Modelo: `sonnet` (T003 é 🧠 — migration sobre tabela com dado)

### T002 ✅ — `geocoded_addresses` nasce com `external_place_id`

Tabela nova, chaveada pela **mesma** chave normalizada da 056 (`buildStopAddressKey`,
`apps/api-transportada/src/trips/domain/stop-address-key.ts` — `${cityCode}|${postalCode}|${number}`).
Colunas: `address_key` (PK), `latitude`, `longitude` (numeric, não float — coordenada é dado, não
estimativa), `external_place_id`, `source` (`google|manual|postal_code|city`), `precision`
(`rooftop|street|postal_code|city`), `geocoded_at`, `created_at`, `updated_at`.

`external_place_id` é `not null` com default `''` — a mitigação D2b.1 só vale se nunca falhar em
silêncio, e o teste de aceite cobra que toda geocodificação bem-sucedida o persista.

- **Arquivos:** `apps/api-transportada/src/database/geocoding.schema.ts`, migration + `rollback.sql`
- **Aceite:** tabela criada, CHECK de `precision` e `source` fechados na lista
- **Verificação:** `bun run --cwd apps/api-transportada db:test`

### T003 🧠 ✅ — `trip_stops` ganha coordenada, precisão e o trecho anterior

Seis colunas novas (RF-3), todas anuláveis — parada existente não tem nenhuma delas, e inventar
valor em migration é inventar rota: `latitude`, `longitude`, `geocoding_precision`,
`estimated_arrival_at`, `distance_from_previous_meters`, `duration_from_previous_seconds`.

**Sem backfill.** A coordenada entra quando a parada for geocodificada, não na migration.

- **Arquivos:** `apps/api-transportada/src/database/trip.schema.ts`, migration + `rollback.sql`
- **Aceite:** colunas anuláveis; nenhuma parada existente alterada
- **Verificação:** `db:test`

### T004 ✅ — `route_suggestions` e `route_suggestion_stops`

A proposta com o que ela assumiu. `route_suggestions`: `status`
(`queued|running|ready|accepted|rejected|failed|stale`), `trip_id` (anulável — a multi-veículo da P2
nasce sem viagem), `vehicle_id`, premissas em `jsonb` (orçamento do solver, tempo de serviço em uso e
sua origem, política de fim, bloco de jornada), custo/distância/duração estimados, `seed`,
`truncated`, `error_code`, métricas do solver. `route_suggestion_stops`: a sequência proposta, com
violações por parada.

`seed` é coluna, não detalhe: o RNF de determinismo (mesma entrada + mesma semente = mesma saída) só
é verificável se a semente que rodou ficar gravada.

- **Arquivos:** `apps/api-transportada/src/database/route-suggestion.schema.ts`, migration + rollback
- **Aceite:** CHECK de status fechado; `accepted`/`rejected` exigem `decided_at`
- **Verificação:** `db:test`

### T005 ✅ — Configuração de otimização por empresa

RF-7: origem, política de fim (`depot|last_stop|address`), orçamento de tempo do solver, velocidade
média de fallback, tempo de serviço padrão, peso médio de fallback, mínimo de amostras da mediana
(padrão 5), e o bloco de jornada da D6b — **todos os limites anuláveis, desligados por padrão**.

Nulo significa "não é restrição aqui", e é isso que faz a jornada ser opcional sem virar `if`
espalhado pelo fitness.

- **Arquivos:** `company_route_optimization_settings` em `route-suggestion.schema.ts`, migration
- **Aceite:** empresa sem linha usa o default; jornada nula não penaliza
- **Verificação:** `db:test`

## Fase 2 — As duas camadas de baixo

> 🤖 Modelo: `sonnet`

### T006 ✅ — `GeocodingPort` + adaptador Google, com a cascata de quatro precisões

Porta pura; adaptador Google mapeando `location_type` → precisão:
`ROOFTOP`→`rooftop`, `RANGE_INTERPOLATED`→`street`, `GEOMETRIC_CENTER`→`postal_code`,
`APPROXIMATE`→`city`. Cascata quando o geocodificador falha ou não responde: centroide do CEP →
centroide do município (`city_code`, que já está em `nfe_addresses`).

**Nenhum endereço em log** (RNF, `security.md` §1). A chamada é encanamento.

- **Arquivos:** `apps/api-transportada/src/routing/application/geocoding.port.ts`,
  `.../infrastructure/google-geocoding.gateway.ts`, `.../domain/geocoding-precision.policy.ts`
- **Aceite:** os quatro `location_type` mapeados; `place_id` sempre persistido; nenhum endereço logado
- **Verificação:** `bun test ./test/routing-domain.contract.test.ts`

### T007 ✅ — O cache de duas camadas, e a de baixo é a autoritativa

Quente em memória com TTL para a rajada de uma sugestão; embaixo, `geocoded_addresses` **permanente**.
Esvaziar a quente não pode disparar geocodificação nova — é a definição de ela estar certa, e é
teste de aceite.

- **Arquivos:** `apps/api-transportada/src/routing/application/geocode-address.use-case.ts`
- **Aceite:** cache quente esvaziado → zero chamadas ao provedor para endereço já em base
- **Verificação:** contrato

### T008 ✅ — `RoutingMatrixPort` + adaptador OSRM + container

`/table` do OSRM devolve N×N. Container no `compose.yaml` (mesma forma dos demais: porta em
`127.0.0.1`, healthcheck, `${VAR:-default}`) e serviço no Railway. Runbook de como reconstruir o
extract OSM.

**OSRM fora do ar não cai em haversine.** A sugestão vai a `failed` com código estável — resultado
ruim disfarçado de bom é pior que ausência.

- **Arquivos:** `apps/api-transportada/src/routing/application/routing-matrix.port.ts`,
  `.../infrastructure/osrm-routing-matrix.gateway.ts`, `compose.yaml`,
  `docs/runbooks/osrm-extract.md`
- **Aceite:** matriz cacheada por conjunto de coordenadas; queda do OSRM → `failed`, nunca haversine
- **Verificação:** contrato + `make up` sobe o OSRM

## Fase 3 — O solver

> 🤖 Modelo: `opus` 🧠 — é o núcleo, e é onde a spec cobra baseline publicável

### T009 🧠 ✅ — A biblioteca pura, sem I/O

RF-10: recebe matriz + restrições, devolve sequência. **Sem I/O** — é isso que torna o baseline
testável. GA híbrido (memético): cromossomo é permutação com separadores de veículo; `2-opt` local
em todo indivíduo antes de entrar na população; seleção por torneio, OX, mutação por troca; elitismo;
parada por orçamento de tempo **ou** N gerações sem melhora.

Fitness é **dinheiro, não quilômetro** — usa `deriveCostPerKilometer`
(`apps/api-transportada/src/fleet/domain/vehicle-cost.policy.ts`), que já sabe consumo, dois tanques
(051) e preço por empresa. Penalidades (não cortes rígidos): peso, janela, jornada quando ligada.

Semente explícita na entrada. Sem isso o RNF de determinismo não existe.

- **Arquivos:** `apps/api-transportada/src/routing/domain/route-solver.ts`,
  `.../domain/route-fitness.policy.ts`, `.../domain/local-search.ts`
- **Aceite:** determinismo com semente fixa; peso estourado devolve violação explícita; volume não
  aparece em lugar nenhum (D5)
- **Verificação:** `bun test ./test/routing-solver.contract.test.ts`

### T010 🧠 ✅ — A suíte de baseline, que é o que separa produto de brinquedo

Instância conhecida da literatura (Solomon/Augerat) comparada com o ótimo publicado, **tolerância
declarada** — não "parece bom". E o baseline obrigatório: **GA ≥ vizinho-mais-próximo + `2-opt` em
toda instância da suíte**. Se o GA perder, o teste falha no CI.

Sem este teste ninguém descobre que a sugestão piorou — ela continua parecendo uma sugestão.

- **Arquivos:** `apps/api-transportada/test/routing-solver/baseline.contract.ts`,
  `.../fixtures/solomon-*.json`
- **Aceite:** GA vence o baseline em toda instância; ótimo publicado dentro da tolerância declarada
- **Verificação:** CI

## Fase 4 — O caminho: worker e rotas

> 🤖 Modelo: `sonnet`

### T011 — Consumer `route-optimization.v1`

D7: otimizar é trabalho de worker, sempre — um GA dentro do `Bun.serve` bloqueia o event loop.
Topologia igual à do CT-e (`apps/worker-transportada/src/messaging/cte-rabbitmq-topology.ts`):
`${queuePrefix}.route-optimization.v1` com `.main`/`.retry`/`.dead`, outbox e
`route_optimization_processed_messages`. Nada de padrão novo.

RNF: **não compartilha processo com emissão fiscal** — uma sugestão pesada não pode atrasar um CT-e.

- **Arquivos:** `apps/worker-transportada/src/routing/`, `messaging/route-optimization-topology.ts`
- **Aceite:** retry/dead-letter na trilha padrão; sugestão pesada não bloqueia a fila fiscal
- **Verificação:** `bun test` do worker

### T012 — As seis rotas (RF-5)

`POST /trips/:id/route-suggestions` → `202`; `GET .../:suggestionId`; `accept`; `reject`;
`POST /route-suggestions/multi-vehicle` (P2 — ✅ entregue em 2026-08-27, ver o fim deste arquivo);
`PATCH /geocoded-addresses/:key` (pino manual). Todas
sob `trip.manage`.

**O aceite escreve pela rota da 056**, `PATCH /trips/:id/stops/order`
(`apps/api-transportada/src/trips/presentation/trip.routes.ts:381`) — a sugestão nunca escreve
sozinha (D4). Aceitar sugestão de viagem `dispatched` → `409`.

- **Arquivos:** `apps/api-transportada/src/routing/presentation/`
- **Aceite:** `202` no POST; `409` em viagem despachada; aceite reutiliza o caso de uso da 056
- **Verificação:** `bun test ./test/routing-http.contract.test.ts`

### T013 — O pino corrigido conserta o futuro

`PATCH /geocoded-addresses/:key` grava com `source: manual`, que **sempre vence** na cascata (D2).
Toda viagem futura para aquele endereço usa a coordenada corrigida.

- **Aceite:** correção manual sobrevive a nova geocodificação; precisão vira `rooftop`
- **Verificação:** contrato

### T014 — A mediana de tempo de serviço (D6)

Mediana **por cliente** sobre `arrived_at`/`completed_at` de `trip_stops`, janela móvel de **3 meses**,
mínimo de amostras configurável (padrão 5). Abaixo do mínimo, padrão por empresa. **Mediana, não
média** — a parada em que o motorista almoçou é outlier que a média engole.

O valor em uso e sua origem (`default`|`measured`, com tamanho da amostra) viajam na resposta. Um ETA
que ninguém sabe de onde veio é um ETA em que ninguém confia.

- **Aceite:** entrega de 100 dias atrás não entra; abaixo do mínimo usa padrão; origem na resposta
- **Verificação:** contrato

## Fase 5 — O painel

> 🤖 Modelo: `sonnet`

### T015 — Mapa com rua, do nosso bucket

MapLibre GL sobre **PMTiles** no bucket privado que já existe, por HTTP Range do nosso domínio (D6c).
Nenhum host de tile externo no CSP — contrato de teste. PMTiles ausente → **degrada para lista
ordenada sem mapa, e diz isso**. O mapa confere a sugestão; ele não é a sugestão.

- **Arquivos:** `apps/frontend-transportada/src/modules/routing/`, geração do `.pmtiles` documentada
- **Aceite:** CSP sem host externo; queda do PMTiles degrada com aviso
- **Verificação:** `bun test` + contrato de CSP

### T016 — A precisão aparece antes de doer (P1)

Parada com precisão `city` **fora da otimização**: vai para o fim, marcada, esperando decisão humana
— um centroide de município é palpite de 8km. Nota sem peso entra com o peso médio e **vem marcada**.
Violação de janela e de jornada aparecem **explícitas**, nunca escondidas escolhendo ordem pior.

- **Aceite:** os três avisos visíveis antes do botão de aceitar
- **Verificação:** contrato de componente

## Objetivo de conclusão (2026-08-26)

Terminar a spec inteira **sem parar**, e validar no fim. O que falta, na ordem em que compila:

| #   | O que                                                             | Por que é o gargalo                      |
| --- | ----------------------------------------------------------------- | ---------------------------------------- |
| E1  | Repositórios Drizzle (geocodificação, sugestão, configuração)     | Tudo abaixo lê e escreve por eles        |
| E2  | Casos de uso (criar/ler/aceitar/rejeitar, corrigir pino)          | Onde mora a regra do aceite              |
| E3  | Adaptadores da API (porta da viagem, fila, escrita de ordem)      | Ligam o caso de uso ao que já existe     |
| E4  | Handler do worker que roda o solver                               | É o que faz a sugestão sair de `queued`  |
| E5  | Fiação no `main.ts` das duas apps                                 | Sem isso nada é alcançável por HTTP      |
| E6  | Cliente e query no painel, montado na tela da viagem              | Fecha o caminho até o olho do conferente |
| E7  | Validação final: typecheck, lint, testes, migration, build, smoke | O que autoriza dizer "pronto"            |

**Regra do aceite deste objetivo:** nada é dado por concluído sem verificação executada. "Compila"
não é "funciona", e teste que só existe contra fixture não prova encanamento.

## Ordem de execução

```
T001 ──> T002 ─┬─> T006 ──> T007 ─┐
               ├─> T003          ├──> T009 ──> T010 ──> T011 ──> T012 ─┬─> T013
               ├─> T004          │                                     ├─> T014
               ├─> T005          │                                     └─> T015 ──> T016
               └────────> T008 ──┘
```

**T009 não começa antes de T008 estar de pé.** Um solver treinado em matriz que não existe é um
solver que se testa contra si mesmo.

## P2 — a sugestão multi-veículo (2026-08-27)

O que faltava desta spec, registrado como buraco no commit `eaf6989a`: `POST
/route-suggestions/multi-vehicle` — pool de notas + frota, **sem viagem ainda**, e o aceite criando as
viagens.

### O modelo

Quatro coisas novas no banco, numa migration com rollback que **recusa reverter** enquanto existir
sugestão multi-veículo por decidir (apagar o pool deixaria uma sugestão `ready` sem as notas que ela
propõe distribuir):

- `route_suggestion_documents` — o pool;
- `route_suggestion_vehicles` — a frota **na ordem oferecida**. A ordem não é enfeite: é o que faz a
  mesma semente distribuir igual;
- `route_suggestion_stops.vehicle_id` — quem serve cada parada. Nulo na sugestão de viagem única, onde
  o veículo é o da viagem e repeti-lo por parada guardaria a mesma resposta N vezes;
- `route_suggestion_stop_documents` — qual nota cai em qual parada proposta. Sem ela o aceite
  reagruparia as notas por endereço **de novo**, e o segundo agrupamento poderia discordar do
  primeiro.

### O aceite cria, mas não escreve

`TripComposer` é a lista explícita do que ele pode fazer: criar viagem, vincular nota, ordenar parada,
planejar rota — os quatro casos de uso da 056, nenhum reimplementado (ADR-0044 §5). A viagem nasce
**sem motorista**: o solver decide o veículo, não quem dirige. As viagens nascem **antes** de a
sugestão virar `accepted`, para falha no meio deixar `ready` e permitir repetir.

A sugestão fala em **endereço** e a viagem em **parada**, porque a parada só nasce depois do vínculo,
pela reconciliação. A tradução é feita depois de vincular, lendo as paradas que acabaram de nascer;
endereço proposto que não virou parada é ignorado, e parada que a sugestão não nomeou vai para o fim
— `reorderTripStops` exige o conjunto exato, e mandar lista parcial é recusa.

### O worker

`readContext` passou a ter **duas origens**: sugestão de viagem lê `trip_stops`; a multi-veículo lê o
pool e agrupa pelo endereço do destinatário, com o mesmo critério da reconciliação da 056. A chave é
**cópia por valor** (`pool-address-key.ts`), com contrato que compara os dois arquivos linha a linha —
se divergirem, a parada proposta e a parada criada deixam de casar. O agrupamento é em TypeScript, não
em `concat_ws`: a normalização tem CEP de oito dígitos, prefixo "nº" e "S/N", e montá-la em SQL criaria
uma segunda regra do que é a mesma parada.

### ⚠️ Um defeito de determinismo que só o Postgres achou

`readGroups` ordenava por `vehicle_id` — ou seja, por **UUID sorteado**. A mesma sugestão devolvia os
grupos em ordem diferente a cada execução, e o determinismo prometido no RNF morria ali, depois de o
solver tê-lo respeitado. O teste passou em execução isolada e falhou na primeira rodada sob carga da
suíte inteira. Hoje a ordem é a `position` da frota oferecida, e há contrato de unidade guardando que o
aceite cria as viagens na ordem em que o repositório devolve.

Comandos executados:

```
make migration-test                              # 86 pass / 0 fail (migration + rollback)
bun run typecheck                                # limpo
bun run lint                                     # limpo (monorepo inteiro)
bun run --cwd apps/api-transportada test         # 3588 pass / 0 fail / 19 skip
bun run --cwd apps/worker-transportada test      # 746 pass / 0 fail
bun run test:integration                         # 172 pass / 0 fail
```

A integração cria a sugestão pronta como o worker a teria escrito, aceita, e confere contra o banco:
duas viagens em `route_planned`, com o veículo certo, as notas vinculadas e as paradas nascidas da
reconciliação — a primeira com duas notas do mesmo endereço numa parada só. O segundo aceite não cria
viagem de novo.

### Buracos declarados

- **Não há tela.** As quatro rotas existem e são testadas, mas nenhum painel chama a multi-veículo: o
  operador não tem por onde selecionar um pool de notas e uma frota. É o maior buraco desta entrega.
- **O worker não foi exercitado de ponta a ponta com pool.** `readPoolStops`/`readPoolVehicles` têm
  typecheck e leitura por contrato, mas nenhum teste roda o solver sobre um pool contra Postgres — a
  integração parte da sugestão **já pronta**. Isso significa que a geração da proposta multi-veículo
  ainda não tem prova de execução.
- **Peso é sempre o de fallback** no pool: a nota ainda não passou pelo cálculo de frete, e inventar
  peso por produto seria uma segunda regra de peso. Vem marcado, como a spec pede.
- **Sem janela de atendimento** no pool: a janela vem do cadastro de cliente da 060 e o
  `readPoolStops` não a lê ainda — as paradas propostas nascem sem restrição de horário.

### A tela da multi-veículo (2026-08-27)

O maior buraco da entrega da P2 era este: as quatro rotas existiam e ninguém as alcançava. Fechado.

**A ação nasce da seleção**, na barra da tabela de notas, ao lado da emissão de CT-e e de NFS-e — o
mesmo padrão de `NfseEmissionAction`, e pelo mesmo motivo: é ali que o operador já escolheu as notas.
Uma tela própria para montar o pool seria esta mesma tabela, de novo, sem os filtros que ele acabou
de usar.

O diálogo mostra **uma coluna por veículo**, porque é essa a decisão que a multi-veículo toma — quem
leva o quê. Três coisas que o contrato guarda:

- **o botão diz quantas viagens o aceite vai criar**, antes do clique. Aceitar aqui cria viagem de
  verdade, e um botão que não avisa transforma isso em surpresa;
- **proposta que não pôs nota em veículo nenhum não oferece o aceite** — ela diz isso por extenso.
  Sem esse corte o operador aceitaria o vazio achando que criou viagem;
- **a parada sem veículo aparece num grupo próprio, no fim, e nunca some**: é ela que espera decisão
  humana (ADR-0044 §5).

Só veículo de **tração ativo** é oferecido (a API recusaria o resto com `409`), a lista reusa a
consulta de opções de frota que o vínculo do motorista já mantém em cache, e depois do aceite a tela
lista as viagens criadas com atalho para abrir cada uma — sem isso o operador teria de procurar,
numa lista de viagens, quais nasceram do clique que acabou de dar.

⚠️ **Um buraco na API que a tela revelou:** `route_suggestion_stops.vehicle_id` existia, o worker o
escrevia, e o **leitor não o publicava** — o `RouteSuggestionStop` da porta não tinha o campo. Sem
isso a tela não teria como agrupar por veículo. Corrigido na porta, no mapeador e na validação do
frontend, onde ele é lido como **opcional**: sugestão gravada antes da P2 não tem o campo, e recusá-la
faria a tela deixar de mostrar roteiro que já existe.

Comandos executados:

```
bun run lint · typecheck · format:check          # limpos, monorepo inteiro
bun run --cwd apps/api-transportada test         # 3588 pass / 0 fail
bun run --cwd apps/frontend-transportada test    # 2075 pass / 0 fail
bun run --cwd apps/frontend-transportada build   # ok
```

#### Buracos que continuam

- **Nenhum teste de tela de verdade**: esta app não tem DOM no `bun test`, então o que se prova é o
  serviço puro (agrupamento, contagem, permissão) e o texto de fonte. Clique, foco e teclado do
  diálogo ficam para o Playwright, que não cobre esta tela.
- **A geração da proposta segue sem prova de execução** (buraco anterior, intacto): nenhum teste roda
  o solver sobre um pool contra Postgres. A tela pede, e o que responde em produção ainda não foi
  exercitado ponta a ponta.
- **Sem orçamento de tempo na tela**: a rota aceita `solverTimeBudgetSeconds` e o diálogo não o
  oferece — fica o padrão da empresa.

### O E2E do solver com pool (2026-08-27)

O segundo buraco da P2, fechado: nada exercitava o caminho que leva a sugestão multi-veículo de
`queued` a `ready`. Agora existe
`apps/worker-transportada/test/route-optimization-pool.integration.test.ts`, contra Postgres, com o
repositório, o efeito, o solver e o banco **reais**.

**O único dublê é a matriz** — o OSRM não sobe no CI, e a distância vira uma tabela de haversine
calculada **no teste**, nunca no código. O segundo caso do arquivo é exatamente o que guarda essa
fronteira: matriz fora do ar não vira estimativa.

O que ficou provado contra o banco:

- **quatro notas, três paradas.** As duas do mesmo endereço viram uma parada só — o mesmo
  agrupamento da reconciliação da 056, que é o que faz a parada proposta e a parada criada no aceite
  serem a mesma coisa;
- **toda parada sai com veículo**, e é por ele que o aceite sabe quantas viagens criar;
- **o peso vem marcado**, porque a nota do pool não passou pelo cálculo de frete;
- **as quatro notas ficam amarradas às paradas** em `route_suggestion_stop_documents`.

#### ⚠️ Um defeito que só este teste acharia

Com a matriz fora do ar e tentativa sobrando, o handler devolvia `retry` **sem soltar a reserva**.
`claim` só pega o que está `queued`, então a reentrega não conseguia reservar de novo: a sugestão
ficava **`running` para sempre**, com o painel dizendo "calculando" até alguém abrir o banco — e o
`failed` com código estável que a ADR-0044 §1 promete nunca chegava.

A correção é `release`: a porta ganhou o método, o repositório devolve a linha para `queued` **só a
partir de `running`** (sugestão decidida entre a falha e a devolução não se ressuscita), e o handler
o chama antes de pedir reentrega. Dois contratos de unidade novos guardam as duas metades, e o E2E
confere o estado no banco depois de cada uma.

Nenhum teste de unidade acharia isso: todos eles dublavam `claim` para sempre devolver reserva.

Comandos executados:

```
make worker-integration                          # 61 pass / 0 fail
bun run lint · typecheck · format:check          # limpos, monorepo inteiro
bun run --cwd apps/worker-transportada test      # 748 pass / 0 fail
```

#### O que continua aberto na P2

- **Sem OSRM no teste**: a matriz é dublê. O `docs/runbooks/osrm-extract.md` explica como subir o
  serviço, mas nenhuma suíte automatizada fala com ele — a qualidade do roteiro em rua depende dele,
  e isso não é verificado por máquina nenhuma.
- **Sem janela de atendimento no pool**: `readPoolStops` não lê o cadastro de cliente da 060, então
  as paradas propostas nascem sem restrição de horário.
- **Sem teste de tela** para o diálogo da multi-veículo (buraco anterior, intacto).

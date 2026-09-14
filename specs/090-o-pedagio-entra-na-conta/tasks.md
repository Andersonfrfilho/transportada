# Tasks — 090 O pedágio entra na conta

> 🤖 Modelo: `sonnet` (T1 e T4 são 🧠 — validar com `opus` antes)

Uma task por vez. Teste de contrato **antes** da implementação. Task só fecha com evidência em
`evidence.md`.

## Fase 1 — O dado entra na casa

> 🤖 Modelo: `sonnet`

### T1 🧠 — `toll_booths`, a terceira tabela sem `company_id`

Migration com `osm_node_id` (`bigint` único), `name`, `operator`, `latitude`, `longitude`,
`charge_per_axle`, `charge_car` e `observed_on`, mais `rollback.sql` ao lado.

- **Depende de:** nada.
- **Aceite:** `make migration-test` verde; `toll_booths` acrescentada por extenso à lista de exceções
  de `test/fleet-schema/tenant-safety.contract.ts`, com o motivo escrito (dado público de mercado,
  como `fuel_price_references` e `vehicle_volume_references`).
- **Verificação:** `make migration-test`.
- 🧠 porque é decisão de esquema sem tenant — o contrato de isolamento tem de listar a exceção, não
  descobri-la.

### T2 — O extrator de praças

Script no runbook do OSRM que lê `barrier=toll_booth` do `.pbf` e emite as linhas, com o `charge`
decomposto em `hgv/axle` e `motorcar`.

- **Depende de:** T1.
- **Aceite:** contra `ribeirao.osm.pbf`, produz **166** praças, **163** com tarifa e **162** com
  `charge_per_axle`. Praça sem `charge` entra com tarifa nula, não é descartada — ela existe na
  estrada.
- **Verificação:** rodar contra o extract e conferir as três contagens.

### T3 — Seed idempotente

Carregar o resultado por `*.use-case.ts`, nunca por `INSERT` bruto. Reexecutar não duplica: a chave
natural é `osm_node_id`.

- **Depende de:** T2.
- **Aceite:** rodar duas vezes seguidas deixa 166 linhas; `observed_on` reflete a data do extract.

## Fase 2 — A rota sabe por onde passou

> 🤖 Modelo: `sonnet`

### T4 🧠 — `annotations=nodes` na geometria

A chamada ao OSRM passa a pedir os nós percorridos, e a porta de geometria passa a devolvê-los.

- **Depende de:** nada (pode correr em paralelo com a Fase 1).
- **Onde:** `apps/api-transportada/src/trips/infrastructure/osrm-route-geometry.gateway.ts:38` — a
  chamada **já existe** e é a mesma que desenha o mapa da montagem; hoje ela pede
  `?overview=full&geometries=geojson`. É um parâmetro a mais, não integração nova.
- **Aceite:** contrato **por texto de fonte** exigindo `annotations=nodes` na consulta. Sem ele o
  custo sai zero sem erro nenhum — a falha é silenciosa, e é por isso que o contrato é de fonte e
  não de comportamento.
- 🧠 porque muda o contrato de uma porta já usada pelo solver; conferir que o payload maior não
  estoura limite de resposta em rota longa.

### T5 — A política que soma o pedágio

`domain/toll-cost.policy.ts`, pura: recebe os nós da rota, as praças e a contagem de eixos; devolve
`{ total, perAxle, booths[], axleSource }`.

- **Depende de:** T1, T4.
- **Aceite:** casa **por id de nó**, e o contrato reprova qualquer aritmética de distância no
  caminho. Rota sem praça devolve **zero com origem conhecida**, nunca `null`. A ordem das praças é
  a ordem de passagem.
- **Verificação:** teste puro com a rota de 126 km medida na spec — três praças, R$ 32,80 por eixo.

### T6 — Eixos: ficha, referência, origem

`resolveVehicleAxles`: `axle_count > 0` → `declared`; senão referência por `vehicle_type` →
`estimated`.

- **Depende de:** T5.
- **Aceite:** a referência é tabela de mercado sem `company_id`; `toco` e `truck` da base real (2 e 3
  eixos) continuam batendo. Origem viaja junto do número, sempre.

### T6B — A montagem lê a distância que o mapa desenhou (D3)

O painel _Custo da operação_ do diálogo **Nova viagem** passa a alimentar pedágio **e combustível**
com a rota que o mapa acabou de receber (`RouteGeometryLeg.distanceMetres`), em vez do campo
persistido na viagem.

- **Depende de:** T5.
- **Por quê:** hoje o mapa diz "estrada medida pelo roteirizador" e o painel logo abaixo diz "roteiro
  ainda não calculado". Acrescentar só o pedágio ali deixaria o painel pior que hoje: uma parcela com
  valor ao lado de outra alegando que não há roteiro, e um "Custo previsto" parcial com cara de
  completo.
- **Aceite:** contrato que reprova a tela que imprimir pedágio com valor enquanto o combustível alega
  `noPlannedDistance`, e vice-versa. `noPlannedDistance` **continua** valendo na viagem já criada —
  a task não o remove, só deixa de usá-lo onde a distância existe.
- **Fora:** a parcela do motorista, que falta por cadastro (spec 086) e não por fonte de distância.

## Fase 3 — A tela conta a história

> 🤖 Modelo: `sonnet`

### T7 — O custo na montagem

Na `TripAssemblyMap`, **imediatamente abaixo** de "Tempo do roteiro": total, número de praças, valor
por eixo, quantidade de eixos, **a data da tarifa** e **quantas praças estão sem tarifa conhecida**.

⚠️ O dado vem na **resposta do `POST /route-geometry`** (decisão D4), junto do traço e dos trechos —
nunca de uma chamada própria, que seria uma segunda rota podendo discordar da desenhada.

⚠️ A contagem de praças sem tarifa é obrigatória, e não é zelo: medido no extract real, `0.00`
aparece como tarifa em 4 das 166 praças, duas delas com nome de praça de rodovia e zero em tudo —
campo não mapeado, não isenção. O total sozinho seria número crível e possivelmente falso.

- **Depende de:** T5, T6, T6B.
- **Aceite:** contrato que reprova o componente se o valor aparecer **sem a marca de estimado**
  quando a origem do eixo for `estimated`, e que proíbe segunda condição escondendo a marca — a
  mesma trava de `test/trip/occupancy.contract.ts`.

### T8 — As praças na descrição do roteiro

Praça a praça, na ordem de passagem, com nome e operador.

- **Depende de:** T7.
- **Aceite:** quem confere consegue dizer **por onde** o custo entrou; rota sem praça imprime "sem
  pedágio no trajeto", não uma lista vazia.

### T9 — O pedágio na conta da viagem

Entra como custo previsto ao lado do combustível, herdando a origem.

- **Depende de:** T7.
- **Aceite:** um eixo estimado torna o custo previsto da viagem estimado; a tela diz isso onde já diz
  "previsto".

### T11 — A viagem criada carrega o pedágio dela (lacuna aberta pela T9)

A T9 pôs o pedágio calculado na **prévia da montagem**, e **não** em `readTripValuation`, a conta da
viagem já criada. A lacuna é real e a saída óbvia é a errada.

⚠️ **Chamar o OSRM de novo na viagem criada pareia a rota de hoje com a distância de ontem.** A
viagem persiste `planned_distance` no momento em que o roteiro foi planejado, e não persiste nó
nenhum. Calcular o pedágio agora traria o caminho que o roteirizador escolhe **hoje** — dataset
diferente, empate desfeito de outro jeito — ao lado de uma distância congelada de outro dia. É a
divergência da D4 acontecendo **dentro do mesmo painel**, e os dois números continuariam plausíveis.

O caminho certo é **congelar o pedágio junto com o roteiro**: quando a rota é planejada, guardar o
custo (ou os nós que o produziram) na viagem, como `trip_dispatch_snapshots` já faz com o roteiro. Aí
a conta da viagem lê o que foi decidido, não o que o mapa acha agora.

- **Depende de:** T9.
- **Custo:** migration + escrita no planejamento de rota + leitura na valoração. É task com esquema,
  não remendo.
- **Enquanto não existir:** a conta da viagem criada mostra o pedágio **lançado à mão**, com o gap
  `notRecorded` quando não houver — que é honesto, não é zero silencioso.

## Fase 4 — Fechamento

> 🤖 Modelo: `haiku`

### T10 — Documentação viva

`CLAUDE.md` ganha o parágrafo do pedágio; o runbook do OSRM ganha o passo do extrator; `evidence.md`
recebe as saídas de teste de cada task.

- **Depende de:** T1..T9, T6B.

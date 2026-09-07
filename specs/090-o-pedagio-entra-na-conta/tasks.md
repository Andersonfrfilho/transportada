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

## Fase 3 — A tela conta a história

> 🤖 Modelo: `sonnet`

### T7 — O custo na montagem

Na `TripAssemblyMap`, ao lado de "Tempo do roteiro": total, número de praças, valor por eixo,
quantidade de eixos e **a data da tarifa**.

- **Depende de:** T5, T6.
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

## Fase 4 — Fechamento

> 🤖 Modelo: `haiku`

### T10 — Documentação viva

`CLAUDE.md` ganha o parágrafo do pedágio; o runbook do OSRM ganha o passo do extrator; `evidence.md`
recebe as saídas de teste de cada task.

- **Depende de:** T1..T9.

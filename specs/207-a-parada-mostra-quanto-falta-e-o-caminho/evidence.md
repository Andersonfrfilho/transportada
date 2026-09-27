# Evidence — Feature 207

Cada task do `tasks.md` tem uma seção aqui, na mesma ordem. A seção registra:

- o comando;
- a contagem de testes;
- o trecho relevante da saída;
- o commit.

Task que toca `test/integration/**`, uma query ou um repositório registra também o segundo comando
da API (`bun --env-file=../../.env.test run test:integration`). Sem o `--env-file`, a integração
pula, e pular não é passar.

## Pendências registradas na escrita da spec (2026-09-25)

- **Numeração.** Conferida por volta das 21h30:
  - `git fetch`;
  - `git log --all --format=%h -- 'specs/20*'`;
  - `ls specs/`;
  - `ls docs/adr`;
  - os worktrees irmãos em `.claude/worktrees/*`.

  A 206 já estava criada por outra sessão, então esta spec ficou com a **207**. A ADR-0087 foi
  reservada com um arquivo provisório e depois escrita.

- **Base.** `work/driver-app` não está em `origin/staging`. O commit `cc3495272` (spec 199, a
  coordenada da parada) está em `origin/staging`, mas **não** no HEAD desta branch. A T0.1 confere
  as duas coisas de novo.
- **Tamanho do precache hoje.** Medido pelo agente de exploração sobre o `dist/` de 25/09 às 21:23:
  13 arquivos e 672.999 bytes (~657 KiB), contra o teto de 1.572.864. A T2.7 mede de novo depois da
  mudança.
- **ETA multi-veículo inflado (achado confirmado).** O `clockSeconds` não zera por veículo
  (`apps/worker-transportada/src/routing/application/route-optimization.effect.ts:329`, `:339`). Um
  P0 separado vai corrigir; o número da spec é conferido na T0.1. Até ele entrar, a T2.8 fica
  bloqueada, e `estimatedArrivalAt` só aparece como "no plano".

## Revisão 2 (2026-09-25) — resposta à crítica

A crítica (`opus`) reprovou a revisão 1 com 11 achados MAJOR e 14 MINOR. A tabela de resposta está em
`spec.md` § "Resposta à crítica". A 207 mudou em quatro frentes:

- **A escrita das pernas é da 192.** Ela acontece dentro de `lockTripForStopOrder`, sob o CAS dela e
  com `kept_previous`, e nada é zerado.
- **A perna tem origem gravada.** O jsonb ganha `tracedStopIds`, e os limites exatos de cada perna vêm
  de `annotation.nodes`.
- **"A caminho" é da 206.** A âncora é a hora do toque no aparelho, e nunca hora do servidor.
- **A posição local só é lida com permissão já concedida.** Não há selo "no horário", e o ETA do
  escritório fica fora do alerta até o P0.

A revisão 1 também tinha citações erradas, agora corrigidas:

- trava em `trips` antes de `trip_stops`;
- `trip-state.policy.ts:128-131` apresentado como "bloqueio de recongelar", quando é
  `checkTripAcceptsLinkage`;
- tolerância de "11 m", quando é 5 m (`read-route-geometry.use-case.ts:57`);
- HEAD `230b548c6`, quando o atual é `b36b0aea1`.

## T0.1

Medido em 2026-09-26, na árvore `.claude/worktrees/pensive-borg-f59971`, branch `work/driver-app`.
Nenhum arquivo de produção foi tocado. Só este arquivo foi escrito.

### Base

```
git merge-base --is-ancestor cc3495272 origin/staging   → verdadeiro (spec 199 está em staging)
work/driver-app                                          → 73 commits locais acima de origin/staging
git status --short                                       → 17 arquivos (WIP de sessões paralelas)
```

**Conclusão.** Duas das três condições da § "Base" do `tasks.md` **não** valem. A publicação do lote
de `work/driver-app` estava em curso por outra sessão no momento da medição, então esta task não
tocou em git (sem commit, sem rebase, sem push, sem `git stash`, cuja pilha é compartilhada). A
T0.1 mede o resto e **não libera a Fase 1**: quem for abrir `work/spec-207` confere de novo as três
condições.

### 192 — a trava, o CAS e as colunas de perna

```
grep -rn "lockTripForStopOrder" apps/                  → 0 ocorrências
grep -rni "kept_previous|keptPrevious" apps/           → 0 ocorrências
grep -rn "stop_order_version|stopOrderVersion" apps/   → 0 ocorrências
git grep -c "lockTripForStopOrder" origin/staging -- 'apps/**'  → 0 ocorrências
grep -c "^- \[x\]" specs/192-o-motorista-muda-a-ordem/tasks.md  → 0 (de 16 tasks)
git log --oneline origin/staging -- specs/192-...      → d98a324bf (só documentação)
```

O nome só existe em prosa de spec: `specs/192-o-motorista-muda-a-ordem/plan.md:75`, `:238`,
`tasks.md:98`.

Quem escreve `distance_from_previous_*`:

- **`route_suggestion_stops`** — o worker, em
  `apps/worker-transportada/src/routing/infrastructure/drizzle-route-optimization.repository.ts:268-269`,
  com os valores calculados em
  `apps/worker-transportada/src/routing/application/route-optimization.effect.ts:351` e `:371`.
- **`trip_stops` — ninguém.** O único caminho que escreve em `trip_stops` depois do planejamento é
  `writeEstimatedArrivals`
  (`apps/api-transportada/src/trips/infrastructure/drizzle-trip-route.repository.ts:225-260`), e ele
  grava **só** `estimated_arrival_at` (`:241`) mais `trips.estimated_arrival_frozen_at` e
  `trips.eta_departure_at` (`:253-256`). A coluna está declarada
  (`apps/api-transportada/src/database/trip.schema.ts:575-576`, com o CHECK em `:634`) e é **morta**,
  como o próprio código já registra em
  `apps/api-transportada/test/integration/trip-financial-end-to-end.integration.ts:533-534`
  ("`distance_from_previous_meters` ficou morta").

**Conclusão — a 207 vai CRIAR `lockTripForStopOrder`**, com a assinatura de
`specs/192-o-motorista-muda-a-ordem/plan.md:74-79` (`trip_stops FOR UPDATE ORDER BY id` →
`trips FOR NO KEY UPDATE`), e a 192 herda. Dois desdobramentos que a T1.2 tem de absorver:

1. **O CAS por `stop_order_version` não é possível nesta spec.** A coluna não existe e a migration é
   da 192 — e a 207 proíbe migration. A cláusula "com CAS por `stop_order_version` **se a coluna
   existir**" (`tasks.md`) resolve-se em "não existe": a T1.2 entrega a trava, e o CAS entra com a 192. A trava sozinha basta para serializar a escrita; o CAS é a defesa contra ordem trocada
   **fora** da transação, que é o caso da 192.
2. **`kept_previous` não tem o que preservar hoje.** Como nada escreve as colunas de perna de
   `trip_stops`, o valor anterior é sempre `null`. A regra continua correta como invariante ("OSRM
   fora não zera"), mas o contrato que a prova tem de montar o estado anterior à mão — não há
   caminho de produção que o produza.

### 192 — ordem de trava: sem ciclo hoje

Levantamento de todo `.for(...)` em `apps/api-transportada/src/trips/infrastructure/**`, casado com
o `from()` mais próximo acima:

```
drizzle-trip.repository.ts:158, :395, :467            trava trips
drizzle-trip-document-batch.repository.ts:212         trava trips
drizzle-redelivery-application.repository.ts:99       trava trips
drizzle-trip-route.repository.ts:106, :284, :481      trava trips
drizzle-driver-field-report.repository.ts:471, :530   trava trips
drizzle-trip-document.repository.ts:240               trava trips
trip-document-review.query.ts:264                     trava trips
```

**Nenhum caminho de hoje trava linha de `trip_stops`.** A chegada
(`drizzle-driver-field-report.repository.ts:458`) lê `trip_stops` **sem** `FOR UPDATE` e só depois
trava `trips` (`:471`). Logo a ordem nova `trip_stops` → `trips` **não fecha ciclo** com nada em
produção, e o `40P01` da integração da T1.2 é improvável — o teste continua valendo como rede, mas
não é preciso converter caller nenhum nesta spec. (O `plan.md:75` da 192 cita a reentrega como
travando `trips` primeiro: verdade — `:99` —, e é irrelevante para o ciclo, porque ela nunca trava
`trip_stops`.)

### 206 — nomes e estado

`plan.md` atual da 206 (revisão 3, de 2026-09-26, já com o bloqueio em vez da troca e com o
"Cancelar rota"):

```
specs/206-.../plan.md:124, :141   enRouteSince, enRouteTappedAt
specs/206-.../plan.md:148         resolveEnRouteStopId({ stops, queueView })
specs/206-.../spec.md:428         mora em shared/enRouteStop.service.ts
specs/206-.../spec.md:423-427     snapshot: stops[].enRouteSince, stops[].enRouteTappedAt
```

```
grep -rn "enRouteTappedAt|resolveEnRouteStopId|en_route_since|enRouteSince" apps/*/src apps/*/test
  → 0 ocorrências
```

**Conclusão.** Os dois nomes de que a 207 depende **não mudaram** nas revisões 2 e 3 da 206:
`enRouteTappedAt` e `resolveEnRouteStopId` seguem idênticos, e a assinatura
`resolveEnRouteStopId({ stops, queueView })` é a mesma. A 206 **não foi executada** — nada dela
existe no código, nem nesta árvore nem em `origin/staging`. T1.3b e T2.2b seguem bloqueadas, como o
`tasks.md` declara.

**⚠️ Divergência a resolver entre 206 e 207.** A `spec.md:427` da 206 diz: "A 207 usa
`enRouteTappedAt` como âncora, **e `enRouteSince` quando ele for nulo**". A 207 proíbe hora de
servidor como âncora (§ "Proibido nesta spec") e define o degrau 1 como `enRouteTappedAt`
(`spec.md:368`), com recuo para a **hora local do item na fila** (`spec.md:431`) — nunca
`enRouteSince`, que é hora do servidor (`206/spec.md:426`). Como a 207 não edita spec irmã, a
resolução é registrar aqui: **vale a regra da 207** (recuo pela hora local da fila), e a frase da
206 é descritiva e desatualizada. Se a 206 for executada assumindo o recuo por `enRouteSince`, a
T2.2b terá de recusá-lo.

### P0 do ETA — é a spec 210, e já está em staging

```
ls specs/ | grep -i ...                → 210-cada-veiculo-parte-da-mesma-partida
grep -c "^- \[x\]" specs/210-.../tasks.md   → 4 de 4 (T001..T004)
git log --oneline origin/staging -- specs/210-...
  → 9f4ad2009 fix(routing): o relógio do 2º veículo em diante parte do zero, não do 1º (spec 210)
git show origin/staging:apps/worker-transportada/src/routing/application/route-optimization.effect.ts
  → :343  let clockSeconds = input.context.departureEpochSeconds   (DENTRO do laço de :330)
```

O `clockSeconds` está declarado **dentro** de `for (const assignment of input.solution.assignments)`
(`:330`), com o comentário `⚠️` de `:337-341`, tanto nesta árvore quanto em `origin/staging`.

**⚠️ Conclusão que contradiz a spec 207.** O P0 do ETA multi-veículo é a **spec 210**, está
**concluída e em `origin/staging`**. Portanto:

- a linha da tabela § "Bloqueios declarados" ("T2.8 depende do P0 do ETA … em `origin/staging`")
  **está satisfeita**: a **T2.8 não está bloqueada**;
- a pendência registrada acima neste arquivo ("Um P0 separado vai corrigir … Até ele entrar, a T2.8
  fica bloqueada, e `estimatedArrivalAt` só aparece como 'no plano'") **está resolvida**;
- a ressalva da T2.4 ("`estimatedArrivalAt` ainda **não** alimenta o alerta … fica desligado até a
  T2.8") continua válida como sequência de tasks, mas a T2.8 pode ser executada na Fase 2, sem
  espera.

Achado fora do escopo que a 210 registrou e continua aberto: as pausas de jornada
(`sinceBreakSeconds`, `route-fitness.policy.ts`) — `specs/210-.../tasks.md` T004.

### OSRM — resposta real de staging

`ROUTING_MATRIX_URL` **existe** no `.env` desta árvore e o serviço de staging **é alcançável** desta
máquina por HTTPS (o valor não é transcrito aqui). O gateway monta a URL em
`apps/api-transportada/src/trips/infrastructure/osrm-route-geometry.gateway.ts:45`, e **já pede
`annotations=nodes`** hoje:

```
/route/v1/driving/{lon,lat;…}?overview=full&geometries=geojson&annotations=nodes&alternatives=true
```

Quatro respostas reais (`curl` → `http_code=200`, `code: "Ok"`):

| requisição                | pernas | `nodes.length` por perna | `sum(nodes−1)` | `coords−1` | bate |
| ------------------------- | ------ | ------------------------ | -------------- | ---------- | ---- |
| 3 paradas                 | 2      | 729, 1242                | 1969           | 1969       | sim  |
| 5 paradas, 1 perna de 0 m | 4      | 729, 2, 1243, 732        | 2702           | 2702       | sim  |
| SP→RJ, primária           | 1      | 5812                     | 5811           | 5811       | sim  |
| SP→RJ, alternativa        | 1      | 6367                     | 6366           | 6366       | sim  |

Lote sintético: 25 requisições de 2 a 5 paradas com coordenadas sorteadas na área SP/MG,
30 rotas conferidas (primárias + alternativas):

```
rotas conferidas: OK=30 FALHA=0 sem-annotation=0 code!=Ok=0 erro-rede=0
taxa de limites que NAO fecham: 0.0% (0/30)
```

**Conclusão 1 — a premissa vale.** `sum(nodes.length − 1) === geometry.coordinates.length − 1` em
**34 de 34** rotas medidas, incluindo alternativa e perna de 0 m. `legPointStarts` derivado de
`annotation.nodes` é exato, e `path: null` por limite que não fecha não apareceu.

**Conclusão 2 — perna de 0 m ocupa 1 vértice, não 0.** A perna de `distance: 0` veio com
`nodes: [7182420907, 1816048051]` (dois nós **distintos**), contribuindo `2 − 1 = 1` para a soma.
O contrato da T1.1/T1.2 para "perna de 0 m" tem de esperar `legPointStarts` avançando **1**, não 0.

**⚠️ Conclusão 3 — não reaproveitar `nodeIdsByLeg` para `vertexCount`.** O gateway já lê
`annotation.nodes` por perna em `toNodeIdsByLeg` (`gateway.ts:123-152`), mas **deduplica**, e a
premissa documentada da dedup **não se confirma em staging**. O comentário de `gateway.ts:115-118`
diz que "o OSRM repete o nó da parada no fim de um trecho e no começo do seguinte"; medido, nos três
limites da rota de 5 paradas, **nenhum** nó se repete:

```
fim perna0: 1816048051 | inicio perna1: 7182420907 | repete: false
fim perna1: 1816048051 | inicio perna2: 7182420907 | repete: false
fim perna2: 3644540523 | inicio perna3: 8333067498 | repete: false
```

O que existe são repetições consecutivas **dentro** de cada perna (15, 0, 37 e 11 nós), que a dedup
remove:

```
nodeIdsByLeg (dedup) lengths: [714, 2, 1206, 721]  soma: 2643
sum(nodes.length − 1) = 2702      coordinates.length − 1 = 2702
```

`nodeIdsByLeg` soma **2643** contra **2702** segmentos de geometria. Usá-lo para `vertexCount`
desalinharia a fatia de `path` em dezenas a centenas de pontos por perna — o desenho sairia errado
sem nada falhar. **`vertexCount` da T1.1 tem de sair do `annotation.nodes` cru
(`nodes.length − 1`), numa leitura própria, sem passar pela dedup.**

Achado fora do escopo, registrado e **não** corrigido aqui: se o nó da parada não é repetido pelo
OSRM, a dedup de `toNodeIdsByLeg` existe para um caso que não ocorre, e ao apagar repetições
internas pode estar **subcontando praça de pedágio** (o oposto do defeito que a spec 090 quis
evitar). Isso é da 090, não da 207 — vale uma spec própria.

### Pendência nomeada — a taxa num lote real

A medição pedida pelo `tasks.md` ("num lote real, ≥ 20 viagens, a taxa em que os limites não
fecham") **não foi feita**. O que faltou: acesso às coordenadas de paradas reais de staging, que
vive no banco de staging — esta árvore não tem credencial dele, e o `.env` local aponta para o
Postgres de desenvolvimento. O lote de 25 requisições acima é **proxy sintético**: coordenadas
sorteadas, não paradas de viagem.

Como medir depois, sem tocar em produção: na T1.5, já com a API em staging, ler as coordenadas de
≥ 20 viagens planejadas por `GET` autenticado (ou por consulta de leitura ao Postgres de staging),
repetir o mesmo laço contra o `/route` e registrar aqui a taxa. Enquanto isso, a Fase 1 pode seguir:
a T1.1 é contrato sobre resposta dublada, e a premissa já tem 34 rotas reais a favor. Se a taxa real
vier acima de zero, o caminho é `path: null`, que a spec já prevê — não há decisão nova pendente.

### Logger — não redige `[lat, lng]`

O logger da API é o pacote `@adatechnology/logger@0.1.0-rc.0`, criado em
`apps/api-transportada/src/main.ts:1371-1381` (`createApiLogger` → `createLogger`). O
`safe-logger.service.ts` só embrulha as chamadas em `try/catch` — não redige nada. A redação mora em
`node_modules/.bun/@adatechnology+logger@0.1.0-rc.0/node_modules/@adatechnology/logger/src/redact.ts`:

- **`redact.ts:15-41`** — `DEFAULT_REDACTED_KEYS` tem `cpf`, `cnpj`, `email`, `phone`, `endereco`,
  `cep`, `xml` e afins. **Não tem** `path`, `latitude`, `longitude`, `lat`, `lng`, `coordinate`,
  `geometry`, `leg` nem `point`.
- **`redact.ts:76-83`** — `redactNumber` devolve o valor **cru** quando não é inteiro
  (`if (!Number.isInteger(value)) return value`). Latitude e longitude são fracionárias, logo passam
  inteiras. Mesmo inteiras só cairia com 11, 14 ou 44 dígitos.
- **`redact.ts:130-132`** — array é mapeado elemento por elemento, **sem contexto de chave**. Um
  `[[−20.5578, −47.5586], …]` chega ao sink exatamente como veio.
- **`redact.ts:151`** — a única defesa é por nome de chave, com casamento por igualdade ou sufixo
  (`:102`).

**Conclusão.** O logger **não** redige um array de pares `[lat, lng]`. A condicional da T1.4 ("Se a
T0.1 viu que o logger não redige `path`, a redação entra aqui") está **acionada**: a T1.4 tem de
entregar a redação. Duas formas, e a segunda é a que a `security.md` §1 manda ("a redação vive no
logger, não na disciplina de quem escreve o log"):

1. na API, nunca pôr `path`/`leg` em `metadata` — barato, e é disciplina de call site;
2. `extraKeys` na chamada de redação, com `path`, `points`, `geometry` e `coordinates`, como
   `sentry.service.ts:23` já faz para `cookies`, `ip_address` e `params`.

A T3.4 ("logs sem coordenada") confere as duas.

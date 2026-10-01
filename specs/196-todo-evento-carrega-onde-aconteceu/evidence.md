# Evidência — spec 196, todo evento carrega onde aconteceu

## T0.1 — leitura das specs do assunto, ADR aceita, recorte de execução

**Data:** 2026-10-01 · **Modelo:** opus · **Branch:** `work/comprovante-duas-fotos`

### O recorte: a 196 entra pela leitura, não pela escrita

A spec tem 30 tasks em 8 fases, e a maior parte delas é o **caminho de escrita**: dar coordenada a
Despachar, Iniciar rota, conferir carga e às duas ocorrências, que hoje não carimbam nada. Isso custa
migration em três tabelas, CHECKs de canal, índice parcial, expurgo novo, app do motorista e a ordem
de publicação em três etapas do §9 da ADR-0081.

O que o usuário pediu em 2026-10-01 — ícone de GPS com a coordenada no tooltip, vermelho quando não
veio — é o **caminho de leitura**, e ele não depende de nada disso para os eventos que **já**
carimbam. Medido antes de decidir:

| Tabela                 | Colunas de ponto hoje                                     | Quem grava                  |
| ---------------------- | --------------------------------------------------------- | --------------------------- |
| `trip_stop_events`     | `latitude`, `longitude`, `accuracy_meters`, `captured_at` | chegada, entrega, devolução |
| `trip_delivery_proofs` | as mesmas quatro                                          | foto/assinatura do canhoto  |

A linha do tempo já lê `trip_stop_events` (`listStopEventRows`) e a leitura do comprovante já
**seleciona** as quatro colunas de `trip_delivery_proofs` — e as descarta depois de calcular
`distanceMeters`. Expor o ponto desses dois não pede `join` novo.

**Executa-se agora:** o `location_state` das **duas** tabelas acima (recorte da D2), os dois
escritores que o preenchem (recorte da Fase 3), T4.0, T4.1, T4.2 e a Fase 6.
**Fica para depois:** as três tabelas sem coluna nenhuma (`trip_status_events`,
`trip_stop_occurrences`, `trip_document_occurrences`), o expurgo das cinco tabelas e a app do
motorista — Fases 1 (resto), 2, 3 (resto) e 5.

#### Por que a coluna entrou no recorte, em vez de derivar o estado do canal

A primeira versão deste recorte dizia "sem migration": o estado sairia da própria linha —
`channel = 'driver_app'` com `latitude` nula seria `unavailable`. **Está errado, e erra em vermelho.**
`trip_stop_events.channel` é `NOT NULL DEFAULT 'driver_app'` e a coluna nasceu sem backfill (o
comentário no schema diz isso: "o default descreve o histórico"). Logo todo evento anterior ao GPS —
quando o app nem pedia posição — cairia na regra e apareceria em vermelho, dizendo "o GPS falhou"
sobre um toque que nunca tentou ler posição. Era exatamente a mentira que este recorte diz não
cometer, cometida no outro sentido.

A D2 já tinha resolvido isso, e o conserto é pequeno: `location_state` (`VARCHAR(16)`, anulável,
CHECK — nunca ENUM) nas duas tabelas, com o CHECK `(location_state = 'captured') = (latitude is not
null)` e o backfill que a própria D2 manda — `captured` onde há coordenada, e **nada** onde não há,
porque sobre o histórico sem ponto o banco não sabe o que aconteceu. Migration aditiva, duas colunas,
sem `DROP` e sem `NOT NULL` retroativo; fecha com `make migration-test`.

Os dois escritores passam a gravar o estado: o relatório de campo do motorista
(`drizzle-driver-field-report.repository.ts`) e o comprovante. `captured` com ponto, `unavailable`
sem ponto quando o canal é `driver_app` ou `whatsapp`, `null` nos demais — a regra do §3 da ADR-0081,
aplicada só a estas duas tabelas.

### A consequência que não se maquia

Despachar, Iniciar rota, conferir carga e as ocorrências **não têm ponto** enquanto o resto da spec
não rodar. Eles aparecem como `null` — "não se aplica" —, sem ícone e sem cor. **Não** entram em
vermelho.

Vermelho é `unavailable`: o motorista tocou e a posição não veio. Pintar de vermelho um toque que
nunca foi construído para carimbar diria que o GPS falhou quando o que falta é a Fase 3 — e é
exatamente a confusão que o `location_state` existe para desfazer. O histórico sem ponto também não
fica vermelho, pela mesma razão e pelo mesmo mecanismo: `null`.

### ADR-0081 passou a `aceita`, com uma emenda

Status `proposta` → `aceita`, conferida contra o código. A lista de leitores do §6 bate com
`authorization.policy.ts`:

- `fleet.read` é de `company-admin`, `fiscal`, `operator`, `viewer` e `separator`. A regra do usuário
  ("`fleet.read` e sem ser apenas `separator`") dá os quatro papéis que a ADR nomeia. Confere.
- A rota `GET /trips/:id/timeline` usa `TRIP_FIELD_READ_POLICY` — `fleet.read` **ou**
  `trip.report-on-behalf` (spec 156 D11). Logo `finance` e `separator` alcançam a tela, e são
  justamente os dois que a ADR manda receber `location: null`. Confere.
- `trip.event-location` **não existe** em `TRANSPORTADA_PERMISSIONS`. É permissão nova, da T4.1.

**Emenda §6.1, de 2026-10-01**, pedida pelo usuário e escrita na ADR:

- A coordenada passa a aparecer **em texto de tela**, no tooltip do ícone `map-pin`, com precisão e
  distância. Decisão do usuário, verbatim: _"precisao e distancia com lat/long"_. O §6 original
  mandava mostrar só precisão, hora e "Ver no mapa".
- O evento sem ponto fica **vermelho e sem coordenadas** — verbatim: _"se não conseguir puxar ali
  deixe em vermelho e sem coordenadas"_. Só `unavailable`; `null` não pinta nada.
- O **card do comprovante** passa a mostrar o mesmo ícone. O §6 só falava da linha do tempo porque a
  tela do comprovante não existia quando a ADR foi escrita.

Levantada uma vez a objeção de privacidade (a coordenada em texto era proibida pela spec 158, e o
comentário em `trip.types.ts:315` ainda diz isso), o usuário manteve a decisão. Implementa-se como
pedido, e a emenda fica escrita para que ninguém a reverta depois como descuido.

**O que a emenda não toca:** a coordenada continua proibida em query string, em URL, em requisição a
tile de terceiro (ADR-0044 §6, ADR-0047) e em log de qualquer nível. O basemap segue sendo o PMTiles
do próprio domínio. O que foi liberado é a coordenada **renderizada para quem tem a permissão**, não
a coordenada **saindo da instalação**.

### Specs do assunto, lidas antes de tocar em código

`ls specs/ | grep -i -e local -e evento -e coordenada` mais a lista da T0.1. A 196 e a ADR-0081 já
decidiam o que o usuário pediu; a tentação era escrever spec nova, que teria recriado a decisão —
o defeito que `specs/179-a-recusa-sai-com-foto/duplicacao.md` registra. Não se escreveu spec nova.

⚠️ Registrado da T5 da própria spec: a spec 206 / ADR-0088 tirou "Iniciar rota" do caminho de toque
direto — virou `POST /me/trips/current/stops/:stopId/depart`, na fila. O alvo de 3 s do §5 da
ADR-0081 fica valendo só para "Despachar". Quem executar a Fase 5 corrige a task antes.

**Status:** T0.1 fechada. Nenhum código tocado nesta task; a evidência é a ADR emendada e este
registro.

---

## T4.0 — o painel aceita o ponto antes de a API mandá-lo

**Commit:** `52626a4da` · 4 arquivos, 23 inserções · `apps/frontend-transportada`

Esta task existe por causa de uma decisão da spec 158: o validador da linha do tempo é **estrito por
chaves exatas** — uma chave desconhecida no item reprova a página inteira, não só o item. Isso foi
desenhado para impedir que `actorUserId`, `receiverName` ou `objectKey` vazassem para a tela sem
ninguém notar, e continua valendo. Mas a consequência é de ordem de publicação: se a API começar a
mandar `location` enquanto o painel no ar ainda é o antigo, a linha do tempo **para de abrir**. Por
isso o painel tolera as chaves primeiro, e só depois a API as manda.

### O que entrou

| Arquivo                                   | O quê                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| `trip.types.ts`                           | `TripTimelineLocation`, `TRIP_TIMELINE_LOCATION_STATES`, as duas chaves opcionais no item |
| `trip.constant.ts`                        | `TRIP_TIMELINE_LOCATION_KEYS`; `location`/`locationState` nas opcionais do item           |
| `tripResponse.validation.ts`              | `isTimelineLocation` + `isFiniteNumber`                                                   |
| `test/trip/timeline-location.contract.ts` | 10 casos, novo arquivo, já na lista explícita do `package.json`                           |

O item aceita as chaves **ausentes, nulas ou preenchidas** — as três, porque durante a transição as
três acontecem: a API antiga não manda nada, a nova manda `null` para quem não tem a permissão, e
manda o objeto para quem tem.

### A distância entrou junto, e não depois

O tooltip que o usuário pediu em 2026-10-01 mostra **precisão, distância e lat/long**. A distância
vem derivada do servidor (ADR-0081 §6: "metros derivados no servidor, nunca a coordenada") — o
painel não a calcula, porque calcular exigiria a coordenada da parada no payload, que é mais
posição exposta para nada.

O detalhe que obrigou a incluí-la agora: `hasExactKeys`. Acrescentar `distanceMeters` ao objeto
depois, com a API já mandando, faria o painel publicado **recusar a resposta inteira** — exatamente
o defeito que esta task existe para evitar, cometido um degrau abaixo. A primeira versão do commit
não tinha o campo; foi corrigida antes de qualquer push. `distanceMeters` é nulo quando a parada
não tem ponto de referência para comparar.

### Dois defeitos achados na revisão à mão, com os portões já verdes

Os quatro portões do agente que escreveu a task passaram, e mesmo assim o diff tinha:

1. **JSDoc órfão** — `isTimelineLocation` foi inserido entre o comentário de `isTimelineItem` e a
   função que ele documentava. Compila, passa, e mente para quem ler depois.
2. **`accuracyMeters` aceitava negativo** — validado com `isFiniteNumber` num arquivo que já tinha
   `isNonNegativeFiniteNumber` ao lado. Raio de precisão negativo é o aparelho mentindo, e viraria
   um círculo impossível no mapa da Fase 6.

Ambos corrigidos, com o caso de contrato `recusa accuracyMeters e distanceMeters negativos` escrito
para que não voltem. **Portão verde não é revisão** — fica registrado porque o mesmo agente poderia
ter fechado a task com os dois dentro.

### Portões

| Portão                        | Resultado                    |
| ----------------------------- | ---------------------------- |
| `bun run test` (painel)       | 5927 pass · 1 fail           |
| `bun run test:hooks`          | 155 pass · 0 fail            |
| `bun run typecheck`           | `TC_EXIT=0`                  |
| `bun run format:check` (raiz) | limpo nos arquivos do painel |

⚠️ A falha única foi `o beacon não inunda o log sob rajada` (`test/driver-trip/legacy-beacon.contract.ts`),
em 5002 ms — teste sensível a tempo, com o agente da API disputando CPU na mesma máquina. Rodada
isolada: `./test/driver-trip.contract.test.ts` → **245 pass · 0 fail**. Não é regressão desta task,
mas é instabilidade real do teste, e fica anotada aqui em vez de sumir no verde da próxima rodada.

⚠️ `bun test` cru na app **não** é o portão: ele varre também as suítes de `test/trip-hooks/`, que
precisam do preload de DOM, e devolve 29 falhas de `window is not defined` que não existem. Os
portões são `bun run test` e `bun run test:hooks`, separados. E `format:check` não existe na app —
é script da raiz.

**Status:** T4.0 fechada.

## T6.1 / T6.2 — o ícone, o tooltip e o mapa do ponto

O item da linha do tempo ganhou o ícone de GPS que o usuário pediu, com **precisão, distância,
coordenada e hora** no tooltip, nessa ordem. Os cinco estados que `resolveTimelineLocationView`
decide, e que o componente só desenha:

| `locationState`           | Tom      | Ícone         | Tooltip                             | Ver no mapa |
| ------------------------- | -------- | ------------- | ----------------------------------- | ----------- |
| `captured` + coordenada   | neutro   | `map-pin`     | precisão · distância · lat/long · h | sim         |
| `captured` sem coordenada | neutro   | `map-pin`     | frase de leitor sem permissão       | não         |
| `unavailable`             | problema | `map-pin-off` | frase de posição não obtida         | não         |
| `expired`                 | neutro   | `map-pin`     | frase dos 90 dias                   | não         |
| nulo / ausente            | —        | —             | nada é desenhado                    | —           |

**Vermelho é só `unavailable`.** `expired` não é falha de ninguém e `captured` sem coordenada é
permissão, não ausência — pintar os três de vermelho transformaria o indicador num alarme constante.
O contrato cobra `tone` em cada um, e cobra que o tooltip do estado restrito **não contenha dígito**:
é a trava de que a coordenada não vaza para quem não tem `trip.event-location`.

### A cor do pino foi escolhida a olho, e a olho ela não existia

O primeiro valor era `#f5f5f5`, com a justificativa "neutro, para não se confundir com a parada".
Medido contra o papel do tema claro (`#fbf9f5`), o contraste era **1,04** — o mesmo tom. No tema
claro o pino do evento simplesmente não aparecia, e nada no diff dizia isso: os quatro portões
estavam verdes.

É o modo de falha que o cabeçalho de `stopColor.service.ts` descreve há duas specs — "contraste ≥ 2,4
contra os dois fundos só existe numa janela estreita de luminância relativa, entre ~0,11 e ~0,33" — e
foi também o que o commit `a10f5b81c` consertou dias atrás por outro caminho. Uma constante de cor
crua num `*.constant.ts` de módulo passa ao largo dessa regra sem disparar nada.

A cor nova saiu de busca, não de escolha: varredura de matiz × saturação × alvo de luminância,
maximizando a ΔE CIELab mínima contra `MAP_SURFACE`, as 96 primeiras cores de parada e `NOTE_COLORS`.

| Medida                                   | `#f5f5f5` (antes) | `#7d5187` (agora) |
| ---------------------------------------- | ----------------- | ----------------- |
| Luminância relativa (janela 0,11 … 0,33) | 0,913 ❌          | 0,120 ✅          |
| Contraste vs. `#10222c` (escuro)         | 14,96             | 2,64 ✅           |
| Contraste vs. `#fbf9f5` (claro)          | **1,04** ❌       | 5,88 ✅           |
| Contraste vs. `#f0f2ee` (mapa claro)     | —                 | 5,48 ✅           |
| ΔE ao vizinho mais próximo já desenhado  | —                 | 30,4 (limiar 6,2) |

A constante mudou de lugar junto com o valor: ela mora em `stopColor.service.ts`, que é onde a
doutrina da luminância está escrita, e `event-pin-color.contract.ts` cobra as cinco linhas da tabela.
**"Neutro" não media nada.**

### O pino sem número era um número mágico em componente compartilhado

O desenho do pino liso tinha virado `input.sequence > 0 ? String(input.sequence) : ''` dentro do
`AssemblyVectorMap`, que **cinco telas** consomem (`TripRouteMap`, `TripAssemblyMap`,
`FreightRegionVectorMap`, o mapa novo e o selo do `mapBadge.constant.ts`). Hoje ninguém mais passa
`sequence: 0`; no dia em que alguém passar índice base-zero, todos os pinos perdem o número **em
silêncio** — sem erro, sem teste vermelho, só o mapa deixando de dizer a ordem do roteiro.

O ponto agora diz `isUnnumbered`, e o componente compartilhado não interpreta mais número fora de
faixa. O sentinela numérico sobrou só como chave de cor **dentro** do `TripTimelineLocationMap`, onde
é local e está documentado como tal.

### Quatro achados que a revisão descartou

Nem tudo que a revisão levantou era defeito, e os descartes ficam registrados para não voltarem à
mesa: `TripTimeline` com 3 props está dentro do teto de 5; `TripStopDetail.latitude` vem de
`geocoded_addresses` (spec 079 T012), **não** da coluna morta de `trip_stops` — a armadilha anotada
na T4.1 não se aplica aqui; o `Intl.DateTimeFormat('pt-BR')` fixo é a convenção do próprio
`TripTimeline.component.tsx` duas dezenas de linhas acima; e o `<p>` → `<div>` em `itemMeta` é
exigência de HTML válido, porque o tooltip aninha elemento de bloco.

### Portões

| Portão                        | Resultado                          |
| ----------------------------- | ---------------------------------- |
| `bun run test` (painel)       | **5945 pass · 0 fail** (eram 5939) |
| `bun run test:hooks`          | 158 pass · 0 fail                  |
| `bun run typecheck`           | `EXIT=0`                           |
| `bun run lint`                | `EXIT=0` — 0 erros, 16 avisos      |
| `bun run format:check` (raiz) | `EXIT=0` — limpo                   |

**Status:** T6.1 e T6.2 fechadas no código. ⚠️ **Nada sobe antes do preview local com coordenada
sintética e do ok do usuário** — regra do `web.md` §15, e é a T6.3 que a cumpre.

## T1.1 / T1.2 / T3.1 — o estado do ponto, no banco e na política

**Data:** 2026-10-01 · **Modelo:** opus · Recorte da T0.1: só as duas tabelas que já têm as quatro
colunas de ponto (`trip_stop_events` e `trip_delivery_proofs`).

A coluna `location_state` existe para separar duas ausências que hoje são o mesmo `null`: **"o GPS
falhou"** e **"ninguém perguntou"**. Sem ela a tela teria de adivinhar pela idade e pelo tipo do
evento — e adivinharia errado em todo evento anterior ao GPS.

| Valor         | O que afirma                                                   |
| ------------- | -------------------------------------------------------------- |
| `captured`    | há coordenada na linha; o CHECK de consistência amarra os dois |
| `unavailable` | o motorista tocou e a posição não veio                         |
| `expired`     | o expurgo dos 90 dias apagou as quatro colunas                 |
| `null`        | não se aplica — não houve pergunta                             |

### A migration é aditiva, e o backfill vem antes dos CHECKs

`ADD COLUMN` anulável e sem default não reescreve a tabela. O `UPDATE ... SET 'captured' WHERE
latitude is not null` roda **antes** dos CHECKs, porque o de consistência reprovaria a tabela com
coordenada e estado nulo na validação. Todo CHECK entra `NOT VALID` e é validado em statement à
parte: `ADD CONSTRAINT` validando toma ACCESS EXCLUSIVE com varredura completa, enquanto `VALIDATE
CONSTRAINT` toma só SHARE UPDATE EXCLUSIVE e não barra leitura nem escrita.

Onde não há coordenada a linha fica `null` **de propósito**. Derivar o estado do canal não serve:
`trip_stop_events.channel` é `NOT NULL DEFAULT 'driver_app'` e nunca teve backfill, então todo evento
pré-GPS apareceria vermelho. **O passado não é pintado de vermelho.**

### Dois defeitos achados na revisão à mão, com cinco portões verdes

Os dois têm a mesma forma do achado da T6.2, e é por isso que ficam registrados juntos: **o
comentário afirma uma invariante que o código não impõe.** Nenhum dos dois apareceu em portão.

**1. O CHECK de consistência não barrava nada.** O texto era:

```sql
CHECK ("location_state" is null or (("location_state" = 'captured') = ("latitude" is not null)))
```

com o comentário "`captured` e a coordenada são a mesma afirmação — uma sem a outra é dado que
mente". A linha com **coordenada e estado nulo** passa por curto-circuito do `or` — exatamente o dado
que mente. E o reparo ingênuo, tirar o `is null or`, também passa: CHECK que avalia `NULL` é aceito
em Postgres, e `(NULL = 'captured') = (true)` é `NULL`. A forma null-safe, conferida nos cinco casos:

```sql
CHECK (("location_state" is not distinct from 'captured') = ("latitude" is not null))
```

| `location_state` | `latitude` | antes        | agora     |
| ---------------- | ---------- | ------------ | --------- |
| `captured`       | preenchida | passa ✅     | passa ✅  |
| `captured`       | nula       | recusa ✅    | recusa ✅ |
| `unavailable`    | preenchida | recusa ✅    | recusa ✅ |
| `unavailable`    | nula       | passa ✅     | passa ✅  |
| `null`           | preenchida | **passa ❌** | recusa ✅ |

Nenhum teste tentava inserir a linha da última linha da tabela — havia o caso "o banco recusa
`captured` sem latitude", e não o seu espelho. O caso novo
(`o banco recusa coordenada com estado nulo`) é o que fecha o achado de verdade; o assert de texto do
contrato de schema e o do contrato estático de migration passaram a cobrar também a **ausência** de
`is null or`, para o buraco não voltar por reescrita.

**2. Todo evento de WhatsApp sairia vermelho.** `STATEFUL_CHANNELS` trazia `whatsapp` ao lado de
`driver_app`, com a justificativa de que nos dois quem toca é o motorista. Mas **nenhum caminho de
WhatsApp carrega latitude** — conferido em `src/main.ts` 990-1290, as dez montagens do fluxo, sem uma
ocorrência de `latitude`/`location`. Logo `hasCoordinate` é sempre `false` ali, e o canal inteiro
carimbaria `unavailable`: 100% das entregas por WhatsApp em vermelho, afirmando uma falha de GPS que
nunca houve. É a mesma recusa que a migration desta spec escreveu sobre o histórico pré-GPS, cometida
três arquivos adiante. `STATEFUL_CHANNELS` ficou só com `driver_app`; no dia em que o WhatsApp mandar
posição, `hasCoordinate` resolve sozinho, sem tocar na lista.

A política recebe `hasCoordinate: boolean`, nunca a coordenada — nenhuma posição consegue
fisicamente chegar a um log a partir dela (ADR-0081 §6.1).

**3. O expurgo dos noventa dias apagava a coordenada e deixava a linha afirmando `captured`.** Este
não veio da revisão: apertar o CHECK é que o revelou. `make migration-test` ficou vermelho num
fixture de SQL cru, e varrer os outros escritores atrás do mesmo defeito chegou em
`worker-transportada/src/trip-location-purge/infrastructure/drizzle-trip-location.repository.ts`, que
anula as quatro colunas de posição das duas tabelas **sem tocar em `location_state`**.

A gravidade é maior que a dos outros dois, e vinha dos dois lados:

- **Com o CHECK antigo**, a rotina produzia em silêncio, todo dia, exatamente a linha que o CHECK
  dizia impedir: `captured` sem coordenada. O estado `expired` existia no `as const` da API, com o
  comentário "o expurgo dos 90 dias apagou as quatro colunas", e **ninguém o escrevia**.
- **Com o CHECK novo**, o `UPDATE` do lote inteiro passa a falhar com 23514 e a batida diária quebra
  em produção — a retenção de LGPD que o `docs/SECURITY.md` promete deixaria de acontecer.

O reparo é o carimbo no mesmo `UPDATE`: `EXPIRED_LOCATION_STATE` em
`trip-location-purge.constant.ts` (cópia por valor de `EVENT_LOCATION_STATES.expired` — o worker não
importa código da API), aplicado nos dois `.set()`. O `test/trip-location-purge.integration.test.ts`
passou a afirmar os três estados depois do ciclo: `expired` nas linhas vencidas, `captured` na
recente, `unavailable` na entrega que nunca teve GPS — porque **o expurgo não varre quem nunca teve
posição**: `unavailable` é um fato, não um vencimento.

O cabeçalho de `trip-execution.schema.ts` já apontava, de antes desta spec, para um
`test/trip-location-purge/schema-parity.contract.ts` **que não existia** — a mesma forma de defeito
das outras duas: a documentação afirma uma trava que o código não tem. O contrato foi escrito (13
testes), e é ele que pega a próxima divergência de coluna entre a cópia e a API.

### Portões

| Portão                                                          | Resultado                    |
| --------------------------------------------------------------- | ---------------------------- |
| `bun --env-file=../../.env.test test` (API)                     | 8468 pass · 23 skip · 0 fail |
| `bun test ./test/trip-location-purge.contract.test.ts` (worker) | 13 pass · 0 fail             |
| `make migration-test`                                           | verde (era 23514 no fixture) |
| `bun run test:integration` (API)                                | 776 pass · 7 skip · 10 fail  |
| as mesmas 10, com `--timeout 120000`                            | 70 pass · 0 fail             |
| contrato do worker (94 arquivos)                                | 1460 pass · 0 fail           |
| `make worker-integration`                                       | 145 pass · 1 fail (OSRM)     |
| `trip-location-purge.integration.test.ts` isolado               | 2 pass · 0 fail              |
| `bun run typecheck` · `lint` · `format:check`                   | verde (0 erro · 16 warning)  |

As dez falhas da integração da API são **todas** estouro de prazo em ~5000 ms, nenhuma violação de
CHECK (`grep -c location_state_consistency_check` sobre o log: 0). A causa é o próprio script: o
`test:integration` do `package.json` **não passa `--timeout`**, e roda no padrão de 5 s. Na CI isso
não aparece porque ela reparte em quatro shards (`ci.yml:167`); aqui os 144 arquivos disputam o mesmo
Postgres. Re-rodados os cinco arquivos afetados com `--timeout 120000`, os dez testes passam. É
flake de ambiente, não regressão — mas o script continua sem a flag, e é defeito dele.

A falha restante do worker é `osrm-routing-matrix.integration.test.ts` (ponto encaixado a 1 143 650 m
em vez de 4 511,2 m): o extrato do OSRM que está de pé localmente não é o da fixture. Esta branch não
toca um só arquivo de rota — `git diff --name-only origin/staging | grep -ci "osrm\|routing"` devolve
**0**.

⚠️ **O banco de integração do worker é criado uma vez e reusado**
(`scripts/provision-integration-database.ts` só faz `create database` se não existir), e o desta
máquina estava com **224** migrations contra as **263** do repositório, com `trip_occurrence_cases`
ainda em `redelivery_policy` enquanto a migration `20260922174226_trip_occurrence_cases` do
repositório já declara `redelivery_application` — a migration foi reescrita no lugar depois que o
banco foi construído, e é o caso de duplicação 164/179 que o `CLAUDE.md` registra. O `db:migrate` do
`make worker-integration` morria em 42703 ali, muito antes de chegar nesta spec. Recriado o banco (sob
aprovação), ele subiu às 263 e o portão passou a correr. O `make migration-test` nunca viu isso
porque sobe um Postgres descartável e roda a cadeia do zero.

⚠️ Um CHECK apertado é contrato sobre **todo escritor**, e o portão verde de contrato não vê nenhum
deles: quem escreve com SQL cru (os fixtures de `database-migration` e os do worker) e quem escreve
em produção (o expurgo) só aparecem quando o banco de verdade recusa a linha. Os três achados desta
fatia saíram de leitura à mão e de um portão vermelho — nenhum da suíte verde.

## T4.1 e T4.2 — a linha do tempo passa a devolver o ponto

A linha do tempo ganhou duas chaves: `location`, com as cinco exatas que a T4.0 congelou
(`accuracyMeters`, `capturedAt`, `distanceMeters`, `latitude`, `longitude`), e `locationState`.
O recorte de permissão vive no use case e é assimétrico de propósito: sem `trip.event-location` a
coordenada sai `null` e **o estado fica**. Estado não revela onde — revela por que não há ponto, que
é justamente o que `finance` e `separator` precisam saber para não confundir "o motorista não mandou"
com "o sistema perdeu".

`distanceMeters` sai do ponto vivo da parada em `geocoded_addresses`, alcançado pelo `address_key`
(ADR-0044 §5) — as colunas de coordenada de `trip_stops` estão mortas e o contrato
`dead-coordinate-columns` recusa o retorno delas.

| Portão                                                       | Resultado                     |
| ------------------------------------------------------------ | ----------------------------- |
| `bun --env-file=../../.env.test test --timeout 120000` (API) | 8474 pass · 23 skip · 0 fail  |
| `auth-me.integration.ts` isolado, após correção              | 1 pass · 0 fail               |
| `check` completo do painel                                   | 5961 pass · 0 fail · build ok |
| `test:hooks` do painel                                       | 165 pass · 0 fail             |

⚠️ **A permissão nova quebrou um teste que nenhum dos dois agentes previu, e quebrou por ordem.**
`auth-me.integration.ts` afirma a lista **exata** de permissões de `viewer` e `fiscal` com `toEqual`,
e array em `toEqual` compara posição. Eu inseri a permissão na posição em que ela aparece no literal
de `authorization.policy.ts` e o teste continuou vermelho: a API não devolve na ordem do literal.
Medido, ela sai no **fim** da lista. A lição é estreita e vale repetir: a ordem de uma lista de
permissões é comportamento observável, não detalhe de escrita, e só o teste sabe qual é.

### O que ficou declaradamente parcial

- **A T4.2 cobre os quatro estados numa fonte só.** Apenas a consulta de eventos de parada tem coluna
  de posição nesta fatia; status, ocorrência e documento são afirmados `null`/`null`. Está correto
  para o que existe, mas é menos do que a task descreve — não marcar como completa.
- **O comprovante não publica `location` na view.** O validador estrito do painel recusaria chave
  desconhecida, então o ponto do comprovante vive só no registro da aplicação. Destravar isso é a
  T6.4, e até lá a tela não mostra o ponto do comprovante.
- **`capturedAt` tem recuo para `recorded_at` / `created_at`** quando a coluna é nula (linha antiga
  carimbada `captured` no preenchimento retroativo). É decisão do agente, seguindo o
  `coalesce(captured_at, recorded_at)` que o schema já usava — não é decisão de spec, e merece o olho
  de quem revisar.

## Minimapa agregado dos eventos — pedido em conversa, fora da spec

Um mapa só, acima da lista da linha do tempo, com um pino por evento localizado, ícone e cor por
tipo, e traço na ordem em que os eventos aconteceram. Cobertos por contrato os estados que a tela
precisa aguentar: `captured` com e sem coordenada, `unavailable`, `expired`, `null`, zero eventos
localizados (estado vazio com texto, sem mapa) e dezenas de pinos no mesmo lugar — mesma categoria
agrupa com selo de contagem, categorias diferentes abrem em leque.

As oito cores foram **medidas**, não escolhidas no olho: luminância, contraste mínimo de 2,4 nos três
fundos, distância CIELab entre si e contra a superfície do mapa base, e os hexadecimais do CSS da
legenda conferidos contra os do TypeScript. É a correção da mesma classe de defeito que o pino
`#f5f5f5` com contraste 1,04 produziu na T6.1.

⚠️ **A rota pelo asfalto não existe e não vai existir assim.** Traçá-la exigiria mandar as
coordenadas a um serviço de roteamento, e ADR-0044 §6 proíbe coordenada sair para terceiro. O traço é
reto entre pontos consecutivos, e a legenda **diz isso** em vez de deixar a linha mentir sobre o
caminho percorrido.

⚠️ **O desenho do mapa não foi verificado por ninguém.** O WebGL do MapLibre não sobe no ambiente de
teste, então o contrato roda com o mapa dublado: ele prova o DOM, a ordem e as cores, e não prova
pino, tracejado, leque nem os 375 px. Isso é exatamente o que o preview da T6.3 existe para provar, e
nada sobe antes dele.

## Integração da API — a corrida limpa

Rodada com nada mais disputando o Postgres, de dentro de `apps/api-transportada`:

```
bun --env-file=../../.env.test run test:integration --timeout 120000
789 pass · 7 skip · 0 fail · exit 0
```

⚠️ **A corrida anterior reprovou e não era regressão.** Ela fechou 788 pass · 7 skip · 1 fail, com a
falha em `auth-me.integration.ts:153` — a lista exata de permissões do `GET /auth/me`. Rodado
isolado, o arquivo passa; rodado limpo, a suíte inteira passa. Duas suítes de integração no mesmo
Postgres produzem vermelho que não é defeito do código, e ler o primeiro vermelho como regressão
custou uma rodada inteira.

⚠️ **O script `test:integration` não declara `--timeout`**, então cai nos 5000 ms padrão do Bun. Na
CI isso não aparece porque `ci.yml:167` reparte a suíte em quatro; na máquina de quem desenvolve, os
144 arquivos disputam e estouram. Toda invocação local precisa de `--timeout 120000` na mão. É
defeito do script, está registrado aqui e **não foi corrigido** — corrigi-lo mexe no portão da CI e
não é o assunto desta spec.

## A migration no banco local compartilhado

A `20261001123700_event_location_stamp` foi aplicada no Postgres de desenvolvimento
(`transportada-local-postgres-1`, banco `transportada`) para que o preview da T6.3 pudesse existir:
sem a coluna `location_state`, a rota da linha do tempo responde 500, e a API deste worktree já a
seleciona. Aditiva, com `rollback.sql`, conferida depois: a coluna existe em `trip_stop_events` e em
`trip_delivery_proofs`.

⚠️ **O banco é compartilhado entre as sessões desta máquina.** O CHECK
`trip_stop_events_location_state_consistency_check` exige `location_state = 'captured'` se e somente
se houver latitude. Sessão rodando código anterior que grave evento **com** coordenada e **sem**
estado passa a ser rejeitada. Não houve ocorrência observada, mas quem esbarrar nisso tem aqui a
causa.

## T6.3 — o preview, e os três defeitos que só a tela mostrou

Preview local com a API deste worktree na 53001 e um painel **deste** worktree na 53112 (a 53112 já
está na allowlist de CORS da API; a 53000 é de outro worktree e não tem a tela nova). Viagem de
preview com coordenada **sintética**, eventos gravados pelas **rotas do motorista** — chegada nas
três paradas, entrega, devolução e as ocorrências — e SQL só para o que a rota não produz: o evento
`expired`, que só o expurgo gera, e o de estado nulo.

Prints em `prints/`: `196-timeline-minimapa-1280.png`, `196-timeline-minimapa-375.png` e os dois
`-so-mapa`. Portões no estado dos prints: `format:check` ok, `check` do painel **5966 pass · 0 fail**
(+ 165 dos hooks), `typecheck` limpo, integração da API **789 pass · 7 skip · 0 fail**.

Três defeitos que os contratos não pegaram, porque o WebGL do MapLibre não sobe no ambiente de teste
e o mapa roda dublado — exatamente o buraco que esta task existe para cobrir:

1. **A ocorrência saía com o código cru do enum** ("Ocorrência: dock_closed"). A tradução já existia
   em `trip.locale.json` e o título montado em `tripTimeline.service.ts` não a usava. Código
   desconhecido agora vira o próprio código como rótulo — sumir seria esconder o evento.
2. **Os pinos competiam com o fundo.** A camada `radar` do estilo cobre o mapa de placas vermelhas de
   limite de velocidade. `buildBasemapStyle` ganhou o modo quieto, que tira `radar` e
   `cabine-de-pedagio` **só** nos mapas da linha do tempo; roteiro e montagem seguem com elas.
   Provedor de tiles e coordenadas intactos (ADR-0044 §6, ADR-0047).
3. **Dois eventos a ~5 m um do outro ficavam empilhados**, um escondendo o outro: eles caíam em lados
   opostos da fronteira da grade de arredondamento, e o mapa os tratava como lugares diferentes, então
   o leque nunca abria. O agrupamento passou a ser por proximidade, não pela grade.

⚠️ **O pino de devolução continua o mais fraco.** `#76602d` contra a via troncal laranja `#d58a47` dá
~2,3:1; o que o separa é o anel branco, ~6:1. Em 375 px, sobre um cruzamento, é o ponto frágil da
tela. O token **não** foi mexido — escurecê-lo é decisão de design que ninguém tomou ainda.

⚠️ **Ocorrência não aparece no mapa, e isso não é defeito desta entrega:** `trip_stop_occurrences`
não tem coluna de posição nenhuma. Está nas Fases 2 e 3, não executadas.

⚠️ **47 px de estouro horizontal em 375 px na página**, vindos do componente da placa do veículo
(`_plate_`, `_plateBand_`) — não da linha do tempo. Pré-existente e fora desta spec.

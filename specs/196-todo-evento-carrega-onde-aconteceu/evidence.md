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

⚠️ **Correção: este parágrafo estava errado, e a rota pelo asfalto passou a existir.** A redação
anterior dizia que traçá-la exigiria mandar coordenada a terceiro e que a ADR-0044 §6 proibia. A
proibição é real, mas não se aplica: o serviço de roteamento é **nosso** (`ROUTING_MATRIX_URL`,
OSRM auto-hospedado), a chamada é servidor-a-servidor, e o painel nunca fala com ele — pede à API.
Nenhuma coordenada sai para terceiro, nem em URL, nem em query string, nem em log. O traço hoje
segue as vias; quando a geometria não vem, cai para reto e **a legenda diz qual dos dois está
desenhado**, em vez de deixar a linha mentir sobre o caminho percorrido.

⚠️ **O contrato nunca prova o desenho.** O WebGL do MapLibre não sobe no ambiente de teste, então o
contrato roda com o mapa dublado: prova DOM, ordem e cores, e não prova pino, tracejado nem leque.
O desenho foi verificado **na tela**, no preview local, e está medido abaixo — pino de 27 px com 72 %
do selo de ordem fora dele, rótulo de tempo sobre o trecho, traço seguindo as vias. **Os 375 px
continuam sem prova:** o Chrome no macOS trava `innerWidth` em 500, e o que existe é 500 px de janela
real mais o contêiner do mapa estreitado a 341 px por `ResizeObserver`. Quem tiver um aparelho na mão
fecha essa lacuna em um minuto; eu não fechei.

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

---

## Fase extra — o traço do minimapa segue o asfalto, e a legenda para de mentir

### O que mudou

O minimapa desenhava sempre a reta tracejada: `TripTimelineMiniMapCanvas` passava
`geometry={null}` fixo para o `AssemblyVectorMap`, que já sabe desenhar estrada desde a spec 079.
Nada de novo foi criado para rotear — o painel passou a **pedir à mesma rota** que o roteiro usa
(`POST /route-geometry`, `TRIP_READ_POLICY`, teto de 100 pontos), com `vehicleId: null` (sem pedágio
a calcular). Zero mudança na API.

- `resolveRoadPoints` extraído em `routeGeometry.service.ts`: era a mesma condição
  (`source === 'road'` + `length >= 2`) copiada dentro de `resolveRouteTrace` e `resolveRouteLegs`.
  Agora quem desenha o traço e quem escreve a legenda ao lado dele **leem da mesma função** — é o que
  impede a legenda de prometer asfalto sobre um tracejado reto (ADR-0044 §5).
- `eventTimeline.map.caption` virou três chaves: `captionRoad`, `captionStraight`, `captionPoint`.
  A frase é **consequência** do traço, nunca texto fixo. Com um lugar só não há traço, e a legenda
  não promete linha nenhuma.
- Rota indisponível (`source: 'unavailable'`, `ROUTING_MATRIX_URL` ausente, ou a consulta falhando)
  volta à reta tracejada **sem erro na tela e sem mapa vazio**: `routeQuery.data ?? null`.

### Números medidos

| Gate                  | Comando                                          | Resultado                                                                                        |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Contrato do painel    | `bun test test/trip.contract.test.ts`            | **2101 passam, 0 falham**, 20713 asserções, 1355 ms                                              |
| Contrato novo isolado | `-t 'rota do minimapa'`                          | **9 passam, 0 falham**, 24 asserções, 214 ms                                                     |
| `check` da app        | `bun run --cwd apps/frontend-transportada check` | **5977 + 165 passam, 0 falham**; lint 0 erros, 16 avisos (todos pré-existentes, outros arquivos) |
| Formatação            | `bun run format:check` (raiz)                    | limpo                                                                                            |
| Tipos                 | `bun run typecheck` (raiz)                       | limpo, 7 apps                                                                                    |

A API não foi tocada, então os gates dela não se aplicam.

O teste novo não confere a legenda contra si mesma: ele roda `resolveRouteLegs` — a função que o
mapa de fato usa — e exige que o `kind` dos trechos desenhados case com o traço que a legenda
anuncia, caso a caso (`null`, `unavailable`, `road`).

### ⚠️ O que **não** foi provado na tela, e por quê

**O print não foi refeito, e a rota não foi vista desenhada no navegador.** Não é "deu certo e não
tirei foto" — é uma parede de ambiente, e ela merece o nome:

`VITE_APP_URL=http://localhost:53000` no `.env` da raiz (que num worktree é **link simbólico** para
o `.env` compartilhado). O painel monta o `redirectUri` do Keycloak a partir dessa variável
(`identityEnvironment.config.ts:40`). Resultado: abrir `localhost:53112` (este worktree, PID 29745,
`cwd` conferido) autentica e **cai em `localhost:53000`**, que é o dev server de _outro_ worktree
(`reconcile-spec-145`, PID 38348) — ou seja, outro código. Corrigir exigiria reiniciar o meu dev
server com a variável trocada, e a instrução desta sessão era explícita: não reiniciar nem matar o
ambiente.

Tentar provar a metade de dados chamando a API direto também não deu: o token vive em memória, não
em `localStorage` (como manda o padrão), e capturá-lo da aplicação foi **barrado como materialização
de credencial** — corretamente. Não foi contornado.

O que **está** provado:

- `ROUTING_MATRIX_URL` **está configurado** nesta máquina (instância OSRM de staging), então o
  caminho de estrada é alcançável aqui — não é um ambiente só-degradação.
- O dev server de 53112 serve o código novo **agora**: o módulo transformado traz
  `geometry` desestruturado e repassado ao `AssemblyVectorMap` (linhas 31 e 58 do módulo servido),
  não mais `geometry={null}`; `tripTimelineRoute.service.ts` é servido com as duas funções.
- Os 9 contratos cobrem os dois lados do contrato: estrada vira traço de estrada **e** legenda de
  estrada; ausência e `unavailable` voltam à reta **e** à legenda de reta.

Os quatro prints `196-timeline-minimapa-*` seguem os antigos. Eles mostram a reta tracejada com a
frase que hoje é `captionStraight` — continuam fiéis ao caminho de degradação, e **não** foram
apagados justamente porque não há como substituí-los nesta sessão. Quem reabrir isto com
`VITE_APP_URL` apontando para a própria porta refaz os quatro.

### Tipos de evento — tratamento visual, um a um

As sete consultas da timeline produzem 11 `kind`. **Só `trip_stop_events` carimba posição**
(`trip-timeline-stop.query.ts:200`); as outras seis usam `NO_EVENT_LOCATION`. Por isso cinco kinds
podem aparecer no mapa e seis não — e isso é limite de dado na API, não fallback do painel.

| kind                       | ícone na lista | cor/tom                    | rótulo                                                                                | no mapa?                           |
| -------------------------- | -------------- | -------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| `trip.created`             | `add`          | neutro                     | "Viagem criada"                                                                       | não — sem posição na origem        |
| `trip.dispatched`          | `send`         | neutro                     | "Viagem despachada"                                                                   | não — sem posição na origem        |
| `trip.status_changed`      | `clock`        | derivado do `toStatus`     | pt-BR por situação (9 rótulos)                                                        | não — sem posição na origem        |
| `stop.arrived`             | `map-pin`      | neutro / pino `#0560c7`    | "Chegada na parada {{n}}"                                                             | **sim**                            |
| `stop.departed`            | `truck`        | neutro / pino `#0a7276`    | "A caminho da parada {{n}}"                                                           | **sim**                            |
| `stop.departure_cancelled` | `close`        | andamento / pino `#c20554` | "Cancelou a rota da parada {{n}}"                                                     | **sim**                            |
| `document.delivered`       | `check`        | conclusão / pino `#048b3c` | "{{nota}} entregue"                                                                   | **sim**                            |
| `document.returned`        | `refresh`      | problema / pino `#76602d`  | "{{nota}} devolvida"                                                                  | **sim**                            |
| `stop.occurrence`          | `alert`        | problema                   | "Ocorrência: {{tipo}}" — traduzido; desconhecido cai no próprio código                | não — tabela sem coluna de posição |
| `document.occurrence`      | `alert`        | problema                   | "Ocorrência em {{nota}}: {{tipo}}" — `tipo` é nome livre pt-BR do catálogo, já humano | não — sem posição na origem        |
| `document.status_changed`  | `document`     | derivado do `toStatus`     | pt-BR por situação (5 rótulos)                                                        | não — sem posição na origem        |

Nenhum kind cai em ícone ou cor genérica: os 11 têm entrada própria em `TIMELINE_MAP_CATEGORY_BY_KIND`
e em `ICON_BY_KIND`. As 8 categorias do mapa têm rótulo nos **dois** idiomas (conferido chave a
chave). A legenda do mapa só lista categoria que tem pino desenhado, então pino sem legenda não
existe.

### O defeito que o levantamento achou, e a emenda

`trip.status_changed` e `document.status_changed` tratavam **duas coisas diferentes como uma só**:
situação ausente (`toStatus === null`) e situação que o bundle não conhece caíam ambas em
"não informada". A segunda **escondia um dado que a API mandou** — o mesmo defeito do
`ocorrência: dock_closed`, pelo avesso. No mesmo arquivo, `stop.occurrence` já fazia o certo desde o
commit `fcee74ba0` ("sumir esconderia o evento"): as duas regras se contradiziam.

Emenda da 196 à 158, em `tripTimeline.service.ts`: ausente continua "não informada"; desconhecido
mostra o próprio código. Os dois contratos da 158 foram **emendados, não apagados** — cada um virou
dois casos (ausente e desconhecido), em `timeline-view.contract.ts`. O comentário do módulo, que
afirmava a regra antiga, foi corrigido junto.

⚠️ **Um achado que não virou mudança:** `tripResponse.validation.ts:1011` **descarta** item cujo
`kind` o bundle não conhece. Um kind novo da API some da tela em silêncio — o oposto de "nunca
some". É decisão deliberada da spec 206 T0.3 (o `nextCursor` sobrevive, a página não quebra) e
desfazê-la obriga a alargar `TripTimelineItem['kind']` para `string`, derrubando a exaustividade de
todos os `switch` do módulo. Fica registrado como dívida consciente, não corrigido por conta própria.

---

## Tarefa A — o selo de ordem no pino do minimapa

O pedido foi literal e corrigiu a si mesmo: _"no mapa não era troca o ícone por número, era add o
símbolo de número junto ao ponto, menor e superior à esquerda"_. O glifo é quem diz o **tipo** do
evento e fica; o número é selo adicional, como contador de notificação. O glifo manda, o selo informa.

### O defeito, medido — não estimado

O primeiro corte cobriu o ícone, e o relato foi esse: _"ícone de número cobriu todo o ícone do
evento"_. A tela deu o número:

|                              | antes           | depois             |
| ---------------------------- | --------------- | ------------------ |
| diâmetro do pino             | 24 px           | **27 px**          |
| glifo                        | 14 px           | 16,09 px           |
| selo                         | 22,99 × 18,2 px | **15 × 15 px**     |
| âncora do selo               | (−2,8, −2,8)    | (−7, −7)           |
| **glifo visível**            | **25,7 %**      | **97,5 %**         |
| área do selo ÷ área do glifo | 2,13×           | 0,87×              |
| corpo da fonte               | 10 px           | 10 px (inalterado) |

A causa não era a âncora, que já estava certa: era `box-sizing: content-box`, que inflava um selo
declarado com 15,2 px somando preenchimento (4,8) e borda (3). O selo passou a `border-box`.

⚠️ **Encolher o selo não era opção.** 10 px em bold é o menor corpo que ainda lê dois dígitos; abaixo
disso ilegível é tão inútil quanto coberto. Quem cresceu foi o pino.

### A janela tem um pixel de largura, e esse é o achado

Dos três caminhos possíveis — o pino cresce, o número sai do pino, os selos se reorganizam — foi
escolhido **o pino cresce**, e o tamanho saiu de duas restrições medidas, não de gosto:

- **piso 27 px**: abaixo disso o selo de dois dígitos estoura o teto de cobertura do glifo (10 %);
- **teto 27,71 px**: é a distância centro a centro de três pinos no mesmo ponto, pelo leque de
  `resolveMarkerOffsets` (raio de 16 px). Acima disso o agrupamento urbano piora.

**1,6875 rem (27 px) é o único diâmetro redondo que cabe nos dois.** Não é um número bonito, e é por
isso que ele está comentado na constante.

### Os cantos já tinham dono — e nenhum passou a ser disputado

O pino já hospedava `.tilePinCount` (contagem) e `.tilePinOccurrenceBadge` (spec 164 RF37), **ambos
no canto superior direito**. O selo de ordem ficou com o **superior esquerdo**, sozinho. Não houve
terceiro selo no mesmo canto. Registrado em `TIMELINE_MAP_ORDER_BADGE_CORNER`. O selo de ocorrência,
aliás, nem chega ao minimapa: `buildTimelineMapPin` não carrega nota nenhuma.

### A conta que o contrato cobra

`measureOrderBadgeGlyphCoverage(digits)` prevê a cobertura pela geometria declarada. A primeira
versão errou por um termo: `position: absolute` conta a partir da **caixa de preenchimento**, por
dentro da borda de 2 px do pino. O modelo previa 3,19 % onde a tela media 10,24 %. Com o termo
`PIN_BORDER_REM` no lugar, modelo e tela passaram a concordar: **2,51 % de cobertura, 97,49 % livre**.

- um dígito e dois dígitos ficam sob o teto de 10 %;
- **três dígitos chegam a ~11,9 %** — o glifo segue 88 % livre, mas a conta sai do teto. Fica como
  **exceção conhecida e documentada**, não como surpresa: exige viagem com cem pontos localizados.
- **ponto agrupado continua um pino, um ícone, um selo.** O selo diz a **vez na cronologia**, não a
  quantidade — quem diz quantos é `.tilePinCount`, no canto oposto. Dois números com significados
  diferentes nunca compartilham o mesmo canto.

O contrato foi provado **vermelho** antes de verde: restaurados os valores defeituosos, 4 dos 6 casos
novos falharam (cobertura 0,36/0,39 contra o teto de 0,1; pino não crescido; `box-sizing` errado).

### 375 px

A janela do Chrome não desce de ~500 px de viewport, então a prova foi feita encolhendo o **quadro do
mapa** para 375 px. O selo **não some e não encolhe**: 15 × 15 px, fonte 10 px, `visible`, contraste
12,66:1 — idêntico a 1280 px. A geometria é em `rem` e não depende da largura.

## Tarefa B — o tempo entre um ponto e o seguinte, sobre o traço

O intervalo já existia na **lista** (`eventTimeline.afterPrevious`); faltava no **mapa**. Ele reusa
`formatTripTimelineDuration` — esta base não ganha um segundo jeito de escrever "2 h 15 min" — e
mede entre pontos consecutivos da cronologia. Em ponto agrupado, mede do **último** evento do grupo
anterior ao **primeiro** do seguinte: é o tempo em que o caminhão esteve de fato a caminho, e não o
tempo parado dentro de cada grupo.

### Trecho curto: o rótulo recolhe, e isso foi decidido, não improvisado

`TIMELINE_MAP_LEG_LABEL_MIN_PIXELS = 72`. Abaixo disso o texto não cabe sobre o traço, e **tempo
ilegível sobreposto é pior que tempo ausente**. O rótulo recolhe por `visibility`, e o intervalo
continua na lista acessível e no resumo — nenhuma informação se perde, só muda de lugar. A legenda
avisa: _"Em trecho curto o tempo sai do mapa e fica só na lista abaixo."_

Medido na viagem de pré-visualização: os dois rótulos ficam **ocultos em todos os cenários**
(1280 px, 375 px, e após quatro passos de aproximação), porque os eventos localizados desta viagem
estão praticamente no mesmo lugar e a 0–1 min um do outro — nenhum trecho alcança 72 px. Forçada a
exibição para medir a caixa que **sairia**: 42,75 × 16,59 px, fonte 10,4 px, contraste 12,66:1.

⚠️ **Um trecho a menos que isso não é defeito:** `resolveRouteLegs` descarta trecho com
`slice.length < 2`, o que acontece quando dois pontos consecutivos caem no mesmo pixel. Sem traço não
há onde escrever, e o intervalo segue na lista.

## O contraste do pino — o mesmo elemento, na mesma passada

A revisão independente reprovou o numeral do próprio pino. Reproduzido e confirmado, com a causa raiz:

⚠️ **`.tilePin` pintava a tinta com `--color-ink-on-accent`, que troca de tema, sobre um
preenchimento que não troca.** O preenchimento é literal porque o MapLibre pinta em WebGL e não
resolve `var()`. O token existe — o comentário dele em `index.css:87` diz — para _"o texto que senta
sobre o cobre"_, superfície essa temática. Era **um token certo no lugar errado**.

| categoria  | antes (escuro) | antes (claro) | depois (os dois temas) |
| ---------- | -------------- | ------------- | ---------------------- |
| dispatched | **2,65**       | 5,81          | **5,81**               |
| cancelled  | 2,68           | 5,75          | 5,75                   |
| returned   | 2,70           | 5,69          | 5,69                   |
| arrived    | 2,72           | 5,65          | 5,65                   |
| departed   | 2,86           | 5,38          | 5,38                   |
| delivered  | 3,70           | **4,16**      | 4,16                   |
| occurrence | 3,84           | 4,01          | 4,01                   |
| status     | 4,32           | 3,56          | **4,32**               |

**Pior caso: 2,65 → 4,16.** Medido na tela depois: 4,16 no tema claro e **4,16 no escuro** — o mesmo
número, que é o ponto: a dependência do tema desapareceu.

### Por que a tinta não é fixa

Uma tinta fixa consertaria o minimapa e **quebraria o irmão**. O mapa do roteiro usa o mesmo
`.tilePin` com a paleta gerada, que vai de luminância 0,15 a 0,30: a tinta clara mede 4,95 numa ponta
e **2,83 na outra**, pior que os 5,43 que a tinta escura dá hoje. Por isso `resolvePinInk(fill)`
escolhe **pela cor do preenchimento**, não pelo tema. No pior ponto possível — onde as duas tintas
empatam, luminância 0,204 — o contraste ainda é **3,94**, e é um piso válido para qualquer cor futura.

O contrato `nenhuma parada do mapa do roteiro perde contraste em qualquer tema` percorre as 96
paradas e confere, uma a uma, que a tinta escolhida é ao menos tão boa quanto qualquer das duas em
qualquer tema. **O irmão melhorou junto**: os numerais dele mediam 2,84 no laudo e medem **4,18** na
tela agora.

### O limiar que se aplica, dito com precisão

O glifo do minimapa é **desenho**, não texto: o mínimo de WCAG 1.4.11 para objeto gráfico é **3:1**, e
todas as oito categorias passam. O numeral do mapa do roteiro é **texto**, e o mínimo seria 4,5 — ele
está em 4,18, ou seja, **melhor que antes mas ainda abaixo**. Levá-lo a 4,5 exige baixar o teto de
luminância do gerador de 0,30 para ~0,166, o que regenera as 96 cores e mexe nas travas de ΔE da
spec 164. **Não foi feito por conta própria; fica relatado com o número.**

### Um buraco que a própria tela revelou

Com a declaração fora do CSS, um pino que esquecesse a tinta **não quebraria: herdaria** a do corpo da
página. Foi exatamente o que apareceu num recarregamento parcial, medindo 2,41. Por isso o par virou
invariante cobrada no código-fonte: `todo pino que pinta o fundo pinta a tinta na linha seguinte`
confere que todo `element.style.background` do mapa vem seguido do `element.style.color =
resolvePinInk(...)`. Um terceiro construtor não consegue esquecer em silêncio.

---

## Polimento do mapa: o dedo, a língua e a tinta da legenda

Quatro apontamentos da revisão independente, feitos **depois** da cobertura do glifo estar resolvida
e provada, em commit separado. Um quinto apareceu no caminho e entrou junto, porque era o mesmo
elemento.

### 1. O literal que repetia um token

`tripTimelineMiniMap.module.css` escrevia `min-height: 2.75rem` no `.pointListSummary`.
`--touch-target` vale exatamente isso. Dois lugares com o mesmo número não são a mesma medida — numa
revisão do alvo de toque, um dos dois fica para trás e nada falha. Agora sai do token.

O contrato antigo que fixava o literal (`test/trip-hooks/timeline-mini-map.contract.ts:148`) foi
**emendado, não apagado**: ele continua provando os 44px que o nome dele promete, só que em dois
passos — a regra usa `var(--touch-target)`, e `src/styles/index.css:130` declara o token como
`2.75rem`. Antes ele provava o valor e perdia a origem; agora prova os dois.

### 2. Os controles do mapa não cabiam no dedo

**Medido na tela antes de mexer, pelos quatro botões sobre o mapa (aproximar, afastar, recentrar,
mudar a leitura): `43,59 × 38,40px`.** A auditoria tinha anotado 44×38 — na verdade os **dois**
sentidos estavam curtos, não só a altura. É o `size="sm"` do botão do design system, que encolhe
respiro e fonte juntos.

A correção não desfaz o `size="sm"`: ele continua mandando no respiro e na tipografia. O que entra é
só um piso por baixo dele, em `.vectorMapControls > button`, dos dois lados.

|                 | antes         | depois      |
| --------------- | ------------- | ----------- |
| aproximar       | 43,59 × 38,40 | **44 × 44** |
| afastar         | 43,59 × 38,40 | **44 × 44** |
| recentrar       | 43,59 × 38,40 | **44 × 44** |
| mudar a leitura | 43,59 × 38,40 | **44 × 44** |

A 375px os quatro continuam 44 × 44, e os selos de ordem continuam 15 × 15 a 10px, visíveis.

### 3. "Map" num painel em português

Os dois canvas se anunciavam `aria-label="Map"`. O nome não é nosso: o MapLibre rotula o próprio
canvas pelo dicionário interno dele (`Map.Title`), e o padrão vem em inglês — web.md §6.

O dicionário é **parâmetro de construção** (`locale`), e é por lá que se troca. Um `setAttribute`
depois do carregamento pareceria resolver e não resolveria: a troca de estilo (claro/escuro)
reconstrói o canvas e o rótulo voltaria ao inglês.

Medido na tela: `{"canvases":["Map","Map"]}` → `{"canvases":["Mapa interativo","Mapa interativo"]}`.
Chave nova em **duas** línguas: `assemblyMap.canvasLabel` = "Mapa interativo" / "Interactive map".

### 4. A legenda discordava do mapa que ela explica — achado novo

Não estava na auditoria; apareceu ao mexer no item 2 abaixo. O `.swatch` cravava `color: #fff` sem
justificativa nenhuma — e era por isso que ele estava errado, não só indocumentado.

Desde `c8c0d4242` a tinta do pino sai de `resolvePinInk(fill)`, pela cor e não pelo tema. Para
`status` (`#788591`) ela escolhe a **escura**:

| tinta sobre `#788591`          | contraste |
| ------------------------------ | --------- |
| `#10222c` (escura)             | **4,32**  |
| `#faf8f4` (clara)              | 3,56      |
| `#fff` (o que a legenda usava) | 3,78      |

Ou seja: a legenda pintava branco onde o mapa pinta escuro, e ainda reprovava nos 4,5 de texto.
Confirmado na tela antes da correção — selo `arrived` em `rgb(255,255,255)` contra pino `arrived` em
`rgb(250,248,244)`: cores diferentes para a mesma coisa, lado a lado.

Agora cada uma das oito categorias declara a tinta **em par** com o preenchimento, e o contrato de
cores compara cada par com o que `resolvePinInk` devolveria. Depois da correção, medido na tela:
`arrived` 5,65 · `delivered` 4,16 · `returned` 5,69, todos em `rgb(250,248,244)`, iguais aos pinos.

### Contratos

`test/trip/timeline-map-touch-and-language.contract.ts` (novo, importado pelo entrypoint
`test/trip.contract.test.ts`) e um caso novo em `timeline-map-colors.contract.ts`. Os quatro casos
foram escritos **vermelhos** contra o código de então — 4 fail / 11 pass — e passaram a 15 pass / 0
fail / 574 expects depois da implementação.

## Revisão de design — o evento sem posição era mudo no toque

O quinto caso de `resolveTimelineLocationView`, `unavailable`, desenhava um pino vermelho com **zero
caractere visível**. A frase que explica o vermelho morava inteira no `Tooltip` e no `aria-label` — e
tooltip não abre no dedo. No celular, o único estado de alarme da linha do tempo era um glifo
colorido que o leitor tinha de adivinhar.

**Forma escolhida: o rótulo curto ao lado do ícone, e só no tom `problem`.** As alternativas eram
pior negócio: uma camada que abrisse no toque transforma informação em gesto (e um gesto que o leitor
não sabe que existe); um texto em todos os cinco casos encheria dez eventos de "posição registrada"
para contar que o normal aconteceu. O rótulo já existia traduzido
(`eventTimeline.location.label.unavailable`) porque o `aria-label` o usava — nenhuma chave nova, logo
nenhum encontro com a outra sessão nos arquivos de locale. A frase longa segue na camada, para quem
aponta ou foca.

O alvo de toque precisou acompanhar: o `::after` do pino é um quadrado de 44×44 **centrado**, forma
certa para um ícone e errada para um botão de 140px — centrado no meio da frase, deixaria o próprio
ícone com os 18,5px da linha. `.locationProblem::after` passa a `inline-size: 100%`, a altura
seguindo do mesmo `--touch-target`.

Medido na tela (viagem de pré-visualização, 1366px, tema claro), depois:

|                                         | antes  | depois                      |
| --------------------------------------- | ------ | --------------------------- |
| caracteres visíveis no pino de alarme   | 0      | 20 (`Posição indisponível`) |
| altura do alvo nas duas pontas do botão | 18,5px | 44px (ícone e fim do texto) |
| pinos neutros com texto                 | 0 de 5 | 0 de 5 (seguem mudos)       |

Contraste do texto, agora que é texto e vale o mínimo de 4,5: **4,69** no claro
(`rgb(194,56,47)` sobre `rgb(242,239,233)`) e **5,46** no escuro (`rgb(255,95,87)` sobre
`rgb(16,34,44)`). Em 375px simulados o botão não quebra a linha nem estoura a largura
(`scrollWidth === clientWidth`). O nome acessível continua começando pelo texto visível (WCAG 2.5.3).

Contrato: `test/trip-hooks/timeline-location-missing-label.contract.ts`, novo, importado pelo
entrypoint `test/trip-hooks.contract.test.ts`. Escrito **vermelho** contra o código de então — 1 fail
/ 2 pass, `Expected: "Posição indisponível" · Received: ""` — e 4 pass / 0 fail depois. Suítes
inteiras: 2156 pass / 0 fail (contrato) e 179 pass / 0 fail (DOM).

### Defeito 4 — o tempo entre eventos não aparecia na tela (tarefa B, correção)

**O fato medido antes da correção**, na 53112, 1440 px, enquadramento inicial, mapa geral aberto:
quatro pinos numerados (1, 2, 3, 4) → três trechos; **dois** nós `.tileLegLabel` no DOM, ambos com
`visibility: hidden`, textos `"0 min"` e `"1 min"`. Nenhum tempo visível. Três defeitos distintos.

**(a) Os que existiam nasciam escondidos.** `applyLegLabelFit` recolhia todo rótulo cujo vão
projetado fosse menor que `TIMELINE_MAP_LEG_LABEL_MIN_PIXELS = 72`. Os três vãos reais no
enquadramento de abertura, medidos por `map.project` na própria tela: **32,0 / 14,2 / 1,4 px**. O
limiar valia para 100% dos rótulos, e ainda era arbitrário — 72 px não tinha relação nenhuma com a
largura do texto que julgava (o rótulo mede **41,7 × 15,6 px**).

**(b) Faltava um rótulo.** Quatro pinos são três trechos, e só dois nós existiam — a regra de (a)
alternava classe, não removia nó, então o terceiro **nunca foi criado**. Causa encontrada em
`routeGeometry.service.ts:433`: `resolveRouteLegs` devolve `[]` quando `slice.length < 2`. Dois
eventos consecutivos no mesmo lugar caem no mesmo índice de corte da polilinha, o trecho degenerado
é descartado, e o rótulo — que era derivado de `legs` — perdia aquele par para sempre.

**(c) Um dos rótulos dizia "0 min".** Zero minuto sobre um traço não informa nada e ocupa espaço.

#### As quatro decisões, e por quê

1. **O conjunto de rótulos pertence à cronologia, não ao traço desenhado.** `resolveTimelineLegLabels`
   percorre pares consecutivos de pontos; o traço decide só **onde** ancorar (meio do trecho
   desenhado quando ele existe, meio da reta entre os pinos quando não). Corrige (b) na causa, um
   nível acima de `resolveRouteLegs`, sem mexer em arquivo fora do território.
2. **Abaixo de um minuto o mapa não escreve nada** (`TIMELINE_MAP_LEG_LABEL_MIN_MINUTES = 1`); o
   intervalo continua inteiro na lista acessível ao lado. Corrige (c).
3. **Traço curto muda o rótulo de lugar, não o apaga.** `resolveLegLabelPlacement` compara o vão com
   a **largura real do texto** (`offsetWidth`) mais `TIMELINE_MAP_LEG_LABEL_GAP_PIXELS = 8`; não
   cabendo, o rótulo desce `TIMELINE_MAP_LEG_LABEL_PIN_OFFSET_PIXELS = 26` px abaixo do pino de
   chegada. Para baixo por eliminação: os dois cantos de cima do pino já hospedam o selo de ordem e
   o de ocorrência. Corrige (a).
4. **A antiga semântica de esconder vira guarda de colisão.** `resolveLegLabelVisibility` recolhe o
   rótulo que cairia por cima de outro já posicionado, e **nunca o primeiro** — nenhuma regra pode
   voltar a apagar tudo.

#### Depois, medido na mesma tela (53112, tab visível, 1280 px)

- `.tileLegLabel` no DOM: **1**, `visibility: visible`, texto `"1 min"`, caixa 41,7 × 15,6 px.
- Os outros dois intervalos são de 0 min e, por decisão 2, não vão ao mapa — vão à lista.
- Centro do rótulo em **(757, 4667,4)**; centro do pino 4 em **(757, 4641,4)** → exatamente **26 px**
  abaixo, que é a constante: a colocação `'pin'` disparou e ancorou no destino, não no traço.
- Topo do rótulo em y 4659,6 contra base do pino 4 em y 4654,9 → **4,7 px de folga**, sem sobrepor
  pino, selo de ordem ou selo de ocorrência.
- Largura de telas: com o canvas do minimapa em **341 px** (largura de telefone), o rótulo continua
  `visible`, 41,7 px, inteiro dentro do mapa; pinos seguem 27 px. ⚠️ O Chrome do macOS não deixa a
  janela abaixo de ~500 px de largura — os 375 px foram verificados estreitando o contêiner do mapa
  e deixando o `ResizeObserver` do MapLibre reprojetar, não a janela.

⚠️ **Armadilha de verificação, registrada para a próxima pessoa:** com a aba de Chrome **oculta**
(janela minimizada ou atrás), o `requestAnimationFrame` não roda, o MapLibre nunca renderiza e
**nenhum** marcador é criado — nem os da rota, que ninguém tocou. O sintoma é idêntico ao de um mapa
quebrado: canvas no lugar, zero pinos, zero requisições de telha, zero eventos `styledata`. Medido:
`document.visibilityState === 'hidden'` e `requestAnimationFrame` sem disparar em 3 s. Trazer a
janela à frente resolveu e os 10 marcadores apareceram. Não é defeito do produto.

#### Contrato

`test/trip/timeline-map-order-and-interval.contract.ts`, **emendado, não apagado**. O caso que cobrava
só a existência do limiar passava com tudo oculto — era exatamente o estado da tela. Ele virou
`'as medidas do rótulo são constantes nomeadas e em pixel'`, e entraram dois blocos novos: o
enquadramento de abertura (colocação nunca esconde; limiar derivado da largura medida; três pares
consecutivos dão três rótulos mesmo com dois trechos cortados; sub-minuto ausente do mapa e presente
na lista; o primeiro ponto nunca ganha rótulo) e a colisão (três caixas empilhadas → `[true, false,
false]`; espalhadas → todas visíveis; encostadas na quina → ambas visíveis). A legenda também foi
emendada: ela prometia que "o tempo sai do mapa" em trecho curto, descrição fiel da regra que apagava
tudo; agora o contrato proíbe essa frase e cobra que ela fale do pino, nos dois idiomas.

Portões: `format:check` 0 · `typecheck` 0 · `check` da app 0 · a suíte do contrato 28 casos, 101
asserções, 0 falhas.

## Fechamento — o portão inteiro e a prova de tela

Rodado comando a comando na árvore final (o hook de pre-commit reescreve arquivos no worktree, então
`make check` não é confiável aqui):

| gate                   | saída                                       |
| ---------------------- | ------------------------------------------- |
| `bun run format:check` | 0 — todos os arquivos no estilo do Prettier |
| `bun run lint`         | 0 — 16 avisos, 0 erros                      |
| `bun run typecheck`    | 0 — sete apps                               |
| `bun run test`         | 0 — **17.370 casos, 0 falhas**              |
| `bun run build`        | 0                                           |

Medido na tela do preview (`localhost:53112`, viagem `5f5820bd`), com a janela à frente:

- **Botões no vão do ícone, com respiro.** `Ver mais` e `Ver no mapa`: `padding-inline` 8 px, altura
  44 px, caixa em `x = 48` contra o título em `x = 56` — os 8 px de diferença são exatamente a
  `margin-inline-start` negativa que alinha o texto sem comer o alvo. Quatro botões, mesma medida.
- **Selo de ordem.** Pino 27 × 27, glifo 16,1 px, selo 15 × 15 com **72 % da área fora do pino** e
  **2,5 % do glifo coberto**. Idêntico nos quatro pinos numerados.
- **Rótulo de tempo.** `1 min` visível sobre o trecho, 26 px abaixo do centro do pino de chegada.
- **Traço pelo asfalto.** A linha sai de Ribeirão Preto e desce pelas vias até a região de Sorocaba.

Prints em `prints/`: `196-mapa-eventos-1280.jpg`, `196-mapa-eventos-500.jpg`,
`196-linha-do-tempo-500.jpg`.

⚠️ **Um rótulo de três, e não é defeito.** Os quatro eventos localizados desta viagem de preview
foram criados com segundos de diferença (`15:55:32` e `15:56:17`): dois intervalos são 0 min e, por
decisão registrada acima, intervalo abaixo de um minuto fica na lista e não vai ao mapa. O único
intervalo ≥ 1 min é o que aparece. Ver os três exigiria espalhar os horários no Postgres local, o que
não foi feito — o dado de preview é compartilhado entre sessões.

## A autoria repetida voltou, e agora tem contrato

O `gate / integration-smoke` reprovou e levou os seis `deploy-*` junto. A falha é antiga: o run
anterior de staging (commit `fcee74ba`) já morria na mesma linha, antes destes commits.

```
Locator: getByRole('region', {name:'Linha do tempo'})
         .getByText('por Marina Alves (escritório) pelo motorista João Pereira', {exact:true})
Expected: 1
Received: 4
```

A regra da spec 180 — a autoria só aparece quando **muda** — vivia dentro do JSX, numa prop
`repeatsAuthorship` calculada no `map`. O redesenho do item (`0e1d1d67a`) reescreveu aquele trecho e
a prop não foi junto. Nada no contrato cobrava a regra: o único a vê-la era o smoke, que roda na CI,
oito dias depois.

A regra virou função pura, `collectRepeatedAuthorshipItemIds`, com quatro casos em
`test/trip/timeline-view.contract.ts`: a sequência do mesmo autor guarda só o primeiro, o autor que
muda reaparece, o mesmo ator por outro canal não é repetição (compara-se a frase, não o nome) e
lista vazia não quebra. Fora do JSX, um refator que a derrube reprova em segundos, não na CI.

⚠️ **O smoke precisa de porta própria neste worktree.** `reuseExistingServer` é `true` fora da CI, e
a 53000 é do outro checkout: a primeira execução testou a app errada e reprovou cinco de cinco em
`getByRole('region')`. Com servidor dedicado, cinco de cinco passam:

```bash
PLAYWRIGHT_FRONTEND_PORT=53110 PLAYWRIGHT_REUSE_EXISTING_FRONTEND_SERVER=false \
  PLAYWRIGHT_TEST_MATCH=trip-timeline.smoke.spec.ts bun run smoke
```

**Os 375 px deixaram de ser lacuna.** Os prints `mobile light` e `mobile dark` do smoke rodam em
375 × 812 no Playwright — o teto de ~500 px é do Chrome no macOS, não do projeto. Os quatro
`t10-timeline-*.png` da spec 158 foram regerados já sem a autoria repetida.

| Portão          | Saída |
| --------------- | ----- |
| `format:check`  | 0     |
| `lint`          | 0     |
| `typecheck`     | 0     |
| `test` (17.374) | 0     |
| `build`         | 0     |
| smoke da linha  | 5/5   |

## T6.4 — a tolerância fechou, e o tipo deixou de mentir

Fechada em `5c2d54ff7`.

A T4.0 deixou `location` e `locationState` em `TRIP_TIMELINE_ITEM_OPTIONAL_KEYS` por um motivo com
prazo: entre a subida da API e a do painel, exigir a chave exata recusaria a página inteira. O prazo
venceu — e a verificação que autorizou fechar não foi "a spec disse que subiu", foi medida:

- `NO_EVENT_LOCATION = { location: null, locationState: null }`
  (`trips/application/trip-timeline.types.ts:110`) é espalhado pelas **três** consultas da linha do
  tempo — `trip-timeline-status.query.ts` (4 usos), `trip-timeline-document.query.ts` (3) e
  `trip-timeline-stop.query.ts` (2). O toque que nunca carimbou sai com as duas chaves em `null`,
  nunca sem elas;
- o recorte por permissão também preserva a forma: sem `trip.event-location`,
  `read-trip-timeline.use-case.ts` devolve `{ ...item, location: null }` — apaga o valor, não a chave;
- `29510bbae`, o commit que publicou as chaves na API, **está em `main`**, não só em `staging`
  (`git merge-base --is-ancestor`). Exigir num painel servido por uma API de produção sem os campos
  é que seria o defeito.

⚠️ **Um alarme falso no caminho, que vale registrar.** Um `grep` por `location:` nas três consultas
devolveu resultado só em `trip-timeline-stop.query.ts`, o que sugeria que status e documento não
mandavam as chaves — e que exigir derrubaria metade da lista. Era o `grep` que estava errado: as
outras duas emitem pelo spread da constante, e nenhum `location:` literal aparece nelas. Procurar o
literal de uma chave encontra quem a escreve à mão, nunca quem a herda.

O escopo foi além do validador de propósito. `TripTimelineItem` marcava as duas como `?`, e um tipo
opcional sobre um campo que sempre chega obriga todo leitor a carregar guarda de `undefined` que
nunca dispara. Com elas obrigatórias, o `exactOptionalPropertyTypes` apontou **nove** fixtures de
contrato e nenhum arquivo de produção — a prova de que o código já tratava a forma certa. Dois outros
contratos montam o payload **cru** (`Record<string, unknown>`), que o typecheck não alcança: esses só
apareceram ao rodar a suíte, e são a razão de o portão de teste não ser substituível pelo de tipo.

O contrato da T4.0 virou o seu oposto por emenda, não por remoção: `aceita o item sem as duas chaves`
virou `recusa o item sem as duas chaves`, com os dois casos de meia-forma (só `location`, só
`locationState`) que antes não existiam. Quatro testes vizinhos ganharam as chaves porque passariam
**pelo motivo errado** sem elas — `recusa location com chave a mais` reprovaria por falta de
`locationState`, não pela chave a mais, e um teste que passa pelo motivo errado é um teste que não
cobre nada.

| Portão                  | Saída                                |
| ----------------------- | ------------------------------------ |
| `format:check` (raiz)   | 0                                    |
| `lint` (raiz)           | 0 erros (16 warnings pré-existentes) |
| `typecheck` do painel   | 0                                    |
| `test` do painel (6166) | 0                                    |
| `test:hooks` (180)      | 0                                    |

**O vermelho veio antes do verde.** Com o contrato ajustado e o código ainda intacto, a suíte deu
`1 fail` em `recusa o item sem as duas chaves`; depois das três camadas (lista de chaves, validador,
tipo), `0 fail`.

## T7.3 — a auditoria de log, metade feita: painel e API de demonstração

Primeiro item do T7.3 ("coordenada em nenhum log"), nas duas superfícies que não dependem da
reconciliação em curso. **Parcial de propósito** — API e worker ficam para depois, e a task não fecha
com isto.

⚠️ **O `grep` cru desta máquina passa por um filtro que omite linhas sem avisar.** Toda varredura
abaixo foi feita com `rtk proxy grep`. A memória do projeto já registrou o estrago da versão
filtrada: um `git log` que contou 50 de 73 commits.

**Painel (`frontend-transportada`), módulos `trip/` e `shared/`:** três chamadas, todas em
`AssemblyVectorMap.component.tsx`, e **nenhuma recebe coordenada**:

| linha | chamada                             | o que carrega                          | em produção                         |
| ----- | ----------------------------------- | -------------------------------------- | ----------------------------------- |
| 233   | `console.warn('[route-layer]', …)`  | mensagem de erro do `setPaintProperty` | não executa — `!== 'production'`    |
| 286   | `console.error('[basemap]', error)` | falha de construção do mapa            | não executa — `import.meta.env.DEV` |
| 332   | `console.error('[basemap]', …)`     | `event.error?.message` do MapLibre     | não executa — `import.meta.env.DEV` |

Os dois primeiros são erro de estilo e de basemap; o terceiro existe porque engoli-lo custou um dia
inteiro de diagnóstico às cegas, e o comentário no arquivo registra isso. O pior caso fora de
produção é a mensagem do MapLibre trazer a URL de um tile — índice `z/x/y`, quadrado do mapa derivado
do enquadramento, não posição carimbada de evento. Não é dado pessoal e não é achado.

**API de demonstração (`apps/frontend-driver/scripts/driver-preview-api.ts`, 487 linhas):** uma única
chamada, linha 485 — faixa de inicialização com a porta e o endereço da API real. Sem coordenada.

Faltam do T7.3: logs da API e do worker, respostas fora da tabela do D7, N+1 nas consultas da linha
do tempo, `EXPLAIN` do expurgo nas cinco tabelas e o destino do `VITE_MAP_TILES_URL`.

## Reconciliação — o que o worker e o app do motorista têm de verdade

As caixas do `tasks.md` não são confiáveis: outra sessão fez parte do trabalho sem marcar, e há nomes
no código que **parecem** entrega da 196 e são de outras specs. Mandei um agente conferir
`apps/worker-transportada` e `apps/frontend-driver` contra o código, task por task. Resultado: **T2.1,
T2.2 e T5.0–T5.4 continuam abertas**, e as caixas abertas delas estão certas.

### Três nomes que não são da 196 — não tique por homonímia

| Nome no código                  | Parece ser | É de fato                                                |
| ------------------------------- | ---------- | -------------------------------------------------------- |
| `applyReportLocation`           | T5.2       | spec 189 — e **com a exceção da ocorrência ainda lá**    |
| `scripts/driver-preview-api.ts` | T5.0       | spec 206 T4.5 (o cabeçalho do arquivo diz isso, linha 3) |
| `location` no `depart`          | T5.3       | spec 206 — o "Despachar" continua sem ponto              |

Tiquar qualquer uma das três por achar o nome no `grep` fecharia task que não existe. É a mesma
família do defeito que a 179 cometeu contra a 164 e a 161.

### O que de 196 realmente entrou no worker

Só o `location_state`/`expired` nas **duas** tabelas que já tinham ponto (`trip_stop_events`,
`trip_delivery_proofs`), no commit `3cdbf9711`, escopo da Fase 1. E a rotina de expurgo **roda**:
`trip-location-purge.routine.ts:44`, registrada em `main.ts:1208` como `TRIP_LOCATION_PURGE_JOB`, no
catálogo com intervalo mínimo de um dia. Sobre três tabelas, não cinco.

**A regra do `package.json` está cumprida**, ao contrário do que eu temia: os três contratos de
`test/trip-location-purge/` rodam, porque o entrypoint `trip-location-purge.contract.test.ts` está na
linha `"test"` da app. O problema da T2.1 não é encanamento — é conteúdo que não existe:
`TRIP_LOCATION_STAMPED_TABLES` e `TRIP_LOCATION_UNSTAMPED_TABLES` não existem em lugar nenhum (0 hits
na API e no worker), as três tabelas novas não são declaradas no schema do worker, e não há `exhausted`
por tabela.

### Por que T2.x não poderia estar feita

**Não há coluna para redigir.** A migration `20261001123700_event_location_stamp` deixou as três
tabelas sem ponto de fora — o próprio `tasks.md` da Fase 1 avisa isso. O expurgo das cinco tabelas
depende da Fase 1 terminar, e ela não terminou.

### O que falta, em uma linha cada

- **T2.1/T2.2:** as três tabelas novas no schema do worker, os dois conjuntos de tabelas, paridade do
  D8, teto de lotes e `exhausted` por tabela, redatores das três tabelas, `try/catch` por tabela
  (hoje uma coluna ausente derruba o ciclo inteiro) e `redactedByTable`/`exhaustedTables` no log.
- **T5.1:** os dois contratos não existem. O vizinho mais próximo, `offline-queue.contract.ts:221`,
  afirma o **oposto** do que a 196 pede: `it('ocorrência não tem posição: fica como está')` — é da 189
  e vai precisar mudar junto.
- **T5.2:** a exceção da ocorrência está viva em `offlineQueue.service.ts:224-235`, e os tipos de
  `occurrence`/`documentOccurrence` não têm `location`. `registerDocumentOccurrence` ainda faz `POST`
  direto em dois lugares, em vez de virar item de fila.
- **T5.3:** `readDirectTapLocation` não existe (0 hits). O que existe é `readCurrentLocation`, com
  `enableHighAccuracy: true`, `maximumAge: 0` e `timeout: 8_000` — o contrário do que a task pede.
- **T5.4:** não existe `prints/` na pasta da spec, e o `.claude/launch.json` não tem
  `motorista-local` nem `motorista-api-demo`.

## T1.1 (parte que faltava) — o contrato das três tabelas sem coluna de ponto

A seção "T1.1 / T1.2 / T3.1" acima cobriu as **duas** tabelas que já tinham as quatro colunas de
posição. As três que não tinham coluna nenhuma — `trip_status_events`, `trip_stop_occurrences`,
`trip_document_occurrences` — ficaram de fora da migration `20261001123700_event_location_stamp`, e
é esse buraco que a T1.1 fecha agora.

### O contrato novo, e por que ele é vermelho

`apps/api-transportada/test/trip-schema/event-location.contract.ts` ganhou um segundo bloco
(`as três tabelas que ganham posição agora`) com cinco asserções por tabela: as cinco colunas
anuláveis e sem default, os quatro CHECKs de coordenada, os dois de estado, os dois de canal, e o
índice parcial pela coluna de tempo **da própria tabela**.

```
bun --env-file=../../.env.test test ./test/trip-schema.contract.test.ts --timeout 120000
147 pass · 15 fail · 586 expect() calls · Ran 162 tests across 1 file. [559.00ms]
```

As 15 falhas são 5 asserções × 3 tabelas, todas dentro do bloco novo — o bloco antigo segue inteiro
no verde. O aceite da task ("o contrato falha pelo motivo certo; a contagem subiu em N") fecha com
**N = 15**. O motivo é estrutural, não de texto: `indexColumnsByName(table)[indexName]` devolve
`undefined` contra `["recorded_at"]` / `["created_at"]`, e os CHECKs e colunas idem — nada existe
ainda no schema.

As cinco asserções, por nome:

| Asserção                                                                            | O que ela prende                                                |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `ganha as cinco colunas de posição, todas anuláveis e sem default`                  | tipos SQL exatos, `notNull: false`, `hasDefault: false`         |
| `amarra a coordenada: par completo, faixa do globo e precisão só com ponto`         | `_coordinates_check`, os dois `_range_check`, `_accuracy_check` |
| `restringe o estado ao conjunto e amarra captured à coordenada, sem buraco de NULL` | `_location_state_check` e `_location_state_consistency_check`   |
| `só aceita coordenada do app do motorista, e estado só de canal que pede posição`   | `_coordinates_channel_check` e `_location_state_channel_check`  |
| `indexa só o que tem ponto, pela coluna de tempo da própria tabela`                 | o índice parcial, com `where` conferido                         |

Cada tabela indexa pela **sua** coluna de tempo: `trip_status_events` não tem `created_at` (índice em
`recorded_at`), e as duas de ocorrência não têm `recorded_at` (índice em `created_at`, append-only por
desenho). Um índice copiado da tabela vizinha nem compila.

### Um helper que faltava no arnês de schema

`indexWhereSqlByName` (`test/fiscal-schema/support.ts`) devolve o `where` de **todo** índice. O irmão
que já existia, `uniqueIndexWhereSqlByName`, filtra `config.unique` — e o índice de posição não é
único. Pedir o `where` dele por aquele mapa devolveria `undefined`, e a asserção passaria **sem ter
olhado nada**. É a mesma família de falso-verde do `test.each` que esconde a tabela de casos.

### Os dois CHECKs de canal entram só nas três tabelas novas

Isto não é preferência de escopo: é o que a composição dos CHECKs permite hoje.

Em `trip_stop_events`, `_location_state_consistency_check` já está aplicado e força
`coordenada ⇒ captured`. Somado a `_location_state_channel_check` (`estado ⇒ canal ∈ {driver_app,
whatsapp}`), o par **proíbe qualquer coordenada fora desses dois canais**. Então adicionar o CHECK de
estado àquela tabela reprova se existir uma linha histórica com coordenada em outro canal.

Tentei a variante "migration que se defende" (`UPDATE … SET location_state = 'captured' WHERE
latitude IS NOT NULL AND channel = 'driver_app'`) e ela não resolve: a linha com coordenada em outro
canal ficaria com `location_state = null`, que é exatamente o que o CHECK de consistência rejeita. A
contagem histórica é inevitável.

As três tabelas novas não têm esse problema — elas nascem sem nenhuma linha com coordenada, então
nada antigo pode reprovar, e os dois CHECKs entram juntos com as colunas.

### A contagem em staging (nenhum segredo na sessão)

O banco certo foi identificado por sondagem, não por adivinhação de nome: `to_regclass
('trip_stop_events')` devolveu `t` no serviço `Postgres` e `f` no `Postgres-q0RQ`. As contagens
rodaram **dentro do contêiner** por `railway ssh`, onde `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`
já existem — nenhuma string de conexão foi extraída para a sessão, e só agregados saíram.

| Medida                              | Valor              |
| ----------------------------------- | ------------------ |
| Linhas em `trip_stop_events`        | 39                 |
| Com coordenada                      | 37                 |
| Com coordenada fora de `driver_app` | **0**              |
| Quebra por canal                    | `driver_app \| 37` |

Muito abaixo do teto de 100 mil que o `plan.md` usa para decidir lote — se produção acompanhar, a
migration é uma transação só.

### O que está bloqueado, e por quem

**Produção não foi medida.** `railway ssh --environment production --service Postgres-Hqfu -- psql
-c "select count(*)…"` foi **recusado** pelo classificador de modo automático, motivo
`[Production Reads]`. A recusa diz valer para o resultado, não só para aquele comando, então não
tentei contorno nenhum — nem túnel, nem variável, nem MCP.

Consequência prática, e é pequena: `_location_state_channel_check` **em `trip_stop_events`** fica
fora da T1.2 até alguém com acesso rodar

```sql
select count(*) from trip_stop_events where latitude is not null and channel <> 'driver_app';
```

Zero → o CHECK entra junto. Diferente de zero → ou ele não entra naquela tabela, ou a migration
precisa de uma decisão de produto sobre as linhas antigas. **Nada mais da Fase 1 depende disso**: as
três tabelas novas e todo o resto da T1.2 seguem.

### Gates desta task

| Gate                                       | Resultado                                    |
| ------------------------------------------ | -------------------------------------------- |
| `bun run typecheck` (api)                  | exit 0                                       |
| `bun run lint` (api)                       | exit 0                                       |
| `prettier --check` nos dois arquivos       | "All matched files use Prettier code style!" |
| `test ./test/trip-schema.contract.test.ts` | 147 pass / 15 fail — vermelho pretendido     |

## T1.2 — as três tabelas de ocorrência e status passam a carimbar onde o evento aconteceu

As cinco colunas, os oito CHECKs e o índice parcial entraram em `trip_status_events`,
`trip_stop_occurrences` e `trip_document_occurrences`. A estrutura partilhada mora em
`src/database/event-location.schema.ts` como **três fábricas**, não como constante de módulo:
`buildEventLocationColumns()`, `buildEventLocationChecks({ columns, coordinateChannel,
statefulChannels, tableName })` e `buildEventLocationIndex({ latitude, tableName, timeColumn })`.

### Por que fábrica, e não uma constante espalhada com spread

A primeira forma óbvia — um `const EVENT_LOCATION_COLUMNS = { latitude: numeric(...), ... }`
espalhado nas três `pgTable` com `...` — é defeito silencioso. O builder do Drizzle é **mutável**:
ele recebe o nome e o `build()` da tabela que o consumiu. Compartilhar a mesma instância entre três
tabelas faz a terceira sobrescrever o que as duas primeiras configuraram, e nada falha em voz alta.
A estrutura partilhada precisa ser função chamada uma vez por tabela.

Dois detalhes do mesmo arquivo, pelo mesmo motivo de ciclo e de ordem de avaliação:

- `tableName` entra como **texto**, não via `getTableName`: dentro do segundo argumento da
  `pgTable` a tabela ainda não existe, e o nome volta vazio.
- os canais entram por **parâmetro** (`coordinateChannel`, `statefulChannels`) em vez de um import
  de `TRIP_FIELD_CHANNELS` — o import fecharia ciclo com `trip.schema.ts`.
- `raw` é helper local, não import do Drizzle: `trip.schema.ts:213` já declara o seu, e importar de
  lá fecharia o mesmo ciclo.

### A migration não tem `UPDATE`, e o nome da pasta é deliberado

`drizzle/20261002033125_occurrence_location_stamp/` — 98 linhas, 66 statements separados por
`--> statement-breakpoint`, nessa ordem: 15 `ADD COLUMN` agrupados por tabela, 24 CHECKs cada um
`ADD CONSTRAINT ... NOT VALID` seguido do seu `VALIDATE CONSTRAINT` em comando separado, e os 3
`CREATE INDEX ... WHERE "latitude" is not null` por último.

Duas coisas que o `plan.md` e o `tasks.md` diziam errado e foram corrigidas na mesma passada:

1. **Nenhum `UPDATE`.** O `UPDATE ... SET location_state = 'captured'` de `trip_stop_events` já
   saiu na migration irmã (`20261001123700_event_location_stamp`), e as três tabelas desta task
   nascem sem uma linha com coordenada — não há o que carimbar.
2. **A pasta não pode terminar em `_event_location_stamp`.** É por esse sufixo que
   `test/database-migration/static-migration.contract.ts:1845-1928` recorta o bloco da migration
   irmã; duas pastas com ele fariam cada asserção daquele bloco valer para a pasta errada. O
   sufixo escolhido (`_occurrence_location_stamp`) mantém os dois recortes disjuntos.

O CHECK de consistência ficou na forma **nula-segura**, e isso não é estilo:

```sql
CHECK (("location_state" is not distinct from 'captured') = ("latitude" is not null))
```

A redação anterior do `plan.md` abria com `location_state is null or (...)`. CHECK que avalia `NULL`
**passa** em Postgres, então a forma antiga aceitava exatamente a linha que ela diz barrar —
coordenada gravada com estado nulo. `test/trip-schema/event-location.contract.ts:78,150` prende isso
com `expect(checkSql).not.toContain('is null or')` no CHECK de consistência.

`NOT VALID` + `VALIDATE CONSTRAINT` separado também é escolha de lock: `ADD CONSTRAINT` que valida
toma ACCESS EXCLUSIVE com varredura cheia, enquanto `VALIDATE CONSTRAINT` toma só SHARE UPDATE
EXCLUSIVE e não bloqueia leitura nem escrita. `CREATE INDEX CONCURRENTLY` fica fora de alcance: não
roda dentro de bloco de transação, e o migrador aplica cada pasta numa transação.

O `rollback.sql` (85 linhas) desce na ordem inversa — índice, constraint, coluna — sem `CASCADE`,
com o aviso de perda de dado e o de ordem (**reverter a API antes**, senão a escrita falha 42703) no
topo, e fecha com o bloco `DO $$ ... GET DIAGNOSTICS ... IF deleted_migrations <> 1 THEN RAISE
EXCEPTION` que o contrato estático exige para a remoção do registro de migration.

### O Docker estava fora, e a substituição está declarada

`make migration-test` é `postgres-up` + `db:test` (`Makefile:206-209`), e o `postgres-up` não subiu:
`Cannot connect to the Docker daemon at unix:///Users/anderson.filho/.docker/run/docker.sock`. Rodei
o `db:test` — os oito arquivos listados em `apps/api-transportada/package.json:24` — contra um
cluster **nativo descartável** do Homebrew (`/opt/homebrew/opt/postgresql@18/bin`,
`PostgreSQL 18.4 (Homebrew) on aarch64-apple-darwin25.4.0`) em `/private/tmp/claude-502/pg-mig-196`,
porta `65490`, `--auth=trust`, banco `transportada_migration`. O cluster foi parado e apagado depois.

Isso **não é** o caminho que o Makefile prescreve, e está escrito aqui para quem revisar não
confundir: a suíte é a mesma e o Postgres é a mesma major, mas o contêiner do `compose.yaml` não
participou desta medição.

### Um defeito achado pela execução, de outra spec, commitado à parte

A primeira execução do `db:test` deu **1 fail de 114**, e não era da 196:
`test/database-migration/delivery-proof-contractor-overrides.assertion.ts:76` (spec 218) afirmava
SQLSTATE `23503` para uma sonda de `ON DELETE RESTRICT`. O Postgres 18 responde `23001`
(`restrict_violation`); versões anteriores, `23503`. O irmão
`cte-profile-output-constraints.assertion.ts` já aceitava os dois — era o modelo, não o perigo.
Corrigido para aceitar o par, commitado **sozinho** em `0659a481b`, fora do lote da T1.2.

A falha disparou **depois** de `runDatabaseMigrations` passar, o que já dizia o principal: a migration
da 196 aplicou, restringiu, reverteu e reaplicou corretamente desde a primeira execução.

### Portões

| Portão                                                      | Resultado                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `bun run typecheck` (api)                                   | exit 0                                                                                  |
| `test ./test/trip-schema.contract.test.ts`                  | **162 pass · 0 fail · 649 expect()** — eram 147 pass / 15 fail na T1.1 vermelha         |
| `DESTRUCTIVE_MIGRATION_PATTERN` sobre a `migration.sql`     | nenhuma correspondência, em 66 statements                                               |
| `bun run db:generate`                                       | `{"status":"no_changes","dialect":"postgresql"}`                                        |
| `test ./test/database-migration.contract.test.ts`           | **74 pass · 4 skip · 0 fail · 869 expect()** (os 4 skips são os dois `.integration.js`) |
| `db:test` (equivalente do `make migration-test`, ver acima) | **114 pass · 0 fail · 1673 expect() · 8 arquivos · [26.19s]**                           |

`schema-snapshot.contract.ts` está dentro da terceira linha — conferido no entrypoint, não presumido.
O `no_changes` do `db:generate` apesar da ordem de statements escrita à mão tem explicação: o
drizzle-kit compara o schema TS contra o `snapshot.json`, nunca contra o texto do SQL.

### O que continua bloqueado, e por quem

Inalterado desde a T1.1: `_location_state_channel_check` **em `trip_stop_events`** segue fora, à
espera de alguém com acesso rodar em produção

```sql
select count(*) from trip_stop_events where latitude is not null and channel <> 'driver_app';
```

Staging deu zero (39 linhas, 37 com coordenada, 0 fora do `driver_app`). Produção foi recusada pelo
classificador, motivo `[Production Reads]`. **Nada das três tabelas desta task depende disso.**

### A pasta foi conferida contra `origin/staging`, e a ordem não importa aqui

`git ls-tree origin/staging apps/api-transportada/drizzle/` não tem `20261002033125` nem qualquer
pasta com o sufixo `_occurrence_location_stamp` — sem colisão de nome. Mas staging **já tem**
`20261002120000_trip_canhoto_read_job`, de outra sessão, com timestamp **posterior** ao meu: depois do
rebase a minha migration fica fora de ordem no meio da lista.

Isso seria defeito no migrador antigo, que comparava `folderMillis` contra o `created_at` da última
migration aplicada e **pularia em silêncio** a pasta com timestamp menor. Não é o caso aqui. No
`drizzle-orm@1.0.0-rc.4`, `getMigrationsToRun` (`migrator.utils.js:11-15`) filtra por **conjunto de
nomes**:

```js
const dbNamesSet = new Set(dbMigrations.map((m) => m.name).filter((n) => n !== null))
return localMigrations.filter((lm) => !lm.name || !dbNamesSet.has(lm.name))
```

Pasta cujo nome não está no journal roda, qualquer que seja o timestamp. E `assertMigrationsAreComplete`
(`migration-completeness.service.ts`) confere o mesmo conjunto depois do `migrate()`, então um pulo
reprovaria o pre-deploy em voz alta em vez de passar com o banco pela metade. **Nenhum rename é
necessário.**

### Adendo — o `make migration-test` prescrito rodou, com o Docker de volta

O daemon voltou com `open -a Docker` (10 s até responder, `28.5.1`), e aí o caminho do Makefile rodou
inteiro, sem substituição nenhuma:

```
make migration-test
 Container transportada-local-postgres-1  Healthy
 114 pass · 0 fail · 1673 expect() calls · 8 arquivos · [34.10s]
```

Mesmo número do cluster nativo, agora no Postgres do `compose.yaml`. A medição com cluster nativo
acima fica registrada como o que foi feito antes, não como equivalência que ninguém conferiu.

## T1.3 — a auditoria de leitura, antes de qualquer escrita de ponto

### A auditoria dos onze leitores: nenhum devolve a linha inteira

Os leitores que o `plan.md` § API — leitura manda conferir — `contractor-occurrence.query.ts`,
`trip-occurrence-feed.query.ts`, `drizzle-occurrence-case.repository.ts`,
`occurrence-case-marker.query.ts`, `drizzle-occurrence-statement.repository.ts`,
`drizzle-occurrence-settlement.repository.ts`, `drizzle-occurrence-settlement-charge.repository.ts`,
`drizzle-redelivery-proposal.repository.ts`, `drizzle-redelivery-application.repository.ts`,
`drizzle-office-occurrence-batch.repository.ts`, `drizzle-occurrence-attachment.repository.ts` e
`dispatch-readiness.query.ts` — foram varridos por `\.(select|selectDistinct)\(\)`: **nenhuma
ocorrência**. Todos projetam coluna a coluna, então nenhum passa a projetar nada nesta task.

Um spread de linha existe, e não está em nenhuma dessas respostas:
`trip-occurrence-feed.query.ts:589` faz `rows.map(({ nfeDocumentId, totalValue, tripDocumentId,
...row }) => ({ ...row, ... }))`. O feed é leitor permitido da 195 — e permitido **só para
`location_state`**. Enquanto a projeção dele não nomear coordenada, o spread não tem o que vazar; e
se alguém nomear, a lista por coluna reprova (provado por mutação abaixo).

### A lista é por coluna, não por arquivo

`src/trips/application/event-location-readers.constant.ts` declara
`EVENT_LOCATION_POSITION_COLUMNS`, `EVENT_LOCATION_TABLE_IDENTIFIERS`, `EVENT_LOCATION_READERS`
(caminho + colunas + motivo) e `EVENT_LOCATION_FORBIDDEN_RESPONSES`.

Escopo por coluna porque arquivo não é a unidade certa do problema: o feed da 195 **vê o estado e não
pode ver o ponto**, e uma lista por arquivo diria sim para os dois. A outra razão apareceu na
varredura: `capturedAt` entra sozinho em quatro leitores
(`drizzle-driver-field-report.repository.ts`, `drizzle-current-driver-trip.repository.ts`,
`drizzle-driver-score.repository.ts` e parte do comprovante) porque ali ele é **instante**, não
ponto — `coalesce(captured_at, recorded_at)` para ordenar e medir pontualidade. Lista por arquivo
obrigaria a liberar coordenada junto com tempo, ou a reprovar código que não lê coordenada nenhuma.

Os nove leitores permitidos hoje, e o que cada um pode ver:

| leitor                                      | colunas               | por quê                                       |
| ------------------------------------------- | --------------------- | --------------------------------------------- |
| `trip-timeline-stop.query.ts`               | as cinco              | ponto do evento na linha do tempo             |
| `trip-timeline-status.query.ts`             | as cinco              | idem (Fase 4)                                 |
| `trip-timeline-document.query.ts`           | as cinco              | idem (Fase 4)                                 |
| `delivery-proof-read.support.ts`            | as cinco              | comprovante: ponto do comprovante e da parada |
| `drizzle-delivery-proof.repository.ts`      | lat, long, capturedAt | distância entre os dois pontos                |
| `trip-occurrence-feed.query.ts`             | só `locationState`    | feed da 195 — estado, nunca ponto             |
| `drizzle-driver-field-report.repository.ts` | só `capturedAt`       | instante do relato                            |
| `drizzle-current-driver-trip.repository.ts` | só `capturedAt`       | instante da chegada                           |
| `drizzle-driver-score.repository.ts`        | só `capturedAt`       | instante para pontualidade                    |

A varredura é por **tabela qualificada** (`tripStopEvents.latitude`), e isso é decisão, não preguiça:
`latitude` solta aparece em 85 arquivos de `src/` — geocodificação, pedágio, endereço de cliente,
centroide de município, OSRM — nada disso é posição de evento. Recorte largo viraria ruído, e ruído
em contrato estático acaba desligado.

### Provado por mutação, cinco sondas

Verde de primeira não prova detector nenhum, então cada asserção levou uma sonda e foi vista
reprovar. Depois de cada uma, `git checkout` do arquivo:

| sonda                                                                                            | asserção que pegou                                             |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `tripStatusEvents.longitude` em `trip-valuation.query.ts` (fora da lista)                        | "nenhum arquivo fora da lista referencia coluna de posição"    |
| `tripStopOccurrences.latitude` em `trip-occurrence-feed.query.ts` (leitor de `locationState` só) | "leitor da lista só referencia as colunas que a lista lhe deu" |
| `tripStopOccurrences.latitude` em `contractor-occurrence.query.ts`                               | "nenhuma delas referencia coluna de posição"                   |
| `queryable.select()` em `occurrence-case-marker.query.ts`                                        | "nenhuma delas usa `select()` sem projeção"                    |
| `{ ...row, extra: 1 }` em `occurrence-case-marker.query.ts`                                      | "nenhuma delas espalha a linha do banco"                       |

As três primeiras rodaram juntas (**167 pass · 3 fail**), as duas últimas juntas (**168 pass ·
2 fail**), cada falha com a mensagem nomeando arquivo e coluna. Sem sonda: **170 pass · 0 fail**, oito
testes novos sobre os 162 da T1.2.

O contrato negativo prova por **estrutura**, não por palavra: projeção explícita + nenhum `select()`
cru + nenhum spread de linha, as três juntas, fazem a resposta não ter como carregar o ponto. Afirmar
só "o arquivo não contém a palavra latitude" seria contrato de parede.

### O `.env.test` não existia neste worktree, e a integração estava pulando

Este worktree foi criado pelo app do Claude, não por `make worktree` — e por isso **não tinha `.env`
nem `.env.test`**. A primeira execução de `bun --env-file=../../.env.test run test:integration`
devolveu **91 pass · 721 skip · 3 fail**, com `A PostgreSQL test URL is required`: o
`--env-file` apontava para arquivo inexistente, a URL vinha `undefined`, e 721 testes viraram
`test.skip` — exatamente o "pular não é passar" que o `CLAUDE.md` avisa, por um caminho que o aviso
não cobria (ele fala da flag ausente, não do arquivo ausente).

Corrigido como o `make worktree` faz: link simbólico de `.env` e `.env.test` para o checkout
principal. Os dois são `.gitignore` (`.env`, `.env.*`), então não entram em commit nenhum.

Isso também diz o que **não** vale deste worktree até aqui: toda execução de contrato segue válida
(não tocam banco), mas qualquer "integração verde" anterior a este ponto, nesta árvore, não exercitou
o banco.

### Portões da T1.3

| Portão                                     | Resultado                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `bun run typecheck` (api)                  | exit 0                                                                      |
| `bun run lint` (api)                       | exit 0                                                                      |
| `prettier --write` nos três arquivos       | aplicado, sem pendência                                                     |
| `test ./test/trip-schema.contract.test.ts` | **170 pass · 0 fail · 658 expect()** — +8 sobre os 162 da T1.2              |
| contrato inteiro da API (`bun test`)       | **8503 pass · 32 skip · 0 fail · 27423 expect() · 192 arquivos · [18.67s]** |
| integração da API (`run test:integration`) | **795 pass · 8 skip · 1 fail · 4913 expect() · 804 testes · [1154.37s]**    |

O 1 fail da integração **não é verde disfarçado, e não é da T1.3**:
`company-user-listing.integration.ts > publica a ficha de motorista e o veículo atribuído` estourou o
teto de 120 s (`this test timed out after 120000ms`), sem asserção nenhuma falhando. O mesmo arquivo,
sozinho, dá **10 pass · 0 fail · [16.95s]** — é a carga de 145 arquivos no mesmo Postgres, o padrão
que `integracao-local-nao-e-evidencia-sob-disputa` já registrou. Listagem de usuário e vínculo de
frota não encostam em nenhuma das cinco tabelas de evento nem na lista de leitores.

A T1.3 não altera caminho de execução nenhum: o `constant.ts` é importado só pelo contrato. A
integração entra aqui como prova de que nada regrediu, não como prova do que a task faz — essa é a
mutação.

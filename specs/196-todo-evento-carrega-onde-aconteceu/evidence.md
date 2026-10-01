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

| Arquivo | O quê |
|---|---|
| `trip.types.ts` | `TripTimelineLocation`, `TRIP_TIMELINE_LOCATION_STATES`, as duas chaves opcionais no item |
| `trip.constant.ts` | `TRIP_TIMELINE_LOCATION_KEYS`; `location`/`locationState` nas opcionais do item |
| `tripResponse.validation.ts` | `isTimelineLocation` + `isFiniteNumber` |
| `test/trip/timeline-location.contract.ts` | 10 casos, novo arquivo, já na lista explícita do `package.json` |

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

| Portão | Resultado |
|---|---|
| `bun run test` (painel) | 5927 pass · 1 fail |
| `bun run test:hooks` | 155 pass · 0 fail |
| `bun run typecheck` | `TC_EXIT=0` |
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

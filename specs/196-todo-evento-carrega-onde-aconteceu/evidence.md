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
`distanceMeters`. Expor o ponto desses dois não pede `join` novo nem migration.

**Executa-se agora:** T4.0, T4.1, T4.2 e a Fase 6, restritas a essas duas tabelas.
**Fica para depois:** Fases 1, 2, 3 e 5 — as colunas novas, o `location_state` em banco, o expurgo
das cinco tabelas e a app do motorista.

### A consequência que não se maquia

Sem a Fase 3, Despachar, Iniciar rota, conferir carga e as ocorrências **não têm ponto**. Eles
aparecem como `null` — "não se aplica" —, sem ícone e sem cor. **Não** entram em vermelho.

Vermelho é `unavailable`: o motorista tocou e a posição não veio. Pintar de vermelho um toque que
nunca foi construído para carimbar diria que o GPS falhou quando o que falta é a Fase 3 — e é
exatamente a confusão que o `location_state` da D2 existe para desfazer. A distinção se sustenta sem
a coluna porque, nas duas tabelas acima, ela é derivável da linha: `channel = 'driver_app'` com
`latitude` nula é `unavailable`; qualquer outro canal é `null`. É o mesmo valor que o `UPDATE` da
migration da D2 gravaria.

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

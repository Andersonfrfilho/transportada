# ADR-0081 — Todo toque do motorista carimba onde aconteceu

- **Status:** proposta (2026-09-25), revisada depois da crítica do mesmo dia. Passa a `aceita` na T0.1
  da spec 196, conferida contra o código.
- **Data:** 2026-09-25
- **Decisores:** usuário, em 2026-09-25: "cada evento deve pegar localização"; e, sobre quem vê: "só
  quem gere a frota — `fleet.read` e sem ser apenas `separator`"; e, no mesmo dia, a confirmação de
  que a permissão `trip.event-location` vale para `company-admin`, `operator`, `fiscal` e `viewer`, e
  que `finance` e `separator` recebem `location: null`. O desenho (onde guardar, estado,
  canais, prazo do toque direto, onde e como o escritório vê, ordem de publicação) é desta ADR.
- **Spec:** `specs/196-todo-evento-carrega-onde-aconteceu/`
- **Emenda:** ADR-0045 §3 — texto novo do item 2 abaixo. Os itens 1 (a recusa não bloqueia) e 3 (90
  dias, com expurgo implementado) não mudam.
- **Emenda:** spec 158, "Fora do escopo" ("Coordenadas do evento na tela") e CA8 (`latitude` e
  `longitude` fora da resposta) — a linha do tempo passa a devolver o ponto, dentro de duas chaves, só
  para quem tem a permissão.
- **Toca:** ADR-0077 §10 (spec 192) — ver §8.

## Contexto

Chegada, entrega, devolução e a foto do canhoto gravam onde aconteceram. Despachar, iniciar rota,
conferir carga e as duas ocorrências não. E ninguém no escritório vê ponto nenhum: a linha do tempo
tirou a coordenada da resposta, e nenhuma outra tela lê as colunas. O ponto é gravado, envelhece 90
dias e é apagado sem ter servido.

## Texto novo da ADR-0045 §3, item 2

> 2. **A coordenada é do toque, não da pessoa.** Ela mora presa ao evento que o motorista registrou —
>    `trip_stop_events`, `trip_status_events`, `trip_stop_occurrences`, `trip_document_occurrences` e
>    `trip_delivery_proofs` — e nunca numa tabela de posição do motorista. **Não existe "onde ele está
>    agora"** nem "por onde ele passou": só "onde estava quando tocou". O ponto é lido por viagem (linha
>    do tempo) ou por ocorrência (spec 195), nunca por motorista entre viagens. Essa ausência é a
>    decisão, não uma etapa futura.

## Finalidade, por toque

A LGPD pede finalidade (art. 6º, I). Cada ponto existe para uma pergunta só:

| Toque                      | Para que serve o ponto                                                   |
| -------------------------- | ------------------------------------------------------------------------ |
| Cheguei                    | provar a chegada à parada e medir o tempo de atendimento (specs 058/060) |
| Entreguei                  | separar "entreguei" de "entreguei **lá**" (ADR-0045 §3)                  |
| Devolvi / "Não entreguei"  | mostrar onde a devolução foi decidida — na porta do cliente ou fora dela |
| Foto/assinatura do canhoto | decidir a pontualidade da foto (ADR-0070)                                |
| Despachar                  | mostrar onde a carga foi liberada (o pátio ou fora dele)                 |
| Conferir carga             | marcar onde a viagem começou                                             |
| Iniciar rota (ADR-0088)    | base do tempo de trajeto **da parada**                                   |
| Ocorrência da parada       | mostrar onde o fato foi relatado; base da distância à parada (spec 195)  |
| Ocorrência da nota         | mostrar onde a recusa ou a avaria foi registrada                         |
| Salvar ordem (spec 192)    | mostrar de onde o motorista mudou a ordem                                |

Nenhum deles serve para reconstituir trajeto, calcular jornada ou avaliar o motorista pela posição.

## Decisão

### 1. Colunas no evento, nunca uma tabela de posição

As quatro colunas que `trip_stop_events` e `trip_delivery_proofs` já têm (`latitude`, `longitude`,
`accuracy_meters`, `captured_at`) entram em `trip_status_events`, `trip_stop_occurrences` e
`trip_document_occurrences`.

Uma tabela única `(event_type, event_id)` foi descartada. Ela seria consultável **por motorista, entre
viagens**, ordenada por hora — o trajeto da pessoa; as colunas no evento só são lidas por viagem ou por
ocorrência. Ela também não teria FK para o evento (ponto órfão na exclusão em cascata, isolamento por
disciplina em vez de constraint), e a linha do tempo, que já lê a linha do evento, pagaria um `join`
polimórfico por fonte.

### 2. O evento diz o estado do seu ponto

`location_state` (`VARCHAR(16)`, anulável, CHECK — nunca ENUM): `captured`, `unavailable`, `expired`.
`null` é **não se aplica**. Entra nas três tabelas acima e em `trip_stop_events`, cujas linhas com
coordenada passam a `captured` na migration. O banco garante
`(location_state = 'captured') = (latitude is not null)` sempre que o estado existe.

Sem o estado, "o GPS falhou", "o prazo apagou" e "não era toque do motorista" são o mesmo `null`, e a
tela teria de adivinhar pela idade e pelo tipo.

### 3. Só o motorista tem ponto; só o motorista tem estado

- App do motorista (`driver_app`): ponto, ou `unavailable`.
- WhatsApp do motorista (as três ações de `driverWhatsAppFlowActions`): `unavailable` — o comando não
  traz GPS.
- WhatsApp do operador, escritório em nome do motorista (ADR-0067), backoffice, despacho automático
  (ADR-0074) e troca de status derivada: não se aplica (`null`).
- CHECKs nas três tabelas novas: `latitude is null or channel = 'driver_app'` e
  `location_state is null or channel in ('driver_app', 'whatsapp')`.

### 4. Só o toque carimba

Levam ponto os eventos que **são** o toque. A troca de status que a entrega deriva não leva: o ponto
está na entrega. Toque repetido sem efeito (`changed: false`) não grava evento nem ponto.

### 5. Na fila, grava primeiro; direto, espera pouco

- Toque que entra na fila (chegada, entrega, devolução, as duas ocorrências — inclusive a ocorrência de
  nota que hoje é `POST` direto e passa a entrar na fila): o item nasce com `location: null` e a
  leitura completa pela chave (spec 189 T9.2 M1).
- Toque direto ("Despachar", "Iniciar rota"): uma leitura, com `enableHighAccuracy: false` e
  `maximumAge` de 5 min, numa corrida com um relógio **da app** de 3 s. O `timeout` da Geolocation API
  só conta depois da permissão, então não serve de teto. Esgotado o relógio, o `POST` sai com `null`.

### 6. Quem lê o ponto é uma lista fechada

A coordenada é para quem gere a frota. A autorização da API é por permissão, então a regra do usuário
("`fleet.read` e sem ser apenas `separator`") vira a permissão `trip.event-location`, dada a
`company-admin`, `operator`, `fiscal` e `viewer`. Quem tem `separator` e mais um desses papéis a recebe
pela união. `finance` e `separator` recebem `location: null` e o `locationState`. A lista de papéis é
decisão do usuário, confirmada em 2026-09-25.

Leitores permitidos, e o que cada um expõe:

- `GET /trips/:id/timeline`: `location` (com a permissão) e `locationState`;
- detalhe da sugestão de endereço da spec 195: o ponto do carimbo da ocorrência, com política própria;
- feed de ocorrências (spec 195): só o estado;
- distância da sugestão (spec 195): metros derivados no servidor, nunca a coordenada.

Portal do contratante, tratativa, demonstrativo, acerto, reentrega, WhatsApp e exportação não leem as
colunas. Um contrato mantém a lista.

Na linha do tempo, o painel mostra a precisão, a hora da leitura e "Ver no mapa", que expande no
próprio item o pino do evento e o da parada.

### 7. O prazo é um só

O job `trip.location.purge` varre uma lista de cinco tabelas, com teto de lotes por tabela, zera as
quatro colunas e marca `expired`. Um contrato reprova tabela com `latitude` no schema da API que não
esteja na lista nem nas exclusões com motivo (endereço e cadastro — `trip_stops`,
`geocoded_address_corrections` e afins — e o rastro ao vivo, que tem prazo próprio). Outro contrato
reprova rota `POST` nova de `/me/trips/current/**` que não aceite `location` nem esteja na lista de
exceções.

### 8. A reordenação da spec 192

A reordenação do motorista é toque e entra nesta regra: `trip_stop_order_events` ganha as colunas e o
estado, e a tabela entra na lista do expurgo. O que a ADR-0077 §10 decidiu continua valendo para a
coordenada da **sugestão** — entrada do solver, apagada quando ele termina, fora do evento. São dois
dados diferentes.

### 9. Ordem de publicação

A app nova contra a API antiga perde evento: o schema `.strict()` responde `400` ao `location`, e a fila
descarta item recusado. Publica-se em três etapas: o painel tolerante às chaves novas; banco, worker e
API, com uma sonda que prova que `location` passa do parse; e só então a app e a tela. A API não é
revertida com a app nova no ar.

## Consequências

- O escritório responde "entregou **lá**?" sem pedir foto nem ligar para o motorista.
- Toda tabela de evento nova do motorista custa cinco colunas, os CHECKs de canal, um índice parcial e
  um redator no worker — e os contratos do §7 cobram os dois últimos.
- O toque direto grava `unavailable` mais vezes do que o da fila. A medição de uma semana, com
  critério escrito na spec, decide se o relógio sobe.
- Uma permissão nova no catálogo (`trip.event-location`), com os contratos de papel atualizados.
- A ocorrência de nota que era `POST` direto passa a funcionar sem rede, como efeito colateral de
  entrar na fila.

## Alternativas descartadas

- **Tabela única de carimbo:** §1.
- **Esperar os 8 s no toque direto:** atrasa o botão mais usado no pátio, onde o sinal é pior.
- **Confiar no `timeout` da Geolocation API:** não conta durante o pedido de permissão.
- **Pôr "Despachar" e "Iniciar rota" na fila:** resolveria o pátio sem rede, mas mexe nos portões de
  estado e no snapshot que abre as ações de campo. Decisão à parte.
- **Coordenada para quem já lê a linha do tempo (inclusive `finance`):** o usuário restringiu a quem
  gere a frota.
- **Recorte por papel, e não por permissão:** a autorização da API não conhece papel na rota; uma
  combinação de permissões existentes (`fleet.read` sem `trip.manage`) erraria a membership com dois
  papéis.
- **Mostrar o ponto numa tela nova de mapa da viagem:** a linha do tempo já é onde o operador
  reconstitui o que houve.

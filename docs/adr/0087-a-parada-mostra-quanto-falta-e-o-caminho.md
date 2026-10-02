# ADR-0087 — A parada mostra quanto falta e o caminho

- **Status:** proposta (2026-09-25), revisão 2 depois da crítica. Passa a `aceita` na T0.2 da spec 207.
- **Data:** 2026-09-25
- **Decisores:**
  - o **usuário**, em 2026-09-25, pediu três coisas:
    - tempo de chegada e distância;
    - prévia do caminho até a parada;
    - agendamento do cliente, com alerta de horário;
  - o **orquestrador**, na crítica, decidiu duas coisas:
    - a 192 é dona da escrita e da trava das pernas;
    - a 206 é dona de "a caminho";
  - o **desenho** é desta ADR.
- **Spec:** `specs/207-a-parada-mostra-quanto-falta-e-o-caminho/`
- **Emenda:**
  - **ADR-0045 §3.** Ganha o item: "a leitura de posição **só no aparelho**, sem envio e sem gravação,
    para mostrar distância, não é coleta pelo controlador". Ela exige a permissão do navegador já
    concedida e um gesto para pedir, e não usa o consentimento.
  - **ADR-0050 §5.** O consentimento contínuo continua sendo o que libera **enviar** a posição. Quando
    ele está ativo, o último ponto do `watchPosition` também alimenta a tela, por um canal local que
    não passa pelo envio.
- **Estende:**
  - **ADR-0083 §1.** O `route` continua sem traçado e sem pernas. As pernas saem **dentro da
    parada**, e o ponto do barracão não sai (§6).
  - **Spec 082 D2.** Continua valendo: sem dado, nada.
- **Aplica sem revisar:** ADR-0044 §2/§6, ADR-0075 §4/§5, ADR-0081, ADR-0084 §4, spec 060 D3.
- **Depende de:**
  - spec 199;
  - spec 192 (trava, CAS e `kept_previous`);
  - spec 206 (`en_route_since`, `enRouteTappedAt`, `resolveEnRouteStopId`);
  - P0 do ETA multi-veículo, só para o alerta usar `estimated_arrival_at`.

## Contexto

O cartão da parada mostra três coisas:

- uma distância em linha reta, lida uma vez e sem rótulo;
- a hora marcada, que vira "—" sem confirmação;
- o "Navegar".

A API já tem quatro dados que não chegam ao motorista:

- o ETA do escritório;
- as pernas de estrada, que ficam no jsonb, sem dizer de que parada cada perna parte;
- a exigência de agendamento do cliente;
- a divergência do agendamento.

## Decisão

### 1. Cada número na tela diz de onde veio

| Na tela                         | Fonte                               | Onde se calcula |
| ------------------------------- | ----------------------------------- | --------------- |
| "chega ~14:35 (em 25 min)"      | âncora + duração da perna congelada | no aparelho     |
| "no plano: 14:20"               | `estimated_arrival_at`              | no servidor     |
| "3,2 km em linha reta"          | haversine da posição local          | no aparelho     |
| "trecho de 8,4 km pela estrada" | distância da perna congelada        | no congelamento |

### 2. O servidor não recalcula a chegada pela posição atual

Recalcular custaria um `/route` a cada 30 s por motorista e levaria a posição ao servidor sem toque,
contra a ADR-0081 e a 0084 §4. Também trocaria a finalidade do rastro do contratante e deixaria o
motorista sem resposta quando estiver sem rede.

### 3. A perna tem origem gravada, e a escrita é da 192

- O congelamento grava duas chaves no jsonb:
  - `planned_route.tracedStopIds`: a ordem das paradas no traçado;
  - `planned_route.legPointStarts`: onde cada perna começa em `points`.
- Os limites saem de `legs[].annotation.nodes`, que o gateway já pede. A simplificação é **por
  perna**, com os mesmos 5 m. Não há casamento por proximidade.
- `assignLegsToStops` (pura) dá, por parada: `fromStopId` (parada ou `'depot'`), distância e duração.
- A escrita em `trip_stops.distance_from_previous_*`/`duration_from_previous_*` acontece **sempre**
  dentro de `lockTripForStopOrder`: `trip_stops FOR UPDATE ORDER BY id` → `trips FOR NO KEY UPDATE`.
  Vale o CAS por `stop_order_version` da 192.
- Se a 207 chegar antes da 192, ela cria a trava no molde da 192, e a 192 herda.
- **Nada é zerado.** Com o OSRM fora vale o `kept_previous` da 192. A leitura só usa uma perna cuja
  parada esteja em `tracedStopIds`.

### 4. A perna só vale se partir de onde o motorista partiu

A perna vale quando `fromStopId` é a última parada concluída, ou `'depot'` quando nenhuma foi
concluída. A regra cobre quatro casos sem tratamento especial:

- `kept_previous`;
- despacho forçado que apaga parada;
- parada geocodificada depois do congelamento;
- motorista fora de ordem.

O servidor manda a perna de toda parada pendente com origem. O `path` vai nas duas primeiras
pendentes e na que tem `en_route_since`. A app decide qual mostrar pela regra da 206, que enxerga a
fila.

### 5. A âncora usa só o relógio do aparelho

Os degraus, em ordem:

1. `enRouteTappedAt` (206), ou o `depart` na fila e não `rejected`.
2. `captured_at` do último desfecho da parada de origem, ou o item na fila.
3. `captured_at` do "Iniciar rota" da viagem, depois da 196.

Regras:

- **Nunca `recorded_at` nem `en_route_since`**, que são hora do servidor. A ADR-0083 §3 recusa
  misturar os dois relógios.
- **Limite declarado:** um toque feito em outro aparelho traz o desvio de relógio daquele aparelho. O
  cabeçalho `Date` não corrige isso, porque mede o aparelho atual, e não o que tocou.

### 6. O mapa é o trecho em SVG, sem o ponto do barracão

O desenho usa o `path` projetado no aparelho, com a saída, o pino, o ponto do motorista e o "Navegar".
Na perna de saída, `path` começa no segundo vértice.

| Opção                         | Por que não agora                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| (a) Imagem gerada no servidor | Não há renderizador; seria um serviço novo, e o ponto do motorista teria de subir                                          |
| (b) MapLibre sob demanda      | ~800 KB mais tiles no 3G, nada sem rede; emenda a ADR-0075 §4/§5 e o `dist.contract`; `map-tiles` público na `connect-src` |
| (d) Só o "Navegar"            | Já existe, e não é prévia                                                                                                  |

**Reabre (b)** se o usuário pedir ruas no preview. A spec própria:

- emenda a ADR-0075, com um chunk sob demanda fora do precache;
- troca o `dist.contract` para "proibido no precache";
- mantém este desenho para quando não há rede.

### 7. A posição fica no aparelho

- A app lê a posição só com `permissions.query` em `granted`. O pedido de permissão só parte de um
  gesto: "Mostrar distância", ou um toque que já lê posição.
- A leitura é `enableHighAccuracy: false` com `timeout` de 8 s, a cada 60 s, só com a tela visível e
  com uma parada a caminho.
- Com o compartilhamento ativo, a app reusa o ponto dele por `onLocalPosition`.
- A tela diz "a distância usa sua posição só no aparelho".
- **Proibido** usar esse ponto como carimbo de toque.
- Três contratos vigiam isso: o de import, o de `onLocalPosition` e o do filtro de rede no smoke.

### 8. Agendamento: um selo, uma regra

- **"Com agendamento · hora · protocolo":** o agendamento está confirmado e não diverge.
- **"Cliente exige agendamento — ainda sem horário confirmado":** o cliente exige, e o agendamento
  está ausente, `pending`, `requested`, `refused` ou divergente. Vai em âmbar.
- **"Sem agendamento":** o cliente não exige e não há confirmação.

O selo substitui a linha "Hora marcada". A exigência vem por `leftJoin` a `delivery_clients` no
`listDocuments`, pela regra da trava do despacho, sem consulta nova.

### 9. O alerta tem três estados, e sem risco não há selo

- **Limite:** a hora marcada confirmada. Sem ela, o fim da janela. Sem nenhum dos dois, não há alerta.
- **Estimativa vencida** (`estimate < now`) conta como "sem estimativa".

| Estado  | Regra                                                     | Sinal                                    |
| ------- | --------------------------------------------------------- | ---------------------------------------- |
| `past`  | `now > deadline`, sem chegada                             | `alert`, fundo vermelho, texto `#10222c` |
| `late`  | estimativa efetiva > `deadline`                           | `alert`, vermelho                        |
| `tight` | folga < 30 min; sem estimativa, `deadline − now` < 30 min | `clock`, âmbar `#f2c14e`                 |
| —       | sem risco                                                 | nenhum selo                              |

- **A margem** é de 30 min, fixa. A regra `max(30, 25%)` foi recusada, porque só a parada a caminho
  tem duração restante. A margem por empresa fica para depois.
- **A estimativa das outras paradas** (`estimated_arrival_at`) só entra depois do P0 do ETA
  multi-veículo. Até lá, aparece só como "no plano".
- **A faixa** vale para a parada a caminho e a seguinte na sequência atual, e mostra o pior estado. É
  um `role="status"` estável, com um `<button>` dentro.
- **Limite conhecido:** chegar cedo demais não gera alerta.
- **Tema:** há só o escuro.

## Alternativas consideradas

- **Recalcular pela posição no servidor.** Rejeitada (§2).
- **Casar parada e vértice por proximidade, até 60 m.** Rejeitada. O OSRM já dá o limite exato por
  `annotation.nodes`, e a heurística erra em rota que passa duas vezes pelo mesmo ponto.
- **Zerar as pernas com rota nula.** Rejeitada. Contradiz o `kept_previous` da 192, e a leitura já
  decide pela origem gravada.
- **Uma função própria, na API ou na app, para escolher a parada a caminho.** Rejeitada. A API não enxerga a fila offline, e "a caminho" é da 206.
- **Âncora por `en_route_since` ou `recorded_at`.** Rejeitada: são hora do servidor (§5).
- **Selo verde "no horário".** Rejeitado. Seria mais um selo em todo cartão, e o pedido é o alerta.
- **Mandar o traçado inteiro no snapshot.** Rejeitada: até ~30 KB a cada 30 s no 3G.
- **Web Push agora.** Adiado. A app não tem push (a 147 está sem tasks feitas), e o aviso com a app
  fechada exige estimativa no servidor. O caminho é a 147 mais uma spec própria, a partir de
  `estimated_arrival_at` e da hora marcada.

## Consequências

- O motorista vê, sem rede, quando chega, a distância pela estrada e em linha reta, o trecho, o
  agendamento e o risco de horário.
- O jsonb da rota ganha `tracedStopIds` e `legPointStarts`, e o painel passa a receber o traçado
  simplificado por perna, com a mesma tolerância.
- Rotas antigas não mostram perna até recongelar.
- A posição do motorista não sai do aparelho por causa desta ADR.
- O design system da app ganha `--color-caution`.

## Seguimentos

- **206:** `enRouteTappedAt`, `resolveEnRouteStopId`, `findCurrentStop` (T1.3b, T2.2b).
- **P0 do ETA multi-veículo:** liga `estimated_arrival_at` ao alerta (T2.8).
- **196:** degrau 3 da âncora.
- **Q1:** ruas no desenho → spec própria (§6).
- **147 e spec própria:** aviso com a app fechada.
- **Margem por empresa:** spec própria, se pedida.

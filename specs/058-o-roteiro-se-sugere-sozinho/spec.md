# 058 — o roteiro se sugere sozinho

> **Depende da 056** (paradas). Otimiza a ordem de uma coisa que precisa existir antes.

## Problema e resultado

Depois da 056, alguém arrasta as paradas na tela. Essa pessoa é boa nisso — conhece a cidade, sabe
que o centro trava às 16h — e é exatamente por isso que ela é o gargalo: só ela sabe, leva quarenta
minutos por dia, e o resultado piora quando ela falta.

O resultado desta feature é o botão **sugerir roteiro**: o sistema propõe quais notas vão em quais
veículos e em que ordem parar, o conferente olha, ajusta o que quiser e aceita — e o que ele aceitou
vira o roteiro da 056, seguindo dali para separação, carregamento e saída como qualquer outro.

## O problema real, com o nome que ele tem

Isto não é "ordenar uma lista". É um **CVRPTW** — roteamento de veículos com capacidade e janela de
tempo, com depósito de partida e de chegada. É NP-difícil, e é o mesmo problema que Circuit,
Routific e Onfleet resolvem. A pilha que todos usam tem três camadas, e a terceira só é tão boa
quanto a segunda:

| Camada               | O que faz                              | Onde está hoje |
| -------------------- | -------------------------------------- | -------------- |
| 1. Geocodificação    | endereço → coordenada                  | **não existe** |
| 2. Matriz de estrada | coordenada × coordenada → km e minutos | **não existe** |
| 3. Metaheurística    | ordena e distribui                     | **não existe** |

A tentação é pular a 1 e a 2 e fazer haversine. Não funciona, e falha de um jeito específico: um rio
sem ponte, uma ferrovia, uma avenida de mão única fazem dois pontos a 800m em linha reta virarem
6km de rota. O genético, confiando na reta, monta uma sequência que o motorista desfaz na primeira
esquina — e depois de desfazer duas vezes ele para de olhar a sugestão. Um roteirizador em que o
motorista não confia não é meio produto; é zero.

## Decisões

### D1 — A matriz é de estrada, e vem de OSRM hospedado por nós

**OSRM** (`osrm-backend`) sobre o extract OSM do Brasil, num container do `compose.yaml` e num
serviço do Railway. O endpoint `/table` devolve a matriz completa de N×N em milissegundos para o N
que interessa (dezenas a centenas de paradas).

Contra Google Distance Matrix / Mapbox Matrix: elas são melhores em tráfego em tempo real e são
pagas **por elemento**. O genético avalia milhares de sequências por sugestão, e cada avaliação lê a
matriz centenas de vezes — com API paga, ou se paga uma fortuna, ou se cacheia tanto que se perde a
vantagem do tempo real. Com a matriz local, avaliar é acesso a array e o genético pode ser tão
guloso quanto quiser. É o mesmo motivo pelo qual as empresas de roteirização hospedam a própria
malha.

O adaptador é uma **porta** (`RoutingMatrixPort`), com o OSRM como um adaptador. Trocar por Google
depois, quando tráfego em tempo real virar requisito, é escrever outro adaptador — não reescrever a
otimização.

### D2 — A geocodificação acontece uma vez por endereço, e é permanente

Nasce `geocoded_addresses`: chave de endereço normalizada (a mesma da 056 D3) → lat/lng,
`external_place_id`, `source`, `precision` (`rooftop` | `street` | `postal_code` | `city`),
`geocoded_at`. Endereço já visto nunca
é geocodificado de novo — a mesma loja recebe cem vezes por ano.

Fontes, em cascata, da melhor para a pior:

1. Correção manual feita por um humano (D4) — sempre vence.
2. Geocodificador de logradouro+número.
3. Centroide do CEP.
4. Centroide do município (`city_code`, que já está em `nfe_addresses`).

**A precisão viaja junto e é visível.** Uma parada no centroide de município não é uma parada — é um
palpite de 8km, e o conferente tem de ver isso na tela antes de aceitar o roteiro, não descobrir
pelo motorista. Parada com precisão `city` **não entra na otimização automática**: ela vai para o
fim da lista, marcada, esperando decisão humana.

**O cache tem duas camadas, e a de baixo é a que importa.** Em cima, cache quente em memória/Redis
com TTL, que atende a rajada de uma sugestão sem tocar o banco. Embaixo, `geocoded_addresses` no
Postgres, **permanente e autoritativo** — é ele que garante que perder o Redis não custa uma segunda
rodada de geocodificação paga, e é ele que sobrevive ao redeploy. A camada quente pode ser
descartada a qualquer momento sem consequência; essa é a definição de estar certa.

Quando a tabela crescer, ela não vira problema de espaço — uma linha de endereço é dezenas de bytes,
e um milhão delas cabe na memória de qualquer instância. O que ela vira é ativo: a base de endereços
geocodificados da operação é a coisa mais cara de reconstruir nesta feature.

**O geocodificador é o Google Geocoding API**, e a escolha é técnica: é o único com número de porta
confiável em cidade do interior, ele resolve endereço mal formatado (que é o que chega no XML), e
devolve `location_type` — `ROOFTOP` | `RANGE_INTERPOLATED` | `GEOMETRIC_CENTER` | `APPROXIMATE` —
que mapeia quase um-para-um na cascata de precisão acima. Um provedor que não distingue telhado de
centroide obriga a inferir precisão, e precisão inferida é precisão errada.

### D2b — A exceção de licença do Google, declarada

**Os Termos do Google Maps Platform não permitem o armazenamento permanente que a D2 descreve.**
Lat/lng da Geocoding API pode ser cacheada por até 30 dias corridos; o armazenamento indefinido é
permitido apenas para suportar funcionalidade direta ao usuário final da aplicação que originou a
requisição, e **não** quando o cache substitui uma nova chamada — que é exatamente o nosso uso.
Apenas o `place_id` é armazenável indefinidamente.

**A decisão do produto é armazenar permanentemente mesmo assim**, e ela está registrada aqui para
que a próxima pessoa saiba que foi escolha consciente, não descuido. O risco real não é multa: é
suspensão de chave por padrão de uso atípico (base grande com volume mensal pequeno é identificável)
ou achado em due diligence — e o modo de falha é o roteirizador parar num dia de operação.

Três mitigações, e nenhuma custa quase nada:

1. **`place_id` é guardado junto com a coordenada.** Ele é armazenável indefinidamente sem exceção
   nenhuma, e é a saída barata: se um dia for preciso ficar dentro dos termos, re-resolver a partir
   do `place_id` é mais barato e mais preciso que re-geocodificar o endereço cru. Guardar essa
   coluna hoje custa nada; não guardar custa a base inteira depois.
2. **`GeocodingPort` com adaptador**, como o `RoutingMatrixPort` da D1. Trocar de provedor é escrever
   um adaptador, e a cascata de precisão já é o vocabulário comum entre eles.
3. **Volume observável.** Endereços novos por mês e total em base vão para métrica, para a conversa
   sobre custo (e sobre risco) acontecer com número.

A alternativa avaliada e recusada foi Mapbox Permanent Geocoding (US$ 5/mil, licenciado para
armazenamento indefinido, ~US$ 43 contra ~US$ 325 no primeiro ano da base estimada). Foi recusada
por cobertura: o Mapbox cai fora do eixo Rio–São Paulo, e a operação entrega onde o cliente está.

### D3 — O genético é o solver, e ele tem de saber quando não é o melhor

O algoritmo genético foi pedido, e é uma escolha legítima: lida bem com múltiplos veículos e
restrições heterogêneas, e é fácil de estender com uma restrição nova sem reescrever nada.

Desenho:

- **Cromossomo**: permutação de paradas com separadores de veículo.
- **Fitness**: minimiza custo total, e **custo é dinheiro, não quilômetro** — o sistema já sabe
  `other_costs_per_kilometer`, consumo médio (inclusive dois tanques, spec 051) e preço de
  combustível por empresa. Roteirizar por km em frota mista otimiza a coisa errada: o caminhão que
  bebe o dobro deve andar menos.
- **Penalidades** (não restrições rígidas, para não matar a população): estouro de peso, violação de
  janela de atendimento, e — quando ligada (D6b) — excesso de jornada.
- **Operadores**: seleção por torneio, crossover de ordem (OX), mutação por troca e por `2-opt`
  local, elitismo.
- **Parada**: teto de tempo (orçamento em segundos, não gerações) **ou** N gerações sem melhora.

E a honestidade que a maioria das implementações pula: **um GA puro é pior que `2-opt` + `or-opt`
numa parada só**, e é pior que OR-Tools em quase tudo. Então duas travas:

1. Todo indivíduo passa por busca local (`2-opt`) antes de entrar na população — é um GA híbrido
   (memético), e é essa hibridização que faz a diferença entre um resultado publicável e um brinquedo.
2. **Baseline obrigatório na suíte**: o resultado do GA é comparado com o vizinho-mais-próximo +
   `2-opt`. Se o GA perder, o teste falha. Sem esse teste ninguém descobre que a sugestão piorou —
   ela continua parecendo uma sugestão.

### D4 — A sugestão é uma proposta, e ela nunca escreve sozinha

`route_suggestions` guarda a proposta com o custo estimado e as premissas. O conferente vê lado a
lado com o roteiro atual (se houver), ajusta arrastando, e **aceita** — e só o aceite escreve em
`trip_stops`, pela mesma rota `PATCH /trips/:id/stops/order` da 056. Rejeição também é gravada.

Duas razões. A primeira é confiança: a pessoa que conhece a cidade precisa ter a última palavra, ou
não adota. A segunda é medição: com aceites e rejeições registrados, dá para responder "a sugestão
está boa?" com número em vez de opinião — e é assim que se afina o fitness.

Corrigir a coordenada de um endereço é parte do mesmo fluxo: arrastar o pino grava em
`geocoded_addresses` com fonte manual, e conserta aquele endereço **para sempre**, para todas as
viagens futuras. É o trabalho que o produto pede ao humano em troca de não pedir de novo.

### D5 — A capacidade é peso, e volume não finge existir

A restrição de carga é **massa**, e só. `fleet_vehicles` tem capacidade em kg e em m³, mas a cubagem
quase nunca vem preenchida no XML da NF-e — `nfe_volumes` traz peso bruto e líquido com
confiabilidade, e m³ quase nunca. Um solver que respeita um limite de volume calculado sobre dado
ausente produz um número que parece uma restrição e não é uma; a rota "cabe" na tela e não cabe no
caminhão.

Então: peso é restrição de verdade, com penalidade no fitness. Volume **não entra no modelo** — nem
como restrição frouxa, nem como aviso. Quando existir cadastro de cubagem por produto, ele volta
como uma penalidade a mais, e o solver puro (RF-10) aceita isso sem reescrita.

Nota que chega sem peso informado entra com o peso médio da empresa e **vem marcada na sugestão** —
o conferente precisa saber que aquela linha é estimativa antes de aceitar o roteiro.

### D6 — O tempo de parada começa como palpite e vira medição

Tempo de serviço por parada é o parâmetro que mais estraga o ETA, e ninguém acerta o valor inicial.
Então ele tem duas vidas:

1. **No começo**, um valor padrão por empresa, configurável, aplicado a toda parada.
2. **Depois**, o valor medido: a 057 grava `arrived_at` e `completed_at` de cada parada real, e o
   sistema passa a usar a mediana observada — por cliente quando houver amostra suficiente, por
   empresa quando não houver.

A janela é de **3 meses**. Mais que isso é memória de uma operação que já mudou.

**Mediana, não média**, e mínimo de amostras declarado antes de substituir o padrão. Uma parada em
que o motorista almoçou é um outlier que a média engole e a mediana ignora; e aprender com três
entregas é aprender ruído. O valor em uso e sua origem (`default` ou `measured`, com o tamanho da
amostra) aparecem na sugestão — um ETA que ninguém sabe de onde veio é um ETA em que ninguém confia.

E a medição não serve só ao solver: ela responde **como aquele cliente se compara**. O painel dele
(060) mostra o tempo mediano ao lado da média geral da operação, se está acima ou abaixo, e a
contagem de ocorrências e problemas no mesmo período — que é o que transforma "esse cliente é
difícil" em número, e é o que sustenta a conversa de renegociar a tabela.

A mesma medição alimenta o tempo de deslocamento: se o trecho A→B leva sistematicamente 40% mais que
a matriz do OSRM diz, isso é trânsito real da cidade, e vira fator de correção por faixa de horário.
Isto é **P3**, e só faz sentido depois de meses de dado — mas o modelo de eventos da 057 já nasce
gravando o que ele precisa, e isso é o que o torna possível sem migration futura.

### D6b — A jornada é restrição, e ela é opcional por empresa

A Lei do Motorista (11.910/2009) limita direção diária, exige pausa a cada 4 horas e intervalo entre
jornadas. Rota que estoura isso não é uma rota otimizada; é uma rota que a operação não pode cumprir
legalmente.

Mas **o modelo de transporte não é o mesmo para todo mundo** — distribuição urbana com retorno ao
barracão no mesmo turno não se parece com viagem interestadual, e uma restrição rígida no lugar
errado só empobrece a solução sem proteger ninguém.

Então a jornada é **configuração da empresa, desligada por padrão**: limite de direção diária, pausa
obrigatória e sua frequência, e jornada máxima total, cada um configurável ou nulo. Nulo significa
"não é restrição aqui". Ligada, entra como penalidade no fitness (não como corte rígido, pela mesma
razão das demais — matar indivíduos inviáveis empobrece a população) e a violação residual aparece
**explícita** na sugestão, nunca escondida.

O que não é opcional é a honestidade do número: com a jornada ligada, o painel mostra horas de
direção e de jornada estimadas por veículo, e destaca quem passa do limite. Uma sugestão que estoura
jornada e não diz é pior que nenhuma sugestão, porque alguém a aceita.

### D6c — O mapa tem rua, e a rua é nossa

O painel de sugestão usa **mapa de rua de verdade com o percurso traçado**, não a malha de municípios
em SVG da spec 047. O motivo é confiabilidade da conferência: numa entrega dentro de uma cidade só, a
malha do IBGE é um polígono e a rota vira rabisco dentro dele — não há como bater o olho e ver que a
sugestão está certa, que é a única razão de o painel existir (D4).

Isso **não reabre** a decisão da 047, porque a razão dela era não mandar dado nosso para terceiro, e
essa razão continua valendo. A saída é **PMTiles**: um único arquivo estático gerado offline do mesmo
extract OSM que alimenta o OSRM, guardado no bucket privado que já existe
(`@adatechnology/object-storage-provider`), e lido pelo MapLibre GL por HTTP Range direto do nosso
domínio.

O que isso compra:

- **Nenhuma requisição a domínio externo.** O CSP não precisa liberar host de tile, e a coordenada da
  parada não viaja na URL de um terceiro. Endereço de cliente é dado pessoal (`security.md` §1), e
  uma URL de tile é um log de servidor alheio.
- **Nenhum serviço novo rodando.** Um tile server clássico (PostGIS + renderizador + cache) é infra
  de verdade, com import, storage e invalidação. PMTiles é um arquivo.
- **Mesma cadeia de build do OSRM.** O extract é o mesmo; muda o passo de geração.

O custo honesto: o Brasil inteiro em zoom alto é da ordem de dezenas de GB. Gera-se **só a área de
operação** — a região metropolitana atendida sai em centenas de MB — e regenera-se quando a operação
expandir. É um script e um runbook, não um serviço.

Se o arquivo não estiver disponível, o painel cai para a lista ordenada sem mapa e diz isso. O mapa
confere a sugestão; ele não é a sugestão.

### D7 — Otimizar é trabalho de worker, sempre

Um GA sobre 200 paradas roda por segundos ou dezenas de segundos. Dentro do `Bun.serve` isso bloqueia
o event loop e derruba o resto da API (`api.md`). Então: `POST /trips/:id/route-suggestions` cria a
sugestão em `queued`, publica em `route-optimization.v1` no RabbitMQ, e a resposta é `202`. O
worker resolve e escreve; a tela acompanha por poll.

A trilha de outbox, retry, `*_processed_messages` e dead-letter é a mesma que CT-e e MDF-e já usam.
Nada de padrão novo.

### D8 — O depósito tem começo e fim, e eles podem ser diferentes

Como no Circuit: toda otimização parte de um ponto e termina em outro. Origem padrão é o endereço da
empresa (ou da filial, quando ela existir — a 054 está reservada). O fim é configurável: volta ao
depósito (padrão), termina na última parada, ou termina num endereço declarado — o motorista que
mora do outro lado da cidade e fecha o dia perto de casa é um caso real, e ignorá-lo produz um
roteiro que ele reordena todo dia.

## Histórias priorizadas

**P1 — sugerir a ordem de uma viagem**
_Dado_ uma viagem `draft` com 12 paradas geocodificadas,
_quando_ o conferente pede sugestão,
_então_ em até 30 segundos recebe uma ordem proposta com distância, tempo e custo estimados, e ao
aceitar a viagem vai para `route_planned` (056).

**P1 — a precisão aparece antes de doer**
_Dado_ uma viagem em que 2 das 12 paradas só têm centroide de município,
_quando_ a sugestão volta,
_então_ as duas vêm destacadas, fora da ordem otimizada, com o pedido de corrigir o pino — e o botão
de aceitar avisa que elas ficam no fim.

**P2 — distribuir notas entre veículos**
_Dado_ um pool de 60 notas não vinculadas e 3 veículos disponíveis,
_quando_ o conferente pede sugestão de carga,
_então_ recebe 3 viagens propostas, cada uma dentro do peso e do volume do seu veículo, e aceita uma,
duas ou as três independentemente.

**P2 — o custo é da frota real**
_Dado_ dois veículos com consumo diferente,
_quando_ a sugestão é gerada,
_então_ a distribuição reflete o custo por km de cada um — o mais caro anda menos —, e a tela mostra
a conta.

**P2 — corrigir o pino conserta o futuro**
_Dado_ um endereço com coordenada errada,
_quando_ o conferente arrasta o pino,
_então_ toda viagem futura para aquele endereço usa a coordenada corrigida.

**P3 — a sugestão respeita a janela de entrega**
_Dado_ uma parada que só recebe das 8h às 11h,
_quando_ a sugestão é gerada,
_então_ ela é sequenciada dentro da janela, ou a violação é mostrada explicitamente.

**P3 — medir se a sugestão presta**
Painel com taxa de aceite, quanto o humano mexeu depois de aceitar, e economia estimada
acumulada.

## Requisitos funcionais

1. Nasce `geocoded_addresses` (D2), com `external_place_id` (D2b.1), e o `GeocodingPort` com
   adaptador Google.
2. Nasce o `RoutingMatrixPort` com adaptador OSRM; OSRM no `compose.yaml` e no deploy.
3. `trip_stops` ganha `latitude`, `longitude`, `geocoding_precision`, `estimated_arrival_at`,
   `distance_from_previous_meters`, `duration_from_previous_seconds`.
4. Nasce `route_suggestions` (+ `route_suggestion_stops`) com `status`
   (`queued|running|ready|accepted|rejected|failed`), premissas, custo e métricas.
5. Rotas sob `trip.manage`:
   - `POST /trips/:id/route-suggestions` → `202`
   - `GET /trips/:id/route-suggestions/:suggestionId`
   - `POST /trips/:id/route-suggestions/:suggestionId/accept`
   - `POST /trips/:id/route-suggestions/:suggestionId/reject`
   - `POST /route-suggestions/multi-vehicle` (P2 — pool de notas + veículos, ainda sem viagem)
   - `PATCH /geocoded-addresses/:key` (correção manual do pino)
6. Consumer `route-optimization` no worker, com a trilha padrão de retry/outbox/dead-letter.
7. Configuração de otimização por empresa: origem, política de fim, orçamento de tempo do solver,
   velocidade média de fallback, tempo de serviço padrão por parada, peso médio de fallback, e o
   bloco de jornada da D6b (todos os limites anuláveis, desligados por padrão).
8. Janela de atendimento e taxa de entrega por parada vêm do cadastro de cliente da **spec 060**,
   resolvido pelo CNPJ/CPF do destinatário. Sem cadastro, a parada não tem janela e a taxa é zero —
   a ausência é o caso normal, não erro.
9. Tempo de serviço medido (D6): mediana por cliente sobre os eventos de parada da 057, **janela
   móvel de 3 meses**, com mínimo de amostras configurável (padrão 5 — abaixo disso a mediana é
   ruído, e o número é ajustável sem migration). Junto sai a comparação com a média da operação e a
   contagem de ocorrências do período.
10. O solver é uma **biblioteca pura, sem I/O**: recebe matriz + restrições, devolve sequência. Isso
    é o que torna o baseline de D3 testável.
11. Frontend: painel de sugestão com mapa MapLibre GL sobre PMTiles do bucket próprio (D6c), com o
    percurso traçado, as paradas numeradas e a precisão de geocodificação visível por parada.
12. Geração do `.pmtiles` da área de operação como passo de build documentado, ao lado do extract do
    OSRM.

## Requisitos não funcionais

- 50 paradas: sugestão em ≤10s. 200 paradas: ≤60s. Acima disso, o orçamento de tempo corta e devolve
  o melhor encontrado, marcado como truncado — nunca roda para sempre.
- O worker de otimização não compartilha processo com o de emissão fiscal: uma sugestão pesada não
  pode atrasar um CT-e.
- Matriz cacheada por conjunto de coordenadas; duas sugestões seguidas da mesma viagem não pedem
  matriz duas vezes.
- **Nenhum endereço de cliente sai para geocodificador de terceiro em log.** A chamada é encanamento;
  o `security.md` §1 vale igual (endereço é PII).
- Custo de geocodificação observável: quantos endereços novos por mês.
- Determinismo: a mesma entrada com a mesma semente dá a mesma saída. GA com aleatório não semeado é
  impossível de testar e impossível de depurar quando o conferente reclama.

## Casos extremos e falhas

| Caso                                                      | Comportamento                                                                                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OSRM fora do ar                                           | Sugestão vai a `failed` com código estável; a tela oferece ordenar à mão. Nunca cai em haversine silenciosamente — resultado ruim disfarçado de bom é pior que ausência. |
| Geocodificador fora do ar                                 | Endereços já em cache seguem; os novos entram como precisão `city` e ficam fora da otimização.                                                                           |
| Uma parada é ilha sem estrada (OSRM não roteia)           | Marcada como inalcançável e separada, com aviso.                                                                                                                         |
| Nota sem peso informado                                   | Entra com o peso médio da empresa, marcada como estimativa na sugestão (D5).                                                                                             |
| Cliente com janela impossível de cumprir junto das demais | A violação aparece explícita na sugestão, com quanto tempo falta. Nunca é escondida escolhendo outra ordem pior.                                                         |
| Carga excede a capacidade de todos os veículos            | A sugestão devolve o que cabe e lista o que sobrou, em vez de estourar o peso em silêncio.                                                                               |
| Uma parada só                                             | Devolve a sugestão trivial sem rodar o GA.                                                                                                                               |
| Duas paradas com a mesma coordenada exata                 | Colapsam para efeito de matriz; continuam paradas distintas na tela.                                                                                                     |
| Nota adicionada depois da sugestão pronta                 | A sugestão é invalidada (`stale`); a tela pede para gerar de novo.                                                                                                       |
| Aceitar sugestão de viagem já `dispatched`                | `409`.                                                                                                                                                                   |
| GA converge para pior que o baseline                      | O teste falha no CI (D3).                                                                                                                                                |

## Critérios de aceite

- [ ] Teste do solver puro com instância conhecida da literatura (Solomon/Augerat), comparando com o
      ótimo publicado — a tolerância declarada, não "parece bom".
- [ ] Teste de baseline: GA ≥ vizinho-mais-próximo + `2-opt` em toda instância da suíte.
- [ ] Teste de determinismo com semente fixa.
- [ ] Teste de penalidade: instância que só cabe violando peso devolve violação explícita.
- [ ] Teste de cascata de geocodificação nas quatro precisões.
- [ ] Teste de que o cache quente pode ser esvaziado sem disparar geocodificação nova (D2).
- [ ] Teste de que `external_place_id` é persistido em toda geocodificação bem-sucedida (D2b.1) —
      é a mitigação inteira, e ela só vale se nunca falhar em silêncio.
- [ ] Teste do mapeamento `location_type` do Google → cascata de precisão, nos quatro valores.
- [ ] Métrica de endereços novos por mês e total em base, exposta (D2b.3).
- [ ] Teste de peso: instância que só cabe estourando massa devolve violação; volume **não** aparece
      em lugar nenhum do solver (D5).
- [ ] Teste de jornada: com o bloco desligado, nenhuma penalidade; ligado, instância que estoura
      devolve a violação explícita (D6b).
- [ ] Teste de que o painel degrada para lista sem mapa quando o PMTiles não carrega (D6c).
- [ ] Contrato de CSP: nenhum host de tile externo liberado.
- [ ] Teste da mediana de tempo de serviço: abaixo do mínimo de amostras usa o padrão; acima, usa a
      medição, e a origem viaja na resposta (D6).
- [ ] Teste da janela de 3 meses: entrega de 100 dias atrás não entra na mediana.
- [ ] Teste do indicador acima/abaixo da média da operação.
- [ ] Teste de que precisão `city` fica fora da otimização.
- [ ] Teste de que a queda do OSRM não produz sugestão.
- [ ] E2E: pool de notas → sugestão multi-veículo → aceite → viagem `route_planned` com paradas
      ordenadas.
- [ ] OSRM no `compose.yaml` e runbook em `docs/runbooks/` (como rebuildar o extract OSM).
- [ ] `tsc --noEmit` + `make validate`.
- [ ] ADR (**0044**) sobre a pilha de três camadas, por que a matriz é hospedada, e por que o mapa
      com rua **não** contradiz a 047 (D6c).
- [ ] ADR (**0044**) registra a exceção de licença da D2b **por extenso**: o que os termos dizem, o
      que decidimos, o risco nomeado e as três mitigações. Uma exceção não escrita vira, dois anos
      depois, um bug que ninguém entende.
- [ ] `docs/SECURITY.md`: endereço saindo para geocodificador de terceiro é tratamento de dado
      pessoal e precisa estar declarado.

## Dúvidas

## 🤖 Modelo

| Etapa                                                | Modelo    |
| ---------------------------------------------------- | --------- |
| Desenho da pilha, fitness, ADR-0044                  | `opus` 🧠 |
| Implementação do solver + suíte de baseline          | `opus` 🧠 |
| Geocodificação, cache, adaptador OSRM, rotas, worker | `sonnet`  |
| Painel de sugestão e mapa                            | `sonnet`  |

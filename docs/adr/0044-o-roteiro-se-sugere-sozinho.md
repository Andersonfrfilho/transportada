# ADR 0044 — O roteiro se sugere sozinho, e a pilha que sustenta isso tem três camadas

- Status: aceito
- Data: 2026-08-26
- Decisores: mantenedor do projeto e revisão Opus
- Fecha a decisão da spec 058
- Depende da **ADR-0043** (paradas: sem `trip_stops` não há o que ordenar)
- **Não revoga a ADR-0047** — a §6 abaixo explica por que o mapa com rua convive com ela
- Emendada em 2026-09-01 pelo adendo no fim deste arquivo: **a cascata da §3 está invertida** — o
  CEP é o degrau primário e o provedor pago virou escalada por marca humana

## Contexto

Depois da 056 a viagem tem paradas, e alguém as ordena arrastando na tela. Essa pessoa é boa nisso:
conhece a cidade, sabe que o centro trava às 16h. É exatamente por isso que ela é o gargalo — só ela
sabe, leva quarenta minutos por dia, e o resultado piora quando ela falta.

O pedido é um botão "sugerir roteiro". O que ele esconde é um **CVRPTW** — roteamento de veículos com
capacidade e janela de tempo, com depósito de partida e de chegada. É NP-difícil, e é o mesmo
problema que Circuit, Routific e Onfleet resolvem.

## Decisão

### 1. A pilha tem três camadas, e a terceira só é tão boa quanto a segunda

| Camada            | O que faz                              |
| ----------------- | -------------------------------------- |
| Geocodificação    | endereço → coordenada                  |
| Matriz de estrada | coordenada × coordenada → km e minutos |
| Metaheurística    | ordena e distribui                     |

A tentação é pular as duas primeiras e calcular distância em linha reta (haversine). **Não funciona,
e falha de um jeito específico:** um rio sem ponte, uma ferrovia, uma avenida de mão única fazem dois
pontos a 800m em linha reta virarem 6km de rota. O otimizador, confiando na reta, monta uma sequência
que o motorista desfaz na primeira esquina — e depois de desfazer duas vezes ele para de olhar a
sugestão.

**Um roteirizador em que o motorista não confia não é meio produto; é zero.** Essa é a razão pela
qual as duas camadas de baixo não são opcionais, e é a razão pela qual a queda do OSRM produz
`failed` em vez de cair em haversine silenciosamente (§5).

### 2. A matriz de estrada é hospedada por nós, e isso é decisão de arquitetura, não de custo

**OSRM** (`osrm-backend`) sobre o extract OSM do Brasil, num container do `compose.yaml` e num serviço
do Railway. O endpoint `/table` devolve a matriz N×N em milissegundos para o N que interessa (dezenas
a centenas de paradas).

Contra Google Distance Matrix / Mapbox Matrix: elas são melhores em tráfego em tempo real e são pagas
**por elemento**. O algoritmo genético avalia milhares de sequências por sugestão, e cada avaliação lê
a matriz centenas de vezes. Com API paga há duas saídas, e as duas são ruins: pagar uma fortuna, ou
cachear tanto que se perde justamente a vantagem do tempo real que motivaria a escolha.

Com a matriz local, avaliar é acesso a array — e o solver pode ser tão guloso quanto a qualidade
exigir. É o mesmo motivo pelo qual as empresas de roteirização hospedam a própria malha.

O adaptador é uma **porta** (`RoutingMatrixPort`). Trocar por Google quando tráfego em tempo real
virar requisito é escrever outro adaptador — não reescrever a otimização.

### 3. A geocodificação é permanente, e a licença do Google diz que não deveria ser

Endereço já visto nunca é geocodificado de novo: a mesma loja recebe cem vezes por ano.
`geocoded_addresses` guarda a coordenada pela chave normalizada da 056, com a precisão viajando junto.

**O provedor é o Google Geocoding API**, e a escolha é técnica: é o único com número de porta
confiável em cidade do interior, resolve endereço mal formatado (que é o que chega no XML da NF-e), e
devolve `location_type` — que mapeia quase um-para-um na cascata de precisão. Um provedor que não
distingue telhado de centroide obriga a **inferir** precisão, e precisão inferida é precisão errada.

#### A exceção de licença, declarada por extenso

**Os Termos do Google Maps Platform não permitem o armazenamento permanente descrito acima.** Lat/lng
da Geocoding API pode ser cacheada por até **30 dias corridos**; o armazenamento indefinido é
permitido apenas para suportar funcionalidade direta ao usuário final da aplicação que originou a
requisição, e **não** quando o cache substitui uma nova chamada — que é exatamente o nosso uso.
Apenas o `place_id` é armazenável indefinidamente.

**A decisão do produto é armazenar permanentemente mesmo assim.** Está aqui para que a próxima pessoa
saiba que foi escolha consciente, não descuido.

**O risco real não é multa.** É suspensão de chave por padrão de uso atípico — base grande com volume
mensal pequeno é identificável — ou achado em due diligence. E o modo de falha é o roteirizador parar
num dia de operação.

Três mitigações, e nenhuma custa quase nada:

1. **`place_id` é guardado junto com a coordenada.** Ele é armazenável indefinidamente sem exceção
   nenhuma, e é a saída barata: se um dia for preciso ficar dentro dos termos, re-resolver a partir do
   `place_id` é mais barato e mais preciso que re-geocodificar o endereço cru. Guardar essa coluna
   hoje custa nada; **não** guardar custa a base inteira depois. Por isso a coluna é `not null`, e o
   teste de aceite cobra que toda geocodificação bem-sucedida a preencha — uma mitigação que falha em
   silêncio não é mitigação.
2. **`GeocodingPort` com adaptador.** Trocar de provedor é escrever um adaptador, e a cascata de
   precisão já é o vocabulário comum entre eles.
3. **Volume observável.** Endereços novos por mês e total em base viram métrica, para a conversa sobre
   custo (e sobre risco) acontecer com número.

**Alternativa avaliada e recusada:** Mapbox Permanent Geocoding (US$ 5/mil, licenciado para
armazenamento indefinido, ~US$ 43 contra ~US$ 325 no primeiro ano da base estimada). Recusada por
**cobertura**: o Mapbox cai fora do eixo Rio–São Paulo, e a operação entrega onde o cliente está.
Economizar US$ 280/ano para não achar o endereço é economia que custa entrega.

### 4. O solver é genético, híbrido, e sabe quando não é o melhor

O GA foi pedido, e é escolha legítima: lida bem com múltiplos veículos e restrições heterogêneas, e
estende-se com uma restrição nova sem reescrever nada.

E a honestidade que a maioria das implementações pula: **um GA puro é pior que `2-opt` + `or-opt` numa
parada só, e é pior que OR-Tools em quase tudo.** Daí duas travas:

1. Todo indivíduo passa por busca local (`2-opt`) antes de entrar na população — é um GA **memético**,
   e é essa hibridização que separa resultado publicável de brinquedo.
2. **Baseline obrigatório no CI:** o GA é comparado com vizinho-mais-próximo + `2-opt`, e se perder, o
   teste falha. Sem esse teste ninguém descobre que a sugestão piorou — ela continua parecendo uma
   sugestão.

**O fitness é dinheiro, não quilômetro.** O sistema já sabe `other_costs_per_kilometer`, consumo médio
(inclusive dois tanques, spec 051) e preço de combustível por empresa. Roteirizar por km em frota
mista otimiza a coisa errada: o caminhão que bebe o dobro deve andar menos.

**Penalidades, não cortes rígidos.** Matar indivíduo inviável empobrece a população; a violação entra
no custo e aparece explícita na proposta.

### 5. A sugestão é proposta, e ela nunca escreve sozinha

`route_suggestions` guarda a proposta com custo e premissas. O conferente vê lado a lado com o roteiro
atual, ajusta arrastando, e **aceita** — e só o aceite escreve em `trip_stops`, pela mesma rota
`PATCH /trips/:id/stops/order` da 056. Rejeição também é gravada.

Duas razões. **Confiança:** quem conhece a cidade precisa ter a última palavra, ou não adota.
**Medição:** com aceites e rejeições registrados, dá para responder "a sugestão está boa?" com número
em vez de opinião — e é assim que se afina o fitness.

Disso decorre o comportamento em falha: **OSRM fora do ar não vira haversine.** A sugestão vai a
`failed` com código estável e a tela oferece ordenar à mão. Resultado ruim disfarçado de bom é pior
que ausência — é a §1 outra vez.

E o corolário sobre precisão: parada com precisão `city` (centroide de município, palpite de ~8km)
**não entra na otimização automática**. Vai para o fim da lista, marcada, esperando decisão humana. O
conferente tem de ver isso na tela antes de aceitar, não descobrir pelo motorista.

### 6. O mapa tem rua, e a rua também é nossa — a ADR-0047 continua de pé

O painel de sugestão usa **mapa de rua com o percurso traçado**, não a malha de municípios em SVG da
ADR-0047. O motivo é conferência: numa entrega dentro de uma cidade só, a malha do IBGE é um polígono
e a rota vira rabisco dentro dele — não há como bater o olho e ver que a sugestão está certa, que é a
única razão de o painel existir (§5).

**Isto não reabre a ADR-0047.** A razão dela era não mandar dado nosso para terceiro, e essa razão
continua valendo integralmente. Endereço de cliente é dado pessoal (`security.md` §1), e **uma URL de
tile é um log de servidor alheio** — a coordenada da parada viajaria na URL.

A saída é **PMTiles**: um único arquivo estático gerado offline do mesmo extract OSM que alimenta o
OSRM, guardado no bucket privado que já existe, e lido pelo MapLibre GL por HTTP Range direto do nosso
domínio. O que isso compra:

- **Nenhuma requisição a domínio externo.** O CSP não precisa liberar host de tile — e há contrato de
  teste cobrando que nenhum seja liberado.
- **Nenhum serviço novo rodando.** Um tile server clássico (PostGIS + renderizador + cache) é infra de
  verdade, com import, storage e invalidação. PMTiles é um arquivo.
- **Mesma cadeia de build do OSRM.** O extract é o mesmo; muda o passo de geração.

O custo honesto: o Brasil inteiro em zoom alto é da ordem de dezenas de GB. Gera-se **só a área de
operação** — a região metropolitana atendida sai em centenas de MB — e regenera-se quando a operação
expandir. É um script e um runbook, não um serviço.

Se o arquivo não estiver disponível, o painel cai para a lista ordenada sem mapa **e diz isso**. O
mapa confere a sugestão; ele não é a sugestão.

### 7. Otimizar é trabalho de worker, sempre

Um GA sobre 200 paradas roda por segundos ou dezenas de segundos. Dentro do `Bun.serve` isso bloqueia
o event loop e derruba o resto da API. Então `POST /trips/:id/route-suggestions` cria a sugestão em
`queued`, publica em `route-optimization.v1`, e responde `202`. O worker resolve e escreve; a tela
acompanha por poll.

A trilha de outbox, retry, `*_processed_messages` e dead-letter é a mesma que CT-e e MDF-e já usam.
Nada de padrão novo. E o worker de otimização **não compartilha processo com o de emissão fiscal**:
uma sugestão pesada não pode atrasar um CT-e.

### 8. Determinismo é requisito, não conveniência

Mesma entrada com a mesma semente dá a mesma saída, e a semente que rodou fica **gravada na
sugestão**. GA com aleatório não semeado é impossível de testar e impossível de depurar quando o
conferente reclama que "ontem deu outro roteiro".

### 9. A capacidade é peso, e volume não finge existir

`fleet_vehicles` tem capacidade em kg e em m³, mas a cubagem quase nunca vem preenchida no XML —
`nfe_volumes` traz peso com confiabilidade, e m³ quase nunca.

Um solver que respeita um limite de volume calculado sobre dado ausente produz um número que **parece**
uma restrição e não é uma: a rota "cabe" na tela e não cabe no caminhão. Então peso é restrição de
verdade, com penalidade no fitness, e volume **não entra no modelo** — nem como restrição frouxa, nem
como aviso. Quando existir cadastro de cubagem por produto, ele volta como uma penalidade a mais, e o
solver puro aceita isso sem reescrita.

## Consequências

- Duas dependências externas novas: um serviço OSRM que precisa de extract mantido (runbook), e uma
  chave Google com custo por endereço **novo** — não por sugestão.
- Uma exceção de licença consciente, com a saída (`place_id`) já guardada.
- Um solver que só é confiável enquanto a suíte de baseline rodar no CI. Desligá-la é desligar a
  garantia.
- O painel ganha um arquivo de tiles a regenerar quando a área de operação mudar.

## Alternativas recusadas

| Alternativa                           | Por que não                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Haversine em vez de matriz de estrada | Falha exatamente onde o motorista percebe (§1); mata a adoção antes de qualquer ganho.                        |
| Google/Mapbox Distance Matrix         | Cobrança por elemento contra um solver que lê a matriz milhares de vezes (§2).                                |
| Mapbox Permanent Geocoding            | Licença melhor, cobertura pior fora do eixo Rio–SP (§3).                                                      |
| OR-Tools em vez de GA                 | Provavelmente melhor em qualidade pura, mas o GA foi pedido e a hibridização + baseline fecham a lacuna (§4). |
| Tile server externo (Mapbox/Google)   | Coordenada de cliente viajando em URL de terceiro contraria a razão da ADR-0047 (§6).                         |
| Otimizar dentro da API                | Bloqueia o event loop; derruba o resto da API (§7).                                                           |
| Volume como restrição frouxa          | Restrição calculada sobre dado ausente é pior que restrição nenhuma (§9).                                     |

## Adendo 2026-09-01 — o CEP é o degrau primário, e o provedor pago é escalada

A §3 escolheu o Google como **o** geocodificador, com o centroide de CEP e o de município como queda
para quando ele falhasse. **A ordem está invertida na implementação** (spec 069), e este adendo
registra por quê — quem ler só a §3 vai procurar no código um Google que quase nunca é chamado.

### O que mudou desde 2026-08-26

Duas medições de 2026-09-01, contra a BrasilAPI:

- **A coordenada do CEP já chega hoje, e nós a jogamos fora.** `postal-code.gateway.ts` chama o
  `/cep/v2` para preencher os campos de endereço e ignora o `location.coordinates` que vem no **mesmo
  corpo** — `{"type":"Point","coordinates":{"longitude":"-46.6553299","latitude":"-23.5617698"}}`. O
  degrau de graça não é destino externo novo nem chamada nova: é ler um campo que a resposta entrega.
- **Ele resolve até em cidade pequena.** Sales Oliveira, onze mil habitantes, devolveu coordenada.

Quando a §3 foi escrita, o degrau gratuito era teórico e a escolha real era "Google ou nada". Deixou
de ser.

### A escada, e ela não tem gatilho automático

| degrau | quem                   | quando                                             | custo        |
| ------ | ---------------------- | -------------------------------------------------- | ------------ |
| 1      | BrasilAPI `/cep/v2`    | sempre, por rotina de população                    | zero         |
| 2      | provedor pago (Google) | **só quando um humano marca a parada como errada** | por endereço |
| 3      | pino manual            | quando nem o degrau 2 acertou                      | zero         |

**Consequência dita por extenso: o provedor pago passa a quase nunca ser chamado.** Isso é a escolha,
não um efeito colateral — o produto roteiriza com precisão de CEP por padrão e compra precisão fina
só onde alguém olhou e disse que estava errado.

Foi avaliada e recusada uma escalada **automática por colisão** (duas paradas distintas caindo na
mesma coordenada). Ela é tentadora e mede a coisa certa, mas gasta sem ninguém decidir. A trava é
teste: uma sugestão inteira faz **zero** chamadas ao provedor pago, e sem esse contrato alguém
acrescenta a escalada automática seis meses adiante e a fatura aparece sem decisão.

### O que a §3 dizia e continua valendo

- a coordenada é guardada **permanentemente**, e é isso que faz endereço já visto nunca ser
  reconsultado;
- `external_place_id` é `not null` para o que vem do provedor pago, e o CHECK do banco o cobra — a
  mitigação 1 sobrevive à inversão e passa a cobrir um número **muito menor** de linhas;
- a **exceção de licença** segue assumida por escrito, com exposição bem menor;
- a cascata de precisão (`rooftop` > `street` > `postal_code` > `city`) e "a correção manual sempre
  vence" não mudam — o degrau 2 é essa mesma cascata usada na direção que ela já sabe ir;
- parada em `city` continua fora da otimização automática (§5).

Hospedar geocodificador nosso (Nominatim sobre o mesmo extract OSM do OSRM) foi **recusado de novo**,
e o motivo merece ficar ao lado da §2 porque contradiz a intuição de quem a leu: as duas camadas têm
formatos de chamada opostos. A matriz é lida **milhares de vezes por sugestão** — custo recorrente e
sem teto, e por isso hospedar ganha. O geocodificador é chamado **uma vez por endereço novo, para
sempre** — pagamento único que decai conforme a base satura. Servidor de pé 24/7 é custo fixo que
nunca decai, e com a inversão o gasto com o provedor pago tende a quase zero: nenhum servidor nosso
compete com zero. Hospedar geocodificador se justificaria por licença ou privacidade — nunca por
economia.

### O risco novo, que a §3 não tinha

**A coordenada do CEP é do CEP, não do endereço: ela ignora o número.** Numa rua coberta por um CEP
só, o número 50 e o número 2000 recebem a mesma coordenada, e o solver não consegue ordenar duas
paradas a dois quilômetros uma da outra. É a família de defeito da §1 — número plausível, sem aviso.

A mitigação é a marca do degrau 2, e ela é também o **instrumento de medida**: se for muito usada, o
degrau 1 não basta para esta operação, e a conversa volta com número em vez de palpite (é o mesmo
raciocínio da §5 sobre aceites e rejeições).

E há um caso que precisa de guarda explícita: **cidade pequena tem um CEP para o município inteiro**,
cujo centroide é palpite de quilômetros. Gravá-lo como `postal_code` o poria dentro da rota. O
discriminador é o **`street` ausente** na resposta — CEP geral não tem logradouro por definição —, e
não o sufixo `-000`, que classificaria a Avenida Presidente Vargas de Araraquara como palpite de
município.

### Onde cada degrau roda

O degrau 1 é do **worker** (assíncrono, e `readStops` é onde a coordenada falta). O degrau 2 é da
**API**: é ação humana síncrona, alguém clicou e está esperando saber se melhorou. Isso **não
contraria a §7** — ali o que não pode bloquear o event loop é a otimização, que continua no worker;
uma chamada de geocodificação iniciada por humano, com humano esperando, é outro caso.

E a marca precisa responder **quando não melhorou**: se o provedor devolver precisão igual ou pior, a
regra de substituição recusa a escrita, e sem aviso a pessoa marca, nada muda na tela e conclui que a
marca não funciona. A resposta oferece o degrau 3.

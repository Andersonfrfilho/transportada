# ADR-0080 — O ponto do motorista é sugestão que o escritório aplica

- **Estado:** aceita (2026-09-25, spec 195), com as quatro perguntas respondidas pelo usuário no
  mesmo dia: (a) `/ocorrencias`, (b) `occurrences.resolve`, (c) o escritório também registra, com pino
  arrastado (§6), (d) a descartada pode ser reaberta (§8).
- **Data:** 2026-09-25
- **Decisores:** usuário, em 2026-09-25: _"botão de endereço incorreto para adicionar um evento de
  correção na página de aviso, e também precisa pegar o ponto de onde foi feito o evento"_. O resto é
  desta ADR, revisada pela crítica (opus) no mesmo dia (M1–M6), mais as quatro respostas do usuário.
- **Contexto:**
  - emenda a **ADR-0057** (`0057-o-endereco-errado-e-ocorrencia-e-ela-conserta-o-cadastro.md`) no
    Contexto item 1 e nos §2, §3, §4 e §5;
  - responde a **D4** da spec 084 e realiza a T18b dela;
  - aceita o risco da **084 T1d** para as correções decididas pelo escritório (`driver` e `operator`),
    e não para `contractor` (§4);
  - usa a trilha da 084 (`geocoded_address_corrections`) e o upsert do `PATCH /geocoded-addresses`
    (084 G1/T1e);
  - complementa a spec 150 sem sobrepô-la;
  - **depende da ADR-0081** (spec 196) e abre uma exceção nomeada ao §6 dela (§7);
  - convive com a **ADR-0082** (spec 197): a parada passa a ser (cliente, endereço), e a correção
    continua sendo do endereço.

## Contexto

A ADR-0057 decidiu que o endereço errado é ocorrência **de parada** (`wrong_address`), que o app não
corrige nada e que a correção é decisão do escritório. A decisão ficou sem implementação: a evidence
da spec 082 registra três saídas possíveis e nenhuma escolhida. A spec 084 ficou com a D4 aberta na
lista de tasks e com a T18b bloqueada por ela.

Enquanto isso, quatro coisas mudaram:

1. **A coordenada da parada vive em `geocoded_addresses`, pela `address_key`**, e é lida ao vivo
   (`trip-stop-coordinates.support.ts`). As colunas `trip_stops.latitude/longitude` nunca são
   escritas.
2. **A 084 criou a trilha de correção humana** (`geocoded_address_corrections`, com
   `origin ∈ {contractor, driver, operator}`), e o `PATCH /geocoded-addresses` passou a gravá-la. O
   valor `driver` existe e ninguém o grava.
3. **A 150 criou o pedido de correção do texto à contratante**, por e-mail, sem tocar na nota.
4. **A ADR-0081 (spec 196)** dá a toda ocorrência de parada o carimbo do toque (`latitude`,
   `longitude`, `accuracy_meters`, `captured_at`, `location_state`), com expurgo de 90 dias. Ela mesma
   separou os dois papéis do ponto do relato de endereço: o **carimbo** (onde o motorista estava) e a
   **coordenada proposta** (dado de cadastro), e deixou a retenção do segundo para esta ADR.

E um limite que a crítica mediu: a `address_key` é `cidade|CEP|número` **sem o logradouro**
(`stop-address-key.ts:53-60`). Numa cidade de CEP único (`…000`, os 149 endereços `city` da 084), a
mesma chave junta ruas diferentes com o mesmo número.

## Decisão

### 1. O ponto proposto entra como sugestão e só vira coordenada com uma decisão

Isto responde a D4 da 084. A sugestão (`trip_stop_location_suggestions`) tem duas origens:

- **`driver_stamp`:** o motorista toca "Endereço incorreto", a app lê a posição, e o relato grava a
  ocorrência `wrong_address`, cujo carimbo (ADR-0081) **é** o ponto. A sugestão não copia o ponto.
- **`office_pin`:** o escritório arrasta o pino no mapa (§6). O ponto proposto fica na própria sugestão
  (`proposed_latitude`/`proposed_longitude`), porque não é carimbo de ninguém.

Nas duas, a sugestão guarda o estado da decisão, a parada de origem e a fotografia do pino que existia
no relato.

A sugestão só vira coordenada quando alguém com `occurrences.resolve` escolhe "Usar este ponto". Aí o
upsert da 084 grava `rooftop`/`manual` e a trilha com `origin = 'driver'` (para `driver_stamp`) ou
`origin = 'operator'` (para `office_pin`), com ator = quem aplicou. A sugestão guarda quem decidiu,
quando e qual linha da trilha nasceu. Tudo isso acontece numa transação só, com `audit_logs`.
`applied` só existe com a coordenada gravada como `source = 'manual'`: o upsert devolve o id da trilha
(`returning`), e sem id não há `applied`.

O motivo é o mesmo do §4 da ADR-0057: _quem lê de fora propõe, quem responde decide_. Um toque numa
tela pequena, na rua, com GPS de galpão, é indistinguível de um toque certo. O mapa com os dois pontos
lado a lado é o que permite distinguir.

### 2. Emendas à ADR-0057: o motorista está na porta certa, e sem permissão o relato sai sem ponto

- **Contexto item 1 e §3.** A ADR-0057 partia de que, nesta ocorrência, o motorista **nunca** está no
  lugar certo, e fazia da distância a medida do erro. Aqui ele relata **na porta certa**: a folha diz
  "toque quando estiver na porta certa". A distância entre o ponto e o pino continua sendo a medida do
  erro, só que agora medida do lado certo. Longe continua **não** bloqueando o relato.
- **§2.** A ADR-0057 fazia a permissão negada **bloquear** a ocorrência. Para `wrong_address` isso
  deixa de valer, por decisão do usuário e em linha com a ADR-0081 (a recusa não bloqueia). O relato é
  gravado com `location_state = 'unavailable'`, e a tela diz "sem ponto". O relato sem ponto ainda diz
  **qual** endereço está errado, e isso serve para o pedido à contratante (150), mas não há sugestão
  para aplicar.
- **§4.** A ADR-0057 dizia que o ponto de atenção "não dispara aviso". Aqui ele dispara um aviso
  **interno** (sino e e-mail do escritório, pelo catálogo de notificações), que leva ao detalhe. Esse
  aviso não é o aviso **ao contratante** da §5 dela, que continua sendo ação do operador, nunca
  automática, pela spec 150.

### 3. Quem aplica, e o limite de precisão

#### 3.1 A permissão é a das ocorrências

`occurrences.resolve` (resposta (b) do usuário), a mesma permissão da tratativa
(`occurrence-case.routes.ts:33`, spec 164 D7), e não `trip.manage`. O `trip.manage` alcança o separador
(`separator-role.contract.test.ts`), e decidir sobre o relato do campo é trabalho de quem trata
ocorrência, não de quem monta carga. As rotas de decisão e de registro pelo escritório têm limitador
próprio, no molde da tratativa (Postgres, janela de 300 s, 120 requisições).

#### 3.2 Precisão de GPS pior que 100 m não se aplica

O servidor recusa aplicar ponto do GPS do motorista com `accuracyMeters > 100`
(`STOP_LOCATION_SUGGESTION_POINT_TOO_IMPRECISE`), e a tela explica o motivo e oferece "Ajustar no
mapa", que é a correção manual existente. Gravar `rooftop` com incerteza de quarteirão é declarar
precisão que não existe, e a ADR-0045 §4 já registrou que precisão de quilômetro é normal dentro de
um galpão. Até 100 m, o ponto é da porta ou da calçada dela. Isso é diferente do raio de 5 km da
ADR-0057, que continua valendo para o que ele media: estar longe não bloqueia o **relato**. Os 100 m
bloqueiam só a **aplicação**. O pino arrastado pelo escritório não tem precisão, e a regra não vale
para ele (§6.3).

#### 3.3 Chave ambígua não se aplica

A 084 já decidiu que candidato ambíguo **não** vira coordenada (spec 084, P5 e "O sistema acha a
divergência; o humano decide"). Aplicar o ponto a uma chave que junta ruas diferentes mandaria o
caminhão de outra rua para esta porta. Por isso, o `PATCH applied` responde
`422 STOP_LOCATION_SUGGESTION_AMBIGUOUS_KEY`, para as duas origens, quando:

- a chave tem número `S/N` (`NO_NUMBER_KEY`); ou
- a empresa tem, nas notas com aquela chave de destino físico, **mais de um logradouro distinto**
  (canonicalizado por `buildClientStreetKey`, que é canonicalização e não semelhança).

O detalhe mostra a contagem de logradouros e oferece o pedido à contratante (150). A sugestão continua
pendente e pode ser descartada.

### 4. O alvo é a chave do endereço; a rota da viagem em curso não é recalculada por esta correção

Emenda ao §5 da ADR-0057. O ponto corrige **onde** o endereço fica, e não o texto da nota. O alvo é
a `address_key` da parada em `geocoded_addresses`. Por isso:

- **As notas e as paradas irmãs não se partem.** Todas compartilham a chave. Com a ADR-0082, a mesma
  chave pode servir mais de um destinatário. A correção vale para todos eles, porque é o mesmo portão
  (ADR-0082 D20), e o detalhe diz "esta chave serve N destinatários". A preocupação do §5 da 0057
  ("aplicar em quatro de cinco notas parte a parada em duas") era do desvio de **texto** por nota
  (`delivery_address_overrides`), que continua sendo o caminho quando a entrega de hoje vai para outro
  lugar.
- **As próximas viagens usam o ponto novo** em qualquer parada com a mesma chave. A geocodificação em
  lote não o desfaz, porque o upsert não sobrescreve `source = 'manual'`.
- **A viagem em curso muda de mapa, e esta correção não recalcula o plano.** O pino se move na hora (a
  leitura é ao vivo). O traçado, a quilometragem e o pedágio congelados em `freeze-trip-planned-route`
  não são recalculados **por esta correção**. Outro gatilho que recalcule, como a reordenação da 192
  (D7), passa a usar o ponto novo, e isso é o certo.
- **O texto se corrige na origem, pela 150.**
- **Não escreve em `client_delivery_addresses`** enquanto a 084 T3b (leitor) e a T1c (envelope do
  `client_tax_id`) estiverem abertas. Enquanto isso, a correção vale para **todos os destinatários** da
  chave, e não para o par (cliente, endereço).
- **084 T1d aceita para as correções decididas pelo escritório** (`origin = 'driver'` e
  `'operator'`). `geocoded_addresses` não tem `company_id` (ADR-0044).
  Numa instalação dedicada (ADR-0021), as empresas que a compartilham são os CNPJs da mesma
  transportadora, e a aplicação é sempre de um humano do escritório, sob permissão, com trilha por
  empresa. É o mesmo caminho do `PATCH` que já está em produção. A T1d continua aberta para
  `origin = 'contractor'`, que é escrita externa.

### 5. O ponto é carimbo por 90 dias, e depois de aplicado passa a ser do endereço

Esta é a retenção da "coordenada proposta" que a ADR-0081 deixou para cá.

- **Enquanto pendente, a coordenada proposta não existe como dado próprio.** Ela é o carimbo da
  ocorrência: localização de pessoa identificada, **nunca** em log, com os **90 dias** e o expurgo
  único da ADR-0081. A tabela da sugestão não copia o ponto e por isso fica **fora** da lista do
  expurgo. Um contrato reprova, por nome de coluna, quem acrescentar coordenada nela fora de
  `pin_latitude`/`pin_longitude`. Sugestão pendente com carimbo `expired` não pode mais ser aplicada.
  Copiar o ponto para a sugestão faria uma segunda cópia fugir do prazo.
- **Depois de aplicado, o ponto é coordenada do endereço, não posição da pessoa.** Ele passa a morar
  em `geocoded_addresses` e `geocoded_address_corrections`, como dado de cadastro, sem prazo
  (ADR-0044). A trilha permite voltar ao motorista pelo relato, mas o fato "o motorista X esteve no
  endereço Y na data Z" já é permanente pelo evento de entrega (`trip_stop_events` guarda hora e
  parada para sempre, e só a coordenada expira). A coordenada aplicada não acrescenta nada pessoal a
  isso.
- **O pino do escritório não é dado pessoal.** `proposed_latitude`/`proposed_longitude` são um ponto
  posto por um humano no mapa, e não a posição de ninguém. Por isso ficam na sugestão, só com
  `origin = 'office_pin'` (CHECK), e fora do expurgo do carimbo.
- O `audit_logs` da decisão guarda ids, chave, precisões, distância, origem e `selfApplied`, **nunca
  coordenadas**.
- **A foto da fachada tem prazo curto.** Ela pode mostrar pessoas e placas, e o propósito dela acaba
  com a decisão. É apagada **90 dias depois da decisão**, ou 90 dias depois do relato se ainda estiver
  pendente (quando o carimbo expira, a sugestão só pode ser descartada). Os 5 anos das fotos de
  ocorrência valem para a prova de avaria e de recusa, que vira cobrança; aqui não há cobrança. A foto
  é reencodada sem EXIF no aparelho, porque o EXIF carrega GPS.

### 6. O motorista tem botão próprio, e o escritório registra com o mapa

`wrong_address` entra no catálogo da parada, como a ADR-0057 §1 decidiu, mas **não** na lista do "Deu
problema", nem na do app novo nem na do módulo legado do painel. O motorista tem botão próprio no card
da parada. Isso resolve o risco que a evidence da 082 registrou ("duas portas para o mesmo fato"): a
devolução `address_not_found` é "não achei, devolvo"; `wrong_address` é "achei, e o pino estava
errado".

O escritório também registra (resposta (c) do usuário), com o ponto vindo do pino que ele arrasta no
mapa. Três decisões sustentam isso.

#### 6.1 Rota própria, canal `backoffice`, permissão `occurrences.resolve`

- **Não é a rota "em nome do motorista".** Ela é `trip.report-on-behalf` com canal `office`, e o banco
  exige `on_behalf_of_driver_id` nesse canal (`trip_stop_occurrences_office_driver_check`, ADR-0067 §2).
  O pino do escritório não é do motorista: é o operador dizendo, como ele mesmo, onde fica o endereço.
  Por isso a rota "em nome de" continua recusando `wrong_address`, e o registro vai por
  `POST /trips/:tripId/stops/:stopId/location-suggestions`, com canal `backoffice` (ADR-0068 §3: ação
  da tela do escritório que não é em nome do motorista).
- **A permissão é `occurrences.resolve`, e não `trip.report-on-behalf`.** `trip.report-on-behalf` é a
  permissão da baixa em nome do motorista (ADR-0067 §1), e este registro não é isso. O pino do
  escritório é uma proposta de coordenada de endereço, e quem propõe do escritório é a mesma pessoa que
  pode decidir sobre ela. As duas permissões vão para os mesmos três papéis (`company-admin`,
  `operator`, `finance`), então nenhum papel ganha nada com a escolha. O separador fica de fora nas
  duas.
- Na interface, o fluxo reusa a interação de arrastar pino do "Ajustar no mapa" (084), mas grava
  sugestão, e não coordenada direta. O diálogo "Registrar ocorrência" da parada ganha a entrada separada
  "Endereço incorreto — marcar no mapa", e os chips de tipo dele continuam sem `wrong_address`.

#### 6.2 Quem registrou pode aplicar

A autoaprovação que a spec 164 D7 e a ADR-0067 evitam é a de um papel de **menos confiança** validando
o próprio registro para escapar da revisão: o separador, que tem `trip.manage`, validando a ocorrência
de galpão que ele mesmo abriu. Aqui não é esse caso:

- registrar e aplicar pedem a **mesma** permissão (`occurrences.resolve`), que o separador não tem;
- a mesma pessoa já pode gravar a coordenada **direto** pelo "Ajustar no mapa" (`PATCH
/geocoded-addresses`), sem registro nenhum. Proibir que ela aplique o próprio pino só a empurraria para
  esse caminho, que não tem ocorrência, nem aviso, nem regra de ambiguidade. A regra de quatro olhos
  aqui não protegeria nada e esconderia o registro.

Por isso, quem registrou pode aplicar, e isso fica **visível**: o `audit_logs` leva `selfApplied: true`,
e o detalhe diz "registrada e aplicada por Fulano". Se um dia o produto quiser quatro olhos na
coordenada, a regra tem de valer para os dois caminhos juntos, começando pelo `PATCH`.

#### 6.3 O pino arrastado não tem precisão, e a chave ambígua vale igual

- **A regra dos 100 m (§3.2) não se aplica ao pino do escritório.** Ela mede a incerteza de um GPS. O
  pino arrastado é um humano pondo o ponto onde sabe que é; ele não tem `accuracy`, e inventar uma
  seria medir o que não foi medido.
- **A regra de chave ambígua (§3.3) se aplica igual.** Ela é sobre a chave, e não sobre o ponto: um
  pino perfeito numa chave que junta três ruas continua corrigindo as três. O registro é aceito (ele
  ainda serve de motivo para a 150), mas a aplicação responde `422 …_AMBIGUOUS_KEY`, e o mapa avisa
  antes de o operador arrastar.

### 7. Exceção nomeada à ADR-0081 §6: o detalhe da sugestão mostra o ponto

A ADR-0081 §6 decidiu que o escritório vê o ponto **só na linha do tempo**, e que o feed de ocorrências
continua sem posição. Aqui o ponto é o **objeto da decisão**: sem ver onde o motorista estava ao lado
do pino atual, "Usar o ponto do motorista" seria um aceite no escuro. Por isso:

- o feed (`GET /trip-occurrences`) continua **sem coordenada** e leva só o estado da sugestão;
- o detalhe da sugestão (`GET /trip-occurrences/:id/location-suggestion`) devolve o ponto, a precisão
  e a hora da leitura, com a política do feed (`fleet.read`). Ela **não** é a mesma população da linha
  do tempo, que aceita `fleet.read` **ou** `trip.report-on-behalf` (`TRIP_FIELD_READ_POLICY`,
  `trip.routes.ts:341-344`). É um **subconjunto** dela: ninguém que hoje não vê o ponto na linha do
  tempo passa a vê-lo aqui;
- vale só para `wrong_address`, e as outras ocorrências seguem a ADR-0081 §6 sem mudança.

### 8. A descartada pode ser reaberta; a aplicada, não

Resposta (d) do usuário.

- `dismissed → pending` é uma transição do mesmo `PATCH`, sob `occurrences.resolve`. Ela limpa
  `decided_*`, grava `last_reopened_by_user_id`/`last_reopened_at` e um `audit_logs`
  `stop_location_suggestion.reopened` com ator e horário. Repetir é idempotente (`pending → pending` dá
  `200` sem efeito).
- **Uma aplicada nunca reabre** (`409`). Ela já moveu a coordenada, e desfazer é outra correção, com a
  própria trilha: um relato novo ou o "Ajustar no mapa".
- **A reaberta volta a "Pendente", e não vira um sexto estado.** Para quem filtra, ela está esperando
  decisão como qualquer outra. A marca "reaberta por Fulano em …" aparece como subtexto no selo e no
  detalhe.
- Reabrir uma sugestão cujo carimbo já expirou devolve "Ponto expirado", que só pode ser descartada de
  novo ou virar motivo da 150. Reabrir não ressuscita foto já apagada.

## Consequências

- O motorista passa a ter como dizer "o pino está errado" sem parar a entrega. O escritório passa a
  ter um motivo concreto, com mapa, para corrigir a coordenada.
- A 084 ganha a primeira fonte `driver` real na trilha, que é o dado que a RF7 dela precisa para medir
  quem corrige melhor.
- A D4 da 084 fica respondida, e a T18b passa a ser realizada pela 195.
- O escritório passa a ter onde registrar "o endereço certo é ali", com a mesma decisão e a mesma
  regra de ambiguidade do relato do motorista.
- **O custo:** um tipo novo no CHECK, uma tabela lateral sem coordenada de pessoa, uma rota de registro
  pelo escritório, duas rotas de leitura/decisão, duas de upload por parada, um template de aviso, uma
  regra de expurgo para a foto e seis contratos de catálogo atualizados nas duas apps de front.
- **O que não se ganha:** correção automática; texto do endereço corrigido na nossa base; correção por
  (cliente, endereço); rota da viagem em curso recalculada por esta correção.
- **A ordem importa:** a 195 roda depois das partes da 196 que dão o carimbo à ocorrência de parada.

## Alternativas descartadas

| alternativa                                                      | por que não                                                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Aplicar o ponto direto, sem o escritório                         | um toque errado vira coordenada oficial e manda o próximo caminhão para o lugar errado (ADR-0057 §4)                              |
| Aplicar mesmo com chave ambígua                                  | a chave sem logradouro junta ruas; a 084 decidiu que ambíguo vai ao humano e nunca vira coordenada                                |
| Tabela própria ligada ao `trip_document` (terceira saída da 082) | a coordenada é da **chave** da parada, e não da nota; ligar à nota criaria N sugestões para o mesmo ponto numa parada de N notas  |
| A correção nascer da devolução (segunda saída da 082)            | não cobre quem **entregou** e só quer corrigir o pino, que é o caso comum                                                         |
| Colunas de decisão em `trip_stop_occurrences`                    | o ciclo de decisão só existe para `wrong_address`; colunas anuláveis nas outras cinco escondem uma regra por tipo                 |
| Gravar em `delivery_address_overrides`                           | é desvio de **texto** de uma entrega, por nota, e sem valor para a próxima; confundir faria um desvio pontual virar endereço fixo |
| Recalcular a rota congelada ao aplicar                           | altera custo e métrica já registrados de uma viagem em andamento, cujo motorista já está no lugar                                 |
| Bloquear o relato sem permissão de localização (ADR-0057 §2)     | decisão do usuário; o relato sem ponto ainda diz qual endereço está errado                                                        |
| Copiar o ponto para a sugestão (colunas próprias)                | duplicaria o carimbo da ADR-0081 e criaria uma segunda cópia do dado pessoal, com um segundo expurgo para lembrar                 |
| Reter a foto da fachada por 5 anos                               | o prazo longo serve à prova que vira cobrança; a foto da fachada perde o propósito na decisão e pode mostrar pessoas e placas     |
| O escritório registrar pela rota "em nome de" (`office`)         | o canal `office` exige `on_behalf_of_driver_id`; o pino não é do motorista, e sim do operador (`backoffice`, ADR-0068 §3)         |
| `trip.report-on-behalf` para o escritório registrar              | é a permissão da baixa em nome do motorista; o registro é uma proposta de coordenada, e quem propõe é quem pode decidir           |
| Proibir que quem registrou aplique o próprio pino                | o "Ajustar no mapa" já grava a coordenada direto; a proibição empurraria para o caminho sem registro e sem regra de ambiguidade   |
| Aplicar os 100 m ao pino arrastado                               | o pino não tem `accuracy`; a regra mede GPS, e não o conhecimento de quem marca                                                   |
| Reabrir uma aplicada                                             | ela já moveu a coordenada; desfazer é outra correção, com trilha própria                                                          |
| "Reaberta" como sexto estado                                     | para quem filtra, a reaberta espera decisão como qualquer pendente; o subtexto basta                                              |
| `trip.manage` para aplicar                                       | alcança o separador; decidir sobre relato de campo é trabalho de quem trata ocorrência (`occurrences.resolve`)                    |

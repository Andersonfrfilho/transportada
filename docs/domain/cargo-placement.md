| tom por nota e a trava contra a cor de outra parada | `frontend/src/modules/trip/shared/noteTone.service.ts` |

# Como as caixas são organizadas no baú

Referência viva do empacotador — `apps/api-transportada/src/trips/domain/cargo-placement.policy.ts`
e `cargo-layout.policy.ts`. Cada regra aqui veio de um defeito **medido**, e o número ao lado é o
número que a medição deu. Specs de origem: 085, 088, 094, 095, 099, 100, 113, 114, 115, 116, 117 e 118.

## O que o desenho promete, e o que ele não promete

Ele diz **"cabe, e nesta ordem"**. Ele não diz "deve ir assim": não confere carga por eixo
(`axleNotChecked`), não conhece a empilhabilidade de toda caixa nem o peso de cada uma. A tela repete
isso numa linha fixa, e o painel de decisões (abaixo) explica o que moldou aquele desenho.

---

## Passo 1 — Em que eixo as paradas se dividem

`resolveStopArrangement` devolve `depth`, `grid` ou `lanes`, **e o motivo**.

| arranjo | como fica                                                                                                                   | quando                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `lanes` | cada parada numa faixa ao longo da largura, **todas encostando na porta**                                                   | quando cabem                                                   |
| `grid`  | K faixas; as K primeiras entregas na porta, lado a lado, e as seguintes atrás delas                                         | faixas não cabem, e a grade coloca o que a profundidade coloca |
| `depth` | **um bloco só** (spec 114): a última entrega na testeira, cada entrega seguinte ao lado ou em cima da anterior, até a porta | quando nem faixas nem grade servem                             |

Faixas cabem quando **as duas** valem:

1. A soma das **larguras mínimas** cabe na largura do baú. A largura mínima de uma parada é a menor
   dimensão de planta da caixa mais larga dela — a menor porque a caixa gira.
2. O **volume** de cada parada cabe na faixa que ela recebe, descontada a eficiência de arrumação.

⚠️ **Caber em largura não é caber.** Sem o segundo teste, duas paradas de uma caixa cada seguravam
0,60 m de um baú de 1,45 m e estrangulavam a parada dominante: **15 de 57 caixas** descartadas como
`bedFull` num baú **64% cheio**, e as mesmas 57 cabiam em profundidade.

⚠️ **A faixa não é proporcional ao volume.** Ela vai do chão ao teto e da porta à testeira; o que a
parada exige da largura é caber a caixa mais larga dela. Medir por fatia proporcional fazia a feature
**não disparar na viagem que a motivou**: a parada menor levava 19% do volume, ganhava 0,28 m e tinha
caixa de 0,30 m.

Recusas com nome próprio, porque a tela precisa explicar a troca: `noBed`, `openBody`, `weight`,
`singleStop`, `tooWide`, `volumeDoesNotFit`.

⚠️ **Sem exceção silenciosa:** as faixas cabem todas ou nenhuma. Metade da carga em faixas e metade em
profundidade produz um desenho que ninguém consegue seguir — e o operador seguiria mesmo assim.

⚠️ **Carroceria aberta não ganha faixa**, pela mesma razão que ela equilibra sempre: quem abre o
comprimento inteiro já tem toda a carga à mão, e não existe "a porta" a que encostar.

⚠️ **Acima de metade do teto de massa a física vence**: as faixas caem, e a carga vai para a grade
ou para a profundidade — as duas equilibram no comprimento. Teto desconhecido **não** afirma peso.

### A grade (spec 113)

Com faixa por parada impossível — muitas paradas, ou peso —, a profundidade punha a entrega 2 atrás da
1 e a 3 atrás da 2: se a 1 ou a 2 dessem problema, tirava-se duas cargas para chegar à terceira. A
grade divide a largura em **K faixas** (K de `floor(largura ÷ faixa mínima)` até 2) e distribui as
paradas em rodízio: as K primeiras ficam **na porta, lado a lado**, e a parada K+1 fica atrás da 1,
na mesma faixa. Dentro de cada faixa valem todas as regras deste arquivo — a faixa é um baú mais
estreito, empacotado em profundidade.

⚠️ **A faixa é aparada à largura que as caixas ocupam** (`packedLaneWidthM`). Com 0,347 m de faixa e
caixa de 0,30 m, os 4,7 cm de folga deixavam a pilha sem parede de um lado, e a esbeltez a travava em
0,75 m num baú de 2,20 m. A folga continua no desenho, entre as faixas.

⚠️ **A grade só vale se colocar pelo menos o que a profundidade coloca** (`gridOrDepth`). O teste de
volume prometia grade que a varredura não entregava: numa Fiorino com duas paradas de uma caixa e uma
de trinta, a grade colocava 28 das 32 caixas. A decisão empacota os dois arranjos e compara — trocar
acesso por caixa fora do desenho é o defeito que a grade veio consertar. Medido: 18,6 ms com 24
paradas e 407 caixas, contra o orçamento de 50 ms.

⚠️ **A grade mais estreita que o volume admite não é a que coloca mais** (spec 115). O rodízio junta
uma parada grande e outra pequena na mesma faixa por acaso, e com seis faixas de uma caixa de largura
a mais cheia estourava. Medido no Accelo de 24 paradas: 494 de 500 caixas com seis faixas, 473 com
cinco, 456 com quatro — e **500 de 500 com três**. A decisão experimenta K decrescente e fica com a
maior que coloca tudo (nenhuma colocando, a que coloca mais; empate com a de mais faixas), e o
`laneCount` viaja na decisão até o empacotador — recalcular devolveria a grade que deixava caixa fora.

---

## Passo 2 — A alocação da faixa

Cada parada recebe **primeiro o mínimo** (caber a caixa mais larga), e só a sobra da largura é
repartida por volume.

⚠️ **Em faixas a fatia nasce do tamanho da alocação e não cresce por etapas.** O crescimento existe
para a fatia em profundidade, onde o que sobra vira vão na testeira. Em faixas o que sobra da largura
não vira vão útil — a faixa seguinte só começa antes —, e a carga desta paga a diferença **em
profundidade**, que é o eixo caro. Efeito de segunda ordem: a orientação da caixa é decidida contra a
largura da fatia, e crescer por etapas a decidia contra uma largura provisória.

---

## Passo 3 — A varredura dentro da faixa

**A faixa é a fatia com o baú girado 90°.** Empacota-se num baú de comprimento e largura trocados e
destroca-se `x ↔ y` ao devolver. `fitSlot` já testava as duas orientações de cada caixa, então girar é
fisicamente honesto — uma caixa girada em torno do eixo vertical é a mesma caixa.

Duas coisas que a rotação exige e não se deduzem de "trocar dois eixos":

- **A destroca é do par inteiro**, posição e encaixe. Trocar só `x` e `y` deixaria a caixa com a
  profundidade medida no eixo da largura, e ela atravessaria a parede sem nada falhar.
- **A profundidade real é espelhada.** No espaço girado a varredura quebra fileira a partir de
  `y' = 0`, que depois da destroca é a testeira: sem o espelho a carga nasceria encostada na parede
  do fundo.

### Sobe antes de andar para o fundo

A varredura enche fileiras e sobe de camada quando elas acabam. **Em profundidade a fileira corre
pela largura, que é de graça** — avançá-la não afasta ninguém da porta. **Em faixas ela corre pela
profundidade real**, e cada fileira nova empurra a carga um passo para dentro.

Medido: seis caixas de 0,30 m numa faixa de 0,40 m saíam **cinco deitadas no chão até 1,50 m da
porta** e uma só empilhada, num baú de 1,30 m que comporta quatro camadas. Hoje a fronteira das
fileiras só cresce **quando a altura acaba**.

### A caixa gira para render mais por fileira

A orientação é escolhida por **caixas por metro do eixo caro**: quantas entram numa fileira, dividido
pelo quanto essa fileira gasta de profundidade.

⚠️ **Não é "a menor dimensão".** A orientação mais estreita punha uma por fileira e gastava mais
fundo — o oposto do objetivo. Numa faixa de 0,60 m uma caixa de 0,40 × 0,30 deitada ia uma por
fileira; de pé, duas.

⚠️ Os dois arranjos usam eixos diferentes para a mesma coisa, e por isso o eixo caro é parâmetro: em
profundidade a varredura marcha em `x` e o caro é `depthM`; em faixas ela quebra fileira em `y`, e o
caro é `widthM`.

---

## Passo 4 — Até onde a pilha sobe

Uma pilha tomba quando a inclinação equivalente passa de `atan(base ÷ altura)`.

- **Coluna livre:** teto de `STABLE_STACK_SLENDERNESS = 3` vezes a menor dimensão da base — 18,4°, ou
  **0,33 g**, que cobre frenagem normal e curva forte.
- **Coluna confinada:** sem teto de esbeltez. Cercada de carga e parede ela não tem para onde girar.
- **Carga amarrada** (`fleet_drivers.secures_cargo`): sem teto de esbeltez. A cinta prende a pilha à
  carroceria, e o modo de falha passa a ser o esmagamento ou a própria cinta.

⚠️ **A porta não é parede.** As três paredes do baú seguram a carga; a porta se abre, e é nesse
instante que a pilha encostada nela cai — em cima de quem abriu. A face aberta muda com o arranjo:
em faixas as fileiras crescem da porta para dentro, em profundidade o bloco termina nela.

⚠️ **A trava é conferida na altura do assento, não no contador de camadas.** O contador é do cursor e
zera quando a fronteira avança; o mapa de apoio, não. Com a trava só no contador a carga voltou a
subir 1,20 m numa pilha limitada a 0,60 m. E a **carga dividida** tem busca própria e furava por
trás — medido, uma caixa a 0,90 m.

⚠️ **A alavanca conta de onde a contenção termina, não do piso** (spec 115). Tombar é girar em
torno da aresta onde a pilha deixa de ser segurada: se a vizinha a segura até 0,63 m, o que tomba é o
trecho acima disso, e é **esse** trecho que não passa de três vezes a base. A regra só conhecia os
dois extremos — livre desde o piso, ou presa na base da caixa —, e cada fileira podia subir **uma
caixa** acima da vizinha do lado da porta: a carga descia em escada por **2,9 m** de um baú de 5,32 m
(RTD-5J78) e 1,9 m de 4,20 m (RTC-4H67), com 49 e 52 caixas `bedFull` a 38% e 55%. Com a contenção
medida pela altura da vizinha, as duas entram inteiras. A porta continua não sendo parede: a fileira
encostada nela segue presa a três vezes a base contados do piso (`isStandingUp`).

⚠️ **Vão mais estreito que o giro da pilha é apoio** (spec 116). A pilha tomba girando em torno da
aresta de baixo; se a parede ou a carga do outro lado de um vão está mais perto do que o topo anda até
o centro de massa passar da aresta, ela encosta antes de cair. O trecho que tomba tem pelo menos três
vezes a base (senão a esbeltez nem é consultada), e para `h = 3b` o topo anda `3b/√10` — 0,95 da base.
Esse é o vão que ainda segura (`braceGapOf`), medido da face **real** da caixa: pela célula
arredondada a régua aceitava 27 cm de vão para uma base de 26,1 cm. Só a célula vizinha contava, e a
caixa presumida de 0,261 m deixa 7 cm até a parede lateral do Atego — a coluna da parede era solta, e
cada fileira subia em pirâmide, **8, 8, 8, 7, 7, 7, 6, 6, 6, 5** caixas por camada. Com a regra: 1089
→ **1282** caixas, e a porta segue não sendo parede — o caminho que chega à face aberta não apoia.

⚠️ **Recusar um assento é tentar o próximo da mesma fileira** (spec 115). A esbeltez, o comprimento e
a sombra (Passo 6) eram conferidos depois de `seat` devolver o **primeiro** lugar nivelado; recusado,
a fileira inteira era pulada com lugar bom mais adiante nela. Hoje as recusas entram em `seat` como
`accept`, e a corrida desliza uma célula.

⚠️ **A massa não entra, e é física, não simplificação.** Ela cancela nos dois lados da condição de
tombamento, e cancela também no deslizamento. O peso importaria pela **distribuição** (caixa pesada
em cima sobe o centro de massa) e pelo **esmagamento**, que é o que `max_stack_count` declara e
continua valendo por cima da esbeltez. Medido nesta base: `gross_weight_grams` existe em **4 de 663**
caixas.

⚠️ **2:1 foi medido e recusado:** a altura útil cai para menos da metade do baú, a carga deixa de
caber em faixas, o arranjo volta a profundidade e a última parada vai a 1,66 m — pior acesso que
antes da spec 100 inteira.

---

## Passo 5 — Onde o vão sobra

- **Em profundidade:** o bloco termina na porta, e o vão fica na testeira. Acima de metade do teto de
  massa ele é repartido nas duas pontas.
- **Em faixas:** a primeira faixa começa em zero — é a que precisa estar à mão —, e o vão sobra na
  lateral oposta.

---

## Passo 6 — A carga que não coube na própria fatia

⚠️ **As fatias somam no máximo o comprimento do baú, e a parada pequena vai para cima — não para o
lado.** A spec 113 pôs um piso na fatia (nunca mais curta que a caixa mais funda da parada) e o
reverteu no mesmo dia: cada parada pequena ganhava um trecho próprio do comprimento, e as fatias
passavam da testeira — medido, **9,5 m** de carga com 24 paradas e **33,9 m** com 85, num baú de
5,32 m, desenhada sobreposta e para fora. Parada cuja fatia é mais curta que a caixa dela manda a
caixa inteira para a divisão abaixo.

⚠️ **A busca da divisão não tem teto global.** Eram 40 tentativas **para o caminhão inteiro**:
esgotadas, toda sobra seguinte saía `tooMany`, e paradas inteiras sumiam como "limite de detalhe"
(medido na tela: 44 de 85 paradas num Atego). Hoje ela memoriza o formato que já falhou para aquela
parada — o mapa de alturas só cresce, então o lugar que não existia para uma caixa não existe para a
gêmea dela —, e o custo que o teto protegia continua protegido.

⚠️ **Spec 114: em profundidade não há mais fatia por parada — a carga é um bloco só.** Com dezenas de
paradas pequenas cada fatia isolada tinha uma ou duas caixas de fundo, toda pilha ficava livre e a
esbeltez a cortava em 0,75 m: medido, 38 de 85 paradas fora do desenho num baú 30% cheio. Hoje a
varredura é a das faixas — sobe até o teto antes de avançar —, com o baú girado e sem espelho: a
última entrega começa na testeira e cada entrega seguinte continua de onde a anterior parou, ao lado
ou **em cima** dela. O bloco é deslocado depois para terminar na porta (ou centralizado acima de
metade do teto de massa). Medido nas mesmas 85 paradas: 237 de 237 caixas, nenhuma parada fora, pilha
até 2,0 m, tudo dentro do baú.

⚠️ **A proibição da 095 foi reduzida ao que ela protegia.** Entrega mais cedo **pode** ficar em cima
de uma mais tardia — é assim que ela sai primeiro. O que continua proibido é o contrário: entrega mais
tardia em cima de uma mais cedo, ou entre ela e a porta. É isso que `delivery-block.contract.ts`
afirma, e é a mesma afirmação que substituiu "cada parada ocupa uma faixa própria".

⚠️ **Sem fatia não há carga dividida em profundidade**: o que não cabe no bloco não cabe no baú
(`bedFull`). A divisão abaixo continua valendo em faixas.

⚠️ **A fileira seguinte começa na próxima borda de carga, se ela vier antes do passo.** Andar sempre o
tamanho da caixa só testava múltiplos dela: uma peça de 3 m atrás de 3,2 m de carga era tentada em
3 m e em 6 m, e saía `bedFull` com 4,2 m livres. As bordas ficam numa lista ordenada com busca
binária — varrer as caixas colocadas a cada fileira recusada levava uma viagem de 300 notas a 100 ms,
contra 50 de orçamento.

- **Em profundidade:** sobe para a região das paradas entregues **depois**, mais fundo no baú, e sai
  marcada `splitCargo` (contorno vermelho). Ali nada fica por cima dela e o corredor já está livre
  quando a vez dela chega. O sentido contrário é proibido.
- **Em faixas:** fica presa **à própria faixa**, na parte mais longe da porta. Não existe "região das
  paradas posteriores": o mesmo movimento poria a sobra em cima da faixa de outra parada.

⚠️ **A caixa ocupa células inteiras do mapa de alturas, e a posição é sempre uma borda de célula**
(spec 114). Arredondar as duas pontas para a célula mais próxima carimbava a caixa de 0,26 m como
0,25 e deixava a vizinha sentar em 0,25 — as duas se cruzando. Medido numa carga real de 24 paradas
com caixas presumidas de 0,371 × 0,261 m: **383 pares de caixas atravessando uma a outra** (132 já
antes do bloco). Hoje a pegada conta a célula parcial como inteira — até 5 cm por caixa —, duas caixas
encostadas nunca dividem célula, e o topo de fileiras iguais fica plano: a mesma carga passou de 372
para 451 caixas desenhadas, de 1,47 m para 2,14 m de pilha e de 383 para **zero** cruzamentos.

⚠️ **O formato que acabou de falhar falha de novo enquanto nada entrar.** O mapa só muda quando uma
caixa é colocada; sem colocação nova não surge lugar novo, e a gêmea da caixa recusada varria o baú
inteiro para descobrir isso (3600 caixas iguais num baú cheio: 67 ms contra 50 de orçamento).

⚠️ **A entrega mais cedo não senta atrás de uma mais tardia mais alta que a base dela** (spec 115).
Subir para uma fileira do fundo é o bloco se enchendo, e é legítimo; mas com tamanhos misturados a
caixa da parada 9 sentava a 0,63 m atrás de uma da parada 10 cujo topo ia a 0,67 m — 4 cm de parede
entre ela e a porta. Medido: 1 par em RTC-4H67 e 1 em RTD-5J78. A cada troca de parada o relevo das
paradas já carregadas é congelado como "o maior topo daqui até a porta" (`freezeLater`), e o assento
recusa o lugar em que ele passa da base (`isShadowed`).

⚠️ **O teto é de desenho, nunca de empacotamento** (spec 115). `MAX_PLACED_BOXES` = 600 era o
orçamento da varredura, e a varredura vai da última entrega para a primeira: a 601ª caixa em diante
eram as primeiras entregas, e o bloco sem elas era deslocado até a porta — desenhando entregas
tardias onde as primeiras deviam estar. Medido no Atego de 85 paradas: 689 caixas `tooMany` e **46
paradas fora do desenho**. Hoje toda caixa é empacotada (6000 caixas em 40 ms) e só o desenho é aparado
em `MAX_DRAWN_BOXES` = 1500 — o redesenho custa ~0,064 ms por caixa (451 caixas em 29 ms ao girar a
vista). Acima do teto sai primeiro a caixa mais alta, nunca a que sustenta outra desenhada nem a
última de uma parada: tirar pela ordem apagava paradas, e tirar do meio deixava caixa no ar.

⚠️ **A célula de 5 cm foi medida contra 2,5, 2 e 1 cm, e fica** (spec 115). A menor arredonda menos a
caixa presumida, mas coloca menos: 500 → 362 caixas no Accelo e 982 → 765 no Atego, e a 1 cm o tempo
vai a 61 ms.

⚠️ **A busca de lugar vai até a porta** (spec 116). O teto de tentativas por caixa era 64 fileiras
para qualquer baú, e num baú de 7,40 m a varredura recomeça da testeira a cada fronteira nova e passa
por quase 150 fileiras de célula. A busca desistia antes de chegar ao lugar livre perto da porta, e a
memória de formato recusava as gêmeas sem procurar: medido no Atego de 85 paradas, **4** buscas
esgotadas derrubaram **431** caixas — nenhuma recusa era de baú cheio. Hoje o teto é
`SEAT_ATTEMPTS_PER_ROW` (4) vezes as fileiras de célula da fatia, e a busca termina sozinha antes
disso (camada varrida sem lugar ou fronteira no fim do baú).

⚠️ **Célula menor, de novo, não é o caminho** (spec 116). Com as duas correções desta spec a célula
passou a mudar o resultado do Atego de forma **caótica** — 1417 caixas com 2,5, 3,0 e 3,3 cm, 1076 com
3,1 e 1043 com 2,8 —, e o RTC-4H67 cai de 481 para 438 em três delas. Escolher célula por carga é
sobreajuste; ela fica em 5 cm, e o que o arredondamento custava era a pirâmide do Passo 4, não a área.

⚠️ **A caixa pequena vai para onde a caixa da carga não cabe** (spec 117). Uma caixa medida de 10 cm
entrava antes das presumidas da própria parada, sentava no meio da fileira e empurrava as seguintes
10 cm para o lado; a chaminé que sobrava tirava o apoio da fileira de trás e a pirâmide voltava no
meio do bloco (8, 8, 8, 8, 7, 7, 7, 6, 6, 2). Medido sobre a planta final do Atego: nenhuma regra
recusava lugar no meio — era topo não nivelado. Sintético nas mesmas 85 paradas: 1344 presumidas
sozinhas, **1093** com um cubo a cada cinco paradas. Hoje a caixa de pegada em células menor que a da
forma dominante procura primeiro um assento cuja folga até o teto seja menor que a altura da dominante
(`createDeadSpaceTracker`), com as mesmas regras de assento. Atego: 1282 → **1347** de 1417; cubos a
cada cinco: 1093 → 1300. Reordenar a medida pequena para depois das presumidas, apoiar a face por
qualquer contato e rebaixar o salto de borda a segunda passada foram medidos e recusados (pioram ou não
generalizam).

⚠️ **O que sobra no Atego é a escada da porta, e ela não se afrouxa.** Sobre a planta final, só
desligar a esbeltez colocaria mais caixa: 73, todas a menos de 1,3 m da porta. A fileira encostada
nela sobe 3 camadas, a seguinte 6, a terceira 9 — 7 + 4 + 1 camadas de 8 caixas = 96 lugares.
Contratos em `test/cargo-placement/dead-space.contract.ts`, incluindo o do teto de tentativas: com 64
fixas, 111 caixas fora de 1396 num baú de 7,40 m.

⚠️ **Limite do modelo, não da física:** com célula de 5 cm a caixa de 0,261 m ocupa 0,30 m e entram 8
na largura em vez de 9. Resolver pede empacotar em coordenada contínua, spec própria.

---

## A descarga, entrega por entrega (spec 118)

A planta tem de aguentar a **descarga**, não só o carregamento. `test/cargo-placement/unloading-simulation.ts`
tira a primeira entrega, depois a segunda, e confere duas coisas, em geometria real de 1 cm, independente
do mapa de 5 cm do empacotador:

- **Estabilidade:** no passo logo antes da entrega dela, toda caixa tem apoio em todas as faces (parede ou
  caixa presente dentro de `3b/√10`, trecho sem contato menor que uma célula tolerado), ou não passa de
  três vezes a base acima da contenção. A porta nunca apoia.
- **Acesso:** a entrega sai inteira por quem fica **de pé no piso** livre ligado à porta, num corredor de
  `ACCESS_CORRIDOR_M` = 0,6 m, alcançando `DELIVERY_REACH_M` = 0,6 m à frente do corpo — as duas
  constantes são declaradas, não medidas —, sempre a caixa sem nada em cima.

Medido em `f126792f`, nas quatro viagens de 2026-09-10: a grade deixava **116 de 252** caixas sem apoio
na Sprinter e **127 de 500** no Accelo (38 já com a carga cheia), com corredores de 0,1 a 0,3 m; a
profundidade aguentava, mas **490** caixas do Atego e 65 da Daily só saíam subindo na carga.

⚠️ **A borda da faixa não é parede.** Na grade e nas faixas da spec 100 a faixa era empacotada como um baú
à parte, e a vizinha — que sai antes — segurava a pilha. Hoje a borda que encosta em outra faixa é face
aberta (`OpenSides`), e nenhuma faixa da grade é mais estreita que o corredor. A grade continua existindo
e continua precisando colocar o que a profundidade coloca: nas quatro viagens ela não vence mais
(Sprinter 164 contra 252, Accelo 395 contra 500).

⚠️ **Em profundidade a estabilidade da descarga vem de graça**: cada caixa é conferida quando só existem as
entregas iguais ou posteriores, e as anteriores só tiram apoio depois. O que faltava era **alcance**: a
entrega mais cedo subia no degrau das posteriores, lá no alto e no fundo. Hoje a caixa só senta com a face
a no máximo 0,6 m da frente do piso das entregas posteriores, medida no trecho de 0,6 m de largura mais
raso que encosta nela (`isOutOfReach`) — num bolso estreito a pessoa para na boca dele.

⚠️ **O rendimento da orientação é contado em células.** Pela medida real a presumida ia com 0,371 m ao longo
do comprimento no Atego; em células as duas orientações dão 20 caixas por metro, e a fileira de 0,30 m põe
o terceiro degrau da porta a 0,60 m — ao alcance. Sem isso: 1008 caixas; com isso: 1190.

É a construção por paredes (George & Robinson, 1980): o bloco enche a largura, sobe e só então avança, e os
formatos de seção — parede inteira, meia largura, meia altura com a mais cedo em cima — saem da varredura.

⚠️ **O custo, dito:** a Daily cai de 481 para 441 caixas (paradas 1–3 fora) e o Atego de 1347 para 1190
(paradas 1, 3–5 e 7–16 fora); Sprinter e Accelo entram inteiras. É a décima camada, que fica a 0,90 m da
frente e só a entrega ao alcance enche. Com a carga amarrada o Atego vai a 1412 de 1417 com as mesmas
regras de acesso. Recusados, com número: alcance de 0,75 m (1089) e 0,9 m (1096, e o acesso piora);
preferir a orientação cujo degrau inteiro cabe na mão (+13 caixas na Daily, e 23 e 30 caixas sem apoio na
Sprinter e no Accelo); adiar o cubo sem espaço morto (conserta uma densidade e estoura outra).

---

## Passo 7 — A planta explica as próprias decisões

`layoutNotes` publica o que moldou **aquela** carga, e a tela imprime como frases sob o título
"Por que o desenho ficou assim".

| chave               | o que diz                                       |
| ------------------- | ----------------------------------------------- |
| `heightBeforeDepth` | dentro da faixa a carga sobe antes de avançar   |
| `stackStability`    | a pilha da borda solta parou na esbeltez        |
| `stackConfined`     | no meio do bloco ela subiu mais, porque cercada |
| `stackSecured`      | o motorista amarra, e ela sobe até o teto       |
| `doorIsNotAWall`    | a face da porta não conta como apoio            |

⚠️ **Só entra o que moldou esta carga.** Nota que valeria para toda viagem é ruído, e ruído fixo
deixa de ser lido na terceira vez — por isso a estabilidade só é dita quando alguma pilha de fato
parou nela, e o confinamento só quando alguma de fato passou dela.

⚠️ A planta é uma **instrução**, e instrução sem motivo não se confere: sem essas frases a única
leitura possível é "o sistema decidiu", e aí ou se obedece sem entender, ou se ignora.

## A nota de cada caixa (spec 119)

`PlacedBox` carrega `documentId` e `documentNumber` — a nota de onde a caixa veio, carimbada por
`stampCargoNote` onde as caixas viram da parada. `null` é "não se sabe", nunca uma nota inventada.

⚠️ **A nota é carona, nunca critério.** Nenhuma comparação, chave de formato (`shapeKey`) ou
ordenação do empacotador lê os dois campos; ele só os copia para a caixa colocada. Conferido nas
quatro viagens reais de 2026-09-10: coordenadas idênticas com e sem nota
(`test/cargo-placement/note-identity.contract.ts` confere o mesmo nas duas cargas do fixture).

A tela usa a nota para dar um **tom por nota dentro da cor da parada** e para acender só as caixas
de uma nota. A marca de presumida é o contorno pontilhado — não mais a lavagem, que clareava
justamente o que agora distingue a nota.

---

## O resultado, na viagem real que gerou a spec 100

`RTF7L01` (Fiorino furgão, 1,70 × 1,45 × 1,30 m), três paradas, 31 caixas:

| parada | notas |            antes |     depois |
| -----: | ----: | ---------------: | ---------: |
|      1 |     6 | 1,107 m da porta | **0,60 m** |
|      2 |     8 | 1,222 m da porta | **0,90 m** |
|      3 |    17 | 1,375 m da porta | **1,20 m** |

Paradas alcançáveis pela porta: **0 de 3 → 3 de 3**. Desempenho: **~25 ms** para 3600 caixas em 12
paradas, contra o orçamento de 50 ms.

---

## Lição de método, que custou duas correções

**Contrato sintético confirma a implementação; só rodar com números confere a premissa.**

Dois defeitos passaram por contratos que estavam verdes — e estavam verdes porque descreviam
fielmente o que o código fazia. Um deles (_"a parada dominante estreita as vizinhas"_) afirmava o
defeito com todas as letras. O primeiro foi achado pela evidência da spec; o segundo, pela revisão de
código. Nenhum dos dois teria aparecido escrevendo mais contratos.

---

## Onde mexer

| o quê                                                                   | onde                                                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| arranjo, alocação, varredura, orientação, esbeltez, confinamento, sobra | `trips/domain/cargo-placement.policy.ts`                                                       |
| fatia publicada, `distanceFromDoorM`, `orderIsBinding`, `layoutNotes`   | `trips/domain/cargo-layout.policy.ts`                                                          |
| camadas por faixa                                                       | `trips/domain/cargo-plan.policy.ts`                                                            |
| o desenho e as frases                                                   | `frontend/src/modules/trip/components/TripCargoLayers.component.tsx`                           |
| contratos                                                               | `api/test/cargo-placement/*.ts`, `api/test/cargo-volume/*.ts`, `frontend/test/trip/cargo-*.ts` |

# Por que o empacotador é assim — os defeitos medidos

Irmão de [`cargo-placement.md`](./cargo-placement.md), que descreve **o que** o algoritmo faz. Aqui
está **por que** cada regra é como é: o defeito que a produziu, com o número que a medição deu, e o
que foi tentado e recusado.

Ele existe porque várias dessas regras já foram desfeitas por engano — todas parecem arbitrárias de
fora, e o custo de refazer a medição é uma rodada inteira. Quem for mexer no empacotador lê este
arquivo antes.

As viagens que aparecem como referência são as quatro reais de 2026-09-10: **Daily** (RTC-4H67),
**Sprinter** (RTE-6K89), **Atego** (RTA-2F45, 85 entregas) e **Accelo** (RTD-5J78).

---

## Passo 1 — O arranjo

**Caber em largura não é caber** (spec 100). Sem o teste de volume, duas entregas de uma caixa cada
seguravam 0,60 m de um baú de 1,45 m e estrangulavam a entrega dominante: **15 de 57 caixas**
descartadas como `bedFull` num baú **64% cheio**, e as mesmas 57 cabiam em profundidade.

**A faixa não é proporcional ao volume.** Ela vai do chão ao teto e da porta à testeira; o que a
entrega exige da largura é caber a caixa mais larga dela. Medir por fatia proporcional fazia a feature
**não disparar na viagem que a motivou**: a entrega menor levava 19% do volume, ganhava 0,28 m e tinha
caixa de 0,30 m.

**Sem exceção silenciosa.** Metade da carga em faixas e metade em profundidade produz um desenho que
ninguém consegue seguir — e o operador seguiria mesmo assim.

**A grade nasceu porque a profundidade enfileira o acesso** (spec 113): ela punha a entrega 2 atrás da
1 e a 3 atrás da 2 — se a 1 ou a 2 dessem problema, tirava-se duas cargas para chegar à terceira.

**A faixa da grade é aparada à largura que as caixas ocupam** (`packedLaneWidthM`). Com 0,347 m de
faixa e caixa de 0,30 m, os 4,7 cm de folga deixavam a pilha sem parede de um lado, e a esbeltez a
travava em 0,75 m num baú de 2,20 m.

**A grade só vale se colocar pelo menos o que a profundidade coloca** (`gridOrDepth`). O teste de
volume prometia grade que a varredura não entregava: numa Fiorino com duas entregas de uma caixa e uma
de trinta, a grade colocava 28 das 32.

**A grade mais estreita que o volume admite não é a que coloca mais** (spec 115). O rodízio junta uma
entrega grande e outra pequena na mesma faixa por acaso, e com seis faixas de uma caixa de largura a
mais cheia estourava. Medido no Accelo de 24 entregas: 494 de 500 caixas com seis faixas, 473 com
cinco, 456 com quatro — e **500 de 500 com três**. Por isso o `laneCount` viaja na decisão; recalcular
devolve a maior grade, que é a que deixava caixa fora.

---

## Passo 2 — A fatia

**Em faixas a fatia não cresce por etapas.** O crescimento existe para a fatia em profundidade, onde o
que sobra vira vão na testeira. Em faixas o que sobra da largura não vira vão útil — a faixa seguinte
só começa antes —, e a carga desta paga a diferença **em profundidade**, que é o eixo caro. Efeito de
segunda ordem: a orientação da caixa é decidida contra a largura da fatia, e crescer por etapas a
decidia contra uma largura provisória.

**As fatias somam no máximo o comprimento do baú, e a entrega pequena vai para cima — não para o
lado** (spec 113). Um piso por fatia ("nunca mais curta que a caixa mais funda da entrega") foi
publicado e revertido no mesmo dia: cada entrega pequena ganhava um trecho próprio do comprimento, e as
fatias passavam da testeira — medido, **9,5 m** de carga com 24 entregas e **33,9 m** com 85, num baú
de 5,32 m, desenhada sobreposta e para fora.

**A fatia proporcional não encostava na porta** (spec 099). Ela era proporcional ao **baú inteiro**, e
a varredura em fileiras só quebra para a fileira ao lado quando o `x` estoura o fim da fatia: com fatia
de 2,5 m e caixa de 30 cm ela nunca quebrava. Medido na tela com 30 caixas em três entregas num baú de
7,4 m: uma fileira rasteira de **7,40 m** que cabia em **0,90 m** encostada na porta.

**Dimensionar a fatia e empacotar são a mesma passagem** (spec 099): pacotes de teste descartados
custavam 64 ms contra o teto de 50 ms; hoje são 9,7 ms com 3600 caixas.

---

## Passo 3 — A varredura

**Em profundidade não há mais fatia por entrega — a carga é um bloco só** (spec 114). Com dezenas de
entregas pequenas, cada fatia isolada tinha uma ou duas caixas de fundo, toda pilha ficava livre e a
esbeltez a cortava em 0,75 m: medido, **38 de 85 entregas fora do desenho** num baú 30% cheio. Depois
da correção: 237 de 237 caixas, nenhuma entrega fora, pilha até 2,0 m, tudo dentro do baú.

**A proibição da 095 foi reduzida ao que ela protegia.** Entrega mais cedo **pode** ficar em cima de
uma mais tardia — é assim que ela sai primeiro. O que continua proibido é o contrário: entrega mais
tardia em cima de uma mais cedo, ou entre ela e a porta. É isso que `delivery-block.contract.ts`
afirma, e é a mesma afirmação que substituiu "cada entrega ocupa uma faixa própria".

**Subir antes de andar para o fundo** (spec 100): seis caixas de 0,30 m numa faixa de 0,40 m saíam
**cinco deitadas no chão até 1,50 m da porta** e uma só empilhada, num baú de 1,30 m que comporta
quatro camadas.

**A orientação não é "a menor dimensão".** A mais estreita punha uma caixa por fileira e gastava mais
fundo — o oposto do objetivo. Numa faixa de 0,60 m uma caixa de 0,40 × 0,30 deitada ia uma por fileira;
de pé, duas.

**O rendimento da orientação é contado em células** (spec 118). Pela medida real a presumida ia com
0,371 m ao longo do comprimento no Atego; em células as duas orientações dão 20 caixas por metro, e a
fileira de 0,30 m põe o terceiro degrau da porta a 0,60 m — ao alcance. Sem isso: 1008 caixas; com
isso: 1190.

**A fileira seguinte começa na próxima borda de carga, se ela vier antes do passo.** Andar sempre o
tamanho da caixa só testava múltiplos dela: uma peça de 3 m atrás de 3,2 m de carga era tentada em 3 m
e em 6 m, e saía `bedFull` com 4,2 m livres. As bordas ficam numa lista ordenada com busca binária —
varrer as caixas colocadas a cada fileira recusada levava uma viagem de 300 notas a 100 ms.

**A caixa ocupa células inteiras, e a posição é sempre uma borda de célula** (spec 114). Arredondar as
duas pontas para a célula mais próxima carimbava a caixa de 0,26 m como 0,25 e deixava a vizinha sentar
em 0,25 — as duas se cruzando. Medido numa carga real de 24 entregas com caixas presumidas de
0,371 × 0,261 m: **383 pares de caixas atravessando uma a outra**. Depois: de 372 para 451 caixas
desenhadas, de 1,47 m para 2,14 m de pilha, e de 383 para **zero** cruzamentos.

**A conversão para célula leva folga nas duas pontas.** `0.6 / 0.05` dá `11.999999999999998`, e sem a
folga duas caixas encostadas dividem uma célula, cada uma pousa sobre a anterior e a fileira sobe em
**escada** até o teto — defeito pior que o que a regra veio consertar.

**A caixa pousa no que está embaixo dela, e isso é absoluto** (spec 099). O `z` vinha de
`layerBottomM`, o topo da **camada inteira** — caixa baixa sobre caixa baixa era erguida até o topo da
caixa **alta** vizinha (medido: 2 de 12 flutuando 0,6 m).

**Sem balanço: a caixa só senta onde o apoio é plano sob a pegada inteira** — nível, não fração de base
apoiada, porque todo percentual aqui seria inventado (ninguém mediu a massa dentro da caixa). Resolve
balanço e vão de uma vez.

**Recusar posição significa tentar a próxima** (spec 115). A versão que mandava para `splitCargo` sem
avançar o cursor fazia toda caixa seguinte recusar no mesmo ponto e a carga voltava a se espalhar. E a
esbeltez, o comprimento e a sombra eram conferidos **depois** de `seat` devolver o primeiro lugar
nivelado; recusado, a fileira inteira era pulada com lugar bom mais adiante nela.

**O laço desiste**: camada varrida inteira sem lugar encerra a busca, senão o cursor sobe de camada sem
fim (o limite de pilha é infinito para caixa empilhável) — medido, 58 buscas por caixa.

**A busca de lugar vai até a porta** (spec 116). O teto de tentativas por caixa era 64 fileiras para
qualquer baú, e num baú de 7,40 m a varredura recomeça da testeira a cada fronteira nova e passa por
quase 150 fileiras de célula. A busca desistia antes de chegar ao lugar livre perto da porta, e a
memória de formato recusava as gêmeas sem procurar: medido no Atego de 85 entregas, **4** buscas
esgotadas derrubaram **431** caixas — nenhuma recusa era de baú cheio. Com 64 fixas: 111 caixas fora de
1396 num baú de 7,40 m.

**O formato que acabou de falhar falha de novo enquanto nada entrar.** Sem a memória, a gêmea da caixa
recusada varria o baú inteiro para descobrir isso: 3600 caixas iguais num baú cheio, 67 ms contra 50 de
orçamento.

**A entrega mais cedo não senta atrás de uma mais tardia mais alta que a base dela** (spec 115). Com
tamanhos misturados a caixa da entrega 9 sentava a 0,63 m atrás de uma da entrega 10 cujo topo ia a
0,67 m — 4 cm de parede entre ela e a porta. Medido: 1 par na Daily e 1 no Accelo.

**A caixa pequena vai para onde a caixa da carga não cabe** (spec 117). Uma caixa medida de 10 cm
entrava antes das presumidas da própria entrega, sentava no meio da fileira e empurrava as seguintes
10 cm para o lado; a chaminé que sobrava tirava o apoio da fileira de trás e a pirâmide voltava no meio
do bloco (8, 8, 8, 8, 7, 7, 7, 6, 6, 2). Sintético nas mesmas 85 entregas: 1344 presumidas sozinhas,
**1093** com um cubo a cada cinco entregas. Depois — Atego: 1282 → **1347** de 1417; cubos a cada
cinco: 1093 → 1300.

**O espaço morto nunca está ao alcance, e o limite tinha sido afrouxado em vez de consertado** (spec
130). Com a mão da 118 o cubo voltou a custar 185 presumidas (um a cada cinco entregas, contra 170 de uma
coluna por cubo), e a 120 subiu o limite para 187. Medido: dos 17 cubos, 11 procuraram espaço morto e
**4100 assentos** da faixa foram recusados — **todos** pela mão, nenhum pela sombra nem pela esbeltez; o
cubo sentava no primeiro lugar nivelado da fileira e as perdas caíam nas entregas 12–23 (`bedFull`).
Tentado, com o custo por densidade (a cada 3 / 5 / 10 entregas, mapa recomendado):

| variante                                                  | custo                       | resultado                                           |
| --------------------------------------------------------- | --------------------------- | --------------------------------------------------- |
| antes                                                     | 217 / 185 / 79              | —                                                   |
| adiar a pequena para depois das grandes da entrega        | 267 / 165 / 109             | recusado sozinho (a de dez estoura 80, como na 118) |
| espaço morto fora da mão vira complemento na hora         | 194 / 20 / 14 (recomendado) | recusado: afrouxa a mão da 118 para 13–14 cubos     |
| assento ao alcance mais alto                              | 114 / 114 / 61              | bom, mas ainda ~6,7 por cubo                        |
| mais alto, empate pelo mais perto da porta ou pela parede | 217 / 185 / 79              | idêntico a antes                                    |
| **adiar + assento mais alto**                             | **100 / 53 / 46**           | **adotado**                                         |

A primeira versão adotada deixou **uma caixa sem apoio** na simulação da descarga: o cubo da última
entrega subia no topo da própria pilha, a 0,63 m, escorado só na testeira — e o bloco é deslocado depois
de empacotado, deixando ali um vão de 0,119 m, mais largo que o giro de uma pilha de base 10 cm (9,5 cm).
A busca do mais alto passou a não contar a testeira como parede para a caixa que precisa de escora.
Nas viagens reais: Atego 1190 → **1239** recomendadas (1269 → 1332 com o complemento, `bedFull` 148 → 85),
Daily 443 → 445, Sprinter e Accelo iguais; nenhuma invariante quebrada; Atego 28,7 → 32,5 ms.

### A célula de 5 cm, medida duas vezes e mantida

**Contra 2,5, 2 e 1 cm** (spec 115): a menor arredonda menos a caixa presumida, mas **coloca menos** —
500 → 362 caixas no Accelo e 982 → 765 no Atego, e a 1 cm o tempo vai a 61 ms.

**Célula menor, de novo, não é o caminho** (spec 116). Com as duas correções daquela spec a célula
passou a mudar o resultado do Atego de forma **caótica** — 1417 caixas com 2,5, 3,0 e 3,3 cm, 1076 com
3,1 e 1043 com 2,8 —, e a Daily cai de 481 para 438 em três delas. Escolher célula por carga é
sobreajuste; o que o arredondamento custava era a pirâmide do Passo 4, não a área.

⚠️ **Limite do modelo, não da física**: com célula de 5 cm a caixa de 0,261 m ocupa 0,30 m e entram 8 na
largura em vez de 9. Resolver pede empacotar em coordenada contínua, spec própria.

---

## Passo 4 — A esbeltez

**A alavanca conta de onde a contenção termina, não do piso** (spec 115). A regra só conhecia os dois
extremos — livre desde o piso, ou presa na base da caixa —, e cada fileira podia subir **uma caixa**
acima da vizinha do lado da porta: a carga descia em escada por **2,9 m** de um baú de 5,32 m (Accelo)
e 1,9 m de 4,20 m (Daily), com 49 e 52 caixas `bedFull` a 38% e 55% de ocupação. Com a contenção medida
pela altura da vizinha, as duas entram inteiras.

**Vão mais estreito que o giro da pilha é apoio** (spec 116). Medido da célula arredondada, a régua
aceitava 27 cm de vão para uma base de 26,1 cm — por isso ela mede da face **real**. Só a célula
vizinha contava, e a caixa presumida de 0,261 m deixa 7 cm até a parede lateral do Atego: a coluna da
parede era solta, e cada fileira subia em pirâmide, **8, 8, 8, 7, 7, 7, 6, 6, 6, 5** caixas por camada.
Com a regra: 1089 → **1282** caixas.

**A trava é conferida na altura do assento, não no contador de camadas.** O contador é do cursor e zera
quando a fronteira avança; o mapa de apoio, não. Com a trava só no contador a carga voltou a subir
1,20 m numa pilha limitada a 0,60 m. E a **carga dividida** tem busca própria e furava por trás —
medido, uma caixa a 0,90 m.

**2:1 foi medido e recusado**: a altura útil cai para menos da metade do baú, a carga deixa de caber em
faixas, o arranjo volta a profundidade e a última entrega vai a 1,66 m — pior acesso que antes da spec
100 inteira.

**A massa não entra, e é física, não simplificação.** Ela cancela nos dois lados da condição de
tombamento, e cancela também no deslizamento. O peso importaria pela **distribuição** (caixa pesada em
cima sobe o centro de massa) e pelo **esmagamento**, que é o que `max_stack_count` declara. Medido
nesta base: `gross_weight_grams` existe em **4 de 663** caixas.

**A porta não é parede, e a borda da faixa também não** (spec 118). Na grade e nas faixas da spec 100 a
faixa era empacotada como um baú à parte, e a vizinha — que sai antes — segurava a pilha: **116 de 252**
caixas sem apoio na Sprinter e **127 de 500** no Accelo (38 já com a carga cheia), com corredores de 0,1
a 0,3 m.

---

## Passo 5 — O vão e o peso

**Acima de metade do teto de massa o bloco vai para o meio.** Degrau e não rampa, porque o operador
precisa **prever** o desenho — posição que desliza a cada caixa não se confere contra nada.
`payloadRatio` nulo é ausência de denominador e **não equilibra**: mover carga por palpite seria a
invenção que a ausência do teto deveria impedir.

**O deslocamento soltava a escora da testeira** (spec 134, revê a 099 D2). O bloco é empacotado com a
testeira contando como parede e deslocado depois; a fileira do fundo ficava a 0,315 m (Sprinter) e
0,474 m (Accelo) dela, contra giro de 0,248 m — **15 + 15 caixas sem apoio** nas viagens reais, 24 de 32
variações com 6 a 36. Hoje o deslocamento para na folga que mantém a escora, com 1 cm de sobra, e a carga
fica encostada na cabeceira: 0 sem apoio em todas, com as mesmas caixas desenhadas. **Recusado, com
número:** reempacotar com a testeira à distância do deslocamento — criou degrau na porta do Accelo, 14
caixas expostas até 1,26 m, porque a contenção da 115 conta como escora a célula da caixa embaixo da
própria pilha (a fraqueza que a spec 135 trata).

**Por onde o veículo abre decide se existe porta a que encostar** (spec 099). `loadingAccess` existia na
ficha e no layout, e o empacotador não o lia: hoje `open` equilibra sempre, sem olhar o peso — quem abre
o comprimento inteiro já tem toda a carga à mão. A **fatia** por entrega continua valendo nos três: a
095 a fez proibição, não preferência.

---

## Passo 8 — A descarga, e o custo dela

Medido em `f126792f`, nas quatro viagens: a **grade** deixava 116 de 252 caixas sem apoio na Sprinter e
127 de 500 no Accelo; a **profundidade** aguentava, mas **490** caixas do Atego e 65 da Daily só saíam
subindo na carga.

**Em profundidade a estabilidade da descarga vem de graça**: cada caixa é conferida quando só existem as
entregas iguais ou posteriores, e as anteriores só tiram apoio depois. O que faltava era **alcance** — a
entrega mais cedo subia no degrau das posteriores, lá no alto e no fundo. Num bolso estreito a pessoa
para na boca dele, e é por isso que o alcance é medido no trecho de 0,6 m mais raso que encosta na caixa.

**O custo, dito** (spec 118): a Daily cai de 481 para 441 caixas (entregas 1–3 fora) e o Atego de 1347
para 1190 (entregas 1, 3–5 e 7–16 fora); Sprinter e Accelo entram inteiras. É a décima camada, que fica
a 0,90 m da frente e só a entrega ao alcance enche. Com a carga amarrada o Atego vai a 1412 de 1417 com
as mesmas regras de acesso. A grade **não vence mais** nas quatro viagens (Sprinter 164 contra 252,
Accelo 395 contra 500).

**Recusados, com número:** alcance de 0,75 m (1089 caixas) e de 0,9 m (1096, e o acesso piora); preferir
a orientação cujo degrau inteiro cabe na mão (+13 caixas na Daily, e 23 e 30 caixas sem apoio na Sprinter
e no Accelo); adiar o cubo sem espaço morto (conserta uma densidade e estoura outra).

**O juiz se escorava na própria caixa** (spec 133). A simulação carimbava a caixa pelo centro da
célula de 1 cm e sondava a primeira vez a 0,5 mm da face: com a face depois do centro da célula, a sonda
caía na célula da própria caixa. Em `85cbb5fc` ela dizia zero caixas sem apoio; pelas bordas reais são
**15 na Sprinter e 15 no Accelo** — a fileira do fundo, que o deslocamento para a porta afasta da
testeira (0,315 e 0,474 m, contra giro de 0,248 m). Nas 32 variações da carga, 24 têm de 6 a 36 caixas
soltas, e 10 delas o juiz antigo dava como zero conforme o milímetro da face. Uma conferência "exata
face a face" acusava mais (Atego 84, Accelo 156) e foi **recusada**, com caso: ela exigia que uma caixa
sozinha atravessasse a altura da contenção (a vizinha na mesma camada, sentada na pilha dela, não
contava) e ignorava a vizinha que começa antes da face (camada de baixo deslocada 5 cm). Relaxadas as
duas exigências, ela devolve exatamente o conjunto do juiz corrigido. As violações ficaram registradas
por placa em `known-unsupported.ts`, com o contrato cobrando não piorar, até a spec 134 zerá-las e apagar
o arquivo.

**O que sobra no Atego é a escada da porta, e ela não se afrouxa.** Sobre a planta final, só desligar a
esbeltez colocaria mais caixa: 73, todas a menos de 1,3 m da porta. A fileira encostada nela sobe 3
camadas, a seguinte 6, a terceira 9 — 7 + 4 + 1 camadas de 8 caixas = 96 lugares.

---

## O complemento (spec 120)

**O alcance é tentado na hora; a ordem, no fim.** Tentar o alcance no fim não funciona e foi medido: no
fim as entregas anteriores já estão no baú e a caixa não pode se apoiar nelas — das 227 caixas que
sobravam no Atego só 78 achavam lugar; na hora, 53 entram por alcance e as demais pela ordem.

**O que fica fora não cabe de pé.** Medido: Daily 481 de 481, Sprinter 252, Accelo 500, Atego 1269 de
1417 (1190 recomendadas + 79 do complemento). As 148 do Atego só entram desligando a esbeltez no
complemento — 1388 caixas com **74 sem apoio**. Os 1347 de antes da 118 eram outra arrumação inteira,
com as entregas mais cedo empilhadas fora da mão; o complemento não desfaz o mapa recomendado para
recuperá-la.

**Agrupar por nota na ordenação do recomendado foi medido e recusado**: tira caixa do recomendado
(Atego 1190 → 1185 com nota por bloco, 1162 com nota por linha) para ganhar quatro pedaços. As caixas de
uma nota já chegam contíguas, e a ordenação é estável.

**A tolerância do pedaço é a célula** porque a caixa ocupa células inteiras: duas presumidas de 0,261 m
encostadas ficam a 3,9 cm no desenho.

---

## O teto de desenho (spec 115)

`MAX_PLACED_BOXES` = 600 era o orçamento da **varredura**, e a varredura vai da última entrega para a
primeira: a 601ª caixa em diante eram as primeiras entregas, e o bloco sem elas era deslocado até a
porta — desenhando entregas tardias onde as primeiras deviam estar. Medido no Atego: 689 caixas `tooMany`
e **46 entregas fora do desenho**.

Hoje toda caixa é empacotada (6000 em 40 ms) e só o desenho é aparado em `MAX_DRAWN_BOXES` = 1500 — o
redesenho custa ~0,064 ms por caixa (451 caixas em 29 ms ao girar a vista). Acima do teto sai primeiro a
caixa mais alta, **nunca** a que sustenta outra desenhada nem a última de uma entrega: tirar pela ordem
apagava entregas, e tirar do meio deixava caixa no ar.

**Spec 131: o teto de desenho também saiu.** Decisão do usuário: carga no baú não some do desenho. Medido
no navegador com o componente real, redesenho ao girar a vista (mediana / pico): 1500 caixas 25 / 44 ms,
3000 caixas 41,7 / 51,9 ms, 6000 caixas **100 / 131 ms** — acima do orçamento. As duas causas eram do
desenho: o comparador do pintor refazia a trigonometria de duas caixas a cada comparação, e cada face
vertical carregava um `filter: brightness`, pintado polígono a polígono. Com a projeção uma vez por
ângulo e o tom calculado, 6000 caixas giram em 69,5 / 91,7 ms.

---

## A cor do desenho

**A nota é carona, nunca critério** (spec 119). `PlacedBox` carrega `documentId` e `documentNumber`,
carimbados por `stampCargoNote` onde as caixas viram da entrega; `null` é "não se sabe", nunca uma nota
inventada. Conferido nas quatro viagens reais: **coordenadas idênticas com e sem nota**
(`test/cargo-placement/note-identity.contract.ts`).

**O tom dentro da cor da parada não distinguia o bastante, e virou cor própria** (spec 121). A 119 dava
à nota um tom da cor da entrega, com uma trava que só oferecia o tom se ele ficasse mais perto da cor
própria do que da de qualquer outra entrega desenhada — e a paleta de entregas é densa em CIELab: a
partir de ~8 entregas quase nenhum tom passava, e as notas de uma entrega repetiam tom. Medido nas
quatro viagens, com as notas reais: 6 notas do Atego sem cor própria em 94, e com 5 notas por entrega
**52 de 120** repetindo na Sprinter. Hoje a nota tem cor própria de uma lista de 128, e **zero** notas
repetem em qualquer das quatro viagens reais.

**A cor de nota não pode ser a cor de uma entrega** (spec 121). `TripAssemblyMap` e `TripCargoPanel`
ficam na mesma tela na proposta e no diálogo de criação, e gerar a paleta da nota só contra o
`MAP_SURFACE` devolvia **exatamente** a sequência de `stopColorOf` — a caixa saía na cor do disco ao
lado. Semear a geração com as 96 primeiras cores de entrega custa separação, e a grade de candidatos foi
adensada para pagar: 2° de matiz e cinco saturações contra 4° e três. Medido com 128 cores: sem semear,
ΔE 9,28 entre notas e **identidade** com as entregas; semeando na grade antiga, **6,61** — abaixo dos
6,2 que a 119 mediu como "a mesma cor"; com a grade densa, **8,09**, e ΔE 8,21 até a cor de entrega mais
próxima.

**A presumida deixou de ser a lavagem clara** (spec 119) e virou o contorno pontilhado: o preenchimento
agora é da nota, e a lavagem brigaria com ele. Nunca hachura — o risco diagonal cruza a face e lê como
rachadura na quina.

**A entrega perdeu o disco de cor na ficha** (spec 121). Com a carga pintada pela nota, um disco com a
cor da entrega afirmaria uma cor que o baú não tem em lugar nenhum. Ela é identificada pelo número da
entrega, pela lista das notas dela — que passou a ser desenhada **também para a entrega de uma nota só**,
ao contrário da 119: é o único lugar em que a cor desenhada é nomeada, e escondê-la deixava a maioria das
entregas reais com carga colorida e ficha sem cor.

---

## Lição de método, que custou duas correções

**Contrato sintético confirma a implementação; só rodar com números confere a premissa.**

Dois defeitos passaram por contratos que estavam verdes — e estavam verdes porque descreviam fielmente o
que o código fazia. Um deles (_"a entrega dominante estreita as vizinhas"_) afirmava o defeito com todas
as letras. O primeiro foi achado pela evidência da spec; o segundo, pela revisão de código. Nenhum dos
dois teria aparecido escrevendo mais contratos.

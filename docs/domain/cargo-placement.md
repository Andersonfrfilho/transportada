# Como as caixas são organizadas no baú

Referência viva do empacotador de carga — **o que o algoritmo faz hoje**, de ponta a ponta, para quem
nunca abriu o código. Ele decide em que lugar do baú cada caixa de cada nota de cada entrega fica, e
publica um desenho em escala que o operador confere com fita na mão.

| arquivo                                                                                | o que tem lá                                                                                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **este**                                                                               | o algoritmo como ele está, sem histórico                                                                     |
| [`cargo-placement-defects.md`](./cargo-placement-defects.md)                           | **por que cada regra é assim** — o defeito medido que a produziu, com o número ao lado, e o que foi recusado |
| `apps/api-transportada/src/trips/domain/cargo-placement.policy.ts`                     | o empacotador: arranjo, fatia, varredura, assento, sobra, complemento                                        |
| `apps/api-transportada/src/trips/domain/cargo-layout.policy.ts`                        | o que é publicado: fatias em metro, `distanceFromDoorM`, `layoutNotes`                                       |
| `apps/api-transportada/src/trips/domain/cargo-plan.policy.ts`                          | camadas por faixa                                                                                            |
| `apps/frontend-transportada/src/modules/trip/components/TripCargoLayers.component.tsx` | o desenho, a ficha de cada entrega e as frases                                                               |
| `apps/frontend-transportada/src/modules/trip/shared/noteColor.service.ts`              | a cor de cada nota no desenho (spec 121)                                                                     |

Specs de origem: 076, 085, 088, 094, 095, 098, 099, 100, 113, 114, 115, 116, 117, 118, 119, 120, 121.

---

## 1. O que o desenho promete, e o que ele não promete

Ele diz **"cabe, e nesta ordem"**. Ele **não** diz "deve ir assim".

Não confere carga por eixo (`axleNotChecked` sai em toda caixa), não conhece a empilhabilidade de
toda caixa nem o peso de cada uma, e trabalha em boa parte com caixa **presumida**. A tela repete
isso numa linha fixa, e o painel "Por que o desenho ficou assim" explica o que moldou aquela carga.

---

## 2. A entrada

`resolveCargoLayout` recebe um objeto só. Tudo o que não vem tem um comportamento declarado — nunca
um palpite silencioso.

| campo                 | o que é                                                               | ausente                                                        |
| --------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| `stops`               | as entregas **na ordem de entrega**, cada uma com as caixas dela      | sem paradas não há desenho                                     |
| `bedDimensions`       | comprimento × largura × altura do baú, da ficha do veículo            | sem planta em escala: só as fileiras proporcionais da 085      |
| `capacityM3`          | o m³ do veículo                                                       | sem proporção, e o desenho não sai                             |
| `loadingAccess`       | por onde o veículo abre: `rear`, `rear_and_side`, `open`              | `rear`, o **mais restritivo**                                  |
| `fallbackBoxVolumeM3` | o volume típico de uma caixa da empresa, para a presumida ter tamanho | a caixa não medida fica fora do desenho, e **nomeada**         |
| `measuredShapes`      | as formas medidas com fita, de onde sai a proporção da presumida      | a presumida não tem forma                                      |
| `payloadRatio`        | quanto do teto de massa a carga ocupa                                 | teto desconhecido: **não equilibra** e não afirma nada de peso |
| `securesCargo`        | algum motorista da viagem amarra a carga com cinta                    | **não** amarra                                                 |

### A caixa

Cada caixa da entrega tem medidas e três marcas que o empacotador respeita: `isFragile`,
`isStackable`, `keepUpright`. `source` diz se ela foi **medida** com fita (`measured`) ou **presumida**
a partir do volume da nota (`estimated`) — e `documentId`/`documentNumber` dizem de que nota ela veio.

⚠️ **A nota é carona, nunca critério** (spec 119): nenhuma comparação, chave de formato (`shapeKey`)
ou ordenação do empacotador lê esses dois campos. O mapa recomendado é idêntico com e sem nota. Só o
complemento (§ 7) procura ficar perto da própria nota, e só a tela usa a nota para pintar e acender.

### A escala da planta

Vem da ficha do veículo, e quando a ficha não tem as três medidas vem da **referência do tipo**, com
a origem colada no desenho: a tela é obrigada a dizer que a escala é de catálogo. Sem nenhuma das
duas não há planta em escala — sobram as fileiras proporcionais, que não prometem metro nenhum.

---

## 3. Passo 1 — Em que eixo as entregas se dividem

`resolveStopArrangement` devolve `depth`, `grid` ou `lanes`, **e o motivo**.

| arranjo | como fica                                                                                                        | quando                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `lanes` | cada entrega numa faixa ao longo da largura, **todas encostando na porta**                                       | quando cabem                                                   |
| `grid`  | K faixas; as K primeiras entregas na porta, lado a lado, e as seguintes atrás delas                              | faixas não cabem, e a grade coloca o que a profundidade coloca |
| `depth` | **um bloco só**: a última entrega na testeira, cada entrega seguinte ao lado ou em cima da anterior, até a porta | quando nem faixas nem grade servem                             |

**Faixas cabem quando as duas valem:**

1. A soma das **larguras mínimas** cabe na largura do baú. A largura mínima de uma entrega é a menor
   dimensão de planta da caixa mais larga dela — a menor porque a caixa gira.
2. O **volume** de cada entrega cabe na faixa que ela recebe, descontada a eficiência de arrumação.

E ainda: carroceria aberta (`open`) não ganha faixa, viagem de uma entrega só não ganha faixa, e
acima de metade do teto de massa as faixas caem — as duas outras opções equilibram no comprimento.

Motivos com nome próprio, porque a tela precisa explicar a troca: `fits`, `noBed`, `openBody`,
`singleStop`, `tooWide`, `volumeDoesNotFit`, `weight`.

⚠️ **Sem exceção: as faixas cabem todas ou nenhuma.**

### A grade

A grade divide a largura em **K faixas** (K de `floor(largura ÷ faixa mínima)` até 2) e distribui as
entregas em rodízio: as K primeiras ficam **na porta, lado a lado**, e a entrega K+1 fica atrás da 1,
na mesma faixa. Dentro de cada faixa valem todas as regras deste arquivo — a faixa é um baú mais
estreito, empacotado em profundidade, e a borda que encosta em outra faixa é **face aberta**, não
parede.

A decisão **empacota de verdade** os dois arranjos e compara: a grade só vale se colocar pelo menos o
que a profundidade coloca. Ela experimenta K decrescente e fica com a maior que coloca tudo (nenhuma
colocando, a que coloca mais; empate, a de mais faixas), e o `laneCount` escolhido viaja na decisão
até o empacotador — recalcular devolveria outra grade.

---

## 4. Passo 2 — A fatia de cada entrega

Em **faixas e grade** cada entrega recebe primeiro o **mínimo** (caber a caixa mais larga dela), e só
a sobra da largura é repartida por volume. A fatia nasce do tamanho da alocação e não cresce por
etapas.

Em **profundidade não há fatia por entrega** desde a spec 114 — a carga é um bloco só. A fatia em
profundidade sobrevive apenas dentro de cada faixa da grade, e ali ela é **teto**: `sizeSlice` mede o
que a carga de fato pede (piso volumétrico crescendo 1,35× até parar de transbordar), e as fatias
somam no máximo o comprimento do baú.

Dimensionar a fatia e empacotar são **a mesma passagem** — os pacotes de teste descartados custavam
mais que todo o orçamento de tempo.

---

## 5. Passo 3 — A varredura dentro da fatia

### O baú girado

**A faixa é a fatia com o baú girado 90°.** Empacota-se num baú de comprimento e largura trocados e
destroca-se `x ↔ y` ao devolver. `fitSlot` já testa as duas orientações de cada caixa, então girar é
fisicamente honesto — uma caixa girada em torno do eixo vertical é a mesma caixa.

Duas coisas que a rotação exige e não se deduzem de "trocar dois eixos": a destroca é do **par
inteiro** (posição e encaixe), e a profundidade real é **espelhada** — no espaço girado a varredura
quebra fileira a partir de `y' = 0`, que depois da destroca é a testeira.

### Sobe antes de andar para o fundo

A varredura enche fileiras e **sobe de camada quando elas acabam**; a fronteira das fileiras só cresce
quando a altura acaba. Em profundidade a fileira corre pela largura, que é de graça; em faixas ela
corre pela profundidade real, e cada fileira nova empurra a carga um passo para dentro.

A fileira seguinte começa na **próxima borda de carga**, se ela vier antes do passo — as bordas ficam
numa lista ordenada com busca binária.

### A caixa gira para render mais por fileira

A orientação é escolhida por **caixas por metro do eixo caro**: quantas entram numa fileira, dividido
pelo quanto essa fileira gasta do eixo caro. Não é "a menor dimensão".

O eixo caro é parâmetro, porque os dois arranjos marcham em eixos diferentes: em profundidade é
`depthM`, em faixas é `widthM`. O rendimento é contado **em células**, não na medida real.

### O mapa de alturas, em células de 5 cm

A fatia mantém um **relevo por célula** de 5 cm. A caixa ocupa **células inteiras** — a pegada conta a
célula parcial como inteira, até 5 cm por caixa —, e a posição é sempre uma borda de célula. A
conversão para célula leva folga nas duas pontas, porque `0.6 / 0.05` dá `11.999999999999998`.

O `z` da caixa é **o maior relevo sob a pegada dela**: ela pousa no que está embaixo dela, nunca no
topo da camada.

### Onde ela pode sentar (`seat`)

Um lugar é aceito quando **todas** valem:

- **Nivelado**: o apoio é plano sob a pegada inteira — nível, não fração de base apoiada.
- **Dentro da esbeltez** (§ 6).
- **Sem sombra** (`isShadowed`): a entrega mais cedo não senta atrás de uma mais tardia mais alta que
  a base dela. A cada troca de entrega o relevo do que já está carregado é congelado como "o maior
  topo daqui até a porta" (`freezeLater`).
- **Ao alcance da mão** (`isOutOfReach`): a face fica a no máximo `DELIVERY_REACH_M` = 0,6 m da frente
  do piso das entregas posteriores, medida no trecho de 0,6 m de largura mais raso que encosta nela.

**Recusar um assento é tentar o próximo da mesma fileira** — a corrida desliza uma célula, nunca pula
a fileira inteira.

A busca tem teto por caixa (`SEAT_ATTEMPTS_PER_ROW` = 4 vezes as fileiras de célula da fatia) e
termina sozinha antes disso: camada varrida inteira sem lugar encerra a busca. E o **formato que
acabou de falhar é memorizado**: o mapa só muda quando uma caixa é colocada, então a gêmea da caixa
recusada não varre o baú de novo.

### A caixa pequena vai para o espaço morto

A caixa de pegada em células **menor** que a da forma dominante procura primeiro um assento cuja folga
até o teto seja menor que a altura da dominante (`createDeadSpaceTracker`), com as mesmas regras de
assento. Sem isso ela senta no meio da fileira, empurra as seguintes para o lado e a chaminé que sobra
tira o apoio da fileira de trás.

Spec 130 — duas regras de lugar, nenhuma de física:

- **A caixa pequena entra depois das grandes da própria entrega** (`rankSmallLast`). Antes delas o único
  topo que ela acha é o das entregas posteriores, onde a entrega dela ainda vai crescer.
- **Sem espaço morto ao alcance, o assento ao alcance mais alto.** Com a mão da 118 o espaço morto quase
  nunca está ao alcance; o topo mais alto é o lugar que a carga menos usaria depois. Empate fica com o
  primeiro achado — o mais longe da porta. Quem aceita é a mesma `accept` da varredura.
- Nessa busca **a testeira não é parede para a caixa pequena que precisa de escora**: o bloco é deslocado
  para a porta depois de empacotado, e o vão que sobra lá passa do giro de uma pilha de base 10 cm.

---

## 6. Passo 4 — Até onde a pilha sobe

Uma pilha tomba quando a inclinação equivalente passa de `atan(base ÷ altura)`.

- **Coluna livre**: teto de `STABLE_STACK_SLENDERNESS = 3` vezes a menor dimensão da base — 18,4°, ou
  **0,33 g**, que cobre frenagem normal e curva forte.
- **Coluna confinada**: sem teto. Cercada de carga e parede, ela não tem para onde girar.
- **Carga amarrada** (`securesCargo`): sem teto. A cinta prende a pilha à carroceria, e o modo de falha
  passa a ser o esmagamento ou a própria cinta.

Três precisões que decidem o desenho:

- **A porta não é parede.** As três paredes do baú seguram a carga; a porta se abre, e é nesse instante
  que a pilha encostada nela cai — em cima de quem abriu. A face aberta muda com o arranjo, e na grade
  a borda que encosta em outra faixa também é face aberta.
- **A alavanca conta de onde a contenção termina, não do piso.** Se a vizinha segura a pilha até
  0,63 m, o que tomba é o trecho acima disso, e é esse trecho que não passa de três vezes a base.
- **Vão mais estreito que o giro da pilha é apoio** (`braceGapOf`). Para `h = 3b` o topo anda `3b/√10`
  — 0,95 da base —, e esse é o vão que ainda segura, medido da face **real** da caixa.

A trava é conferida **na altura do assento**, nunca num contador de camadas. E `max_stack_count`
continua valendo por cima da esbeltez: ele declara esmagamento, que é outra coisa.

⚠️ **A massa não entra, e isso é física, não simplificação**: ela cancela nos dois lados da condição de
tombamento e também no deslizamento.

---

## 7. Passo 5 — Onde o vão sobra, e o equilíbrio de peso

- **Em profundidade**: o bloco é deslocado para **terminar na porta**, e o vão fica na testeira.
- **Em faixas**: a primeira faixa começa em zero — é a que precisa estar à mão — e o vão sobra na
  lateral oposta.

**Acima de metade de `capacity_kg` a física vence a descarga** (`shouldBalanceLoad`): o bloco vai para
o meio do baú, com folga nas duas pontas, e toda caixa recebe `weightBalanced`. Degrau e não rampa,
porque o operador precisa **prever** o desenho.

**Carroceria aberta equilibra sempre**, sem olhar o peso: quem abre o comprimento inteiro já tem toda
a carga à mão, e não existe "a porta" a que encostar.

`payloadRatio` nulo **não equilibra** — mover carga por palpite seria a invenção que a ausência do
teto deveria impedir.

---

## 8. Passo 6 — O que não coube na própria fatia

- **Em faixas**: a sobra fica presa **à própria faixa**, na parte mais longe da porta, e sai marcada
  `splitCargo` (contorno vermelho). Não existe "região das entregas posteriores" ali: o mesmo movimento
  poria a sobra em cima da faixa de outra entrega.
- **Em profundidade**: não há fatia, então não há carga dividida — o que não cabe no bloco não cabe no
  baú, e sai `bedFull`.

A busca da divisão **não tem teto global**: ela memoriza o formato que já falhou para aquela entrega.

---

## 9. Passo 7 — O complemento: se tem espaço, a carga entra

O desenho tem **duas camadas**. O **mapa recomendado** é tudo o que está acima. O que ele não colocou
tenta o **complemento**, que afrouxa só conveniência, nesta ordem:

| marca             | o que foi afrouxado                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `outOfReach`      | a mão de quem descarrega: a caixa fica a mais de 0,6 m da frente do piso                  |
| `needsRehandling` | a ordem de descarga: alguém remaneja carga para chegar nela, ou nela para chegar em outra |

⚠️ **Nada de física se afrouxa**: dentro do baú, sem cruzar ninguém, nada no ar, pilha de pé no
carregamento, `weightBalanced`, e pilha de pé **em cada passo da descarga**. Isso sai por construção: o
complemento roda na mesma ordem do recomendado — da última entrega para a primeira — e a caixa da
entrega `k` só pousa e só se escora em caixa que ainda está no baú na vez dela (entregas `≥ k`). E ela
**nunca pousa em cima de caixa recomendada da própria entrega**, que ficaria presa até alguém alcançar
a de cima.

**O alcance é tentado na hora; a ordem, no fim.** O primeiro lugar recusado **só** pela mão fica
guardado durante a varredura (`reachFallback`) e recebe a caixa se a varredura terminar sem lugar
recomendado. A ordem, ao contrário, só pode ser afrouxada no fim, sobre o que sobrou.

**A nota junta**: a caixa do complemento procura primeiro um lugar encostado nas caixas da mesma nota
(só nas fileiras onde ela está) e só depois qualquer lugar, da porta para a testeira. O mapa
recomendado **não lê a nota**.

O complemento não rouba lugar do recomendado, e a decisão do arranjo compara só o que é recomendado.
Só o que nem assim cabe segue `bedFull`.

---

## 10. Passo 8 — A prova: a descarga, entrega por entrega

A planta tem de aguentar a **descarga**, não só o carregamento.
`api-transportada/test/cargo-placement/unloading-simulation.ts` tira a primeira entrega, depois a
segunda, e confere duas coisas em geometria real de 1 cm, **independente do mapa de 5 cm** do
empacotador:

- **Estabilidade**: no passo logo antes da entrega dela, toda caixa tem apoio em todas as faces (parede
  ou caixa presente dentro de `3b/√10`, trecho sem contato menor que uma célula tolerado), ou não passa
  de três vezes a base acima da contenção. A porta nunca apoia.
- **Acesso**: a entrega sai inteira por quem fica **de pé no piso** livre ligado à porta, num corredor
  de `ACCESS_CORRIDOR_M` = 0,6 m, alcançando `DELIVERY_REACH_M` = 0,6 m à frente do corpo, sempre a
  caixa sem nada em cima.

As duas constantes são **declaradas, não medidas**. Nenhuma faixa da grade é mais estreita que o
corredor.

É a construção por paredes (George & Robinson, 1980): o bloco enche a largura, sobe e só então avança,
e os formatos de seção — parede inteira, meia largura, meia altura com a mais cedo em cima — saem da
varredura.

---

## 11. O que sai publicado

### `reasons` por caixa (`PLACEMENT_REASONS`)

O motivo não é texto livre: se não está nesta lista, não existe.

| marca             | o que diz                                                         |
| ----------------- | ----------------------------------------------------------------- |
| `lastStopFirst`   | a última entrega foi carregada primeiro — é a ordem do baú        |
| `fragileOnTop`    | caixa frágil, e ela vai por cima                                  |
| `notStackable`    | nada pode ser empilhado em cima dela                              |
| `keepUpright`     | ela não deita                                                     |
| `estimatedBox`    | caixa presumida: a medida saiu do volume da nota, não de uma fita |
| `axleNotChecked`  | carga por eixo **não** foi conferida                              |
| `splitCargo`      | não coube na própria fatia e foi para o fundo dela                |
| `weightBalanced`  | o bloco foi centrado no baú por causa do peso                     |
| `outOfReach`      | complemento: funda demais para a mão de quem fica de pé no piso   |
| `needsRehandling` | complemento: fura a ordem de descarga                             |

### Caixa que ficou de fora (`UNPLACED_REASONS`)

`notMeasured` · `largerThanBed` · `bedFull` · `tooMany`. Nomear é obrigatório — sumir com ela, nunca.

### `layoutNotes` — a planta explica as próprias decisões

A tela imprime como frases sob o título "Por que o desenho ficou assim".

| chave               | o que diz                                       |
| ------------------- | ----------------------------------------------- |
| `heightBeforeDepth` | dentro da faixa a carga sobe antes de avançar   |
| `stackStability`    | a pilha da borda solta parou na esbeltez        |
| `stackConfined`     | no meio do bloco ela subiu mais, porque cercada |
| `stackSecured`      | o motorista amarra, e ela sobe até o teto       |
| `doorIsNotAWall`    | a face da porta não conta como apoio            |

⚠️ **Só entra o que moldou esta carga.** Nota que valeria para toda viagem é ruído, e ruído fixo deixa
de ser lido na terceira vez.

### `splitNotes` — as notas que o desenho dividiu

Com quantos pedaços. **Pedaço** é componente conexo por **contato de face**: encostadas num eixo (vão
menor que uma célula na horizontal, pousada na vertical) e sobrepostas mais de 1 cm nos outros dois.

⚠️ A divisão que sobra é quase toda da **entrega**, não da nota: com uma nota por entrega — 90% das
entregas reais — nota dividida é entrega dividida.

---

## 12. O desenho: o que cada marca quer dizer

| marca no desenho              | o que é                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------- |
| **cor cheia da face**         | a **nota** de onde a caixa veio (spec 121) — uma cor por nota fiscal          |
| contorno **pontilhado curto** | caixa presumida, derivada do volume da nota                                   |
| contorno **vermelho**         | carga dividida (`splitCargo`)                                                 |
| contorno **cobre tracejado**  | caixa do complemento; traço mais grosso quando ela também fura a ordem        |
| linha tracejada atravessando  | a divisa entre as fatias das entregas (`sliceCut`)                            |
| cinza sólido esmaecido        | entrega apagada pelo foco — a carga dela continua ocupando o espaço que ocupa |

A cor sai de `noteColor.service.ts`: uma lista de 128 cores ordenada das mais diferentes para as menos,
escolhida por ponto mais distante em CIELab, longe do que já se desenha sobre mapa e das cores de
parada. **A entrega não some da leitura sem a cor**: ela é identificada pelo número da entrega na
ficha, pela lista das notas dela (cada uma com a cor que está no baú), pela divisa entre fatias e pelo
destaque ao clicar. `stopColorOf` continua servindo a lista de paradas, o mapa e o disco da parada, que
não desenham carga. Como acrescentar cor nova, e o que o contrato exige de cada item, está no cabeçalho
do próprio arquivo.

---

## 13. Desempenho

O orçamento do empacotamento é **50 ms**. **Não há teto de desenho** (spec 131): toda caixa
empacotada vai para a planta que a tela recebe — `MAX_DRAWN_BOXES` e a poda pela caixa mais alta
saíram. Desenho lento é defeito do desenho, nunca motivo para esconder carga. O orçamento do desenho é
**≤ 100 ms para redesenhar ao girar a vista com 6000 caixas**, e é cumprido por `projectSolids`
(geometria uma vez por ângulo, profundidade uma vez por caixa) e por `shadeHexColor` (o tom das faces
verticais é cor calculada — o `filter: brightness` era pintado face a face).

Medições recentes: 9,7 ms com 3600 caixas em 12 entregas; 18,6 ms com 24 entregas e 407 caixas.

---

## 14. O resultado, na viagem real que gerou a spec 100

`RTF7L01` (Fiorino furgão, 1,70 × 1,45 × 1,30 m), três entregas, 31 caixas:

| entrega | notas |            antes |     depois |
| ------: | ----: | ---------------: | ---------: |
|       1 |     6 | 1,107 m da porta | **0,60 m** |
|       2 |     8 | 1,222 m da porta | **0,90 m** |
|       3 |    17 | 1,375 m da porta | **1,20 m** |

Entregas alcançáveis pela porta: **0 de 3 → 3 de 3**.

---

## 15. Onde mexer

| o quê                                                                      | onde                                                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| arranjo, fatia, varredura, orientação, esbeltez, confinamento, complemento | `trips/domain/cargo-placement.policy.ts`                                                       |
| fatia publicada, `distanceFromDoorM`, `orderIsBinding`, `layoutNotes`      | `trips/domain/cargo-layout.policy.ts`                                                          |
| camadas por faixa                                                          | `trips/domain/cargo-plan.policy.ts`                                                            |
| o desenho, a ficha da entrega e as frases                                  | `frontend/src/modules/trip/components/TripCargoLayers.component.tsx`                           |
| a cor de cada nota                                                         | `frontend/src/modules/trip/shared/noteColor.service.ts`                                        |
| contratos                                                                  | `api/test/cargo-placement/*.ts`, `api/test/cargo-volume/*.ts`, `frontend/test/trip/cargo-*.ts` |

⚠️ **Antes de mexer no empacotador, leia [`cargo-placement-defects.md`](./cargo-placement-defects.md).**
Cada regra deste arquivo veio de um defeito medido, e várias delas já foram desfeitas por engano uma
vez. Lá está o número que cada uma custou, e a lista do que foi tentado e recusado — com a medição.

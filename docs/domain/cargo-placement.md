# Como as caixas são organizadas no baú

Referência viva do empacotador — `apps/api-transportada/src/trips/domain/cargo-placement.policy.ts`
e `cargo-layout.policy.ts`. Cada regra aqui veio de um defeito **medido**, e o número ao lado é o
número que a medição deu. Specs de origem: 085, 088, 094, 095, 099 e 100.

## O que o desenho promete, e o que ele não promete

Ele diz **"cabe, e nesta ordem"**. Ele não diz "deve ir assim": não confere carga por eixo
(`axleNotChecked`), não conhece a empilhabilidade de toda caixa nem o peso de cada uma. A tela repete
isso numa linha fixa, e o painel de decisões (abaixo) explica o que moldou aquele desenho.

---

## Passo 1 — Em que eixo as paradas se dividem

`resolveStopArrangement` devolve `depth`, `grid` ou `lanes`, **e o motivo**.

| arranjo | como fica                                                                           | quando                                                         |
| ------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `lanes` | cada parada numa faixa ao longo da largura, **todas encostando na porta**           | quando cabem                                                   |
| `grid`  | K faixas; as K primeiras entregas na porta, lado a lado, e as seguintes atrás delas | faixas não cabem, e a grade coloca o que a profundidade coloca |
| `depth` | uma parada atrás da outra a partir da porta                                         | quando nem faixas nem grade servem                             |

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

⚠️ **Aberto:** com dezenas de paradas pequenas cada fatia tem uma ou duas caixas de fundo, toda pilha
fica livre e a esbeltez as corta em 0,75 m — medido, 38 de 85 paradas `bedFull` com o baú a 30%.
Agrupar entregas consecutivas num bloco só, a mais tardia por baixo, contraria a proibição da 095 e
precisa de decisão escrita.

- **Em profundidade:** sobe para a região das paradas entregues **depois**, mais fundo no baú, e sai
  marcada `splitCargo` (contorno vermelho). Ali nada fica por cima dela e o corredor já está livre
  quando a vez dela chega. O sentido contrário é proibido.
- **Em faixas:** fica presa **à própria faixa**, na parte mais longe da porta. Não existe "região das
  paradas posteriores": o mesmo movimento poria a sobra em cima da faixa de outra parada.

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

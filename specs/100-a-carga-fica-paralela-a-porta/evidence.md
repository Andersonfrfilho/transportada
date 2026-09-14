# Feature 100 — Evidência

> Medida em 2026-09-08, na viagem real que gerou a crítica: `RTF7L01` (Fiorino furgão), baú de
> 1,70 × 1,45 × 1,30 m da ficha, três paradas, 31 caixas.

## O que a crítica dizia

> se caso acontecer um problema na primeira ele deve ter de remover toda a primeira para acessar a
> segunda, e se der problema na 1 e na 2 precisa remover as duas para chegar a 3

## Antes e depois, na mesma viagem

| parada | notas                                             | antes (profundidade) | depois (faixas) |
| ------ | ------------------------------------------------- | -------------------: | --------------: |
| 1      | 883599 · ECONÔMICO SUPERMERCADOS · AVENIDA 07     |     1,107 m da porta |         **0 m** |
| 2      | 883598 · ECONÔMICO SUPERMERCADOS · AVENIDA 04     |     1,222 m da porta |         **0 m** |
| 3      | 883605 · VICENTE SOBRINHO MAISZENA · ROD. PAOLINO |     1,375 m da porta |         **0 m** |

|                                              |      antes |     depois |
| -------------------------------------------- | ---------: | ---------: |
| paradas alcançáveis pela porta               | **0 de 3** | **3 de 3** |
| a ordem de entrega obriga (`orderIsBinding`) |        sim |        não |

Com `payloadRatio` acima de metade do teto de massa a mesma viagem volta a `depth`, com as três
distâncias de antes — a D4 valendo, e a tela dizendo que foi o peso.

## ⚠️ O que a evidência achou, e nenhum contrato sintético tinha pego

**A primeira versão do critério não disparava no caso que motivou a feature.** Ela media o cabimento
pela fatia **proporcional ao volume**: a parada 1 leva 19% da carga, ganhava 0,28 m de faixa, e a
caixa dela tem 0,30 m. Resultado: `arrangement = depth`, 0 de 3 na porta — o desenho de sempre.

O erro era de premissa, não de aritmética. A faixa vai do **chão ao teto e da porta à testeira**, e é
limitada só na largura: o que a parada exige da largura é caber a caixa mais larga dela, e a
profundidade resolve o resto. Repartir a largura por volume tratava a faixa como se ela fosse a fatia
girada, e ela não é.

Hoje o critério é a **soma das larguras mínimas** — a caixa mais larga de cada parada, girada se for
o caso — contra a largura do baú. A alocação segue a mesma ordem: cada parada recebe o mínimo, e só
a sobra é repartida por volume.

⚠️ Isto reprovou um contrato que existia e passava: _"parada dominante estreita as vizinhas e derruba
as faixas"_. Ele afirmava o defeito com todas as letras, e passava porque descrevia fielmente o que o
código fazia. **Contrato sintético confirma a implementação; só o dado real confere a premissa.**

## ⚠️ E o que a revisão de código achou depois disso

A correção acima criou uma regressão que **nenhum contrato pegou**, e ela só apareceu rodando a
política com números:

|                                                      |               antes da revisão |           depois |
| ---------------------------------------------------- | -----------------------------: | ---------------: |
| 57 caixas (2,052 m³) num baú de 3,204 m³ — 64% cheio | **42 colocadas**, 15 `bedFull` | **57 colocadas** |
| as mesmas 57 em profundidade                         |                   57 colocadas |     57 colocadas |

**Caber em largura não é caber.** Duas paradas de uma caixa cada seguram 0,60 m de um baú de 1,45 m —
o mínimo delas —, e a parada dominante fica com 0,85 m, que não comporta o volume dela. O arranjo
saía `lanes` e o empacotador descartava a sobra. O operador lia "não coube" numa viagem que cabe, na
tela em que ele decide aceitar a carga.

Duas correções, porque eram dois defeitos encadeados:

1. **O teste de cabimento passou a incluir volume**, com o mesmo desconto de eficiência de arrumação
   que dimensiona a fatia. Caber em largura é o piso, não o critério.
2. **O atalho que mandava toda sobra em faixas para `bedFull` saiu.** Ele se apoiava em "a parada que
   estoura a própria faixa já encheu o baú" — verdade com faixa proporcional ao volume, falsa desde
   que o mínimo passou a ser reservado por parada. A busca voltou, agora presa à faixa da parada.

E um terceiro achado, de honestidade da tela: o aviso "o peso venceu" era **deduzido** de `depth`
mais carga pesada, e afirmava o mesmo na viagem de uma parada só, na carroceria aberta e quando as
faixas não caberiam de todo jeito. Hoje a API publica `stopArrangementReason` e a tela imprime o que
ela diz.

⚠️ **A lição é a mesma da correção anterior, uma volta acima.** O contrato "a parada dominante não
estreita a vizinha" passava, e passava porque descrevia fielmente o que o código fazia. Contrato
sintético confirma a implementação; medir com números confere a premissa — e desta vez foi a revisão
de código, não a evidência, que teve de fazê-lo.

## ⚠️ E o que o usuário achou olhando a tela, que a medição anterior não olhava

As três paradas ficaram acessíveis pela porta, e mesmo assim ele apontou: _"poderiam agrupar mais
próximo à porta em vez da pessoa precisar ir até o fundo do baú"_.

Medido, e era pior do que a crítica dizia — **até a parada de seis caixas obrigava a ir a 1,50 m**:

| parada | caixas | alcance antes | alcance depois |
| -----: | -----: | ------------: | -------------: |
|      1 |      6 |        1,50 m |     **0,60 m** |
|      2 |      8 |        1,50 m |     **0,60 m** |
|      3 |     17 |        1,50 m |         1,50 m |

A causa é a varredura, não o arranjo: ela enche **fileiras** e só sobe de camada quando as fileiras
acabam. Em profundidade a fileira corre pela **largura**, que é de graça — avançá-la não afasta
ninguém da porta. Em faixas ela corre pela **profundidade real**, e cada fileira nova empurra a carga
um passo para dentro. Seis caixas de 0,30 m numa faixa de 0,40 m saíam cinco deitadas no chão e **uma
só empilhada**, num baú de 1,30 m que comporta quatro camadas.

Hoje, em faixas, a fronteira das fileiras só cresce **quando a altura acaba**: sobe-se até o teto
junto da porta antes de andar para o fundo. Em profundidade nada muda, e um contrato guarda isso —
inverter lá empilharia carga com metade do piso vazio ao lado.

### A orientação da caixa, que valia os 0,30 m restantes

`fitSlot` escolhia a **primeira orientação que coubesse**. Numa faixa de 0,60 m uma caixa de
0,40 × 0,30 entrava deitada e ia **uma** por fileira, quando de pé iam duas — e cada fileira custa
0,30 m de baú. Hoje a escolha é por **rendimento no eixo caro**: quantas entram numa fileira,
dividido pelo quanto essa fileira gasta de profundidade.

⚠️ Não é "a menor dimensão": escolher a orientação mais estreita punha uma por fileira e gastava
**mais** profundidade, que é o oposto do objetivo.

⚠️ **E ela só rendeu depois de a faixa parar de crescer por etapas.** A orientação é decidida contra a
largura da fatia, e o crescimento da 099 D1 a decidia contra uma largura **provisória**, menor que a
alocada. Em faixas o crescimento não faz sentido de todo jeito: o que sobra da largura não vira vão
útil — a faixa seguinte só começa antes —, e a carga desta paga a diferença em profundidade. Com a
faixa nascendo do tamanho da alocação, os 17 caixas foram de 1,50 m para 1,20 m.

Desempenho depois das duas mudanças: **28,3 ms** para 3600 caixas em 12 paradas, contra o orçamento
de 50 ms declarado pela 099 — mais rápido que antes, porque a faixa deixou de ser reempacotada a
cada etapa de crescimento.

## ⚠️ E a pilha, que subia sem teto

Com o acesso resolvido, o usuário apontou o que a altura custava: _"ao levarmos muito a carga ela
pode balançar e cair"_. Sem `max_stack_count` cadastrado o limite era **infinito**, e a varredura
subia até o teto do baú — numa prateleira isso passa, num veículo em movimento não.

A trava é a **esbeltez**: a altura da pilha não passa de três vezes a menor dimensão da base. A pilha
tomba quando a inclinação equivalente passa de `tan⁻¹(base ÷ altura)`, e a 3:1 isso é 18,4°, ou
**0,33 g** — frenagem normal e curva forte.

Medido na viagem real, escolhendo a razão:

| esbeltez    | pilha             | resiste a |    colocadas | alcance por parada       |
| ----------- | ----------------- | --------: | -----------: | ------------------------ |
| 2:1         | 2 caixas · 0,60 m |    0,50 g |     30 de 31 | 0,33 / 0,73 / **1,66 m** |
| **3:1**     | 3 caixas · 0,90 m |    0,33 g | **31 de 31** | 0,60 / 0,90 / 1,20 m     |
| 4:1 (antes) | 4 caixas · 1,20 m |    0,25 g |     31 de 31 | 0,60 / 0,60 / 1,20 m     |

⚠️ **O 2:1 se sabota.** A altura útil cai para menos da metade do baú, a carga deixa de caber em
faixas, o arranjo volta a profundidade e a última parada vai a **1,66 m** — pior acesso que antes da
spec inteira, em nome de uma segurança que a viagem não usa. E uma caixa fica de fora num baú 35%
cheio, que é a tela dizendo "não coube" a quem tem espaço sobrando.

### ⚠️ Por que o peso não entra

A massa **cancela** nos dois lados da condição de tombamento: coluna pesada e leve de mesma forma
tombam no mesmo ângulo, e no deslizamento o atrito e a inércia crescem juntos. O peso importaria pela
**distribuição** (caixa pesada em cima sobe o centro de massa) e pelo **esmagamento**, que é o que
`max_stack_count` declara e continua valendo por cima da esbeltez.

E o dado decide sozinho: `gross_weight_grams` existe em **4 de 663** caixas desta base — uma regra de
peso não rodaria em 99,4% das cargas, e seria a lacuna que a ADR-0044 §5 proíbe.

### Três lugares, porque a pilha sobe por três caminhos

A trava precisou ser conferida na **altura do assento**, não no contador de camadas do cursor: ele
zera quando a fronteira avança, e o mapa de apoio não — com a trava só no contador a carga voltou a
subir 1,20 m numa pilha limitada a 0,60 m. E a **carga dividida** furava por trás, com busca própria:
medido, uma caixa a 0,90 m. Por fim, o teste de cabimento das faixas passou a usar a altura **útil**,
não a do baú, senão ele prometia faixa que a varredura não entrega.

Desempenho: **25,4 ms** para 3600 caixas em 12 paradas.

## Gates

```
bun run --cwd apps/api-transportada test        4813 pass · 23 skip · 0 fail
bun run --cwd apps/api-transportada typecheck   limpo
bun run --cwd apps/api-transportada lint        limpo
bun run --cwd apps/frontend-transportada test   3057 pass · 0 fail
bun run --cwd apps/frontend-transportada build  index 853,77 kB (gzip 259,40 kB)
```

⚠️ Os três erros de `lint` do frontend são pré-existentes, em `DriverHomeMap.component.tsx`,
`vectorBasemap.service.ts` e `driver-home-coordinates.contract.ts` — nenhum deles tocado por esta
feature.

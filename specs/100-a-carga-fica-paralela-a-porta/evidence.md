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

## Gates

```
bun run --cwd apps/api-transportada test        4807 pass · 23 skip · 0 fail
bun run --cwd apps/api-transportada typecheck   limpo
bun run --cwd apps/api-transportada lint        limpo
bun run --cwd apps/frontend-transportada test   3057 pass · 0 fail
bun run --cwd apps/frontend-transportada build  index 853,77 kB (gzip 259,40 kB)
```

⚠️ Os três erros de `lint` do frontend são pré-existentes, em `DriverHomeMap.component.tsx`,
`vectorBasemap.service.ts` e `driver-home-coordinates.contract.ts` — nenhum deles tocado por esta
feature.

# Spec 117 — A caixa pequena vai para o espaço morto, e o resto é a escada da porta

> 🤖 Modelo: `opus` (análise e empacotador)

## Problema

Depois da spec 116 o Atego de 85 paradas (RTA-2F45, baú 7,40 × 2,47 × 2,30 m) desenhava 1282 de 1417
caixas, 135 `bedFull`, com as paradas 1, 3, 4, 5, 7, 8 e 9 fora do desenho a 62% do volume. A 116
atribuiu a perda a duas causas sem medir a divisão entre elas: a fileira da porta, que só sobe três
camadas, e caixas medidas de outro tamanho no meio do bloco.

Dois pontos também ficaram abertos: o teto de tentativas da busca de lugar só era travado pelo piso do
Atego, e a tela nunca tinha sido conferida com 1282+ caixas.

## Medido (2026-09-10, entrada real das quatro viagens)

- Sobre a planta final, **nenhuma** regra deixava de colocar caixa no meio do bloco: desligando a
  esbeltez, 56 caixas a mais entrariam, 48 delas a menos de 0,45 m da porta. A perda era de
  **topo não nivelado**, não de regra recusando.
- As fileiras do meio voltavam a fazer pirâmide (8, 8, 8, 8, 7, 7, 7, 6, 6, 2 caixas por camada).
  Origem: uma caixa medida pequena (10 × 10 × 10 cm) de uma parada entra **antes** das presumidas da
  mesma parada (095 G002), senta no meio da fileira e empurra as seguintes 10 cm para o lado. A
  chaminé de 10 cm que sobra atravessa a fileira, a de trás perde o apoio frontal naquela coluna, e
  cada camada acima perde uma caixa.
- Sintético sobre as mesmas 85 paradas, todas presumidas: **1344** caixas sozinhas; com um cubo
  medido de 10 cm a cada cinco paradas, **1093** — 17 cubos custando 251 presumidas.

## Decisões

- **D1 — A caixa pequena vai primeiro para o espaço morto.** Antes da busca comum, uma caixa de pegada
  em células menor que a da forma dominante da fatia procura um assento cuja folga até o teto seja
  menor que a altura da dominante — em cima da pilha que já chegou ao teto útil, onde a caixa da carga
  não cabe. O assento passa pelas mesmas regras (esbeltez, sombra, fim do baú). Sem lugar assim, a
  busca comum segue como antes.
- **D2 — O que sobra no Atego é a escada da porta, e ela não se afrouxa.** A porta não é parede
  (Passo 4). Com D1, sobre a planta final só desligar a esbeltez colocaria mais caixa: 73, todas a
  menos de 1,3 m da porta. A escada custa 7 + 4 + 1 camadas de 8 caixas presumidas = 96 lugares.
- **D3 — O teto de tentativas ganha contrato próprio.** Carga sintética de 85 paradas × 16 presumidas
  e uma caixa de 0,40 × 0,30 × 0,25 m a cada sete, 1396 caixas no Atego: teto fixo de 64 deixa 111 fora,
  o proporcional às fileiras deixa 28. O contrato afirma que o que fica fora cabe na escada da porta.

## Recusados, com número

- **Caixa medida menor que a presumida depois das presumidas da parada** (reordenar): Atego 1289; nos
  cubos a cada três paradas, 980 contra 1057 do código anterior — piora.
- **Face apoiada por qualquer contato** (corpo rígido): Atego 1265, piora.
- **Salto para a próxima borda só como segunda passada** (evitar as fileiras atravessadas): sozinho
  1263; junto do reordenar, 1320 — mas o reordenar não generaliza, e com D1 não soma nada.
- **Célula menor ou ajustada à caixa**: já medido na 116 como caótico; não repetido.

## Fora do escopo

- A quantização da célula de 5 cm (0,261 m ocupa 0,30 m; oito caixas na largura em vez de nove) é
  limite do modelo, não da física. Resolver pede empacotar em coordenada contínua, spec própria.

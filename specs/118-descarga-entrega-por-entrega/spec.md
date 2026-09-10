# Spec 118 — A planta aguenta a descarga, entrega por entrega

## O que o usuário viu (2026-09-10)

Na grade (spec 113) cada entrega vira uma faixa estreita, da porta ao fundo, empilhada. Na descarga:

1. **Acesso:** esvaziada a primeira entrega da faixa, sobra uma fresta de ~0,8 m e vários metros de
   fundo, e ninguém entra nela para buscar a seguinte.
2. **Estabilidade:** esvaziada a faixa, a pilha vizinha fica com a lateral livre e pode tombar. O
   empacotador só conferia estabilidade com a carga inteira.

## O que foi medido (`f126792f`, 4 viagens reais de 2026-09-10)

Simulação independente da descarga (grade de 1 cm, geometria real):

| viagem            | arranjo      | sem apoio na descarga                   | travadas (de pé no piso, corredor ≥ 0,6 m, mão a 0,6 m) |
| ----------------- | ------------ | --------------------------------------- | ------------------------------------------------------- |
| RTC-4H67 Daily    | profundidade | 0                                       | 65 caixas / 11 entregas, todas fora de alcance          |
| RTE-6K89 Sprinter | grade        | 116 (22 paradas), 116 já na carga cheia | 35 / 13, corredores de 0,2–0,3 m                        |
| RTA-2F45 Atego    | profundidade | 0                                       | 490 / 60, quase todas fora de alcance                   |
| RTD-5J78 Accelo   | grade        | 127 (12 paradas), 38 já na carga cheia  | 102 / 16, corredores de 0,1–0,3 m e fora de alcance     |

- **Grade:** a faixa era empacotada como um baú à parte, e a borda dela contava como parede
  (`createSupportMap`, borda fora do mapa = apoio). A vizinha segura só enquanto está lá.
- **Profundidade:** a estabilidade aguenta a descarga **por construção**: cada caixa é conferida quando
  só existem entregas iguais ou posteriores, e as anteriores só tiram apoio depois de ela já estar lá.
  O defeito é acesso: a entrega mais cedo subia em cima das posteriores, funda demais para a mão (893 de
  1137 caixas das entregas travadas do Atego).

## Decisões

- **D1 — A simulação da descarga é invariante.** Estabilidade: cada caixa, no passo logo antes da
  entrega dela, tem apoio em todas as faces (parede ou caixa presente dentro de `3b/√10`, trecho sem
  contato < 5 cm tolerado) ou não passa de três vezes a base acima da contenção; a porta nunca apoia.
  Acesso: a entrega sai inteira por quem fica de pé no piso livre ligado à porta, num quadrado de
  `ACCESS_CORRIDOR_M` = 0,6 m, alcançando `DELIVERY_REACH_M` = 0,6 m à frente do corpo, sempre a caixa
  sem nada em cima. As duas constantes são declaradas, não medidas.
- **D2 — Construção por paredes, emergente.** O bloco em profundidade já constrói paredes atravessadas
  (enche a largura, sobe até a estabilidade permitir, só então avança). A regra nova: a caixa só senta
  se a face dela ficar a no máximo 0,6 m atrás da frente do piso das entregas posteriores, medida no
  trecho de 0,6 m de largura mais raso que encosta nela. Os formatos de seção da tabela (parede inteira,
  meia largura, meia altura com a mais cedo em cima, quadrante) saem da varredura, não de uma escolha
  explícita — ver evidência.
- **D3 — Rendimento em células.** A orientação é escolhida pelas caixas por metro contadas nas células
  que a varredura ocupa. Pela medida real a presumida ia com 0,371 m ao longo do comprimento; em
  células empata, e a fileira de 0,30 m põe o terceiro degrau da porta ao alcance.
- **D4 — A grade continua, e só vale quando passa.** Borda de faixa que não é parede do baú é face
  aberta, e nenhuma faixa fica mais estreita que 0,6 m. A comparação com a profundidade por caixas
  colocadas continua; nas quatro viagens ela nunca vence (Sprinter 137 contra 252; Accelo 402 contra
  500).
- **D5 — O vocabulário da API não muda.** `STOP_ARRANGEMENTS` segue `depth · grid · lanes`.

## Custo aceito

A regra nova custa caixa desenhada onde a descarga só funcionava subindo na carga: Daily 481 → 441
(paradas 1–3 fora), Atego 1347 → 1190 (paradas 1, 3–5, 7–16 fora). Sprinter e Accelo entram inteiras.
Com a carga amarrada (`securesCargo`) o Atego chega a 1412 de 1417 com as mesmas regras de acesso.

## Referências

- George, J. A. & Robinson, D. F. (1980). A heuristic for packing boxes into a container. _Computers &
  Operations Research_ 7(3), 147–156 — construção por paredes (camadas). Conferida.
- Eley, M. (2002). Solving container loading problems by block arrangement. _EJOR_ 141(2), 393–409 —
  blocos, com estabilidade e distribuição de peso. Conferida.
- Fanslau, T. & Bortfeldt, A. (2010). A tree search algorithm for solving the container loading
  problem. _INFORMS Journal on Computing_ 22(2), 222–235 — construção por blocos. Conferida.
- Bortfeldt, A. & Wäscher, G. (2013). Constraints in container loading — a state-of-the-art review.
  _EJOR_ 229(1), 1–20 — restrições práticas (multi-drop, estabilidade). Conferida.
- Junqueira, L., Morabito, R. & Yamashita, D. S. (2012). MIP-based approaches for the container loading
  problem with multi-drop constraints. _Annals of OR_; e Three-dimensional container loading models
  with cargo stability and load bearing constraints. _Computers & OR_ 39(1), 74–85. Conferidas.
- Ramos, A. G., Oliveira, J. F., Gonçalves, J. F. & Lopes, M. P. (**2015**). Dynamic stability metrics
  for the container loading problem. _Transportation Research Part C_ 60, 480–497 — apoio lateral
  insuficiente como métrica. Conferida; o ano pedido (2016) estava errado. A simulação da **retirada**
  (descarga parcial) não foi achada numa referência específica: é desta spec.

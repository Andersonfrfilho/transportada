# Spec 115 — A carga inteira no baú: contenção medida, grade que coloca tudo, teto só de desenho

> 🤖 Modelo: `opus` (empacotador — `docs/domain/cargo-placement.md` lido antes)

## Problema

Medido em 2026-09-10 na montagem por busca de notas (345 notas, 6 motoristas, 6 veículos, quatro
viagens propostas), com a resposta real de `POST /trips/cargo-preview`:

- **RTD-5J78** (Accelo, 24 paradas): 49 de 500 caixas `bedFull` com o baú a 38%, e a parada 4 fora do
  desenho.
- **RTC-4H67** (Daily, 19 paradas): 52 de 481 `bedFull` a 55%, as paradas 1 a 4 fora.
- **RTA-2F45** (Atego, 85 paradas): 817 de 1417 caixas fora — 689 por "limite de detalhe" —, e **46
  paradas** fora do desenho, as primeiras entregas entre elas.
- Um par de caixas furando a ordem de descarga em RTC e outro em RTD: entrega mais cedo atrás de uma
  mais tardia 4 cm mais alta que a base dela.

## Causas (medidas)

1. **A coluna livre era contada do piso.** A fileira atrás da vizinha só subia além de três vezes a
   base se estivesse presa **na base da caixa** — então cada fileira subia uma caixa acima da vizinha
   do lado da porta, e a carga descia em escada: 2,9 m de escada num baú de 5,32 m (RTD), 1,9 m em
   4,2 m (RTC).
2. **A grade usava a maior quantidade de faixas que o volume admitia.** Com seis faixas de uma caixa
   de largura, o rodízio sobrecarregava uma delas (55% contra 27–52% das vizinhas).
3. **O teto de 600 caixas cortava o empacotamento**, e a carga é empacotada da última entrega para a
   primeira: as caixas cortadas eram as primeiras entregas, e o bloco que sobrava era deslocado até a
   porta.
4. **O assento aceitava o primeiro lugar nivelado da fileira**; recusado por altura, a fileira inteira
   era pulada.
5. **Nada conferia, no assento, a carga mais tardia à frente** de uma caixa que subia para o fundo.

## Decisão

- **D1.** A esbeltez rege o trecho **acima da contenção**: a pilha fica de pé se o que passa da altura
  até onde os quatro lados estão segurados não excede três vezes a base. Presa na base, sobe sem teto
  (como antes); livre, três vezes a base do piso (como antes). ⚠️ A porta continua não sendo parede.
- **D2.** A grade experimenta da maior quantidade de faixas para a menor e fica com a maior que coloca
  tudo; nenhuma colocando, a que coloca mais, e o empate fica com a de mais faixas. A decisão leva o
  `laneCount` ao empacotador.
- **D3.** Toda caixa é empacotada. O teto (`MAX_DRAWN_BOXES` = 1500) é só de desenho: sai primeiro a
  caixa mais alta, nunca a que sustenta outra desenhada nem a última de uma parada.
- **D4.** Recusar um assento é tentar o próximo da mesma fileira.
- **D5.** No bloco por ordem de entrega, a caixa não senta onde, entre ela e a porta, há carga de
  parada mais tardia acima da base dela.

## Aceite

- A carga real de 24 paradas a 41% entra inteira.
- Nas cargas reais, nada fora do baú, nada se cruzando, nada no ar, ordem de descarga intacta.
- Nenhuma caixa do Atego de 85 paradas fica fora por limite de detalhe, dentro de 50 ms.
- A caixa sem nada à frente continua presa a três vezes a base.
- Acima do teto de desenho, nenhuma parada some e nenhuma caixa fica no ar.

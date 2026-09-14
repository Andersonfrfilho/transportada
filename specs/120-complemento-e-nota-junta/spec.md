# Spec 120 — Se tem espaço, a carga entra: mapa recomendado e complemento

## O que o usuário pediu (2026-09-10)

> "Se tivermos espaço para colocar carga deve adicionar carga; às vezes não tem como a arrumação ser
> perfeita, mas vamos dar o mapa recomendável." E: "tente ao máximo agrupar todas as caixas de uma única
> nota; se tiver que separar, pode ser uma alternativa."

A spec 118 impôs na planta a descarga entrega por entrega (apoio lateral, corredor de 0,6 m, mão de
0,6 m). O preço foi caixa fora do desenho com baú sobrando: a Daily (RTC-4H67) deixava 40 caixas
`bedFull` a 57% e as entregas 1–3 fora; o Atego (RTA-2F45) 227 a 58% e 14 entregas fora.

## Decisões

**D1 — Duas passadas, e a segunda só afrouxa conveniência.** O **mapa recomendado** é a varredura de
sempre, com todas as regras (a 118 inclusive). O que ele não coloca vai para o **complemento**, que
afrouxa, nesta ordem: (1) o alcance da mão — `outOfReach`; (2) a ordem de descarga — `needsRehandling`,
só quando não há alternativa. Nunca afrouxa: dentro do baú, caixas sem se cruzar (AABB, 1e-6), nada no
ar (assento nivelado sob a pegada inteira), pilha de pé no carregamento, `weightBalanced`, e a pilha de pé
em cada passo da descarga — a caixa do complemento só se apoia e só se escora em entrega que sai **depois
ou junto** dela, e nunca pousa em cima de caixa recomendada da própria entrega (que ficaria presa).
Só o que nem assim cabe continua `bedFull`.

**D2 — O alcance é tentado na hora; a ordem, no fim.** O primeiro lugar que a varredura recusa **só**
pela mão fica guardado (`reachFallback`), e a caixa vai para ele se a varredura terminar sem lugar
recomendado. É o lugar que o empacotador anterior à 118 escolheria, com o baú contendo só as entregas
`≥ k`. No fim, com as entregas anteriores já no baú, esse lugar não existe mais: a caixa da entrega `k`
não pode pousar nem se escorar em quem sai antes dela. A ordem de descarga, ao contrário, é afrouxada no
fim (`placeComplement`), sobre o espaço que sobrou, da última entrega para a primeira.

**D3 — O complemento não rouba lugar do recomendado.** O que é fundo demais para a mão da entrega `k` é
mais fundo ainda para as anteriores, cuja frente de piso fica mais perto da porta. E a decisão do arranjo
(`gridOrDepth`) compara só caixas recomendadas.

**D4 — A nota junta, sem mexer no mapa recomendado.** O recomendado não lê a nota (spec 119 D2 continua
valendo para ele): as caixas de uma nota já chegam contíguas (`stampCargoNote` carimba nota a nota) e a
ordenação é estável. O complemento que fura a ordem procura **primeiro** um lugar encostado nas caixas da
mesma nota, só nas fileiras onde ela está, e só depois qualquer lugar, da porta para a testeira.

**D5 — Pedaço é componente conexo por contato de face.** Duas caixas da mesma nota se tocam quando estão
encostadas num eixo — vão menor que uma célula do mapa de alturas (5 cm) na horizontal, pousada na
vertical — e se sobrepõem mais de 1 cm nos outros dois. A célula é a tolerância porque a caixa ocupa
células inteiras (spec 114): duas presumidas de 0,261 m encostadas ficam a 3,9 cm no desenho. A planta
publica `splitNotes: {documentId, pieces}[]` — só as notas com mais de um pedaço.

**D6 — Resposta.** Dois motivos novos em `PLACEMENT_REASONS`: `outOfReach` e `needsRehandling` (uma
caixa pode ter os dois). `CargoPlacement.splitNotes` é novo e opcional no tipo. Nada muda em
`STOP_ARRANGEMENTS` nem em `UNPLACED_REASONS`.

**D7 — Tela.** A caixa do complemento ganha marca própria no 3D, distinta da presumida (pontilhado) e da
dividida (`splitCargo`, contorno vermelho); a legenda e a folha impressa dizem a mesma coisa; o resumo
separa "N no mapa recomendado + M no complemento, de T"; a nota dividida é marcada na ficha da parada.

## Janela de deploy

O frontend não valida os motivos da caixa por lista fechada (`isPlacement` não percorre as caixas) e lê
`splitNotes` como opcional. **Qualquer ordem de deploy funciona**: API nova com frontend velho desenha a
caixa do complemento como caixa comum; frontend novo com API velha não tem complemento nem nota
dividida.

## Fora do escopo

- Faixas (`lanes`, spec 100) não ganham complemento — lá a sobra continua `splitCargo`.
- Refazer o mapa recomendado para caber o que os 1347 caixas de antes da 118 cabiam no Atego: aquela era
  outra arrumação inteira, com as entregas mais cedo fora da mão.
- Empacotamento em coordenada contínua (célula de 5 cm).

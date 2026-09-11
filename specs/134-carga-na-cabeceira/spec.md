# Spec 134 — Carga encostada na cabeceira

## Contexto

Em profundidade o bloco é empacotado encostado na testeira — que o mapa de apoio conta como parede
(`cargo-placement.policy.ts`, `supportsBefore`) — e **depois** deslocado para a porta (spec 099 D2) ou
para o meio acima de metade do teto de massa (099 D3). A pilha alta da última entrega se escora na
testeira durante o empacotamento; deslocada além do giro dela (`3b/√10`), fica solta.

O juiz antigo não via, porque a caixa se escorava nela mesma. Com o juiz corrigido da spec 133: **15
caixas sem apoio na Sprinter real** (vão de 0,315 m) e **15 no Accelo** (0,474 m), contra giro de
0,248 m; nas 32 variações da carga, 24 com 6 a 36 caixas soltas.

Uma tentativa anterior (reempacotar com a testeira à distância do deslocamento) foi recusada: criou
degrau na porta do Accelo (14 caixas expostas até 1,26 m).

## Decisão do usuário

> Encostar a carga na cabeceira: o bloco não é mais deslocado além da folga que mantém a escora na
> testeira (margem de 1 cm), e o vão sobra do lado da porta quando a testeira escora.

Isto **revê a 099 D2** (vão na testeira, carga na porta) onde a testeira escora alguma pilha. É também
a prática de amarração: carga encostada na cabeceira não corre na freada.

## Requisitos

- R1. O mapa de apoio anota, para cada caixa **carimbada** que precisou da testeira para ficar
  confinada, a folga `giro − vão` — quanto o bloco ainda pode andar sem soltar a escora.
- R2. O deslocamento do bloco (para a porta ou para o meio) é limitado a essa folga menos 1 cm
  (`HEADBOARD_BRACE_MARGIN_M`), arredondado para baixo no milímetro.
- R3. Onde nenhuma pilha precisa da testeira, a 099 vale como sempre: carga leve na porta, pesada no
  meio.
- R4. Nenhuma caixa perde apoio na descarga, no juiz corrigido, nas quatro viagens reais, nas 32
  variações e nos cubos; nenhuma outra invariante piora (total, recomendado, paradas fora, tempo).
- R5. A linha de base `known-unsupported.ts` da 133 é apagada e os contratos voltam a cobrar zero.
- R6. Os contratos da 099 que afirmavam a regra revista são reescritos com a razão, nunca apagados.

## Fora do escopo

`weightBalanced` continua sendo carimbado quando o degrau de peso manda equilibrar, mesmo que a
escora da testeira segure o bloco antes do meio: a decisão de equilibrar foi tomada, e o bloco anda
para o meio até onde a escora deixa. O vocabulário não muda — o frontend não precisa subir.

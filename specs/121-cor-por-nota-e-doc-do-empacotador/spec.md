# Spec 121 — A carga segue a cor da nota, e o empacotador fica documentado

## O que o usuário pediu (2026-09-10)

> "Grave isso na docs para documentar esse algoritmo."

E, sobre a cor, por escrito:

> "Deve ficar a cor da nota; qualquer coisa distribua mais cores nas notas, uma variedade maior;
> deixe as cores mais diferentes primeiro e conforme for precisando vai utilizando a variedade; e a
> carga segue a cor da nota."

A spec 119 dava à nota um **tom** da cor da parada, com uma trava que só oferecia o tom se ele
ficasse mais perto da cor própria do que da de qualquer outra parada desenhada. A paleta de paradas é
densa em CIELab, e a partir de ~8 paradas quase nenhum tom passava: as notas de uma parada repetiam
tom, e a distinção que o tom prometia não existia. Medido nas quatro viagens reais de 2026-09-10, com
as notas reais: **6 de 94** notas do Atego sem cor própria; com 5 notas por parada, **52 de 120**
repetindo na Sprinter.

E a documentação do empacotador misturava, no mesmo arquivo, a regra e o histórico de defeito: quem
chega novo não consegue ler o algoritmo inteiro sem atravessar dezessete medições.

## Decisões

**D1 — A caixa é pintada pela NOTA.** `documentId` já é carimbado desde a 119. A lógica de tom sai
inteira (`noteTone.service.ts` → `noteColor.service.ts`), e com ela as quatro classes `.noteTone*` do
CSS e a cópia em TypeScript da mesma mistura que existia só para a trava rodar sem DOM.

**D2 — A paleta é uma constante em array, ordenada das cores mais diferentes para as menos.** 128
cores, escolhidas por ponto mais distante em CIELab — o mesmo método da paleta de paradas. A nota N
usa a posição N, então a viagem pequena usa só o topo. Medido no prefixo: ΔE mínimo 18,3 com 4 · 12,9
com 16 · 10,6 com 32 · 9,4 com 64 · 8,5 com 94 (a maior viagem real) · 8,1 com as 128. A garantia é a
**monotonia**, e é ela que o contrato cobra — nunca um valor cravado em cima de uma cor. Cor nova
entra **no fim**: no meio, trocaria a cor de toda nota depois dela.

**D3 — 128 cores, e acabando a lista a repetição é dita.** A maior viagem real tem 94 notas. Passando
de 128, a nota 129 repete a cor da nota 1 — a repetição mais distante possível na ordem — e a legenda
imprime quantas notas repetiram. Repetir calado é o defeito que a paleta de paradas já pagou uma vez.

**D4 — A cor de nota não é a cor de uma parada, e isso custou separação.** `TripAssemblyMap` e
`TripCargoPanel` ficam **na mesma tela** na proposta e no diálogo de criação. Gerar a paleta só contra
o `MAP_SURFACE` devolvia **exatamente** a sequência de `stopColorOf` — cor de nota idêntica à do disco
ao lado. A geração é semeada também com as 96 primeiras cores de parada, e a grade de candidatos foi
adensada (2° de matiz e cinco saturações, contra 4° e três) para pagar a conta. Medido com 128 cores:
sem semear, ΔE 9,28 entre notas e identidade com as paradas; semeando na grade antiga, **6,61** —
abaixo dos 6,2 que a 119 mediu como "a mesma cor"; com a grade densa, **8,09**, e 8,21 até a cor de
parada mais próxima.

**D5 — A luminância continua presa à janela dos dois temas.** A paleta **não é redeclarada por tema**:
os três alvos de luminância relativa são os mesmos da paleta de paradas (0,15 · 0,22 · 0,30), e o
contraste medido é 3,09 contra o fundo escuro e 2,84 contra o claro — os dois acima do piso de 2,4.

**D6 — A cor é determinística pela nota, ordenada pelo id, não pela parada.** Reordenar a proposta
(spec 111) é um clique de seta; uma cor por posição de parada repintaria o baú inteiro a cada um.

**D7 — A parada se lê sem cor.** O disco de cor saiu da ficha da carga: com a carga pintada pela nota,
ele afirmaria uma cor que o baú não tem em lugar nenhum. O que identifica a parada passa a ser o
número da entrega, a **lista das notas dela** — desenhada agora também para a parada de uma nota só,
ao contrário da 119, porque é o único lugar em que a cor desenhada é nomeada —, a divisa entre fatias
(`sliceCut`) e o destaque ao clicar. `stopColorOf` continua servindo a lista de paradas, o mapa e o
disco da parada, que não desenham carga.

**D8 — Nenhuma coordenada de caixa muda.** Esta spec não toca o empacotador: só o frontend e a
documentação. A prova é a árvore — nenhum arquivo de `apps/api-transportada` foi alterado.

**D9 — A documentação vira dois arquivos irmãos.** `docs/domain/cargo-placement.md` passa a ser o
algoritmo como ele é hoje, legível de cabo a rabo por quem nunca abriu o código; e
`docs/domain/cargo-placement-defects.md` recebe o "por que é assim", com o número ao lado de cada
regra e a lista do que foi recusado. Misturar os dois era o que tornava o arquivo ilegível para quem
chega, sem tornar as medições mais fáceis de achar para quem já conhece.

## Fora de escopo

Marca da carga no desenho por arranjo, rótulo de parada desenhado dentro da planta, e qualquer
mudança de empacotamento.

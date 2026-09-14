# Spec 119 — Cor por nota dentro da cor da parada

## O que o usuário viu (2026-09-10)

No desenho 3D da carga a cor sai só da **parada** (`stopColorOf(box.stopSequence)`). Dentro dela,
havia dois tons: a caixa medida em cor cheia e a presumida lavada (30% de `--color-fog`). Como numa
parada com várias notas umas têm caixa medida e outras não, o desenho acabava mostrando notas
diferentes em tons diferentes — e o usuário gostou disso. Ele quer de propósito:

1. cada caixa da planta sabe de que nota veio;
2. cada nota da parada ganha um tom próprio, derivado da cor da parada;
3. a marca de presumida deixa de ser o tom mais claro (senão briga com o tom da nota);
4. dá para acender só as caixas de uma nota, além de acender a parada inteira.

## Decisões

**D1 — A caixa leva a nota, e a nota é o `nfe_documents.id`.** `PlacedBox` ganha `documentId` e
`documentNumber` (o número impresso, por onde a nota é procurada). Nada de chave de acesso nem dado
de pessoa. O carimbo acontece onde as caixas já são agrupadas por parada — `buildCargoPreviewStops`
(prévia) e o repositório da viagem (detalhe) —, nunca num mapa ao lado: o mesmo motivo da spec 088
G003. Caixa sem nota conhecida é `null` nos dois campos, nunca inventada.

**D2 — Nenhuma posição muda.** O empacotador só copia os dois campos da caixa de entrada para a
colocada; nenhuma comparação, chave de formato ou ordenação lê a nota. Prova nas quatro viagens
reais de 2026-09-10: as coordenadas antes e depois são idênticas (evidência).

**D3 — O tom é da nota, dentro da cor da parada.** Cinco tons: a cor da parada, e ela misturada a
`--color-fog` ou `--color-asphalt` em 80% e 64%, por `color-mix(in srgb, currentColor N%, var(--x))`
— nenhum hexadecimal novo. A nota recebe o tom pela **posição do id dela entre os ids da parada,
ordenados**: a mesma nota tem o mesmo tom em todo redesenho, qualquer que seja a ordem em que as
caixas chegam.

**D4 — O tom nunca vira a cor de outra parada.** Medido: a paleta de paradas é densa em CIELab (é
escolhida por ponto mais distante numa janela estreita de luminância), e nenhuma mistura fixa
distingue as notas **e** fica longe de todas as paradas — com mistura de 18% o tom já fica mais
perto de outra parada a partir de 8 paradas; com 8%, a partir de 30, e aí os tons quase não se
distinguem (ΔE 2). Por isso a trava é **por desenho**: um tom só é oferecido a uma parada se, nos
dois temas, ele fica mais perto da cor dela do que da cor de qualquer outra parada **desenhada**.
Tom que falha sai da lista daquela parada; na viagem grande as notas de uma parada podem repetir
tom, e o caminho inequívoco é acender a nota (D6).

**D5 — Presumida vira contorno pontilhado.** A lavagem saiu. A caixa presumida tem as arestas das
faces em pontos curtos na cor `--color-fog` — marca de borda, não de face: não cruza a face (o risco
diagonal que lia como rachadura continua recusado) e não mexe no preenchimento, que agora é da nota.

**D6 — Acender uma nota.** A ficha de cada parada com duas ou mais notas desenhadas lista as notas
(amostra do tom, número, caixas). Cada uma é botão com `aria-pressed`; acende só as caixas daquela
nota, e soma com as paradas acesas. Nada escolhido é o baú inteiro aceso, como sempre.

## Janela de deploy

A validação do frontend (`isPlacement`) não percorre as chaves de cada caixa, e o frontend lê
`documentId`/`documentNumber` como opcionais. **Qualquer ordem funciona**: API nova com frontend
velho ignora os campos; frontend novo com API velha desenha todas as caixas no tom da parada, sem a
lista de notas.

## Fora do escopo

- A folha impressa continua sem cor (laser mono): ela não ganha coluna de nota.
- Mudar a paleta das paradas — ela é a mesma do mapa e do traço da rota.

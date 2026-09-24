# Feature 174 — A prontidão fiscal na linha da nota

## Problema e resultado

O bloco de prontidão fiscal **repete a lista de notas** que já está logo acima, só que sem contexto:
no rodapé dele aparecem `883518/2 sem CT-e`, `879783/2 sem CT-e`, e assim por diante. Quem lê
precisa casar número de nota entre duas listas para descobrir qual parada tem o problema, e a ação
("Gerar CT-e desta viagem") só existe para a viagem inteira ou para o maço já marcado — não para a
nota que ele acabou de identificar.

O estado fiscal é **da nota**. Ele pertence à linha dela, ao lado do estado de separação que já está
lá, e não a uma segunda lista no fim da tela.

Resultado: cada nota diz o próprio estado fiscal, com a ação ali; a seleção em massa continua sendo
o caminho para agir em várias; e o bloco de prontidão encolhe para o que ele é de fato — o resumo e
o que **barra** a viagem.

## Fora do escopo

- O resumo no cabeçalho, que a spec 170 já entregou ("X de Y notas prontas").
- A regra de quando um CT-e pode ser emitido, que é do módulo fiscal.
- A dispensa de MDF-e, que continua sendo decisão da viagem, não da nota.

## Histórias priorizadas

### P1 — Ver o estado fiscal onde a nota está

**Given** uma viagem com notas sem CT-e
**When** o operador olha a lista de paradas
**Then** cada nota mostra o próprio estado fiscal, sem ele precisar procurar em outra lista.

### P2 — Agir na nota que ele acabou de ver

**Given** uma nota sem CT-e
**When** o operador clica na ação daquela linha
**Then** o CT-e daquela nota é gerado, sem passar pela seleção.

### P3 — Agir em várias de uma vez

**Given** várias notas sem CT-e
**When** o operador marca as que quer e usa a ação em massa
**Then** só as notas marcadas que aceitam a ação entram, e a tela diz quantas ficaram de fora.

### P4 — Saber o que o ícone quer dizer

**Given** um ícone de estado na linha
**When** o operador para o cursor ou navega por teclado até ele
**Then** aparece a explicação em texto — nunca só a cor ou o desenho.

## Requisitos funcionais

- **RF1** A linha da nota mostra o estado fiscal dela (sem CT-e, CT-e autorizado, rejeitado, NFS-e
  esperada), com ícone **e** texto — cor sozinha não informa.
- **RF2** O ícone carrega explicação pelo primitivo de tooltip do design system
  (`@/components/ui/tooltip`), nunca pelo `title` nativo (`docs/frontend/tooltips.md`).
- **RF3** Nota que aceita emissão ganha a ação na própria linha, com a mesma regra da ação em massa.
- **RF4** A seleção em massa e a ação "Gerar CT-e de N notas marcadas" continuam como estão — elas
  já existem e já filtram o que não aceita a ação.
- **RF5** O bloco de prontidão fiscal **deixa de listar as notas**: fica com o resumo, o que barra a
  viagem e a dispensa de MDF-e. A lista vira a própria lista de paradas.
- **RF6** Rejeição da SEFAZ mostra o código e a mensagem na linha, porque é o que diz o que fazer.
- **RF7** Sem permissão de emitir, o estado aparece e a ação não.
- **RF8** Textos em pt-BR; en onde a seção já existir.

## Requisitos não funcionais

- Só frontend: os dados de prontidão por nota já vêm da API (`fiscalReadiness.documents`).
- Área de toque de 44px em mobile; a linha da nota não pode virar parede de ícone.
- Contraste conferido no estado normal e na linha marcada.

## Casos extremos e falhas

- **Nota que não espera documento fiscal**: sem ícone e sem ação — ausência é silêncio, não um selo
  dizendo "nada a fazer".
- **Viagem inteira pronta**: a lista não mostra selo nenhum, e o bloco de prontidão diz que está
  pronta.
- **Rejeição com mensagem longa**: a linha mostra o código e corta a mensagem, com o texto inteiro
  no tooltip.
- **Nota marcada que não aceita a ação**: continua fora do lote, com o aviso que já existe.

## Critérios de aceite

- **CA01** Cada nota mostra o próprio estado fiscal, com ícone e texto.
- **CA02** O ícone explica por tooltip do design system, não por `title`.
- **CA03** A ação por nota emite só aquela nota.
- **CA04** A ação em massa continua funcionando e filtrando.
- **CA05** O bloco de prontidão não repete mais a lista de notas.
- **CA06** Sem permissão, o estado aparece e a ação não.
- **CA07** Revisão de design com print, em 375px e no desktop (web.md §15).

## Dúvidas

Nenhuma.

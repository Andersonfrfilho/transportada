# Feature 172 — A unidade da ocorrência vem da nota, não de uma lista nossa

## Problema e resultado

A quantidade da ocorrência (spec 166) só aceita **peça** ou **caixa** — dois valores fixos, com
`CHECK` no banco. Foi a decisão de 22/09, e ela já apertou no primeiro uso real: produto vendido em
**quilo** ou em **litro** não cabe em nenhuma das duas, e quem registra é obrigado a mentir ou a
deixar em branco.

A informação certa já está no dado: **cada item da nota traz a unidade comercial** do XML
(`commercialUnit` — UN, CX, KG, L, PC, FD…). Usar uma lista nossa ao lado dela é criar um segundo
vocabulário para a mesma coisa, e mais estreito.

Resultado: a quantidade é contada na unidade que a nota declara para aquele item, e o operador não
precisa converter nada de cabeça.

## Fora do escopo

- Converter entre unidades (quilo para peça, litro para caixa). O sistema não sabe o fator, e
  inventá-lo produziria número crível e falso.
- Mudar a unidade da nota, que é dado fiscal e chega pronto.

## Histórias priorizadas

### P1 — Contar na unidade do produto

**Given** um item vendido em quilo
**When** o separador registra a ocorrência dele
**Then** a unidade oferecida é **KG**, a da nota, e não uma escolha entre peça e caixa.

### P2 — Item sem unidade declarada não trava

**Given** um item cuja nota não trouxe unidade comercial
**When** o separador vai contar
**Then** ele escolhe entre peça e caixa, como hoje — a ausência degrada, não bloqueia.

### P3 — O que já foi registrado continua legível

**Given** ocorrências registradas antes desta spec
**When** alguém abre a leitura
**Then** elas continuam mostrando peça ou caixa, sem reescrita.

## Requisitos funcionais

- **RF1** O `CHECK` de `quantity_unit` deixa de ser a lista de dois e passa a aceitar o vocabulário
  de unidade comercial da nota, mais `unit` e `box` (o legado da spec 166).
- **RF2** O seletor de unidade de cada item nasce **na unidade daquele item na nota**, e oferece
  também peça e caixa — quem avaria uma caixa fechada de um produto vendido por quilo precisa poder
  dizer isso.
- **RF3** Item sem `commercialUnit` na nota cai no par peça/caixa de hoje.
- **RF4** A leitura imprime a unidade como a nota a escreve (KG, L, CX), sem traduzir para nome
  comprido — é o vocabulário que o conferente vê no romaneio.
- **RF5** Migration aditiva: nenhuma linha existente muda de valor.
- **RF6** Unidade desconhecida vinda do cliente continua sendo `400` — tolerar lista aberta não é
  aceitar qualquer string.
- **RF7** Textos em pt-BR.

## Requisitos não funcionais

- O vocabulário aceito é declarado em um lugar só, compartilhado entre API e banco pela mesma
  constante (nunca duas listas).
- Sem consulta nova: a unidade já vem com os itens da nota que a tela carrega.

## Casos extremos e falhas

- **Unidade da nota fora do vocabulário conhecido** (XML com sigla exótica): aceita e gravada como
  veio; a tela imprime o que a nota disse.
- **Ocorrência de nota inteira**: sem item, sem unidade — nada muda.
- **Mesma ocorrência com itens de unidades diferentes**: é o caso normal, e cada item guarda a sua.

## Critérios de aceite

- **CA01** Migration amplia o `CHECK` sem tocar em linha existente.
- **CA02** Item em quilo oferece KG como unidade inicial.
- **CA03** Item sem unidade na nota oferece peça e caixa.
- **CA04** A leitura imprime a unidade da nota.
- **CA05** Unidade desconhecida no payload é `400`.
- **CA06** Ocorrência antiga continua legível, sem migração de dado.

## Dúvidas

Nenhuma.

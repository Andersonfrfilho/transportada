# Feature 176 — O frete da nota na linha da viagem

## Problema e resultado

A linha da nota, na viagem, diz quanto a **mercadoria** vale (`R$ 6.805,48`) e não diz quanto aquela
nota **rende de frete**. Quem monta a viagem decide o que carregar olhando para o valor errado: a
nota mais cara não é necessariamente a que paga melhor, e a regra que define o frete
(percentual, mínimo, máximo) não aparece em lugar nenhum da tela da viagem.

O número já existe no produto, só não aqui: a listagem de notas mostra `freightAmount` e
`freightRuleName` — "o frete previsto pela parametrização e a regra que o produziu". A viagem tem
o vínculo (`freightCalculationId`) mas não o valor.

Resultado: cada nota da viagem mostra o frete ao lado do valor da mercadoria, **dizendo de onde o
número vem** — o cálculo guardado, quando existe, ou a previsão da parametrização.

## Fora do escopo

- Recalcular frete a partir da tela: o cálculo é do módulo de frete, não da viagem.
- A conta da viagem inteira (`TripAmounts`), que já existe e continua como está.
- Alterar regra de frete, que é cadastro.

## Histórias priorizadas

### P1 — Ver quanto a nota rende, onde ela está

**Given** uma viagem com notas vinculadas
**When** o operador olha a linha da nota
**Then** ele vê o frete daquela nota ao lado do valor da mercadoria.

### P2 — Saber se o número é medido ou previsto

**Given** uma nota sem cálculo de frete guardado
**When** a linha mostra o frete previsto pela parametrização
**Then** a tela marca que é previsão, e não um valor fechado.

### P3 — Saber qual regra produziu o número

**Given** um frete exibido na linha
**When** o operador quer entender de onde veio
**Then** o nome da regra aparece junto — sem ele o número não se explica nem se contesta.

### P4 — Não inventar número

**Given** uma nota sem cálculo guardado e sem regra que case
**When** a linha é desenhada
**Then** não aparece valor de frete nenhum, e a ausência é dita em texto.

## Requisitos funcionais

- **RF1** A resposta da viagem passa a trazer, por nota: o valor do frete, a **origem** dele
  (`measured` quando vem de `freight_calculations`, `estimated` quando é a previsão da
  parametrização) e o nome da regra.
- **RF2** A linha mostra o frete ao lado do valor da mercadoria, com os dois rótulos distinguíveis —
  dois números de dinheiro colados sem rótulo é convite a ler um pelo outro.
- **RF3** Origem `estimated` é marcada na tela. O vocabulário é o que a viagem já usa em
  `TripAmounts.revenueSource`, não um novo.
- **RF4** Sem valor e sem regra, a linha diz que não há frete calculado — ausência é dita, não
  desenhada como `R$ 0,00`. Zero é um preço; ausência não.
- **RF5** Campo ausente na resposta (API anterior) trata como ausência, nunca como zero.
- **RF6** `Decimal`/string no transporte; nada de float binário para dinheiro.
- **RF7** Textos em pt-BR e en.

## Requisitos não funcionais

- Sem N+1: o frete das N notas sai de uma consulta, como a prontidão fiscal já faz.
- A previsão não pode custar uma chamada por nota ao módulo de frete.
- Área de toque e contraste inalterados; a linha não pode virar parede de número.

## Casos extremos e falhas

- **Nota com cálculo guardado e regra removida depois**: mostra o valor guardado e o nome que o
  cálculo congelou — o retrato de quando foi calculado, não o cadastro de hoje.
- **Nota sem `nfeDocumentId`** (vínculo que é só cálculo de frete): mostra o frete, que é o que ela
  tem, e não finge ter nota.
- **Regra com mínimo aplicado**: o valor exibido é o total efetivo, não o percentual bruto.
- **Viagem antiga, API nova**: `freight_calculation_id` nulo em massa cai todo em `estimated` ou em
  ausência — nenhum dos dois pode ser lido como "frete zero".

## Critérios de aceite

- **CA01** A linha mostra o frete da nota ao lado do valor da mercadoria.
- **CA02** Origem `estimated` aparece marcada; `measured` não precisa de selo.
- **CA03** O nome da regra aparece junto do valor.
- **CA04** Sem frete e sem regra, a linha diz a ausência e não mostra `R$ 0,00`.
- **CA05** Campo ausente na resposta não vira zero.
- **CA06** Uma consulta para as N notas, provada por contrato de contagem.
- **CA07** Revisão de design com print, em 375px e no desktop (web.md §15).

## Dúvidas

Nenhuma — a fonte preferida é o cálculo guardado, com a previsão da parametrização como segunda
opção marcada, espelhando `revenueSource` que a viagem já usa.

# Spec 128 — empate de rota usa o maior valor, e a matriz só vale sozinha

> 🤖 Modelo: `sonnet` (decisões já tomadas pelo usuário; nada de arquitetura nova)

## Contexto

A 127 fez a rota do agregado ser a que casa com mais cidades da viagem. Empate real virou a lacuna
`DRIVER_ROUTE_AMBIGUOUS` e a parcela do motorista ficava **sem valor**. Medido na base local em
2026-09-10: 6 de 32 viagens empatam, 5 delas com motorista — R$ 3.231,89 a menos no custo, porque a
conta simplesmente deixava de somar o agregado.

Uma das seis, `157f1822`, só tem RIBEIRÃO PRETO: a cidade está na matriz (`0.001`) e na `1.001`, e
empata por construção.

## Decisões do usuário (não reabrir)

**D1 — empate → maior valor, explicando.** Quando duas ou mais rotas empatam no número de cidades, a
parcela usa, entre as zonas empatadas (a faixa mais alta de cada rota), a de **maior preço** na
tabela para a classe do veículo. A parcela sai **com valor**, origem `measured` (é preço da tabela),
e com um **aviso** que não marca a conta como incompleta — no molde de `ADVISORY_GAPS` da 124. O
detalhe diz quantas cidades empataram e nomeia cada faixa com o preço dela.

- Só uma das empatadas tem preço: usa-se essa, e o detalhe diz que a outra está sem preço.
- Nenhuma tem preço: a parcela fica ausente com a lacuna da 123, `DRIVER_RATE_MISSING_FOR_CLASS`,
  nomeando as zonas (veículo sem coluna na planilha continua `NO_DRIVER_RATE`, como na 123).
- O maior valor também empata: vence o **menor código de zona** (família numérica, depois faixa) —
  determinístico e independente da ordem das linhas.

**D2 — a matriz só vale sozinha.** A zona da família `0` (`parseRegionCode`, nunca o nome da cidade —
ADR-0021) só é escolhida quando **nenhuma outra rota** casa com cidade da viagem. Se a cidade também
está numa rota, a matriz não vota.

## Vocabulário

- `DRIVER_ROUTE_TIE_HIGHEST_RATE` — **novo**, aviso (entra em `ADVISORY_GAPS`). O cálculo escolheu o
  maior valor entre rotas empatadas; `detail` =
  `3 cidades · 1.003 (FRANCA) R$ 570,00 | 2.001 (SÃO CARLOS) R$ 480,00 · toco`.
- `DRIVER_ROUTE_AMBIGUOUS` — **mantido** em `VALUATION_GAPS` e nos rótulos, e não é mais produzido:
  resultado congelado pela 127 ainda o carrega, e tirar o rótulo faria a tela imprimir a chave crua.
- No empate, o aviso de empate vence o lembrete de ficha (`DRIVER_ZONE_PRICED_FROM_TABLE`): a parcela
  tem uma lacuna só, e é o empate que explica **o número**.

## Fora de escopo

- Escolher a rota pela ordem do roteiro ou pela cobertura do motorista (recusado pela 127).
- Mudar a conta de viagem sem empate — ela não pode mudar, e o contrato afirma isso.

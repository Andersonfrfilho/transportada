# Spec 131 — Sem teto de desenho

## Contexto

A spec 115 tirou o teto do **empacotamento** e deixou um teto de **desenho**: `MAX_DRAWN_BOXES` = 1500
aparava a planta pela caixa mais alta, e a tela dizia "N caixas ficaram fora do desenho por limite de
detalhe". O número vinha do custo do redesenho (~0,064 ms por caixa, medido com 451).

## Decisão do usuário

> "Não pode ter teto."

Toda caixa que o empacotador pôs no baú vai para o desenho. Se o desenho ficar lento, isso é defeito
do desenho a corrigir, **nunca** motivo para esconder carga.

## Requisitos

- R1. `resolveCargoPlacement` não apara a planta: `MAX_DRAWN_BOXES` e `trimForDrawing` saem.
- R2. Nenhuma caixa empacotada deixa de ser desenhada — a planta recebida tem todas as caixas da
  planta empacotada, e `tooMany` nunca é produzido pelo desenho.
- R3. O desenho mantém destaque por parada e por nota, cor por nota, contorno pontilhado da presumida,
  contorno do complemento e da dividida, e a acessibilidade (`role="img"`, `aria-label`).
- R4. Orçamento declarado: **redesenho ao girar a vista ≤ 100 ms com 6000 caixas** (quatro vezes o
  antigo teto), medido no navegador.

## Vocabulário mantido

`tooMany` continua em `UNPLACED_REASONS` e nos dois `*.locale.json`: o caminho de `budget` do
empacotador ainda o conhece (hoje sempre `Infinity`), e um frontend novo diante de uma API antiga
continua sabendo nomeá-lo. O frontend não valida `reasons` por lista fechada.

## Ordem de deploy

Indiferente. A API passa a mandar mais caixas no mesmo formato; o frontend não tem teto próprio.

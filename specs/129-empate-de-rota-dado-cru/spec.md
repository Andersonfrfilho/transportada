# Spec 129 — o empate de rota manda dado cru, e a tela compõe a frase

> 🤖 Modelo: `sonnet` (transporte de dado para camada de apresentação; nenhuma decisão de negócio nova)

## Contexto

A spec 128 fez o aviso `DRIVER_ROUTE_TIE_HIGHEST_RATE` sair com `detail` composto na API, em
português fixo — `4 cidades · 1.003 (FRANCA) R$ 480,00 | 2.001 (SÃO CARLOS) R$ 747,50 · vuc`. Na
tela em inglês essas palavras ("cidades", "sem preço") e a moeda formatada apareciam em português
mesmo assim, porque a API nunca soube em que idioma a tela está.

## Decisão

A API para de compor frase. `TripCostParcelBasis` (`of: 'driver'`) ganha `tie`, opcional e cru:
quantas cidades empataram e, por faixa empatada, o código, a cidade e o preço em decimal-string (ou
`null` para ausência). `detail` passa a carregar **só** o nome do condutor, quando há mais de um na
tripulação — o resto do que ele continha (zona, faixas, classe) já está em `basis`.

A tela (`tripCostParcelDetail.service.ts`, compartilhado entre o razão da viagem e o da proposta)
traduz "N cidade(s)" e "sem preço"/"no price", e formata a moeda com `formatAmount` — que é sempre
real brasileiro, em qualquer idioma da interface.

## O que NÃO muda

- Nenhum valor numérico da conta. A soma, a margem e o total continuam idênticos — só o texto do
  aviso muda de forma.
- Os outros `detail` revisados (`buildRateDetail` da spec 123, o de PIS/COFINS em
  `trip-tax.policy.ts`, o de pedágio parcial em `read-trip-valuation.use-case.ts`) já eram só dado
  (código, cidade, classe, contagem) — sem palavra natural nem moeda formatada — e ficam como
  estavam.
- O código `DRIVER_ROUTE_AMBIGUOUS` (spec 127) continua no vocabulário, sem produção.

## Compatibilidade

`basis.tie` é campo novo e opcional: uma API anterior a esta spec não o manda, e a tela cai no
texto cru de `detail` (o que a 128 produzia) sem tradução — não quebra, não esconde o aviso. Não há
validação de chave fechada (`hasExactKeys`) na `basis` do custo de motorista, então a ordem de
deploy entre API e frontend é indiferente aqui.

## Fora de escopo

- Mudar a conta em si (números).
- Estender o tratamento a `detail` que já é dado puro.

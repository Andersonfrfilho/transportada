# Spec 122 — A taxa de entrega risca, em vez de parecer cadastro esquecido

## O que o usuário pediu (2026-09-10)

No razão da viagem (`ValuationLedger`) a parcela `delivery_charges` sai hoje com a lacuna
`FEATURE_ABSENT` e o rótulo "módulo ainda não usado" — a mesma aparência de `NO_FUEL_CONSUMPTION` ou
`NO_DRIVER_RATE`, que são cadastro faltando. Mas taxa de entrega não tem cadastro nenhum para
preencher: o módulo simplesmente ainda não foi construído. O usuário decidiu: "crie uma página
depois para isso; deixe riscado por enquanto." A página de taxas de entrega **não** é desta spec —
só a aparência da linha muda, e o trabalho da página fica registrado em "Trabalho futuro" abaixo.

## Decisão

**D1 — O risco segue a lacuna `FEATURE_ABSENT`, nunca a parcela `delivery_charges`.**
`buildValuationLedger` (`trip-financials/shared/valuationLedger.service.ts`) marca cada linha com
`isGapStruckThrough: boolean`, verdadeiro só quando `line.gap` está em `STRUCK_THROUGH_GAPS`
(hoje `['FEATURE_ABSENT']`). Se `FEATURE_ABSENT` um dia nomear outra parcela ainda não construída,
ela herda o mesmo risco sem código novo — e nenhuma outra lacuna (`NO_FUEL_CONSUMPTION`,
`NO_DRIVER_RATE`, `TOLL_PARTIAL`, …) muda de aparência. Chavear pelo `kind === 'delivery_charges'`
teria acoplado a aparência à parcela específica, e a razão de negócio ("isto é lacuna de recurso
inexistente, não de cadastro") vive no **motivo**, não no nome do custo.

**D2 — O risco é CSS do design system, nunca inline.** `.ledgerGapAbsent`
(`trip-financials/styles/tripFinancials.module.css`) aplica `text-decoration: line-through` com
`text-decoration-color: var(--color-copper)` — o mesmo token que `.ledgerGap` já usa para a cor do
texto da lacuna, então nenhum token novo entra na folha (o contrato `css-tokens.contract.ts` já
varre por `var(--x)` sem definição, e `--color-copper` já está em `:root`).

**D3 — O texto continua presente; o risco é só reforço visual.** `ValuationLedger.component.tsx`
segue compondo `t('gap.FEATURE_ABSENT')` do jeito que já compunha — "módulo ainda não usado" continua
saindo no `<dd>`. A classe de risco só é somada à classe existente (`styles.ledgerGap`), nunca
substitui o texto por ícone ou por texto vazio: quem usa leitor de tela lê a mesma frase de sempre.

**D4 — As contas não mudam.** `buildValuationLedger` não toca `amount`, `sum`, `totalCost`,
`totalMargin`, `totalRevenue` nem `marginPercentage`: a marca é um campo booleano a mais na linha, e
a parcela com `FEATURE_ABSENT` continua fora da soma exatamente como antes (`amount: null` quando há
`gap`, como todas as demais lacunas).

## Trabalho futuro — a página de taxas de entrega

Esta spec **não** decide nada disto; fica registrado para quando a página nascer:

- **O que é uma taxa de entrega?** Por parada, por nota, por peso, por volume, valor fixo por
  viagem — o produto hoje não modela nenhuma dessas formas, e a escolha define o schema inteiro
  (`trip_cost_kinds` já reserva `delivery_charges` como parcela, mas não como lançamento).
- **Quem lança, e quando?** Lançamento manual como o pedágio hoje (`NOT_RECORDED` → valor digitado),
  ou parametrizado como o combustível (regra por empresa/perfil)? Isso decide se existe uma tela de
  configuração ("Taxas de entrega" ao lado de "Combustível" na aba correspondente) ou só um campo na
  viagem.
- **Entra no CT-e, ou só na margem?** Taxa de entrega pode ser encargo declarado no documento fiscal
  (como ICMS/PIS-COFINS) ou custo puramente interno que não aparece para o tomador do frete — as duas
  opções têm consequências fiscais diferentes e talvez exijam campo no perfil de emissão
  (`cte_emission_profiles`).
- **Permissão.** Seguindo o padrão de `trip.financials` (dinheiro tem permissão própria, separada de
  quem monta o roteiro), ou entra em `settings.manage` como as demais tabelas de referência
  (combustível, pedágio)?
- **Viagem já fechada.** A conta congelada (`trip.status === 'completed'`) já existe sem taxa de
  entrega nenhuma — lançar taxa depois do fechamento precisa decidir se recongela a conta ou se a
  taxa só vale para viagens novas a partir da data em que o módulo nascer.

## Fora do escopo

- Construir a página de taxas de entrega em si.
- Qualquer nova lacuna, template de notificação ou rota de API.
- Mudar `FEATURE_ABSENT` para qualquer outra parcela hoje — ele continua nomeando só
  `delivery_charges`.

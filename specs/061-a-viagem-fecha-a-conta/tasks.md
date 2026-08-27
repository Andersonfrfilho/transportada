# 061 — a viagem fecha a conta · tasks

> 🤖 Modelo: `sonnet` de padrão. T001, T003 e T004 são 🧠 (`opus`) — composição de custo, imposto e
> congelamento decidem números que ninguém confere de novo depois.

As três `[NEEDS CLARIFICATION]` estão respondidas: dois modelos de pagamento convivem (agregado por
rota, motorista da casa por quinzena), a margem **desconta** ICMS e PIS/COFINS, e `trip.financials`
é de `company-admin` e `finance`.

**O que a 065 D7 já deixou pronto:** a valoração **prevista** da viagem (`trip-valuation.policy.ts`,
`read-trip-valuation.use-case.ts`), com receita medida ou estimada por nota e as lacunas nomeadas.
Esta spec fecha a lacuna `NO_DRIVER_RATE`, acrescenta imposto, congela e soma.

| Task    | O que                                                                                  | Requisito | Estado |
| ------- | -------------------------------------------------------------------------------------- | --------- | ------ |
| T001 🧠 | ADR-0049, e a spec sem cláusula em aberto                                              | —         | ✅     |
| T002    | Migration: resultado congelado, custo avulso, modelo de pagamento do motorista, regime | 1, 6      | ⬜     |
| T003 🧠 | O custo do motorista: tabela de região por classe, e o fixo que é do período           | 2, 9      | ⬜     |
| T004 🧠 | O imposto que desce da receita: ICMS do payload, federais da configuração              | 2, 9      | ⬜     |
| T005    | O resultado congelado no fechamento, e o recálculo com motivo e versão                 | 2, 3      | ⬜     |
| T006    | Rotas: resultado, recálculo, custo avulso — e a recusa nomeando cada papel              | 4, 6, 7   | ⬜     |
| T007    | A soma por período, veículo, motorista e contratante, com a folha do período           | 5         | ⬜     |
| T008    | Frontend: o painel da conta na viagem                                                  | 10, 11    | ⬜     |
| T009    | Frontend: o workspace de resultados                                                    | 10, 11    | ⬜     |
| T010    | E2E: viagem → CT-e → fechamento → resultado congelado com a margem certa                | —         | ⬜     |

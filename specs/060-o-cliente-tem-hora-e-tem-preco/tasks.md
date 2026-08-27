# 060 — o cliente tem hora e tem preço · tasks

> 🤖 Modelo: `sonnet` de padrão. T001, T004 e T010 são 🧠 (`opus`) — máquina de estados de dinheiro,
> portão de despacho e superfície anônima decidem o que não dá para consertar depois.

As duas `[NEEDS CLARIFICATION]` da spec estão respondidas (aprovação por link público na landing;
calendário de feriado por município). Uma task por vez, cada uma com evidência executada.

| Task    | O que                                                                                 | Requisito | Estado |
| ------- | ------------------------------------------------------------------------------------- | --------- | ------ |
| T001 🧠 | ADR-0048, e a spec sem cláusula em aberto                                             | —         | ✅     |
| T002    | Migration: cliente, contratante, janela, exceção, feriado do município                | 1, 2, 2b  | ✅     |
| T003    | Migration: agendamento da parada, lançamento, regra recorrente, lote de repasse       | 3, 4, 4b  | ✅     |
| T004 🧠 | A janela responde "abre?" — intervalos, meia-noite, exceção e feriado, em módulo puro | 2, 2b     | ✅     |
| T005 🧠 | A máquina do lançamento, com toda transição inválida nomeada                          | 4, 5      | ✅     |
| T006    | Cliente e contratante nascem da nota — idempotente, sem regra, sem derrubar a importação | 5      | ✅     |
| T007    | Rotas de cliente: cadastro, janela, exceção, busca por documento                      | 6         | ✅     |
| T008    | Rotas de contratante e de feriado do município                                        | 6         | ✅     |
| T009    | Agendamento da parada, e o despacho recusando pendência com `force` + motivo          | 3, 7      | ✅     |
| T010    | Lançamento manual, regra recorrente e a fila de sugestões                             | 4, 4b, 6  | ⬜     |
| T011    | O lote por contratante, o relatório e as decisões                                     | 5, 6      | ⬜     |
| T012 🧠 | A página pública da landing: um lote, token que gira, trilha por token                | 5, 6      | ⬜     |
| T013    | O motorista vê hora e protocolo, e registra ocorrência de cobrança                    | 8         | ⬜     |
| T014    | Frontend: workspace de clientes, editor de janela semanal                             | 10, 11    | ⬜     |
| T015    | Frontend: fila de sugestões e painel de lote                                          | 10, 11    | ⬜     |
| T016    | E2E: cadastrar → agendar → despachar → entregar → lançar → fechar → aprovar           | —         | ⬜     |

`docs/spec/domain-model.md` é atualizado junto da task que cria cada tabela, não no fim.

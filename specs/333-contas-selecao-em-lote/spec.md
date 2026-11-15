# 333 — Contas: seleção em lote e filtros de busca

Pedido do Anderson (15/11/2026): na lista de contas, filtrar e selecionar para ações rápidas.

- Busca por nome (conta, categoria, tipo, pessoa) e faixa de vencimento (de/até), no cliente, sobre o mês que o servidor já trouxe.
- Caixa de seleção por linha (só conta em aberto) e "selecionar todas as listadas". A seleção vale só para o que está à vista: mudar o filtro nunca age em conta escondida.
- Barra de ação rápida: **Dar baixa** (paga o previsto de cada uma, na data escolhida) e **Cancelar contas** (motivo obrigatório). Chama as rotas de baixa e cancelamento que já existem, uma por vez; a falha de uma não derruba as outras e fica dita na tela.
- Só painel; sem API nem migration. Exige `expenses.manage`.
- Contrato: `test/expenses/view.contract.ts` (spec 333).

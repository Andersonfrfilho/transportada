# Roteiro T3.1 — conferir Contas em staging (Anderson, ~10 min)

Antes: `bash /home/miyazaki/Documents/personal/transportada/scripts/ops/staging-325-t31-rotina.sh` (somente leitura; imprime o caminho da saída).
Depois de conferir que a rotina está pausada e as tabelas existem, o Claude pede o `--retomar` (o mesmo UPDATE do botão "Retomar").

No painel de staging (usuário `company-admin`):

1. **Menu Fiscal → Contas** abre `/contas`; sem a permissão `expenses.read` o item some.
2. **Nova conta → fixa** (ex.: Aluguel, dia 10, mensal): aparece a ocorrência do mês na lista, "Previsto" no total.
3. **Nova conta → variável** com categoria "Pagamento de motorista/agregado" e um motorista: abre a ocorrência.
4. **Viagens do pagamento** nessa ocorrência: "Adicionar viagens" lista as disponíveis do motorista; incluir muda o previsto; remover volta ao valor da conta.
5. **Dar baixa** numa conta: estado vira "Paga"; abrir a baixa de novo não paga duas vezes.
6. **Configurações → Categorias de contas:** 8 categorias semeadas; criar e desativar uma.
7. **Rotinas (painel de rotinas):** `company-expense.occurrence.generate` aparece pausada; só o Claude/Anderson retoma. Segundo ciclo deve fechar com `created = 0`.

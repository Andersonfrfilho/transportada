# Spec 330 — Conta de funcionário

Anderson (15/11/2026): precisamos de uma modalidade de funcionário, com o tipo e se o pagamento é quinzenal, envolvendo **todas** as pessoas do cadastro (a parte administrativa só tem acessos).

## Decisão

Mesmo molde do causador da 328, em colunas próprias de `company_expenses` (a conta de motorista da 325 segue como está):

- `employee_driver_id` (ficha da frota da empresa), `employee_user_id` (usuário com vínculo ativo, com ou sem papel) ou `employee_name` (digitado): no máximo um (`company_expenses_single_employee_check`).
- `employment_type`: `clt`, `daily`, `autonomous`, `other`, opcional.
- **Quinzenal** é a recorrência `fortnightly` que já existe (vence 15 e último): nada novo.
- Categoria padrão **Funcionários** (329) e **Cartão de crédito** (pedida no mesmo dia), semeadas por empresa, idempotentes.

## Critérios

1. Criar e editar a conta aponta a pessoa e o tipo; informar uma forma limpa as outras; ficha de outra empresa ou inexistente é recusada; vínculo inválido é recusado.
2. A lista mostra "Funcionário: nome · tipo".
3. O seletor de pessoas é o `GET /expense-people` (fichas ativas da frota e todos os vínculos ativos, com perfil).

Fora desta spec: o fluxo de lançar conta pelo WhatsApp não pergunta o funcionário.

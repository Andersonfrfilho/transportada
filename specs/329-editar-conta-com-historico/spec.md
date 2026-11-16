# Spec 329 — Editar a conta, com histórico de valores

## Pedido (Anderson, 15/11/2026)

- A lista de Contas só tinha "Dar baixa": não havia como alterar uma conta já lançada.
- "A alteração deve ficar no histórico, não pode alterar o que era um valor antes já registrado."
- "O aluguel vai aumentar daqui três meses": o valor novo precisa de **competência de início**.
- Categorias de consumo (água, luz, gás), internet/telefone e financiamentos.
- Opcional: **link de onde se pega o boleto**, clicável na lista.
- Bug: depois de criar uma conta a lista não atualizava sozinha.

## Decisões

1. `company_expenses.expected_amount` vira o **valor de abertura** e nunca é reescrito. Cada mudança de valor é uma linha nova em
   `company_expense_amount_changes` (competência de início, valor anterior, valor novo, quem, quando). Só acrescenta.
2. O valor de uma competência é o da última mudança com início até ela; sem mudança, o de abertura. A mesma subconsulta está no
   `insertIfAbsent` da API e do worker (contrato de paridade).
3. `PATCH /expenses/:id` com `expectedAmount` + `effectiveFrom` (`yyyy-mm`, padrão o mês de hoje). Só mudam as ocorrências **abertas**,
   da competência em diante, com vencimento hoje ou depois e **sem viagens incluídas**; paga, cancelada ou vencida nunca é reescrita.
   Mesmo valor em vigor: nenhuma linha de histórico.
4. `GET /expenses/:id/amount-history` (`expenses.read`): valor de abertura e mudanças. Auditoria `expense.amount.changed`.
5. `company_expenses.bill_url` (http/https, até 500), opcional; a lista mostra "Abrir o boleto" com `rel="noopener noreferrer"`.
6. Seis categorias padrão (Água e esgoto, Energia elétrica, Gás, Internet e telefone, Financiamentos, Funcionários): na migration, só para empresa que
   já tem categoria (idempotente pelo unique empresa+nome); empresa nova as recebe na semente. Nenhuma categoria existente é tocada.
7. Criar, editar e dar baixa aguardam a renovação da lista; criar leva a lista ao mês da conta nova e limpa filtros que a escondam.

## Fora deste PR (proposta ao Anderson)

Linha digitável por competência com botão "Copiar" e PDF do boleto anexado à ocorrência do mês (reaproveita o armazenamento do
comprovante da spec 327).

## Publicação

API (migration) antes do painel: o painel novo manda `billUrl`/`effectiveFrom`, que a API antiga recusa (`.strict()`).

## Correção de valor digitado errado (urgente)

O Editar tem dois modos para o valor: **reajuste** (vale a partir de uma competência; não mexe em parcela vencida, paga ou cancelada) e **correção** (`amountKind = correction`). A correção troca o valor do trecho que contém a competência escolhida, inclusive a parcela vencida e não paga e o valor de abertura; parcela paga ou cancelada nunca muda. Cada mudança fica em `company_expense_amount_changes` com `kind` (`adjustment` | `correction`), e o histórico mostra "Correção" ou "Reajuste", de quanto para quanto, quem e quando.

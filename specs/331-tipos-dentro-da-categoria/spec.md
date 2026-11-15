# Spec 331 — Tipos dentro da categoria

Anderson (15/11/2026): a categoria é "Cartão de crédito", mas é preciso dizer **qual cartão**; parcelado e à vista da mesma fatura têm de somar quando se filtra ("Mercado Pago traz o total dos dois"). Digitar e Enter cadastra e já seleciona.

## Decisão

- Tabela `company_expense_subtypes` (empresa, categoria, nome, ativo). Nome não repete na categoria sem diferenciar caixa (índice único em `lower(name)`).
- `company_expenses.subtype_id`, com FK composta `(company_id, category_id, subtype_id)`: o tipo só vale da própria categoria da conta, garantido no banco além do caso de uso.
- API: `GET /expense-subtypes` (`expenses.read`), `POST /expense-subtypes` (`expenses.manage`, idempotente: nome que já existe devolve o mesmo tipo), `subtypeId` ao criar e editar a conta, `subtypeId`/`subtypeName` na lista e filtro `?subtypeId=`.
- Os totais da lista já somam o que o filtro devolve: filtrar por um tipo soma parcelado e à vista.
- Painel: campo "Tipo" abaixo da categoria (cadastro e edição) e filtro "Tipo". O campo de busca que cadastra ao digitar e Enter é um recurso do `SearchableSelect` (`creatable`), e a categoria passa a usá-lo também.

## Fora desta spec

"Quem causou" e funcionário com o mesmo campo único; "a própria empresa" como causadora; multa e juros do boleto; correção pelo bot do WhatsApp.

# Spec 328 — Quem causou a conta

Pedido do Anderson (15/11/2026): a conta ganha um campo **opcional** "quem causou" (ex.: o motorista que causou uma multa).

## Leitura adotada

- É uma **pessoa da frota** (`fleet_drivers`: motorista, agregado ou ajudante), escolhida na ficha. Não é quem recebe aviso.
- **Informativo**: nada dispara aviso, cobrança nem desconto a partir dele. Motorista e ajudante continuam sem receber nada de Contas (spec 325 RF24).
- Usuário do escritório como causador fica fora (pergunta em aberto).

## Requisitos

- RF1 `company_expenses.caused_by_driver_id` (nulo), FK composta `(company_id, id)`, migration aditiva com rollback que recusa com dado.
- RF2 `POST`/`PATCH /expenses` aceitam `causedByDriverId` (PATCH com `null` limpa); ficha de outra empresa ou inexistente é recusada (`ExpenseDriverNotFoundError`).
- RF3 A lista de vencimentos devolve `causedByDriverId` e `causedByDriverName` e filtra por `?causedByDriverId=`.
- RF4 Painel: campo no cadastro, linha "Causada por" na lista e filtro.
- RF5 WhatsApp "Lançar conta": pergunta opcional com "Pular" depois do vencimento; entra no resumo; sem pessoas na frota a pergunta nem aparece.

## Publicação

API antes do painel (a API recusa chave de consulta desconhecida com 400). O grafo do WhatsApp não muda: o passo mora no roteador da ação, sem republicar.

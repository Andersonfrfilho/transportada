# Spec 328 — Quem causou a conta

Pedido do Anderson (15/11/2026): a conta ganha um campo **opcional** "quem causou" (ex.: o motorista que causou uma multa).

## Leitura adotada

- Por decisão do Anderson (15/11), o causador é **uma entre três escolhas**: ficha da frota, usuário do escritório ou um **nome digitado** (fora do cadastro). Só uma por conta (CHECK `num_nonnulls <= 1`).
- É uma **pessoa da frota** (`fleet_drivers`: motorista, agregado ou ajudante), escolhida na ficha. Não é quem recebe aviso.
- **Informativo**: nada dispara aviso, cobrança nem desconto a partir dele. Motorista e ajudante continuam sem receber nada de Contas (spec 325 RF24).
- Campo novo **"onde a conta está"** (`bill_location`, texto livre até 120): com quem está o boleto ou em que fatura/cartão a cobrança aparece. Não há cadastro de faturas de cartão no produto (o módulo de faturas é o de frete), então é texto livre.

## Requisitos

- RF1 `company_expenses.caused_by_driver_id` (nulo), FK composta `(company_id, id)`, migration aditiva com rollback que recusa com dado.
- RF2 `POST`/`PATCH /expenses` aceitam `causedByDriverId` (PATCH com `null` limpa); ficha de outra empresa ou inexistente é recusada (`ExpenseDriverNotFoundError`).
- RF3 A lista de vencimentos devolve `causedByDriverId` e `causedByDriverName` e filtra por `?causedByDriverId=`.
- RF4 Painel: campo no cadastro, linha "Causada por" na lista e filtro.
- RF6 `GET /expense-people` (`expenses.read`) lista fichas ativas e usuários com vínculo ativo para o seletor.
- RF5 WhatsApp "Lançar conta": pergunta opcional com "Pular" depois do vencimento; entra no resumo; sem pessoas na frota a pergunta nem aparece.

## Publicação

API antes do painel (a API recusa chave de consulta desconhecida com 400). O grafo do WhatsApp não muda: o passo mora no roteador da ação, sem republicar.

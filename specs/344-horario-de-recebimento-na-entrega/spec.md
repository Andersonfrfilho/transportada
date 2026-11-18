# Spec 344 — O horário de recebimento aparece na entrega e a chegada avisa

Pedido do Anderson (18/11/2026): com o horário de recebimento lido da nota (PR 889, runbook § 5.40) e gravado em `delivery_client_windows`, (1) mostrá-lo nas informações da entrega, (2) levá-lo às mensagens do bot ao motorista e (3) avisar, ao registrar a chegada, se o motorista está dentro ou fora da faixa.

## Decisões

- **D1 — A fonte é a janela que já existe.** `delivery_client_windows` + exceções + feriado do município, resolvidos por `resolveDeliveryWindow`/`isWithinDeliveryWindow` (spec 060), no fuso `America/Sao_Paulo`. Nada de segunda tabela.
- **D2 — O cliente da parada vem do destinatário das notas dela** (`nfe_participants` `recipient` → `delivery_clients.tax_id`, dentro da `companyId`). Parada com mais de um destinatário de janelas diferentes **não mostra janela** (melhor nada do que a errada); mesma janela, mostra.
- **D3 — O aviso nunca recusa.** Chegar fora da faixa grava a chegada de sempre; o aviso é informação (mesma regra "máquina nunca recusa" do canhoto). Cliente sem janela cadastrada = `unset`: nenhuma linha, nenhum aviso.
- **D4 — Um contrato, três consumidores.** A API devolve `receivingWindow { source, intervals[], today[] }` por parada e `receivingWindowCheck { status: inside|outside|unset, at }` na resposta da chegada; painel, app do motorista e bot só leem.
- **D5 — Ordem de publicação (ADR-0081 §9):** painel e app tolerantes (campo opcional) → API → bot.

## Critérios de aceite

- CA01 Parada de cliente com janela: o detalhe da viagem (painel) e `GET /me/trips/current` (app) trazem a janela do dia e a semana.
- CA02 Parada sem janela, ou com destinatários de janelas diferentes: a chave não vem.
- CA03 O bloco da parada do bot (saída, chegada, oferta) ganha a linha "🕒 Recebe hoje: 08:00–11:00 e 13:00–17:00" (ou "Hoje não recebe" quando o dia está fechado), sem mudar nenhuma outra linha.
- CA04 A chegada responde `receivingWindowCheck`; o bot e o app avisam "dentro da faixa" / "fora da faixa de recebimento (hoje 08:00–17:00)". Fora da faixa nunca impede a chegada.
- CA05 Painel e app: componentes padrão do design system, prints claro/escuro × desktop/celular, revisor independente antes do merge.

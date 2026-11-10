# Tarefas — Feature 317

Modelo por etapa (regra do projeto): o coordenador abre cada etapa numa thread com o modelo indicado.

## Etapa 1 — Banco · Modelo: padrão do projeto

- [ ] T1 Teste de migration (antes): enum, colunas, tabelas, CHECK, índice único parcial, semeadura, renomeação só do nome padrão, rollback.
- [ ] T2 Migration aditiva + `trip.schema.ts` / `delivery-client.schema.ts`; `make migration-test`.

## Etapa 2 — API · Modelo: opus (regra de dinheiro, transação e idempotência)

- [ ] T3 Contratos: foto faltando por vaga, valor, nota (1 vs >1 vs 0), reenvio idempotente, sem saída à contratante (RF7), cliente marcado.
- [ ] T4 Política `stop-occurrence-photo-slots.policy.ts` e leitura das vagas no registro.
- [ ] T5 `report-stop-occurrence`: transação com fotos, linha `receiving_charge`, marca do cliente; remover a sugestão `onDelivered` para o tipo (E10).
- [ ] T5a Modo por nota/agrupada: linhas, `delivery_charge_documents`, idempotência por (parada, nota).
- [ ] T5b Pagamento ao motorista (E13): tabela, rota, bloqueio `409` na resolução.
- [ ] T6 Relatório de Ressarcimentos com `photos[]`; rota para limpar a marca (`delivery.manage`).
- [ ] T7 Validação do tipo recusa `emailsContractor` ligado em `unexpected_charge`.
- [ ] T8 Adicionar os arquivos de teste novos à lista do `package.json` da API.

## Etapa 3 — Painel · Modelo: padrão do projeto

- [ ] T9 Ressarcimentos: fotos rotuladas e link da ocorrência; locale; componentes do design system.
- [ ] T10 Ficha/lista do cliente: selo "Possível cobrança na entrega" e ação de limpar; PIX do motorista na linha de Ressarcimentos (`trip.financials`); tela de registrar o pagamento ao motorista na resolução.
- [ ] T11 Prints claro/escuro, desktop/celular, comparados a outra tela do painel.

## Etapa 4 — App do motorista · Modelo: padrão do projeto

- [ ] T12 Formulário: valor, escopo (uma nota/todas), quem pagou e PIX, vagas de foto rotuladas, travando o envio sem as duas.
- [ ] T13 Fila com `slotKey` e mensagem do que falta.
- [ ] T14a Selo somente leitura no cartão da parada do motorista, só se `show_client_charge_seal_to_driver`; interruptor no editor de tipos (painel).
- [ ] T14 Contrato de paridade da exigência (lê do servidor) e prints.

## Etapa 5 — Fechamento · Modelo: padrão do projeto

- [ ] T15 Runbook de produção, `CLAUDE.md` da API/painel/app, `evidence.md`.
- [ ] T16 Publicação em staging; conferir a ordem painel → API → app. Produção só com aprovação.

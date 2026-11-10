# Tarefas — Feature 314

- [x] T1 Contrato da API: reprocesso de item `rejected` reprocessável, `409` para os demais e para importação ocupada (teste antes do código).
- [x] T2 Contrato da simulação: devolve contagem por motivo e não grava.
- [x] T3 Use case + constante `REPROCESSABLE_REJECTION_CODES` + rota de simulação.
- [x] T4 Dupla confirmação: a segunda recebe `409` porque a importação já está `queued` (contrato de aplicação; sem tentativa nova para a recusa, não há o que duplicar no banco).
- [x] T5 Painel: botão, diálogo de confirmação com a contagem, textos, contrato.
- [x] T6 Runbook e CLAUDE.md da API/painel.
- [ ] T7 Evidência em `evidence.md` e publicação na staging.

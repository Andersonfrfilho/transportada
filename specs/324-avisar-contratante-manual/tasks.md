# Tarefas — Feature 324

Cada etapa abre numa thread com o modelo indicado (regra de modelo por spec). Contrato antes do código. Tudo para `staging`; nada para `main` (melhoria, não bug crítico). **Nenhuma task começa com `[NEEDS CLARIFICATION]` aberto em `spec.md`.**

- [x] **T0** Só leitura: permissão da mensagem à contratante, `findPlan` e `sendThroughGroup/sendByEmail` reaproveitáveis, contrato de paridade das frases de andamento. Resultado em `evidence.md`. — Modelo: sonnet
- [x] **T1** [contrato primeiro] Rota `POST /trip-occurrences/:id/contractor-notice`, corpo estrito, 409 para `blocks_contractor_notice`, idempotência D3, testes CA01–CA05. — Modelo: opus
- [ ] **T1b** Modelo geral `ocorrencia.contratante-aviso-manual` (HTML do e-mail + texto do WhatsApp, D10) no mesmo molde do publicador de modelos de ocorrência, com teste da régua de variáveis; script de staging com simulação primeiro (`--confirm` grava versão nova). — Modelo: opus
- [x] **T2** Caso de uso `sendManual` sobre o automático (ignora só `type_off`), tabela de registro, migration + rollback, auditoria e frase de andamento. — Modelo: opus
- [x] **T3** Leitura do estado no detalhe da ocorrência (pode avisar, motivo se não, já avisada por quem/quando). — Modelo: sonnet
- [ ] **T4** Painel: botão, diálogo de confirmação com canal e texto, estados e erros; componentes padrão; locale pt-BR/en; prints claro/escuro, desktop/celular (CA06). — Modelo: sonnet
- [ ] **T5** Staging: registrar Local fechado/Espera longa pelo app, avisar pelo botão em contratante com grupo e outra com e-mail, conferir CA01–CA06; runbook. — Modelo: sonnet

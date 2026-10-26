# Tasks — 279 O cliente tem e-mail para receber o boleto

> Gate: typecheck + lint por app, script `test` de cada app tocada, integração da API com `--env-file` sem skip.
> Modelo indicado por tarefa (regra do projeto: o coordenador abre cada etapa numa thread com o modelo da linha).

- [ ] **T1** (opus) Migration `delivery_client_emails` + schema Drizzle + rollback; contrato vermelho (CA1) — `database/`,
      `drizzle/`, migration-test.
- [ ] **T2** (sonnet) API do painel `delivery-clients/:taxId/emails` (RF1), validação, máscara, auditoria; integração CA1/CA4.
- [ ] **T3** (opus) Novo alvo `client_boleto_emails` no `forward-contractor-reply-by-email` (D3) com `emailIds` e `save`;
      paridade API/worker; integração CA2.
- [ ] **T4** (sonnet) Rotas do motorista (RF2/RF3) com escopo de viagem/empresa e limite; integração CA3.
- [ ] **T5** (sonnet) Painel: seção "E-mails para boleto" na tela do cliente e seletor no botão da ocorrência (RF5); prévia
      com print.
- [ ] **T6** (sonnet) App do motorista: botão e folha "Enviar ao cliente" (RF6), fila offline com `idempotencyKey`; prévia
      com print.
- [ ] **T7** (haiku) Linha do tempo "Boleto enviado ao cliente" (RF7), docs (`CLAUDE.md` das apps, runbook se tocar produção),
      `evidence.md`.

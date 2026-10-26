# Tasks — 279 O cliente tem e-mail para receber o boleto

> Gate: typecheck + lint por app, script `test` de cada app tocada, integração da API com `--env-file` sem skip.
> Modelo indicado por tarefa (regra do projeto: o coordenador abre cada etapa numa thread com o modelo da linha).

- [ ] **T1** (opus) Migration `delivery_client_emails` + schema Drizzle + rollback; contrato vermelho (CA1) — `database/`,
      `drizzle/`, migration-test.
- [ ] **T2** (sonnet) API do painel `delivery-clients/:taxId/emails` (RF1), validação, máscara, auditoria; integração CA1/CA4.
- [ ] **T3** (opus) Novo alvo `client_boleto_emails` no `forward-contractor-reply-by-email` (D3) com `emailIds` e `save`;
      paridade API/worker; integração CA2.
- [ ] **T4** (sonnet) Rotas do motorista (RF2/RF3) com escopo de viagem/empresa e limite; integração CA3.
- [ ] **T5** (sonnet) Painel: seção "E-mails do cliente" (por tipo) na tela do cliente e seletor no botão da ocorrência (RF5); prévia
      com print.
- [ ] **T6** (sonnet) App do motorista: botão e folha "Enviar ao cliente" (RF6), fila offline com `idempotencyKey`; prévia
      com print.
- [ ] **T3b** (sonnet) Campo `client_email_type` em `company_occurrence_types` (RF9): migration aditiva, validação, aba Tipos,
      API recusa o envio com `off`.
- [ ] **T3c** (opus) Envio automático (RF10): `client_email_send_mode`, gatilho ao aceitar o boleto no worker/API com
      paridade, idempotência, ator Sistema; integração do automático e do "sem e-mail".
- [ ] **T4b** (opus) Reconhecer o e-mail na mensagem do motorista (RF8): extração única no domínio, `detected_email` na
      mensagem, cartão de confirmação no app e no painel, confirmação por "1" no WhatsApp; teste de contrato com mensagens
      reais ("manda pra x@y.com", vários endereços, endereço mascarado/inválido).
- [ ] **T6b** (sonnet) Mensagem do sistema "Boleto enviado para o e-mail: …" na conversa e estado Enviado/Falhou no painel
      (RF12); teste de que log e evento não levam o endereço.
- [ ] **T6c** (sonnet) Botão "Ver detalhes da ocorrência" no cabeçalho da conversa, no painel e no app do motorista (RF13);
      prévia com print.
- [ ] **T7** (haiku) Linha do tempo "Boleto enviado ao cliente" (RF7), docs (`CLAUDE.md` das apps, runbook se tocar produção),
      `evidence.md`.

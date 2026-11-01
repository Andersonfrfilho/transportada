# Evidência — spec 290

- API: `test/operations/sent-messages.contract.ts` (use case), `test/operations-http/sent-messages.contract.ts` (rota), `test/integration/operations-sent-messages.integration.ts` (Postgres 16 descartável: junção com o tipo da ocorrência e isolamento por empresa). 2 integração + contratos verdes, `tsc` limpo.
- Painel: `test/operations/sent-messages.contract.ts` (frontend), 12 passam em `operations.contract.test.ts`; `tsc` e `eslint` limpos.
- Convite e redefinição de senha contam na entrega ao envio (aproximado); código de WhatsApp de verificação não tem log e não entra. A fonte `contractor_mail` foi retirada: o e-mail da contratante já está em `occurrence_conversations`.

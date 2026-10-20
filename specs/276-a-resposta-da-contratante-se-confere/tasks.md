# Tasks — 276 A resposta da contratante se confere

> Gate: typecheck + lint por app, script `test` da API e do worker, integração tocada com `--env-file` sem skip.

- [x] **T1** Etapa 1: contrato vermelho (`contractor-reply.contract.ts`, cópia idêntica no worker) → `decideContractorReply`
      devolve `awaiting_attachment` com zero anexos; integração da API (e-mail "Solicitado" → "Segue" + PDF; portal só texto).
- [x] **T2** Etapa 2: conferência do boleto. Anexo `boleto_pdf` no tipo e motivo `document_not_confirmed` (migration
      `20261020171448_contractor_reply_boleto_check`, só alarga três CHECKs; o rollback recusa com dado). Política pura
      `contractor-reply-document.policy.ts` (linha digitável FEBRABAN de 47/48 dígitos com DV conferido **e** número da
      nota no texto ou valor da linha igual ao total), cópia idêntica no worker. Texto do PDF: API no portal (unpdf), worker
      antes da transação na thread do pdf.js (ADR-0053). Sem texto ou sem leitor, o retorno vai ao operador.
- [ ] **T3** Etapa 3: status e tempos da ocorrência (leitura dos eventos; painel e app).
- [ ] **T4** Etapa 4: trava de pedido repetido na mesma nota (coluna do tipo, guarda no registro).
- [ ] **T5** Etapa 5: resposta automática à contratante.

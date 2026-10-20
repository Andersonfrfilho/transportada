# Tasks — 276 A resposta da contratante se confere

> Gate: typecheck + lint por app, script `test` da API e do worker, integração tocada com `--env-file` sem skip.

- [x] **T1** Etapa 1: contrato vermelho (`contractor-reply.contract.ts`, cópia idêntica no worker) → `decideContractorReply`
      devolve `awaiting_attachment` com zero anexos; integração da API (e-mail "Solicitado" → "Segue" + PDF; portal só texto).
- [ ] **T2** Etapa 2: conferência do documento por tipo (coluna do tipo, extração de texto do PDF no worker, motivo novo).
- [ ] **T3** Etapa 3: status e tempos da ocorrência (leitura dos eventos; painel e app).
- [ ] **T4** Etapa 4: trava de pedido repetido na mesma nota (coluna do tipo, guarda no registro).
- [ ] **T5** Etapa 5: resposta automática à contratante.

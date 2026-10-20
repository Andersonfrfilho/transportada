# Tasks — 276 A resposta da contratante se confere

> Gate: typecheck + lint por app, script `test` da API e do worker, integração tocada com `--env-file` sem skip.

- [x] **T1** Etapa 1: contrato vermelho (`contractor-reply.contract.ts`, cópia idêntica no worker) → `decideContractorReply`
      devolve `awaiting_attachment` com zero anexos; integração da API (e-mail "Solicitado" → "Segue" + PDF; portal só texto).
- [x] **T2** Etapa 2: conferência do boleto. Anexo `boleto_pdf` no tipo e motivo `document_not_confirmed` (migration
      `20261020171448_contractor_reply_boleto_check`, só alarga três CHECKs; o rollback recusa com dado). Política pura
      `contractor-reply-document.policy.ts` (linha digitável FEBRABAN de 47/48 dígitos com DV conferido **e** número da
      nota no texto ou valor da linha igual ao total), cópia idêntica no worker. Texto do PDF: API no portal (unpdf), worker
      antes da transação na thread do pdf.js (ADR-0053). Sem texto ou sem leitor, o retorno vai ao operador.
- [x] **T3a** Etapa 3, leitura: `stages` (etapa, início, autor, duração, motivo, terminal) e `timings.resolvedAt` em
      `GET /trip-occurrences/:id/timeline`, derivados em `occurrence-timeline.policy.ts` dos eventos já gravados — agora
      também os do retorno da 248 (`contractor.reply`, com a abertura do retorno). Nada é gravado. Painel mostra as etapas
      na linha do tempo da ocorrência (parser tolerante: API anterior sem `stages` segue valendo).
- [x] **T3b** Etapa 3, opção do tipo: fechar sozinha depois de entregar ao motorista (resolução `system` causada pelo
      retorno; hoje a CHECK da 266 exige `case_event_id` no `system`, então pede migration) e o app do motorista.
- [x] **T4** Etapa 4: trava de pedido repetido na mesma nota, escolhida no tipo (`duplicate_request_policy`:
      `while_request_open` | `until_resolved` | `allow`). Migration `20261020193306_occurrence_duplicate_request_policy`
      (padrão `allow`; tipo que já pede retorno passa a bloquear). Guarda em `saveTripOccurrence` sob trava advisory por
      nota e tipo; o app do motorista recebe a ocorrência que já existe, galpão e escritório recebem 409
      `TRIP_OCCURRENCE_DUPLICATE_REQUEST`. Painel: tolerante no #322, editor e cadastro (tipo novo nasce bloqueando).
- [x] **T5** Etapa 5: resposta automática à contratante, escolhida no tipo entre as respostas rápidas ativas da aba
      Contratante (`contractor_reply_acknowledgement_quick_reply_id`, nula = desligada, sem FK). Migration
      `20261020204714_contractor_reply_acknowledgement`. Sai uma vez por conversa, na mesma thread de e-mail, só quando o
      documento é confirmado e entregue ao motorista automaticamente; a ocorrência aberta segue o retrato do tipo que tinha.

# Evidence — 273 A ocorrência tem dono

## Decisões do dono (2026-10-17)

- **D-a** Responsável por contratante **e** por tipo de ocorrência ("e por tipo de ocorrência").
- **D-b** Precedência do dono: **contratante → tipo → empresa** (escolhida; difere de propósito da cópia da 271, que é
  tipo → contratante → empresa e não muda).
- **D-c** Um **principal** por lista ("2 - sim"), os demais só em cópia.
- **D-d** No tipo, o principal é uma **estrela na lista "Em cópia"** do bloco "E-mail à contratante" (sem campo novo).
- **D-e** Configuração nas telas que já existem (267): aba da empresa e ficha da contratante; perfil = quem tem
  `occurrences.resolve` (hoje Administrador da empresa, Financeiro, Operador).

## Assunções (reversíveis, marcar se o dono vetar)

- **A1** Lista sem estrela ainda dá dono: o primeiro elegível por nome.
- **A2** O dono sempre entra em cópia (RF8), mesmo vindo de uma lista diferente da que deu a cópia.
- **A3** Sem backfill: ocorrência anterior à publicação fica "sem dono".
- **A4** Mudar listas não troca dono de ocorrência existente.

## Levantamento (origem/staging 68613c0f9)

- Nenhuma coluna de dono em `trip_document_occurrences` (`trip.schema.ts`); `assigned_*` de
  `occurrence_conversation_unassigned` é outra coisa (e-mail órfão).
- Contratante responde → só o motorista é avisado (`worker/.../record-contractor-mail-inbound-message.use-case.ts:217`).
- Alarme de atraso → quem despachou (`drizzle-occurrence-contractor-reply-alert-store.repository.ts:87-113`).
- Reabrir → último que resolveu (`occurrence-resolution-notifier.gateway.ts:180-200`).
- "De" = `senderName <senderAddress>` (`send-contractor-mail-outbound-message.use-case.ts:163`); assinatura em
  `occurrence-mail.template.ts:28`; automático passa `actorUserId: null` (`send-automatic-occurrence-mail.use-case.ts:113`).
- Cópia: `occurrence-watcher.policy.ts` `selectSource`/`resolveEffectiveWatchers`; candidatos em
  `occurrence-watcher-candidates.query.ts`; corte de 50 em `resolve-mail-copy.service.ts`.

## Execução

(preencher por task)

# Evidence — 275 O aviso da ocorrência do motorista chega ao painel

## Decisão do dono (2026-10-19)

Quando o motorista registra ocorrência numa nota (app e WhatsApp), o painel recebe o aviso interno — sempre, todo tipo —
para os responsáveis por ocorrências (lista efetiva 267/271) mais quem despachou, sem duplicar; sem lista, só quem
despachou. Reverte a 079 ("sem notificador").

## Levantamento (código em f8e5a7a)

- Rota `/me`: `main.ts` `registerDriverOccurrence` sem notificador, depois `automaticOccurrenceMail.announce`. WhatsApp:
  mesmo caso de uso, mesmo vazio (`registerOccurrence` no `bootstrap`).
- `notifyOccurrence` (`register-trip-occurrence.use-case.ts`): `try/catch` que engole; um destinatário.
- `createOccurrenceNotifier`: último `trip_dispatch_snapshots.actor_user_id`; `dedupeKey` sem destinatário.
- Módulo de notificação 0.2.2: `idx_notifications_dedupe` único em `(company_id, dedupe_key)` → para vários
  destinatários a chave precisa do destinatário (D5).
- `loadEffectiveWatcherCandidates` exigia `contractorId` string; a prévia do e-mail tratava contratante nula como "sem
  lista". Para o aviso interno, nota sem contratante cai em tipo > empresa.
- ADR: nenhuma ADR registrava o "sem notificador" (só comentário de código) → a reversão fica nesta spec.

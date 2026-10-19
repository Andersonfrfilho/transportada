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

## T2 — contrato antes da implementação (2026-10-19)

- Vermelho: `bun --env-file=../../.env.test test ./test/trip-occurrence/driver-notification.contract.ts` → **0 pass, 1 fail,
  1 error** (`Cannot find module .../driver-occurrence-notifier.service.js`). Com o caso de uso e o serviço prontos e o
  `main.ts` ainda sem ligação: **11 pass, 1 fail** (a ligação no `main.ts`).
- Verde: **12 pass, 0 fail** — D1 (`notifies = false` avisa), D3 (template do tipo vence o legado), WhatsApp, D6 (falha do
  notificador não derruba; destinatário que falha não impede os outros; log sem `@`), D2 (responsáveis ∪ despachante, sem
  duplicar; sem lista só o despachante; inativo/sem e-mail fora; sem nada, ninguém), D5 (`dedupeKey` por destinatário) e a
  ligação das duas chamadas de `registerDriverOccurrence` no `main.ts` (o escritório segue com `occurrenceNotifier`).
- Script completo `bun --env-file=../../.env.test run test`: **12412 pass, 26 skip, 0 fail** (213 arquivos; os 26 skip são
  pré-existentes).

## T3 — integração (Postgres + migrations do módulo de notificação)

- `test/integration/driver-occurrence-notification.integration.ts`: **2 pass, 0 fail, 0 skip** — linhas em
  `notification.notifications` para {responsável, despachante} com a chave D5; despachante na lista → uma linha; sem lista → só
  o despachante; tipo com `notifies = false`.
- Integrações tocadas (fixture `registerStreetOccurrence`, `loadEffectiveWatcherCandidates`, WhatsApp): 12 arquivos,
  **54 pass, 0 fail, 0 skip** (`driver-occurrence-notification`, `occurrence-configuration-decides`, `driver-occurrence-items`,
  `occurrence-watchers-{mail,reply,repository}`, `occurrence-type-contractor-watchers`, `occurrence-chat-mail`,
  `address-correction-mail-repository`, `whatsapp-driver-flow-actions`, `occurrence-template-values`,
  `trip-field-authorship`).
- ⚠️ O `test:integration` inteiro parou em `trip-timeline.integration.ts` ("step operation still running") por mais de 30 min
  nesta máquina e foi interrompido; arquivo não tocado por esta spec. Medido aqui: o módulo cria a notificação e **depois**
  lança "Destinatário sem endereço utilizável para este canal" se o usuário não tem perfil com contato — a integração semeia
  `identity_user_profiles` para o despachante.

## Gates

`bun run typecheck` limpo · `bun run lint` limpo (`--max-warnings=0`) · `bun run format:check` (raiz) limpo.

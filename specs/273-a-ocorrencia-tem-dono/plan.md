# Plan — 273 A ocorrência tem dono

ADR: **0109 — A ocorrência tem dono** (escrita na T0.2): dono gravado na ocorrência no registro, precedência
contratante → tipo → empresa distinta da cópia, e avisos pessoais que caem no comportamento antigo sem dono.

## Dados (migration A, aditiva)

- `company_occurrence_watchers.is_primary boolean not null default false` + índice único parcial
  `(company_id) where is_primary`.
- `contractor_occurrence_watchers.is_primary` idem, único parcial `(company_id, contractor_id) where is_primary`.
- `company_occurrence_type_watchers.is_primary` idem, único parcial `(company_id, occurrence_type_id) where is_primary`.
- `trip_document_occurrences`: `owner_user_id uuid null`, `owner_source varchar(32) null` com CHECK
  (`contractor`,`occurrence_type`,`company`,`manual`), `owner_assigned_at timestamptz null`,
  `owner_assigned_by_user_id uuid null`; FK composta `(company_id, owner_user_id)` → `user_company_memberships`
  **ON DELETE SET NULL (owner_user_id)** — conferir na T0.1 se o Postgres em uso aceita `SET NULL (col)` (PG ≥ 15);
  senão, sem FK e a leitura trata ausência como "sem dono". Índice `(company_id, owner_user_id) where resolved_at is null`
  (nome real da coluna de estado conferido na T0.1).
- Marcar inativo ou remover da lista limpa `is_primary` na mesma transação.
- Sem backfill.

## Domínio

- `occurrence-owner.policy.ts` (puro, em `contractor-mail/domain/` ao lado de `occurrence-watcher.policy.ts`):
  `selectOccurrenceOwner({ contractorRows, typeRows, companyRows, eligibleUserIds })` →
  `{ ownerUserId, source } | undefined`. Mesma forma de linha que `loadEffectiveWatcherCandidates` devolve, mais `isPrimary`.
- Carregamento: estender `occurrence-watcher-candidates.query.ts` para devolver `isPrimary` (uma consulta, sem N+1).
- `assign-occurrence-owner.service.ts`: chamado **dentro** da transação de cada use case de registro de ocorrência
  (lista exata na T0.1: registro do motorista, registro no painel, ocorrência de parada).
- `transfer-occurrence-owner.use-case.ts`: assumir/passar; valida elegibilidade do destino; grava evento na linha do
  tempo da ocorrência (tipo de evento novo `owner_changed`, conferir a tabela de eventos na T0.1) + `audit_logs`;
  enfileira notificação pelo outbox existente.

## API

- `PUT /company-settings/occurrence-watchers/:userId/primary` e `PUT /contractors/:id/occurrence-watchers/:userId/primary`
  (`settings.manage`); `DELETE …/primary` desmarca. O tipo grava a estrela pelo próprio salvamento do tipo:
  `contractorMailPrimaryWatcherUserId` opcional ao lado de `contractorMailWatcherUserIds` (deve estar contido nele → 400).
- Leituras das listas passam a devolver `isPrimary`.
- `PUT /occurrences/:id/owner` `{ userId }` (`occurrences.resolve`): assumir = o próprio id. Código de erro em
  `shared/errors/codes.ts`: `OCCURRENCE_OWNER_NOT_ELIGIBLE` (404 para quem não é da empresa, 422 para inelegível da empresa).
- Leitura da ocorrência (lista e detalhe) ganha `owner: { userId, name, source, assignedAt, isEligible } | null`.
- Filtro da lista: `owner=me|none|all` (`none` inclui dono inelegível).

## Worker

- Inbound da contratante: após gravar a mensagem, notificação `occurrence.contractor-reply.received` ao dono elegível.
- Alarme de atraso: destinatário = dono elegível ?? quem despachou.
- Envio automático: resolve o dono e passa como assinante (nome) e no "De" (`<dono> — <senderName>`); dono entra no `Cc`
  antes do corte de 50 (o dono nunca é cortado; corta-se da cópia comum).

## API (notificador de reabertura)

- `occurrence-resolution-notifier.gateway.ts`: dono elegível ?? último que resolveu.

## Painel

- Estrela (`button` com `aria-pressed`, rótulo "Principal") em `OccurrenceWatcherRow` (empresa e contratante) e em
  `OccurrenceTypeWatchersSelect`. Texto de ajuda: "O principal vira dono das ocorrências desta lista."
- Lista de ocorrências: filtro segmentado Minhas / Sem dono / Todas, selo com o nome do dono.
- Detalhe da ocorrência: bloco "Dono" com origem, "Assumir", "Passar para…" (select de elegíveis via
  `/company-settings/occurrence-watchers/candidates` — conferir permissão na T0.1; se exige `settings.manage`, criar
  leitura de elegíveis com `occurrences.resolve`).
- Evento `owner_changed` na linha do tempo.

## Publicação

1. Painel tolerante (aceita `owner`, `isPrimary`, `contractorMailPrimaryWatcherUserId`, evento `owner_changed`) → staging → main com aprovação.
2. API + migration A → staging.
3. Worker → staging.
4. Painel com telas → staging.
Produção só com aprovação humana, na mesma ordem.

## Riscos

- Registro de ocorrência ficar mais lento: uma consulta a mais na transação; medir no teste de integração.
- Dono que não está em cópia por e-mail recebendo resposta: coberto pelo RF8.

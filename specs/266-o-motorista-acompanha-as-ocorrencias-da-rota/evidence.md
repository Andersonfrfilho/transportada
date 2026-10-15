# Evidência — 266 O motorista acompanha as ocorrências da rota

## Decisões do dono (chat, 2026-10-15)

- Prévia aprovada: "certo aprovado pode fazer".
- Escopo: "App-motorista + API + e o painel verifique se o painel está pronto também".
- Reabrir: "ele pode reabrir e responder e tudo registrado em evento".
- Documentos: anexos do chat + fotos do motorista.

### Decisões do dono (chat, 2026-10-15, após a revisão de arquitetura)

- **A. Reabrir é explícito.** Na ocorrência resolvida o composer do chat fica travado; o motorista toca em "Reabrir" e só
  então envia, com a primeira mensagem indo com `reopen: true`. Tocou em Reabrir e não enviou: nada é gravado. Resposta
  sem `reopen` (app antigo, WhatsApp) é gravada sem reabrir.
- **B. Resolução automática mostra frase fixa.** Por status terminal da tratativa: `closed` → "Encerrada pelo escritório",
  `returned_to_warehouse` → "Mercadoria devolvida ao armazém", `cancelled` → "Tratativa cancelada pelo escritório". Nunca a
  nota interna. O critério de aceite 5 mudou. A resolução manual mostra a observação do operador, e o formulário do painel
  avisa "o motorista vai ler esta observação".
- **C. Só enquanto a viagem não termina.** Lista, detalhe e links assinados do motorista valem para viagem não finalizada.
  Depois: 404 no detalhe e "Viagem encerrada" no app num link antigo. `trip.occurrence-resolved` não é enviada se a viagem
  já terminou.
- **D. `trip.occurrence-resolved` vai à equipe inteira** (motorista e ajudantes).

## Levantamento contra `origin/staging` (d6459e4cd, 2026-10-15)

Feito por três buscas paralelas, só de leitura. A T0.1 confere as linhas antes de qualquer código.

### API

- A tratativa (`trip_occurrence_cases`, `trip.schema.ts:3550`) só abre com política de reentrega `allowed`/`blocked`
  (`occurrence-case.policy.ts:20`). A ocorrência de parada (`trip_stop_occurrences`, :1625) nunca abre tratativa.
- Estados: `recorded`, `under_review`, `returned_to_warehouse`, `awaiting_contractor`, `decided`, `closed`,
  `cancelled`. O terminal é protegido por `trip_occurrence_case_events_terminal_check` (:3720). Não existe
  `resolved` nem reabertura.
- "Recusada" não é estado do servidor: é a rejeição do registro na fila offline do app (246).
- Rota do motorista `GET /me/trips/current` (`me-trip.routes.ts:346`): `registeredOccurrences` só traz as que abriram
  retorno com a contratante (248); a parada não traz ocorrência.
- Foto e assinatura do motorista são servidas só ao escritório (`GET /trip-occurrences/:id/attachments`).
  `signature_object_id` é gravado e nunca lido.
- Conversa da ocorrência (183): uma por (ocorrência, participante), sempre "aberta", sem relação com a tratativa.
  O motorista não cria conversa de ocorrência (263 D4).
- Notificações: só inbox e e-mail. Nada notifica mudança de estado da tratativa
  (`occurrence-case.use-case.ts:88`).

### App do motorista

- Não existe entidade de ocorrência no cliente. `DriverRegisteredOccurrence` = `{ id, contractorReply }`
  (`driverTrip.types.ts:54`).
- "Enviada" vem de `sentReportKeys` da sessão; as chaves ficam em estado da página e se perdem ao recarregar.
- `OPENABLE_SUBJECT_TYPES = ['document','trip']` (`driverConversation.constant.ts:20`).
- O cabeçalho (`DriverShellHeader.component.tsx:40-78`) tem fila, sino e avatar. O alerta entra entre a fila e o sino.
- Faltam os ícones `share`, `paperclip` e `arrow-left`. Não há `navigator.share`; existe `saveDriverFile`.
- CSP: `frame-src 'none'`, `object-src 'none'`.

### Painel — veredito: não pronto

- A tratativa aparece só para `source === 'document'` (`TripOccurrenceDetail.page.tsx:436`,
  `TripOccurrenceTable.component.tsx:207`).
- Não há resolver com observação, reabrir ou selo de reaberta. "Fechar" não pede nota e é terminal.
- **Guardas estritos:** status desconhecido reprova `isFeedItem` e `readPage` lança `RESPONSE_INVALID` para a lista
  inteira (`tripOccurrenceFeedClient.service.ts:148,372`). Um `kind` desconhecido derruba a linha do tempo
  (`tripOccurrenceTimeline.validation.ts:49`). Daí a Fase 1 antes da API.

## T0.1 — Conferência do levantamento

Conferido no worktree `spec-266` (base `origin/staging` d6459e4cd, 2026-10-15). Caminhos do painel em
`apps/frontend-transportada/src/modules/trip/`, da API em `apps/api-transportada/src/`, do app em
`apps/frontend-driver/src/`.

| Afirmação                                                              | Status | Referência correta / nota                                                                                                                                                                |
| ---------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guarda `case.status` em `tripOccurrenceFeedClient.service.ts:~148`     | ✅     | `shared/tripOccurrenceFeedClient.service.ts:148` (`TRIP_OCCURRENCE_CASE_STATUSES.includes`)                                                                                              |
| `readPage` lança `RESPONSE_INVALID` (~:372)                            | ✅     | `:372` (`every(isFeedItem)`); outros `RESPONSE_INVALID` em :326, :355, :370                                                                                                              |
| `tripOccurrenceTimeline.validation.ts:~49` rejeita `kind` desconhecido | ✅     | `default: return false` em `:49`; `isOccurrenceTimeline` exige `events.every(isEvent)`                                                                                                   |
| `TripOccurrenceDetail.page.tsx:436` limita a `source === 'document'`   | ✅     | `pages/TripOccurrenceDetail.page.tsx:437` (off by 1)                                                                                                                                     |
| `TripOccurrenceTable.component.tsx:207` idem                           | ✅     | `components/TripOccurrenceTable.component.tsx:207`                                                                                                                                       |
| `trip_occurrence_cases` em `trip.schema.ts:~3550`                      | ✅     | `src/database/trip.schema.ts:3551`                                                                                                                                                       |
| CHECK terminal (~:3720)                                                | ⚠️     | `:3721`. Atenção: o CHECK barra evento com `from_status` em `closed`, `returned_to_warehouse`, `cancelled`. `decided` **não** é terminal no CHECK                                        |
| `trip_stop_occurrences` (~:1625)                                       | ✅     | `:1626`                                                                                                                                                                                  |
| `occurrence-case.policy.ts:20`                                         | ✅     | `resolveOccurrenceCaseOpening` em `src/trips/domain/occurrence-case.policy.ts:20`                                                                                                        |
| `occurrence-case.use-case.ts:88`                                       | ✅     | `createOccurrenceCaseUseCase` em `src/trips/application/occurrence-case.use-case.ts:88`; o arquivo não importa nem chama notificação                                                     |
| `me-trip.routes.ts:346`                                                | ✅     | `src/trips/presentation/me-trip.routes.ts:346` (rota GET da viagem atual); `registeredOccurrences` é montado em `application/attach-driver-document-contractor-replies.service.ts:55-58` |
| Motorista só vê anexo via `GET /trip-occurrences/:id/attachments`      | ✅     | `trip.routes.ts:457` (`TRIP_OCCURRENCE_FEED_ATTACHMENTS_PATH`, `TRIP_READ_POLICY`, rota do escritório); nenhuma rota `/me/**` serve foto ou anexo de ocorrência                          |
| `signature_object_id` nunca lido                                       | ✅     | Só escrito (`trip.schema.ts:1662`, `:2452`; `register-driver-occurrence.use-case.ts:46,93`) e indexado; nenhuma leitura em rota ou serviço                                               |
| `driverTrip.types.ts:54` `DriverRegisteredOccurrence`                  | ✅     | `modules/driver-trip/shared/driverTrip.types.ts:54`                                                                                                                                      |
| `OPENABLE_SUBJECT_TYPES` (`driverConversation.constant.ts:20`)         | ✅     | `modules/conversation/shared/driverConversation.constant.ts:20` = `['document','trip']`                                                                                                  |
| `DriverShellHeader.component.tsx:40-78`                                | ✅     | fila (botão `upload`), `NotificationBell`, avatar, nessa ordem                                                                                                                           |
| `icon.tsx` sem `share`/`paperclip`/`arrow-left`                        | ✅     | `components/ui/icon.tsx`: zero ocorrências                                                                                                                                               |
| Sem `navigator.share`                                                  | ✅     | nenhuma ocorrência de `share`/`canShare` em `src/`                                                                                                                                       |
| `saveDriverFile` existe                                                | ✅     | `modules/driver-trip/shared/driverFileSave.service.ts:9`                                                                                                                                 |
| CSP `frame-src 'none'`                                                 | ✅     | `modules/shared/contentSecurityPolicy.service.ts:89`                                                                                                                                     |

### Fatos novos para as próximas tasks

- **Pasta de migrations da API:** `apps/api-transportada/drizzle/` (`drizzle.config.ts`: `out: './drizzle'`; sem subpasta `meta`).
  Última migration: `20261015120000_occurrence_type_default_icons`. A nova usa prefixo posterior, no formato
  `AAAAMMDDHHMMSS_nome` (ex.: `2026101512xxxx_trip_occurrence_resolution_events`) e deve ser reconferida contra
  `origin/staging` antes de gerar.
- **IndexedDB do app do motorista:** `DATABASE_VERSION = 4` em `modules/driver-trip/shared/indexedDbQueue.service.ts:43`
  (banco `transportada.driver-trip`). O plano pede v5 para o store `trip-occurrences`: confere.
- **FK de `companies`:** a tabela é `companies` (`src/database/identity.schema.ts:106`, `id uuid`). Outros schemas
  usam `.references(() => companies.id, ...)`; o `REFERENCES companies(id)` do plano está certo.

## T0.2 — Revisão de arquitetura

Veredito do `architect` (opus): **aprovado com mudanças**. Todas aplicadas na ADR-0105 (agora "aceita"), no `spec.md`, no
`plan.md` e no `tasks.md`. As decisões do dono acima entraram junto.

| #   | Mudança                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Identidade sem polimorfismo: `document_occurrence_id` e `stop_occurrence_id` com FK composta `ON DELETE CASCADE`, `CHECK (num_nonnulls(...) = 1)` e dois índices parciais. A API mantém `kind` + `id`.                    |
| 2   | Ator: `case_event_id` com FK e único parcial; `CHECK ((actor_kind='system') = (case_event_id IS NOT NULL))`; CHECK da nota do `resolved` interno; sai `client_message_id`; único `(company_id, conversation_message_id)`. |
| 3   | Lock: sai o `FOR UPDATE` no último evento. Resolver, reabrir e resolver automático travam a linha da ocorrência `FOR NO KEY UPDATE`; estado lido depois; ordem tratativa → ocorrência; T2.4 audita a 167.                 |
| 4   | Resolução automática em `applyTransition` (único escritor do status), em transição terminal (`decided` não é); não duplica; o insert do evento da tratativa devolve o id.                                                 |
| 5   | Reabrir sem rota nova: `reopen?: true` na resposta existente do motorista (dois use cases), dentro de `replayOrRun.run`; 409 `OCCURRENCE_CANCELLED` / `OCCURRENCE_NOT_RESOLVED`; emenda da 263 D4 reescrita.              |
| 6   | Prefixo `/me/trips/current/route-occurrences` (o roteador pega o primeiro match dinâmico); contrato de rotas na T2.5 contra colisão.                                                                                      |
| 7   | Estado do motorista: `cancelled_at` (só nota) → cancelada; sem evento → aberta; último `resolved` → resolvida; `reopened` → aberta com `reopenedAt`. `cancel` da tratativa não cancela a ocorrência.                      |
| 8   | `case.transition` fora da linha do tempo do motorista (ADR-0045 §6); `trip.occurrence-resolved` sem nota.                                                                                                                 |
| 9   | Destinatário de `trip.occurrence-reopened`: último `resolved` interno → seu ator; `system` → ator do evento da tratativa ligado; sem `occurrences.resolve` → ninguém, com log `info` sem texto.                           |
| 10  | `occurrences.resolve` já existe (`authorization.policy.ts:115`): reusa, sem seed.                                                                                                                                         |

## Tasks

_(cada task registra aqui comando, saída resumida e commit)_

### T2.1 — Tabela `trip_occurrence_resolution_events` (`f824d7bab`)

- Migration `apps/api-transportada/drizzle/20261015151849_trip_occurrence_resolution_events/` (aditiva, rollback manual
  que recusa rodar com evento gravado). `db:generate` de novo: `no_changes`. A tabela mora em
  `occurrence-conversation.schema.ts` (FK para a mensagem; o inverso criaria ciclo de import).
- Contratos da API: 11762 pass, 34 skip; a falha da lista de migrations esperadas foi corrigida (454 pass em
  `database-migration`, `migration-chain`, `trip-schema`).
- **Ambiente:** o WSL não tem `docker` (integração do Docker Desktop desligada) e o Bun local é 1.4.3 (o `Makefile` fixa
  1.3.14), então `make migration-test` não roda daqui. O `db:test` rodou direto contra o Postgres local: 185 pass e 4
  falhas, todas de **tempo** em testes antigos (fiscal, backfill de viagem, pre-deploy) que fixam o próprio timeout;
  disco `/mnt/c` lento.
- **Prova direta da migration** num banco descartável (`spec266_check`): cadeia inteira aplicada em 13 s; rollback ok
  (tabela e linha do journal removidas); reaplicada; seis inserções inválidas recusadas, cada uma pelo CHECK esperado:
  `owner_check` (duas identidades e nenhuma), `kind_check`, `internal_note_check` (nota em branco), `reopen_check`
  (reaberta sem mensagem), `system_case_event_check`. Banco descartado no fim.

### T2.2 — Política pura do andamento (`4e8b2f92c`)

- `resolveOccurrenceResolutionState` e `resolveSystemResolutionPhraseKey` (`case_closed`, `case_returned_to_warehouse`,
  `case_cancelled`). Teste vermelho antes (módulo ausente), verde depois. `tsc --noEmit` limpo.

### T4.1 — Ícones `share`, `paperclip`, `arrow-left` (`2361af55b`)

- Desenhados (o painel não tem os três). Teste de renderização vermelho antes, verde depois. `bun run typecheck` ok;
  `bun run test`: 1898 pass, 2 falhas de **tempo** em `test/shared.contract.test.ts` (varredura de arquivos lenta no
  WSL), que passa 85/85 sozinho com `--timeout 60000`.

### T4.8 (parte do pacote) — `renderComposerLock` no `conversations-ui`

- O pacote 0.10.0 só trava o composer por `closed`. Prop nova `renderComposerLock` (minor), testes primeiro (4 novos;
  1370 pass), build ok. PR https://github.com/Andersonfrfilho/adatechnology-packages/pull/141, CI verde, **merge
  autorizado pelo dono** ("pode fazer o merge") em `79af4c1`; a pipeline publica a 0.11.0. O lado do app (flag
  `reopen` no adaptador e na fila) fica na T4.8.

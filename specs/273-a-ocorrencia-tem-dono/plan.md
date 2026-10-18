# Plan — 273 A ocorrência tem dono

ADR: [**0109 — A ocorrência tem dono**](../../docs/adr/0109-a-ocorrencia-tem-dono.md): dono gravado na ocorrência no
registro, precedência contratante → tipo → empresa distinta da cópia, avisos pessoais que caem no comportamento antigo
sem dono, e o assinante do e-mail que a 272 consome.

Fatos que moldam o plano: [`evidence.md`](evidence.md) § Execução → T0.1 (arquivo:linha). Caminhos abaixo relativos a
`apps/api-transportada/src/` salvo indicação.

## Dados (migration A, aditiva)

- `company_occurrence_watchers.is_primary boolean not null default false` + único parcial `(company_id) where is_primary`.
- `contractor_occurrence_watchers.is_primary` idem, único parcial `(company_id, contractor_id) where is_primary`.
- `company_occurrence_type_watchers.is_primary` idem, único parcial `(company_id, occurrence_type_id) where is_primary`.
- **`trip_document_occurrences` e `trip_stop_occurrences`** (as duas — parada é outra tabela): `owner_user_id uuid null`,
  `owner_source varchar(32) null` com CHECK (`contractor`,`occurrence_type`,`company`,`manual`),
  `owner_assigned_at timestamptz null`, `owner_assigned_by_user_id uuid null`.
  - CHECK `…_owner_user_check` (o nome `trip_document_occurrences_owner_check` já existe, é da nota/recebimento):
    `owner_user_id`, `owner_source` e `owner_assigned_at` todos nulos ou todos preenchidos; `owner_assigned_by_user_id`
    preenchido ⇔ `owner_source = 'manual'`.
  - FK composta `…_owner_membership_fk` `(owner_user_id, company_id)` → `user_company_memberships (user_id, company_id)`
    **`ON DELETE RESTRICT`** (ordem de colunas e forma das FKs de usuário existentes, ex.
    `contractor_occurrence_watchers_membership_fk`). A remoção do vínculo limpa o dono antes do `DELETE` (§ Domínio).
    `owner_assigned_by_user_id` sem FK (histórico; o ator vem do token).
  - Índice parcial `(company_id, owner_user_id) where owner_user_id is not null` nas duas (não existe `resolved_at`: o
    estado é o último evento de resolução).
- **`trip_occurrence_owner_events`** (nova, só inserção, molde de `trip_occurrence_resolution_events`): `id`, `seq`
  identity, `company_id`, `document_occurrence_id` | `stop_occurrence_id` (`num_nonnulls = 1`, FKs compostas `CASCADE`),
  `kind` (`assigned` | `transferred` | `cleared`), `source` (o `owner_source` resultante; nulo em `cleared`),
  `from_user_id`, `to_user_id` (sem FK: histórico sobrevive à remoção do vínculo), `actor_user_id` (nulo = sistema),
  `created_at clock_timestamp()`. Índices `(company_id, document_occurrence_id, seq)` e `(company_id, stop_occurrence_id, seq)`.
- `contractor_mail_messages`: `signer_user_id uuid null`, `signer_name varchar(120) null`, `signer_kind varchar(16) null`
  CHECK (`owner`,`operator`), os três juntos.
- Cópias no worker: **não tocar** `trip-execution.schema.ts` (cópia mínima da purga, lista exata de colunas presa em
  `test/trip-location-purge/schema-parity.contract.ts:160-183`); o worker lê o dono por SQL cru. Só a cópia de
  `contractor_mail_messages` do worker ganha `signer_*`, na mesma task da migration.
- Sem backfill. Rollback com guarda (molde `20261015151849_trip_occurrence_resolution_events/rollback.sql`).

## Domínio

- `contractor-mail/domain/occurrence-owner.policy.ts` (pura):
  `selectOccurrenceOwner({ contractorRows, typeRows, companyRows, eligibleUserIds })` → `{ ownerUserId, source } | undefined`.
  Linha = `{ userId, name, status, isPrimary }`. Ordem contratante → tipo → empresa; vale a primeira lista com algum
  `active` **e** elegível (≠ `selectSource` da cópia, que olha só `active`); dentro dela o principal elegível, senão o
  primeiro elegível por `name`, `userId`. `contractorRows`/`typeRows` vazios quando não há contratante/tipo.
- Elegibilidade do dono = vínculo ativo + `occurrences.resolve` (`canResolve` de `findOccurrenceWatcherUsers`), **sem**
  exigir endereço (a cópia exige).
- Carregamento: `occurrence-watcher-candidates.query.ts` devolve `isPrimary` (mesma consulta, sem N+1).
- `trips/application/assign-occurrence-owner.service.ts` — **uma** função grava colunas e evento (também usada pela
  troca e pela limpeza); chamado **dentro** da transação de cada caminho de registro
  (T0.1): `drizzle-separation-occurrence.repository.ts:34`, `drizzle-driver-field-report.repository.ts:93` (documento e
  parada, :1088), `drizzle-office-occurrence-batch.repository.ts:44` (lote: listas carregadas uma vez por lote,
  elegíveis uma vez, escolha por nota), `drizzle-cargo-arrival-occurrence.repository.ts:114`. Grava as colunas e o evento
  `assigned`. O caminho de separação passa a ler a contratante sempre (`findDocumentOccurrenceSubject`), não só em tipo
  `listed`. **Sem trava consultiva** (serializaria todo registro por lista e, no lote com várias contratantes, travaria
  em ordem variável): as listas de uma escolha saem de **uma** consulta (snapshot único em READ COMMITTED — qualquer
  instante é válido para o RF3). Depois de escolher, `select 1 from user_company_memberships where company_id = $1 and
user_id = $2 and status = 'active' for key share`; sem linha → ocorrência **sem dono** (nunca falhar o registro por
  causa do dono; um vínculo apagado em paralelo daria `23503` e desfaria o relato do motorista). No lote, listas de
  contratante e de tipo carregadas com `inArray` uma vez por lote.
- `trips/application/transfer-occurrence-owner.use-case.ts`: assumir/passar; trava a linha (`for update`), confere o
  destino elegível na empresa (senão 404), mesmo dono → 200 sem evento; grava colunas (`manual`), evento `transferred`
  e `audit_logs` (`occurrence.owner.transferred`, só ids); sino pós-commit a quem recebeu se ≠ ator. Ocorrência
  cancelada → 409 `OCCURRENCE_CANCELLED` (erro existente). Violação de `…_owner_membership_fk` (vínculo apagado em
  paralelo) vira `OccurrenceOwnerCandidateNotFoundError` (404), não 500. A linha é resolvida nas duas tabelas com escopo
  de empresa; ocorrência de recebimento de carga (fora do feed) → 404 até aparecer no feed.
- `removeMembership` (`identity/infrastructure/drizzle-company-user.repository.ts:550-630`): a limpeza e a contagem
  rodam **antes** do `insert` em `audit_logs` (contagem no `metadata` como `occurrenceOwnersCleared`):
  `UPDATE … SET owner_user_id = null, owner_source = null, owner_assigned_at = null, owner_assigned_by_user_id = null`
  nas duas tabelas e `INSERT … SELECT` dos eventos `cleared`, sem laço por ocorrência. Só alcança o dono **passivo**
  (atribuído automaticamente, sem ação auditada): quem tem histórico já não é removível hoje
  (`audit_logs_actor_membership_fk`, `fiscal-operation.schema.ts:73`, e outras FKs `RESTRICT`). Remover quem tem
  histórico continua fora do escopo (suspender).
- Erros na classe do módulo (não existe `shared/errors/codes.ts`): `OccurrenceOwnerCandidateNotFoundError` (404
  `OCCURRENCE_OWNER_CANDIDATE_NOT_FOUND`) em `trips/domain/occurrence-owner.error.ts`; estrela de inelegível/inativo
  reusa `OCCURRENCE_WATCHER_NOT_ELIGIBLE` (400).

## API

- Estrela: `PUT /company-settings/occurrence-watchers/:userId/primary` e `PUT /contractors/:id/occurrence-watchers/:userId/primary`
  (`settings.manage`); `DELETE …/primary` desmarca. Sob a trava consultiva da lista (267): desmarca o atual, marca o novo,
  `audit_logs` `occurrence_watchers.<lista>.primary` com antes/depois (ids). Linha inativa ou inelegível → 400.
  Contratante de outra empresa → 404. Teste de roteador real (`/:userId/primary` não colide com `candidates`).
- Tipo: `contractorMailPrimaryWatcherUserId` opcional no salvamento (contido em `contractorMailWatcherUserIds` → senão
  400; linha da empresa ativa e elegível → senão 400); entra em `occurrence_type.contractor_mail.updated`. O índice
  parcial único não é `DEFERRABLE` (confere linha a linha), então a ordem em `replaceOccurrenceTypeMailWatchers`
  (`occurrence-type-mail-watchers.support.ts:42-98`) é: (1) `update … set is_primary = false where company_id,
occurrence_type_id and is_primary and user_id is distinct from $new`; (2) delete dos removidos; (3) insert dos novos
  com `is_primary = (user_id = $new)`; (4) `update … set is_primary = true` se o novo já existia. A linha do principal na
  empresa é lida `for share` (o `for key share` de :69 não conflita com a troca de status). Mesmo padrão nas rotas
  `…/primary`: desmarcar e marcar em dois comandos, desmarcar primeiro.
- Invariante: a estrela só vale se ativo e elegível (RF2); limpar na inativação é higiene, não garantia.
- Leituras das listas e do tipo devolvem `isPrimary` / `contractorMailPrimaryWatcherUserId`.
- `GET /trip-occurrences/owner-candidates` (`occurrences.resolve`): `[{ userId, name }]` elegíveis da empresa, sem
  e-mail (os candidatos da 267 exigem `settings.manage`).
- `PUT /trip-occurrences/:id/owner` `{ userId }` `.strict()` (`occurrences.resolve`); assumir = o próprio id. Ocorrência
  de outra empresa ou destino fora/inelegível → 404.
- Leitura (lista, detalhe, item do feed — `findTripOccurrenceFeedItem`, `trip-occurrence-feed.query.ts:815`, cobre os
  três): `owner: { userId, name, source, assignedAt, assignedByName, isEligible } | null`, nas fontes documento e parada.
- Filtro `owner=me|none|all` em `ALLOWED_KEYS` (`trip-occurrence-feed.schema.ts:42-54`); o use case resolve os elegíveis
  da empresa uma vez e passa `ownerUserIds` à consulta: `me` = `owner_user_id = viewer` e viewer elegível; `none` =
  `owner_user_id is null or not (owner_user_id = any($elegíveis))` (conjunto vazio → toda linha com dono é `none`);
  `me` com viewer inelegível → lista vazia sem consulta; `all` resolve só os donos da página
  (`findOccurrenceWatcherUsers({ userIds })`), `none` resolve a empresa inteira. O feed não tem contagem e o cursor não
  muda. Aplica-se às duas fontes do feed.
- Linha do tempo: fonte `trip_occurrence_owner_events` em `findTripOccurrenceTimelineSources`
  (`trip-occurrence-timeline.query.ts:276-307`), eventos `owner.assigned` / `owner.transferred` / `owner.cleared` (de,
  para, origem, ator) na união e no `KIND_PRIORITY` (`trips/domain/occurrence-timeline.policy.ts:26-84`), com
  `owner.assigned` logo depois de `occurrence.recorded` — um `kind` por verbo, como `resolution.resolved`/`.reopened`.
- Reabertura: `occurrence-resolution-notifier.gateway.ts:180-214` → dono elegível ?? último que resolveu.
- E-mail (API): no envio automático, `send-occurrence-mail.use-case.ts:315-320` usa o nome do dono elegível no lugar de
  `operatorName` e grava `signer_kind = 'owner'`; no manual, `signer_kind = 'operator'` com o operador. `resolveMailCopy`
  (`resolve-mail-copy.service.ts:28-74`) recebe `ownerWatcher` e o põe primeiro na cópia (dedup com `To`), não
  excluível; o corte do automático corta só da cópia comum; o manual que chega a 50 por causa do dono (que não se
  remove) → 400 `CONTRACTOR_MAIL_TOO_MANY_RECIPIENTS`, como hoje.

## Worker

- Dono elegível no worker = vínculo `active` na empresa (`left join user_company_memberships m on m.company_id =
o.company_id and m.user_id = o.owner_user_id and m.status = 'active'`), sem `occurrences.resolve`: o worker não resolve
  permissão e uma cópia da política não teria teste cruzado possível. Diverge do RF5 no caso "perdeu só a permissão" —
  `[NEEDS CLARIFICATION]` Q1 no `evidence.md`.
- Inbound: `drizzle-occurrence-conversation-mail.repository.ts:98-183` devolve `ownerNotice` (dono elegível, ≠ remetente
  interno) independente da entrega ao motorista; `record-contractor-mail-inbound-message.use-case.ts` avisa pós-commit,
  melhor esforço como `notifyDriver` (:254-263). Chave nova `TRIP_OCCURRENCE_CONTRACTOR_REPLY_RECEIVED`
  (`trip.occurrence-contractor-reply-received`) no catálogo da API e na cópia do worker.
- Alarme de atraso: `findRecipient` (`drizzle-occurrence-contractor-reply-alert-store.repository.ts:87-114`) → dono
  elegível ?? quem despachou (`coalesce(m.user_id, dispatch.actor_user_id)`).
- "De": `send-contractor-mail-outbound-message.use-case.ts:163` monta hoje sem aspas (vírgula no nome quebraria em dois
  endereços; `senderName` só tem `trim().max(200)`, `contractor-mail-settings.schema.ts:44`). Passa a ser: nome de
  exibição = `${signer_name} — ${senderName}` quando `signer_kind = 'owner'`, senão `senderName`; remove C0/C1, CR/LF,
  U+2028/2029 e controles bidi (U+202A–202E, U+2066–2069); trunca em 160; vira **quoted-string** RFC 5322 (escapa `\` e
  `"`): `"…" <addr>`. O sandbox (nodemailer) recebe `{ name, address }` para codificar RFC 2047 (travessão e acentos).
  Teste de contrato com vírgula, aspas, CRLF e acento.

## Painel

- Estrela (`button` com `aria-pressed`, rótulo "Principal") em `OccurrenceWatcherRow` (empresa e contratante) e em
  `OccurrenceTypeWatchersSelect`. Texto de ajuda: "O principal vira dono das ocorrências desta lista."
- Lista de ocorrências: filtro segmentado Minhas / Sem dono / Todas, selo com o nome do dono.
- Detalhe: bloco "Dono" com origem, "Assumir", "Passar para…" (select de `/trip-occurrences/owner-candidates`).
- Eventos `owner.assigned` / `owner.transferred` / `owner.cleared` na linha do tempo (`tripOccurrenceTimeline.service.ts` / `.validation.ts`).

## Coordenação com a 272 (ponto `signer`)

A 272 (e-mail em HTML) desenha o nome de quem assina. Contrato que ela consome, fixado por esta spec:

```ts
type OccurrenceMailSigner = {
  readonly userId: string
  readonly name: string // já saneado
  readonly kind: 'owner' | 'operator'
} | null // null = assina só a transportadora
```

`name` = texto cru do perfil, sem caracteres de controle, ≤ 120, **instantâneo** do envio; escapar HTML (272) e citar no
cabeçalho (worker) é de quem consome. Só `kind = 'owner'` altera o "De". Gravado em `contractor_mail_messages.signer_*`
e produzido por um só ponto na API (`resolveOccurrenceMailSigner`, ao lado
de `send-occurrence-mail.use-case.ts`). A 272 lê dali; não recalcula o dono.

## Publicação

1. Painel tolerante: o painel já descarta `kind` desconhecido da linha do tempo
   (`tripOccurrenceTimeline.validation.ts:89-93`) e os guardas manuais ignoram chave extra. A T1.1 escreve o teste de
   contrato dos parsers atuais com o payload novo (`owner`, `isPrimary`, `contractorMailPrimaryWatcherUserId`,
   `owner.*`); se verde sem mudar código, a etapa 1 não tem deploy (T1.2 vira registro); se vermelho, tolerância →
   staging → main com aprovação.
2. API + migration A (com as cópias de schema do worker) → staging.
3. Worker → staging.
4. Painel com telas → staging.
   Produção só com aprovação humana, na mesma ordem.

## Riscos

- Registro mais lento: listas + elegíveis na transação; medir no teste de integração (lote do escritório carrega uma vez).
- Dono que não está em cópia recebendo resposta: coberto pelo RF8.
- Nome do dono no cabeçalho do e-mail: saneado no worker; nunca em log.

## Revisão de arquitetura (T0.2) — veredito: aprovado com mudanças

`architect` (opus), 2026-10-18. Achados aceitos já estão incorporados acima; recusados e a pergunta aberta no
`evidence.md` § T0.2.

1. FK `RESTRICT` + limpeza explícita mantida; a justificativa ganha o bloqueio que `audit_logs` já impõe (só o dono
   passivo é alcançado) e a ordem limpeza → auditoria em `removeMembership`.
2. Registro sem trava consultiva; snapshot único das listas; `for key share` no vínculo do escolhido, sem linha → sem
   dono; troca converte violação da FK em 404.
3. Índice parcial não adiável: ordem desmarcar → apagar → inserir → marcar no tipo; principal lido `for share`;
   invariante "estrela só vale se ativo e elegível".
4. Filtros: `me` inelegível vazio, `all` resolve só a página, `none` com `= any`. Worker: elegível = vínculo ativo (Q1).
5. "De" em quoted-string saneado; sandbox com `{ name, address }`; contrato do `signer` para a 272 detalhado.
6. Não tocar `trip-execution.schema.ts` do worker; recebimento ganha dono mas não é lido nem trocado; eventos `owner.*`
   por verbo; etapa 1 da publicação pode não ter deploy; RF8 com 400 explícito; uma função grava colunas e evento;
   índice parcial `where owner_user_id is not null`; lote com `inArray`.

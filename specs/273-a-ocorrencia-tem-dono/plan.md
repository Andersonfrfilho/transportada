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
- `contractor_mail_messages`: **nada novo nesta spec.** As colunas do assinante e do "De" (`from_display_name`,
  `signer_kind` com `owner`, `signer_user_id`) e `user_company_memberships.job_title` são da 272 (D9, D10), que sai antes.
- Cópias no worker: **não tocar** `trip-execution.schema.ts` (cópia mínima da purga, lista exata de colunas presa em
  `test/trip-location-purge/schema-parity.contract.ts:160-183`); o worker lê o dono por SQL cru.
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
- E-mail (API): a 273 **implementa a porta `OccurrenceOwnerReader`** que a 272 entrega nula
  (`occurrence-conversation/application/occurrence-owner-reader.port.ts`): devolve o dono **elegível** da ocorrência
  `{ userId, name, jobTitle }` (nome do perfil e `job_title` da membership ativa, senão o rótulo do papel — mesma leitura
  do `findOperatorSigner` da 272), ou `undefined`. O montador, o `buildSenderDisplayName` e a gravação de
  `from_display_name`/`signer_kind`/`signer_user_id` são da 272 e não mudam. `resolveMailCopy`
  (`resolve-mail-copy.service.ts:28-74`) recebe `ownerWatcher` e o põe primeiro na cópia (dedup com `To`), não
  excluível; o corte do automático corta só da cópia comum; o manual que chega a 50 por causa do dono (que não se
  remove) → 400 `CONTRACTOR_MAIL_TOO_MANY_RECIPIENTS`, como hoje.

## Worker

- Dono elegível no worker = a **mesma** regra da API (D-f): vínculo `active` na empresa **e** `occurrences.resolve`,
  pela elegibilidade espelhada (§ Elegibilidade espelhada). O alarme e o inbound leem os fatos do dono numa consulta e
  decidem pela política do worker; inelegível = sem dono (reserva do RF6).
- Inbound: `drizzle-occurrence-conversation-mail.repository.ts:98-183` devolve `ownerNotice` (dono elegível, ≠ remetente
  interno) independente da entrega ao motorista; `record-contractor-mail-inbound-message.use-case.ts` avisa pós-commit,
  melhor esforço como `notifyDriver` (:254-263). Chave nova `TRIP_OCCURRENCE_CONTRACTOR_REPLY_RECEIVED`
  (`trip.occurrence-contractor-reply-received`) no catálogo da API e na cópia do worker.
- Alarme de atraso: `findRecipient` (`drizzle-occurrence-contractor-reply-alert-store.repository.ts:87-114`) → dono
  elegível ?? quem despachou (`coalesce(m.user_id, dispatch.actor_user_id)`).
- "De": **nada no worker nesta spec.** A 272 grava `from_display_name` e o worker o usa nos dois transportes, com o
  formatador saneado dela (D5 da 272); o dono chega ao "De" só por a porta devolver alguém.

## Elegibilidade espelhada (D-f)

Uma regra, duas implementações, nenhuma importação entre apps (molde do contrato de tabela espelhada da 247, com trava
de identidade que a 247 não tem). Espelha a **autorização canônica** (`drizzle-membership.repository.ts:33-129` +
`resolveCompanyPermissions`, o mesmo caminho do `canUserResolveOccurrences` da 266, `main.ts:2427-2439`), não o diretório
de responsáveis, que hoje não confere o status da empresa.

- **Regra pura** `canResolveOccurrences({ companyStatus, membershipStatus, hasProfile, roles, grantedPermissions })`:
  empresa `active` **e** vínculo `active` **e** perfil existente (o diretório descarta quem não tem perfil,
  `occurrence-watcher-directory.query.ts:123`) **e** `occurrences.resolve` no conjunto efetivo = união de papéis (diretos
  e de grupo) e concessões (diretas e de grupo), com `companies.manage` e nomes fora do catálogo nunca contando e
  permissão de serviço só por papel (`authorization.policy.ts:346-401`). Não há negação: revogar é apagar a linha.
  - API: `contractor-mail/domain/occurrence-owner-eligibility.policy.ts`, delega a
    `resolveCompanyPermissions({ roles, granted }).has('occurrences.resolve')` (`identity/domain/authorization.policy.ts:359`).
    `findOccurrenceWatcherUsers` passa a usá-la e a filtrar `companies.status = 'active'` (o filtro de
    `drizzle-membership.repository.ts:50`).
  - Worker: `occurrence-owner/domain/occurrence-owner-eligibility.policy.ts` com as constantes espelhadas
    `OCCURRENCE_RESOLVE_ROLES = ['company-admin', 'finance', 'operator']` (hoje `authorization.policy.ts:133-262`) e
    `OCCURRENCE_RESOLVE_PERMISSION = 'occurrences.resolve'`. Papel fora do catálogo não chega a nenhuma app (CHECK em
    `membership_roles.role`, `identity.schema.ts:160-164`, e em `company_group_roles`, `company-group.schema.ts:71-74`).
- **Fatos por SQL sobre as mesmas tabelas** nas duas apps: `companies.status`; vínculo `(company_id, user_id)` e
  `status`; perfil (`identity_user_profiles`); papéis = `membership_roles` ∪ `company_group_roles` via
  `membership_groups`; concessões = `membership_permissions` ∪ `company_group_permissions` via `membership_groups`. Na
  API, a consulta do diretório (`occurrence-watcher-directory.query.ts:70-107`, + empresa ativa); no worker,
  `occurrence-owner/infrastructure/occurrence-owner-facts.query.ts`, SQL cru como o `findRecipient` do alarme (o worker
  já mapeia `companies`, `identity_user_profiles` e `user_company_memberships` em
  `apps/worker-transportada/src/database/identity.schema.ts`; não ganha cópia de schema de papéis e grupos). Papéis e
  concessões em **subconsultas escalares separadas** (`array(select … union select …)`), nunca join de papéis ×
  concessões (multiplica linhas; a API evita de propósito em `drizzle-membership.repository.ts:90-95`); vazio = `'{}'`,
  nunca `{NULL}`. Filtrada por `company_id` e pelos ids dos donos. O worker **não** acrescenta filtro
  `company_groups.company_id` que a API não tem (o escopo do grupo é garantido na escrita,
  `drizzle-company-group.repository.ts:84,134`); apertar as duas fica para outra mudança.
- **Casos em forma de fatos, não de prosa:** `test/fixtures/occurrence-owner-eligibility.cases.ts`, **idêntico byte a
  byte** em `apps/api-transportada` e `apps/worker-transportada`:
  `{ id, companyStatus, membershipStatus: 'active' | 'disabled' | null, hasProfile, roles, groupRoles, directGrants,
groupGrants, otherCompanyMembership?, expected }`. O teste puro achata os fatos na entrada da política; os de
  integração **semeiam as linhas a partir do mesmo objeto**, por uma fábrica por app — semente escrita à mão por id é
  proibida.
- **Quatro travas contra divergência:**
  1. **Raiz:** `test/occurrence-owner-eligibility-mirror.contract.test.ts` falha se os dois arquivos de casos diferirem
     **ou se algum não existir**; `ci.yml` ganha `- run: bun test test/occurrence-owner-eligibility-mirror.contract.test.ts`
     ao lado da linha 95, no job `quality`, que sempre roda (a matriz de apps só roda o que foi tocado). Ler dois arquivos
     como texto na raiz é ferramenta do repositório, não importação entre apps.
  2. **Exaustividade na API:** para todo papel de `COMPANY_ROLE_PERMISSIONS` existe o caso "só este papel", com esperado
     `COMPANY_ROLE_PERMISSIONS[papel].includes('occurrences.resolve')`; todo papel citado num caso é chave da matriz; o
     esperado de E14/E15/E16 é `isGrantablePermission('occurrences.resolve')` (`authorization.policy.ts:399`).
  3. **Pura nas duas apps:** `test/occurrence-owner/occurrence-owner-eligibility.contract.ts` roda todos os casos.
  4. **Integração nas duas apps** (banco real, todos os casos semeados pela fábrica):
     `apps/api-transportada/test/integration/occurrence-owner-eligibility.integration.ts` (exercita
     `findOccurrenceWatcherUsers`; roda com `--env-file`, senão pula) e
     `apps/worker-transportada/test/integration/occurrence-owner-facts.integration.ts`; os dois entram na lista explícita
     de `test:integration` do `package.json` da app.

  Cadeia: matriz muda → API vermelha (2) → tabela muda → raiz vermelha até a cópia do worker (1) → worker vermelho até
  `OCCURRENCE_RESOLVE_ROLES` mudar (3).

- **Casos** (id · fatos · elegível); salvo indicação, empresa `active`, vínculo `active`, com perfil:

  | Id  | Fatos                                                                            | Elegível |
  | --- | -------------------------------------------------------------------------------- | -------- |
  | E01 | papel `company-admin`                                                            | sim      |
  | E02 | papel `finance`                                                                  | sim      |
  | E03 | papel `operator`                                                                 | sim      |
  | E04 | papel `fiscal`                                                                   | não      |
  | E05 | papel `viewer`                                                                   | não      |
  | E06 | papel `driver`                                                                   | não      |
  | E07 | papel `aggregate`                                                                | não      |
  | E08 | papel `separator`                                                                | não      |
  | E09 | papel `helper`                                                                   | não      |
  | E10 | papel `contractor`                                                               | não      |
  | E11 | papel `automation`                                                               | não      |
  | E12 | sem papel nem concessão                                                          | não      |
  | E13 | grupo que dá o papel `operator`                                                  | sim      |
  | E14 | grupo que concede `occurrences.resolve`                                          | sim      |
  | E15 | concessão direta `occurrences.resolve`                                           | sim      |
  | E16 | papel `viewer` + concessão direta `occurrences.resolve`                          | sim      |
  | E17 | concessão direta `trip.read`                                                     | não      |
  | E18 | concessão de permissão de serviço (`occurrence.automatic-mail`) — não interfere  | não      |
  | E19 | papel `company-admin`, vínculo `disabled`                                        | não      |
  | E20 | vínculo apagado (sem linha; `membershipStatus: null`)                            | não      |
  | E21 | `operator` ativo na empresa B, sem linha na empresa A (`membershipStatus: null`) | não      |
  | E22 | papel `operator`, sem perfil                                                     | não      |
  | E23 | papel `operator`, empresa `disabled`                                             | não      |
  | E24 | grupo que concede `occurrences.resolve`, vínculo `disabled`                      | não      |
  | E25 | concessão direta `occurrences.decide`                                            | não      |
  | E26 | concessão ou grupo com `companies.manage` ou nome fora do catálogo               | não      |
  | E27 | `operator` por papel e por grupo, mais concessão direta duplicada                | sim      |

## Painel

- Estrela (`button` com `aria-pressed`, rótulo "Principal") em `OccurrenceWatcherRow` (empresa e contratante) e em
  `OccurrenceTypeWatchersSelect`. Texto de ajuda: "O principal vira dono das ocorrências desta lista."
- Lista de ocorrências: filtro segmentado Minhas / Sem dono / Todas e status do dono em cada linha (D-g, emenda ao
  RF9): para o dono elegível, selo **"Atribuída a você"**; para os demais, o nome do dono; dono ausente ou inelegível,
  "Sem dono". Derivado de `owner.userId === viewer` e `owner.isEligible` — sem estado "lida/não lida" e sem coluna nova.
- Detalhe: bloco "Dono" com o mesmo status ("Atribuída a você" / nome / "Sem dono"), origem, "Assumir", "Passar para…"
  (select de `/trip-occurrences/owner-candidates`).
- Registro de ocorrência **não** gera sino ao dono (D-g); o status no painel é o aviso.
- Eventos `owner.assigned` / `owner.transferred` / `owner.cleared` na linha do tempo (`tripOccurrenceTimeline.service.ts` / `.validation.ts`).

## Coordenação com a 272 (ponto `signer`)

A 272 (`~/personal/transportada-wt/spec-272`, plan D5, D9, D10 e § Coordenação com a 273) sai **antes** e manda nos
nomes; a 273 se adapta.

| Ponto          | A 272 entrega                                                                                                                                                                                 | A 273 faz                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Assinante      | `OccurrenceMailSigner` = `{ kind: 'operator' \| 'owner', userId, name, jobTitle }` ou `{ kind: 'team' }`                                                                                      | Nada no tipo                                                                                                    |
| Leitor do dono | Porta `OccurrenceOwnerReader` com implementação nula                                                                                                                                          | Implementa: dono **elegível** (mesma regra da § Elegibilidade espelhada, lado API) `{ userId, name, jobTitle }` |
| "De"           | `buildSenderDisplayName({ companyDisplayName, signer })`: `<nome> — <nome de exibição da transportadora>` sempre, Resend e sandbox; `from_display_name` gravado; formatador saneado no worker | Nada. O RF7 herda a regra: "De" = `<nome do dono> — <nome de exibição>` (não mais o `sender_name` do Resend)    |
| Cargo          | `user_company_memberships.job_title` (D10)                                                                                                                                                    | O leitor devolve `jobTitle` na mesma leitura                                                                    |
| Colunas        | `from_display_name`, `signer_kind` (`operator`,`owner`,`team`), `signer_user_id`, `layout_version`, `has_inline_logo`                                                                         | Nenhuma coluna de assinante própria (o `signer_name`/`signer_*` do rascunho anterior sai)                       |
| Cópia (RF8)    | Não mexe                                                                                                                                                                                      | `resolve-mail-copy.service.ts`                                                                                  |

Se a 273 ficar pronta antes da 272 chegar a `staging`, rebaseia sobre a 272.

## Publicação

0. **A 272 antes** (porta, `from_display_name`, `job_title`).
1. Painel tolerante: o painel já descarta `kind` desconhecido da linha do tempo
   (`tripOccurrenceTimeline.validation.ts:89-93`) e os guardas manuais ignoram chave extra. A T1.1 escreve o teste de
   contrato dos parsers atuais com o payload novo (`owner`, `isPrimary`, `contractorMailPrimaryWatcherUserId`,
   `owner.*`); se verde sem mudar código, a etapa 1 não tem deploy (T1.2 vira registro); se vermelho, tolerância →
   staging → main com aprovação.
2. API + migration A → staging.
3. Worker → staging.
4. Painel com telas → staging.
   Produção só com aprovação humana, na mesma ordem.

## Riscos

- Registro mais lento: listas + elegíveis na transação; medir no teste de integração (lote do escritório carrega uma vez).
- Dono que não está em cópia recebendo resposta: coberto pelo RF8.
- Nome do dono no cabeçalho do e-mail: saneado pelo formatador da 272; nunca em log.

## Revisão de arquitetura (T0.2) — veredito: aprovado com mudanças

`architect` (opus), 2026-10-18. Achados aceitos já estão incorporados acima; recusados e a Q1 (respondida pela D-f) no
`evidence.md` § T0.2.

1. FK `RESTRICT` + limpeza explícita mantida; a justificativa ganha o bloqueio que `audit_logs` já impõe (só o dono
   passivo é alcançado) e a ordem limpeza → auditoria em `removeMembership`.
2. Registro sem trava consultiva; snapshot único das listas; `for key share` no vínculo do escolhido, sem linha → sem
   dono; troca converte violação da FK em 404.
3. Índice parcial não adiável: ordem desmarcar → apagar → inserir → marcar no tipo; principal lido `for share`;
   invariante "estrela só vale se ativo e elegível".
4. Filtros: `me` inelegível vazio, `all` resolve só a página, `none` com `= any`. Worker: elegível = vínculo ativo —
   **substituído pela D-f** (§ Elegibilidade espelhada, revisão própria abaixo).
5. "De" em quoted-string saneado; sandbox com `{ name, address }` — **passou à 272** (D5 dela), que sai antes.
6. Não tocar `trip-execution.schema.ts` do worker; recebimento ganha dono mas não é lido nem trocado; eventos `owner.*`
   por verbo; etapa 1 da publicação pode não ter deploy; RF8 com 400 explícito; uma função grava colunas e evento;
   índice parcial `where owner_user_id is not null`; lote com `inArray`.

## Revisão de arquitetura da D-f (T0.2) — veredito: aprovado com mudanças

`architect` (opus), 2026-10-18, só o trecho da elegibilidade. Escolha: **política pura espelhada + fatos por SQL nas
duas apps + tabela de casos espelhada**; a view/função no banco foi recusada (terceira cópia da matriz em SQL, presa em
migration congelada, troca de papel exigindo migration nova, deriva invisível sem o mesmo teste espelhado, e o worker
dependendo do tempo das migrations da API). Todos os achados aceitos e incorporados acima:

1. **F1** empresa `active` na regra e nos fatos (a autorização canônica confere; o diretório não) + E23.
2. **F2** casos em forma de fatos; integração semeia pela mesma fábrica.
3. **F3** integração nas duas apps (a consulta da API também muda e precisava de trava).
4. **F4** subconsultas separadas e `'{}'` para vazio.
5. **F5** esperado de E14–E16 preso a `isGrantablePermission`; E18 rotulado "não interfere".
6. **F6** exaustividade nos dois sentidos; papel fora do catálogo garantido pelo CHECK, não por caso.
7. **F7** worker não filtra empresa do grupo além do que a API faz.
8. **F8** E24–E27; forma de E21.
9. **F9** passo no `ci.yml` (job `quality`) e falha se faltar arquivo.

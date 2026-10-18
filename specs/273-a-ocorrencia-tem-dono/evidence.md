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

### T0.1 — Conferência contra o código (`origin/staging` 68613c0f9, 2026-10-18)

Caminhos relativos a `apps/api-transportada/src/` salvo indicação. Contagens de staging lidas por script só leitura
(`default_transaction_read_only = on`) dentro do container `api` (`railway ssh`), sem expor URL nem segredo.

**Caminhos que registram ocorrência** — dois pontos de `INSERT` em `trip_document_occurrences` e um em
`trip_stop_occurrences`; todos dentro de `database.transaction`, nenhum no worker/cron:

| #   | Caminho                                                                                | Use case                                                           | Transação                                                                                                                                                   | Contratante disponível                                                                                                   |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Separação no painel (`trip.routes.ts:1889-1891`) e pelo WhatsApp (`main.ts:1339-1405`) | `register-trip-occurrence.use-case.ts:374` → `saveOccurrence` :465 | `drizzle-separation-occurrence.repository.ts:34` → `saveTripOccurrence` (`delivery-proof-read.support.ts:564`, insert :620)                                 | Só quando o tipo é `listed` (:405-413), lido **fora** da transação por `findDocumentOccurrenceSubject`                   |
| 2   | Motorista no app (`me-trip.routes.ts`) e pelo WhatsApp (`main.ts:1180-1203`)           | `register-driver-occurrence.use-case.ts:38`                        | `drizzle-driver-field-report.repository.ts:93` → `saveDocumentOccurrence` :1168 → insert A                                                                  | Sim: `driver-occurrence-assessment.service.ts:216` (`driver-reachable-document.query.ts:51,57`), lido antes da transação |
| 3   | Lote do escritório (156), em nome do motorista                                         | `register-office-document-occurrences.use-case.ts:38`              | `drizzle-office-occurrence-batch.repository.ts:44` → insert A (:54), por nota em `office-occurrence-batch.service.ts:164`                                   | Sim, dentro da transação (`drizzle-office-occurrence-batch.repository.ts:68-110`)                                        |
| 4   | Recebimento de carga (237), backoffice                                                 | `register-cargo-arrival-occurrence.use-case.ts:107,127`            | `drizzle-cargo-arrival-occurrence.repository.ts:114` → `cargo-arrival-occurrence-write.support.ts:87` (`cargo_arrival_document_id`, sem `trip_document_id`) | Sim, obrigatório (`cargo-arrival-occurrence.port.ts:35`)                                                                 |
| 5   | Parada (motorista `main.ts:4234`, escritório `main.ts:4303`)                           | `reportStopOccurrence`                                             | insert em **`trip_stop_occurrences`** (`drizzle-driver-field-report.repository.ts:1088`)                                                                    | Só se a parada tiver nota (`trip_document_id` anulável); `occurrence_type_id` também é anulável (`trip.schema.ts:1647`)  |

- A contratante **não é coluna** da nota: sai do emitente da NF-e (`nfe_participants` papel `emitter`) casado com
  `contractors` por `(company_id, tax_id)` — `document-occurrence-subject.query.ts:29-75` (um) e `:81-112` (lote). Pode ser
  `null` (contratante não cadastrada).
- `notifyOccurrence` (`register-trip-occurrence.use-case.ts:540`, chamado em :485) roda **depois** do commit e engole erro;
  o lote do escritório o reusa (`office-occurrence-notification.service.ts:25,43`). O e-mail automático também é
  fire-and-forget pós-commit (`main.ts:1005-1013`, `:1199`, `:4077`, `:4357`); o caminho 4 não avisa ninguém.

**Estado aberta/resolvida, linha do tempo e leitura**

- `trip_document_occurrences` (`trip.schema.ts:2417-2603`) **não tem** `resolved_at` nem status: é só inserção, e o
  estado é o último `trip_occurrence_resolution_events` (ADR-0105; `occurrence-conversation.schema.ts:720-809`, lido em
  `trip-occurrence-feed-resolution.query.ts:22-56`). Só `cancelled_at` mora na linha.
- Não há tabela de linha do tempo: `findTripOccurrenceTimelineSources` (`trip-occurrence-timeline.query.ts:276-307`)
  junta ocorrência, fotos, eventos da tratativa, e-mails e eventos de resolução. Tipos na união `OccurrenceTimelineSource`
  (`trips/domain/occurrence-timeline.policy.ts:26-48`), ordem em `KIND_PRIORITY` (:75-84); no painel
  `tripOccurrenceTimeline.service.ts:27-45` e `tripOccurrenceTimeline.validation.ts`. Os nomes são pontuados
  (`occurrence.recorded`, `resolution.reopened`).
- Já existe "assumido por" derivado da tratativa (`occurrence-case-taken-by.support.ts:4-29`, `case.takenBy` no feed).
- Lista do painel: `GET /trip-occurrences` (`trip.routes.ts:463,1828-1845`), parser com chaves fechadas
  (`trip-occurrence-feed.schema.ts:42-54,141`), `viewerUserId` já chega ao use case (`trip-occurrence-feed.use-case.ts:206-222`),
  consulta `trip-occurrence-feed.query.ts:771` com duas fontes: documento (`:228`, filtros :234-264, `inner join trip_documents`
  :320-326 — ocorrência de recebimento **não aparece**) e parada (`:470`). Detalhe e linha do tempo partem de
  `findTripOccurrenceFeedItem` (`:815`), mesma consulta de linha.
- O worker tem cópia do schema de `trip_document_occurrences` (`apps/worker-transportada/src/database/trip-execution.schema.ts:63`)
  presa por teste de paridade (`apps/worker-transportada/test/trip-location-purge/schema-parity.contract.ts:179-180`).

**Pontos de aviso**

- Sino = `notificationModule.useCases.sendNotification` direto (sem outbox), canal `inbox`. Chaves em
  `notification/domain/notification-catalog.constant.ts:33-76` (catálogo :98+) e cópia por valor no worker
  (`apps/worker-transportada/src/notification/notification.constant.ts:30-44`, paridade em `test/notification/triggers.contract.ts`).
- Resposta da contratante (worker): transação em `drizzle-contractor-mail-inbound-worker.repository.ts:160-265`; a
  mensagem entra em `drizzle-occurrence-conversation-mail.repository.ts:98-183`; remetente usuário da empresa retorna sem
  aviso (:160-163); aviso ao motorista pós-commit em `record-contractor-mail-inbound-message.use-case.ts:217`
  (`notifyDriver` :254-263, engole erro). Nenhum aviso a usuário do escritório hoje.
- Alarme de atraso (worker): `drizzle-occurrence-contractor-reply-alert-store.repository.ts` `findRecipient` :87-114 —
  SQL cru, `actor_user_id` do último `trip_dispatch_snapshots` (:102-108); `null` = sem sino; roda na transação do lock da
  resposta (:121-126, :180). Não confere vínculo nem permissão de quem despachou. Só ocorrência de documento.
- Reabertura (API): `occurrence-resolution-notifier.gateway.ts:180-214`, `findLastResolverUserId` :88-125, confere
  `canUserResolveOccurrences` (`main.ts:2430-2440`); chamado com `void` em `driver-conversation.use-case.ts:384` e
  `reply-my-subject-conversation.use-case.ts:223`.

**"De", assinatura e cópia**

- O envio automático é da **API** (`send-automatic-occurrence-mail.use-case.ts:113-123`, `actorUserId: null`); o núcleo é
  `send-occurrence-mail.use-case.ts` (`actorUserId === null` ⇔ `automatic`, :143-145).
- Assinatura: `operatorName` (null sem ator) + `carrierName` em `send-occurrence-mail.use-case.ts:315-320`;
  `buildOccurrenceMail` (`occurrence-conversation/domain/occurrence-mail.template.ts:28-47`) monta `[operatorName, carrierName]`
  em texto e em HTML (`html` já existe, :11-15, gravado como `bodyHtml` :357).
- "De" é montado no **worker**: `` `${settings.senderName} <${settings.senderAddress}>` ``
  (`apps/worker-transportada/src/contractor-mail/application/send-contractor-mail-outbound-message.use-case.ts:163`), lido
  das configurações da empresa (`drizzle-contractor-mail-outbound-worker.repository.ts:142`); sandbox usa `message.fromAddress` (:221).
- O modelo da 271 não tem variável de assinante (`occurrence-contractor-mail.constant.ts:24-45`, 17 nomes) e recusa HTML no
  corpo (`HTML_BODY_PATTERN` :16-17).
- Cópia só na API: `resolve-mail-copy.service.ts:28-74` (corte do automático em :55-59), `occurrence-watcher.policy.ts`
  (`selectSource` :38-49 — primeira lista com algum **ativo**; `resolveEffectiveWatchers` :55-82), candidatos em
  `occurrence-watcher-candidates.query.ts:25-130` via `findOccurrenceWatcherUsers` (`occurrence-watcher-directory.query.ts:49`).

**Listas, vínculo, Postgres e permissões**

- `company_occurrence_watchers` (`contractor-mail.schema.ts:764-799`), PK `(company_id, user_id)`, FK `(user_id, company_id)`
  → vínculo `CASCADE`; `contractor_occurrence_watchers` (:802-839), PK `(company_id, contractor_id, user_id)`;
  `company_occurrence_type_watchers` (`occurrence-type-mail.schema.ts:14-44`) **sem `status`** (lê o da linha da empresa) e
  FK `(company_id, user_id)` → linha da empresa `CASCADE`. Teto 10/30 em `occurrence-watcher.constant.ts:9-10`, aplicado
  sob `pg_advisory_xact_lock` por lista (`drizzle-occurrence-watcher.repository.ts:56-65,122-134`).
- `user_company_memberships` (`identity.schema.ts:117-144`): único `(user_id, company_id)` (:139), `status` `active|disabled`.
  O vínculo **é apagado** de verdade em `removeMembership` (`identity/infrastructure/drizzle-company-user.repository.ts:625`,
  spec 191/ADR-0076).
- Postgres: staging `18.6` (medido); local/CI `postgres@sha256:742f…` = `17.10` (`docker image inspect`, `PG_MAJOR=17`);
  backup/restore em `postgres:18-alpine`. `ON DELETE SET NULL (col)` (PG ≥ 15) é aceito nos dois, mas o Drizzle não
  expressa a lista de colunas e o repositório não usa a forma em lugar nenhum; precedente explícito de recusar `set null`
  em FK composta: `trip.schema.ts:1091-1095` (ADR-0043 §3).
- Elegibilidade: permissão resolvida em TypeScript (`resolveCompanyPermissions`, `identity/domain/authorization.policy.ts:359`),
  não em SQL; `isEligible` da cópia = `canResolve` **e** endereço (`occurrence-watchers.use-case.ts:59`). O worker não tem
  resolução de permissão.
- `/company-settings/occurrence-watchers/candidates` exige `settings.manage` (`occurrence-watchers.routes.ts:21,123-131`).
- Estrela no tipo: o tipo salva a lista inteira (`occurrence.schema.ts:583-589` →
  `occurrence-type-mail-watchers.support.ts:42-98`), auditoria `occurrence_type.contractor_mail.updated`
  (`occurrence-type-mail-audit.support.ts:16,64-76`). Lista da empresa audita `occurrence_watchers.<lista>.<ação>`
  (`drizzle-occurrence-watcher.repository.ts:67-103`).
- Migrations em `apps/api-transportada/drizzle/YYYYMMDDHHMMSS_nome/` (`migration.sql`, `rollback.sql`, `snapshot.json`);
  a última é `20261017041702_occurrence_type_contractor_mail`.

**Staging (2026-10-18, só contagem):** 1 empresa; `trip_document_occurrences` 11 (11 abertas, 0 canceladas);
`trip_stop_occurrences` 3 (3 abertas); as três listas de responsáveis com **0** linhas.

**Divergências do plano (corrigidas no `plan.md` na T0.2)**

1. **Parada é outra tabela.** O plano punha o dono só em `trip_document_occurrences`; a ocorrência de parada mora em
   `trip_stop_occurrences` e precisa das mesmas colunas (o RF2 já previa "parada pula a contratante").
2. **Há um quarto caminho:** recebimento de carga (237) grava em `trip_document_occurrences` sem nota de viagem. O RF3 diz
   "qualquer caminho", então entra; não aparece no feed.
3. **Não existe `resolved_at`.** O índice "onde aberta" não tem coluna onde se apoiar; vira índice simples
   `(company_id, owner_user_id)`.
4. **Não há tabela de eventos da ocorrência.** `owner_changed` não pode virar mais um `kind` de
   `trip_occurrence_resolution_events`: a leitura de estado trata todo `kind ≠ resolved` como reaberta
   (`trip-occurrence-feed-resolution.query.ts:33`, `occurrence-resolution.policy.ts:79`). Precisa de fonte própria; e o
   nome segue a convenção pontuada (`owner.changed`).
5. **Não existe `shared/errors/codes.ts`** na API: o código mora na classe de erro do módulo (`*.error.ts`).
6. **O "De" é montado no worker** a partir das configurações da empresa: a API tem de gravar o nome do assinante na
   mensagem para o worker usar.
7. **O caminho 1 só lê a contratante em tipo `listed`**: o dono exige ler sempre (uma consulta a mais).
8. **Vínculo é apagável.** FK `RESTRICT` travaria remover quem é dono; `SET NULL (col)` funciona no PG 17/18 mas não é
   expressável no Drizzle — decisão na T0.2.
9. **O worker não resolve permissão:** sino da resposta e alarme de atraso precisam de "dono elegível" sem a política da API.
10. **Dono ≠ cópia na elegibilidade:** a cópia exige endereço; o dono não (spec: vínculo + `occurrences.resolve`). A lista
    que dá o dono é a primeira com membro ativo **e elegível**, não "algum ativo" como o `selectSource`.
11. **A estrela do tipo não tem status próprio:** a linha do tipo lê o status da empresa; inativar na empresa precisa
    limpar a estrela também nas linhas de tipo daquele usuário.
12. Candidatos para "Passar para…" exigem `settings.manage`: precisa de leitura própria com `occurrences.resolve` (o plano
    já previa a alternativa).

### T0.2 — ADR-0109 e revisão de arquitetura (2026-10-18)

- `docs/adr/` conferido: 0109 livre em todas as refs locais e remotas (`git ls-tree` por ref); a spec já citava 0109,
  nada a corrigir.
- [ADR-0109](../../docs/adr/0109-a-ocorrencia-tem-dono.md) escrita; `plan.md` reescrito com as 12 divergências da T0.1.
- Revisão por `oh-my-claudecode:architect` (opus): **aprovado com mudanças**, sem bloqueador. Seis achados maiores e
  oito menores; plan § Revisão de arquitetura resume o que entrou.

**Aceitos (todos incorporados ao `plan.md` e à ADR):**

1. FK `RESTRICT` + limpeza explícita em `removeMembership`, com a razão completa: `audit_logs_actor_membership_fk`
   (`fiscal-operation.schema.ts:73`) e outras FKs `RESTRICT` já impedem remover quem tem histórico, então a limpeza só
   alcança o dono passivo — e sem ela a remoção dele viraria um 500 novo. Limpeza antes da auditoria, em lote; FK na
   ordem `(owner_user_id, company_id)`.
2. Registro sem trava consultiva (serialização e deadlock no lote); snapshot único das listas; `for key share` no vínculo
   do escolhido, sem linha → sem dono (o `23503` de um vínculo apagado em paralelo desfaria o relato do motorista).
   Troca: violação da FK → 404.
3. Índice parcial único não é adiável: ordem desmarcar → apagar → inserir → marcar no salvamento do tipo; principal
   lido `for share` (o `for key share` atual não conflita com a troca de status); invariante "estrela só vale se ativo e
   elegível".
4. Filtros `owner=`: `me` com viewer inelegível vazio sem consulta; `all` resolve só os donos da página; `none` com
   `= any` e conjunto vazio.
5. "De" hoje montado sem aspas (vírgula no nome quebra o cabeçalho; `senderName` só tem `trim().max(200)`): quoted-string
   RFC 5322 saneado (C0/C1, CR/LF, U+2028/2029, bidi), truncado em 160; sandbox com `{ name, address }` (RFC 2047);
   contrato do `signer` para a 272 detalhado (texto cru, instantâneo, quem consome escapa).
6. Não tocar a cópia mínima `trip-execution.schema.ts` do worker (paridade exata da purga); worker lê o dono por SQL cru.
7. Recebimento de carga ganha dono, mas leitura e troca ficam fora (não aparece no feed).
8. Eventos `owner.assigned`/`owner.transferred`/`owner.cleared` (um `kind` por verbo) no lugar de `owner_changed`;
   `tasks.md` T1.1, T2.6 e T4.3 atualizadas.
9. Etapa 1 da publicação: teste de contrato dos parsers atuais com o payload novo; verde sem código → sem deploy.
10. RF8: manual que chega a 50 por causa do dono → 400 existente; uma função grava colunas e evento; índice parcial
    `where owner_user_id is not null`; lote carrega listas com `inArray`.

**Recusados:** nenhum.

**Ajuste do plano contra a spec:** o plano anterior dava 422 para destino inelegível da empresa; a spec RF4 e o critério 7
dizem 404 — vale a spec (`tasks.md` T2.6 corrigida).

**Observação (não bloqueia, dentro do que a spec decidiu):** o RF6 não lista aviso ao dono quando a ocorrência é
registrada; o aviso de registro continua indo a quem despachou (`occurrence-notifier.gateway.ts:33`). Se o dono quiser
o sino do registro para o dono, vira emenda.

### [NEEDS CLARIFICATION] Q1 — elegibilidade do dono no worker

O RF5/RF6 dizem que dono sem vínculo **ou** sem `occurrences.resolve` é "sem dono", e os avisos caem na reserva. A
permissão só é resolvida na API (`resolveCompanyPermissions`, em TypeScript, com papéis, grupos e concessões diretas);
o worker, que dispara o sino da resposta da contratante e o alarme de atraso, não tem essa política, e uma cópia dela não
teria teste cruzado (apps não importam código uma da outra).

- **Recomendado pela revisão (padrão no `plan.md`):** no worker, elegível = vínculo ativo. Consequência: quem perdeu só
  `occurrences.resolve` mas segue com vínculo ativo aparece "sem dono" no painel e **ainda recebe** o sino da resposta e
  o alarme (em vez de o alarme ir a quem despachou). Atribuição e troca já garantem permissão no momento em que gravam.
- **Alternativas:** (a) copiar a resolução de permissão no worker (deriva em silêncio); (b) a API grava a elegibilidade
  a cada mudança de papel, grupo ou concessão (escrita em todo fluxo de permissão).

Decisão do dono: aceitar a divergência (padrão) ou exigir (a)/(b). Até a resposta, a T0.2 fica **aberta** e a Fase 3
(T3.1, T3.2) não começa; as Fases 1 e 2 não dependem disto.

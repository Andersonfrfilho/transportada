# Evidências

## T001 — 2026-09-13

Respondida pela documentação oficial do Postmark, sem conta:

- `postmarkapp.com/developer/webhooks/inbound-webhook`: o resultado de DKIM/SPF vem em
  `Headers[]` → `X-Spam-Tests` (marcas do SpamAssassin); a retentativa segue a escala de 1 min a
  6 h; um `403` interrompe as retentativas.
- `postmarkapp.com/developer/webhooks/webhooks-overview`: não há assinatura HMAC; o webhook aceita
  Basic Auth na URL; os IPs estão em `support/article/800-ips-for-firewalls#webhooks`.
- `postmarkapp.com/developer/user-guide/inbound/inbound-domain-forwarding`: MX para
  `inbound.postmarkapp.com` com prioridade 10; `InboundDomain` gravado pelo `PUT /server`.
- `postmarkapp.com/developer/api/domains-api`: a verificação de DKIM exige
  `X-Postmark-Account-Token`.

Consequências registradas: o portão usa `DKIM_VALID_AU` (ADR-0063 §3), a configuração vira página
(ADR-0063 §7, P0), e a captura com e-mail real passou a ser a T012.

## T002 — 2026-09-13

- `docs/SECURITY.md`: três achados abertos com data (webhook de entrada sem HMAC, corpo de 12 MiB
  na rota do webhook, respostas guardadas sem prazo de descarte) — commit `41fda8dc`.
- ADR-0063 aceita pelo usuário em 2026-09-13, depois da explicação do DNS: raiz no Zoho, DNS na
  Cloudflare, respostas pelo subdomínio `resposta.` para não tocar no MX raiz.

## T001 e T002, emenda — 2026-09-13

O usuário informou que o domínio já envia pelo Resend, e o provedor trocou no mesmo dia.

- DNS de `fernandes-transportadora.com.br` (Cloudflare): `resend._domainkey` publicado, `send.` com
  SPF `include:amazonses.com` e MX `feedback-smtp.sa-east-1.amazonses.com`. MX raiz e SPF raiz do
  Zoho, intocados. `resposta.` sem MX.
- `resend.com/docs/dashboard/receiving/introduction` e `…/create-receiving-webhook`: evento
  `email.received` só com metadados; conteúdo pela API de recebidos.
- `resend.com/docs/api-reference/emails/retrieve-received-email`: `headers`, `text`, `html` e
  `raw.download_url` (MIME original, URL assinada com expiração).
- `resend.com/docs/dashboard/webhooks/verify-webhooks-requests`: assinatura Svix (`svix-id`,
  `svix-timestamp`, `svix-signature`), sobre o corpo cru.
- `resend.com/docs/api-reference/emails/send-email`: `reply_to`, `headers` e `Idempotency-Key`.
- `npm view mailauth`: 5.0.3, MIT, postalsys, publicada em 2026-09-03, `engines.node >= 22.19.0` —
  a compatibilidade com o Bun é a T004.

Consequência: a antiga T004 (corpo de 12 MiB) saiu, porque o webhook do Resend não traz corpo; o
DKIM passa a ser verificado por nós sobre o MIME bruto.

## T003 — 2026-09-13

Migration `20260913120000_contractor_mail`: as seis tabelas do e-mail com contratantes
(`contractor_mail_settings`, `contractor_contacts`, `contractor_mail_threads`,
`contractor_mail_messages`, `contractor_mail_outbox`, `contractor_inbound_email_outbox`), a coluna
`delivery_charge_events.decided_by_message_id`, `company_occurrence_types.emails_contractor` e o
seed dos contatos. Arquivos: `apps/api-transportada/src/database/contractor-mail.schema.ts` (novo),
`database.schema.ts`, `delivery-client.schema.ts`, `trip.schema.ts`,
`apps/api-transportada/drizzle/20260913120000_contractor_mail/{migration.sql,rollback.sql,snapshot.json}`.

Gerada com `bun run db:generate --name contractor_mail` e ajustada à mão: a pasta foi renomeada de
`20260913155051_contractor_mail` para o nome do `tasks.md`, e dois trechos foram acrescentados ao
`migration.sql` gerado (a FK de `decided_by_message_id` e o `INSERT ... SELECT` do seed — nenhum dos
dois nasce do objeto Drizzle, ver decisões abaixo). `test/database-migration/static-migration.contract.ts`
tinha a lista de pastas travada por texto; a nova entrada foi acrescentada nela (linha 235).

Antes de gerar, o branch estava desalinhado da cadeia de snapshots: `db:generate` mesclou minhas
tabelas com um lote inteiro de colunas de outras specs (`fleet_vehicle_axles`, `toll_booth`,
`nfe_package_boxes`, etc.) que já estavam em `schema.ts` mas sem migration própria nesta árvore —
sintoma do que o commit `8b3753a9` ("o snapshot volta à ponta da cadeia de migrations") já corrigia
em `origin/staging`. Rebaseei `work/spec-143` em `origin/staging` (traz esse fix e mais 4 commits,
nenhum deles em `src/database/`) antes de gerar de novo; a segunda geração ficou só com as tabelas e
colunas da spec 143.

**Decisões que desviam do `plan.md`, registradas conforme pedido:**

- **`citext` → `text` com índice único sobre `lower(email)`.** Nenhuma tabela deste repositório usa
  a extensão `citext` hoje. `contractor_contacts_company_contractor_email_unique` é
  `uniqueIndex(...).on(companyId, contractorId, sql\`lower(email)\`)`.
- **`reply_token_hash bytea` → `text` com o mesmo CHECK hex de `password_reset_requests.code_hash`
  e `user_invitations.code_hash`.** O dialeto pg-core do drizzle-orm 1.0.0-rc.4 não expõe um tipo
  `bytea` nativo, e não há nenhum `customType` no repositório para introduzir um. O padrão existente
  para hash de token é hex em `text` com `CHECK (col ~ '^[0-9a-f]{64}$')`; segui o mesmo.
- **O CHECK de autoria de `delivery_charge_events` não existia antes desta migration** — a tabela
  real só tinha `delivery_charge_events_name_check` (conferido em
  `drizzle/20260827023727_delivery_charges_and_scheduling/migration.sql` e no schema atual). O
  `plan.md` fala em "refazer" um CHECK "ator xor token" que nunca chegou a existir no banco.
  Além disso, `suggest-delivery-charges.use-case.ts:88` grava o evento `suggested` com
  `actorUserId: null` e sem `decidedByToken` — nem ator, nem token, nem mensagem —, porque é a
  sugestão automática do sistema. Um CHECK "sempre exatamente um dos três" quebraria essa linha já
  em produção. `delivery_charge_events_authorship_check` exige exatamente um dos três **exceto**
  quando `event_name = 'suggested'`.
- **A FK composta `delivery_charge_events.decided_by_message_id → contractor_mail_messages` vive só
  na migration SQL, não no objeto Drizzle de `delivery-client.schema.ts`.**
  `contractor-mail.schema.ts` importa `contractors` de `delivery-client.schema.ts` (para as FKs de
  `contractor_contacts` e `contractor_mail_threads`); se `delivery-client.schema.ts` importasse de
  volta `contractorMailMessages`, os dois arquivos formariam um ciclo de módulos ES — nenhum outro
  par de arquivos em `src/database/*.schema.ts` importa um do outro, e o lado que carregasse por
  último leria `pgTable(...)` construindo `foreignColumns` sobre um export ainda não inicializado
  (erro em tempo de execução, não de tipos — o `tsc --noEmit` não pega isso). Optei por manter o
  grafo de módulos acíclico: a coluna existe em `delivery-client.schema.ts` como `uuid` simples, sem
  `.references()`, e a restrição real (composta, com `company_id`, `on delete restrict`) foi escrita
  à mão no `migration.sql`. Consequência: `bun test test/database-migration/schema-snapshot.contract.ts`
  continua verde porque o TS e o snapshot concordam entre si (nenhum dos dois conhece essa FK) — só
  o banco de fato a impõe. Se o time preferir a FK espelhada em TS, a alternativa é mover
  `deliveryChargeEvents` inteira para um arquivo mais "de baixo" no grafo (fora do escopo da T003).
- **`contractor_mail_settings.status`** não tinha valores definidos no `plan.md`/spec. Usei
  `['pending', 'active', 'failed']`, no espírito da lista de verificação do RF12 — `pending` até o
  primeiro teste fechar, `active` quando fecha, `failed` quando algo que já funcionou pára.

**Gates:**

- `bun run typecheck` (raiz) — limpo.
- `bunx drizzle-kit check` — "Everything's fine".
- `bunx prettier --check` nos arquivos tocados — "All matched files use Prettier code style!".
- `make migration-test` — 94 pass, 0 fail (119.13s numa execução isolada; as duas primeiras
  tentativas, concorrendo no mesmo host com outra suíte de testes e um processo de dev de longa
  duração, esbarraram no timeout fixo de 30 s do teste
  `test/database-migration/database-migration.integration.ts` — reproduzido também isolando só esse
  arquivo, que passa em 43–50 s totais quando nada mais compete por CPU. Não é defeito desta
  migration: o mesmo teste roda o ciclo completo de aplicar/checar/reverter/reaplicar todas as
  migrations e está sob o mesmo teto fixo há a base inteira (histórico do arquivo sem qualquer
  ajuste de timeout desde 2026-07-19); a marca de ~30 000 ms nas duas tentativas falhas bate com
  "matou no limite do teste", não com um travamento real).
- `bun run --cwd apps/api-transportada test` — 5057 pass, 23 skip, 0 fail (5080 testes, 164
  arquivos). Uma tentativa anterior, também sob concorrência do host, teve 5 timeouts isolados em
  `test/cargo-volume.contract.test.ts` (simulação pesada de arrumação de caixas, teto interno de
  5 s); refeito sozinho, o mesmo arquivo passa (302–303 testes, 1 flake isolado por vez, todos por
  timeout de 5 s sob carga, nunca por asserção).
- Ajuste necessário em teste existente: `test/database-migration/static-migration.contract.ts`
  tinha a lista literal de diretórios de migration — acrescentei
  `'20260913120000_contractor_mail'` ao fim.

## T003, rebase — 2026-09-13

`origin/staging` avançou 36 commits (spec 144: WhatsApp como canal de comando, mais o CT-e de saída
por perfil), trazendo sete migrations novas — a mais recente, `20260913032201_whatsapp_command_settlement_retry`,
continua **antes** de `20260913120000_contractor_mail` no timestamp (03:22 < 12:00 do mesmo dia), então
a pasta não precisou ser renomeada; ela já é a ponta da cadeia por ordem alfabética.

`git fetch origin && git rebase origin/staging` parou duas vezes:

- **`docs/SECURITY.md`**: a seção "Abertos" recebeu achados novos dos dois lados (spec 144 —
  liquidação por procuração, webhook do WhatsApp — e os três da T002 desta spec, no commit `f5f07ba8`).
  Mesclei os dois blocos, com os achados de 2026-09-13 (spec 143) entrando **antes** dos de
  2026-09-12/11 (spec 144), preservando a ordem "mais recente primeiro" que o arquivo já seguia.
- **`test/database-migration/static-migration.contract.ts`**: a lista literal de diretórios recebeu
  as sete pastas novas da spec 144 de um lado e `20260913120000_contractor_mail` do outro — juntei os
  dois na ordem cronológica (as sete da 144, depois a minha).

`database.schema.ts` mesclou sozinho (`Auto-merging`, sem marcador) — as seis tabelas do
contractor-mail e as tabelas da 144 entraram em blocos diferentes do arquivo.

O `snapshot.json` da migration **não conflitou como arquivo** (a pasta é minha, ponta nova), mas
ficou **semanticamente desatualizado**: `prevIds` continuava apontando para
`20260910120000_vehicle_reference_every_type` (o topo da cadeia de antes do rebase), pulando as sete
migrations da 144 que agora vêm no meio. Regerei pelo mesmo método do fix `8b3753a9` ("o snapshot
volta à ponta da cadeia de migrations"): movi a pasta `20260913120000_contractor_mail` para fora
temporariamente, rodei `bun run db:generate --name tmp_resnapshot` (que então diffou o schema TS
contra o snapshot real mais recente, o de `20260913032201_whatsapp_command_settlement_retry`),
copiei o `snapshot.json` gerado de volta para a pasta original e apaguei a pasta temporária.
`migration.sql` e `rollback.sql` **não mudaram uma linha** — só o `snapshot.json` foi substituído.
Conferido: `bun run db:generate` depois disso responde `no_changes`, e o novo `prevIds` aponta para
o id do snapshot de `20260913032201_whatsapp_command_settlement_retry`.

**Gates depois do rebase:**

- `bun run typecheck` (raiz, as seis apps) — limpo.
- `bunx drizzle-kit check` (dentro de `apps/api-transportada`) — "Everything's fine".
- `bun run db:generate` sem alterar nada — `no_changes` (confirma TS ≡ snapshot).
- `bunx prettier --check` no `snapshot.json` regerado — limpo.
- `make migration-test` — 95 pass, 0 fail, 38.30 s (sem concorrência desta vez; o timeout de 30 s do
  `database-migration.integration.ts` não voltou a aparecer).
- `bun run --cwd apps/api-transportada test` — 5543 pass, 23 skip, 0 fail (5566 testes, 168 arquivos
  — o crescimento vem dos arquivos novos da spec 144, ex. `whatsapp-commands.contract.test.ts`).

O commit da T003 (`bed59472` antes do rebase) foi reaplicado como `460ec31c` pelo `git rebase`; o
`git commit --amend` deste passo, só com arquivos da T003 (o `snapshot.json` regerado), fecha o SHA
definitivo — ver o relatório da tarefa.

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

## T004 — 2026-09-13

**Checagem do §13 antes de instalar (`mailauth`, npm):**

- **Manutenção:** última publicação em 2026-09-03 (dez dias antes desta task), mantida por
  `postalsys` (Andris Reinman, também autor do `nodemailer`, `wildduck` e o resto do ecossistema
  Postal Systems). Repositório ativo (`postalsys/mailauth`), sem sinal de abandono.
  `engines.node: ">=22.19.0"` — não usamos Node aqui, o worker roda Bun 1.3.14, e é exatamente essa
  compatibilidade que este spike prova.
- **Licença:** MIT.
- **Tipagem:** `package.json` declara `"types": "index.d.ts"` — tipagem nativa, sem precisar de
  `@types/mailauth`. ⚠️ Achado durante o spike: o `.d.ts` **está errado** para `dkimSign` — ele
  declara `signingDomain`/`selector`/`privateKey` como campos obrigatórios no topo de
  `DKIMSignOptions`, mas a implementação (`lib/dkim/sign.js`) só lê `signatureData` (um array com os
  mesmos três campos por assinatura); passar só os campos do topo produz `signatures: ''` sem erro
  nenhum, e a mensagem "assinada" sai sem assinatura de verdade. Isso não afeta produção — só
  usamos `dkimSign` no teste, para fabricar mensagens sintéticas — e o contorno no teste é passar os
  dois: os campos do topo (satisfazem o compilador) e `signatureData` (o que a implementação lê de
  fato). `dkimVerify`, que é o que o gateway de produção chama, tem o `.d.ts` correto: só usamos
  `resolver` na chamada, e bateu com o comportamento medido em todos os casos.
- **Sem I/O bloqueante:** a única I/O é o `resolver` de DNS, que é **injetado** — a biblioteca não
  chama `dns.resolve` direto quando o resolvedor é passado (confirmado em `lib/tools.js:290-293`,
  `getPublicKey`). O gateway (`dkim-verifier.gateway.ts`) usa isso para nunca tocar rede nos testes,
  e para impor um prazo (`dnsTimeoutMs`, padrão 5 s) que a biblioteca sozinha não impõe.

**Versão instalada:** `mailauth@5.0.3`, pinada exata (sem `^`) em
`apps/worker-transportada/package.json`, com o `bun.lock` da raiz atualizado junto
(`bun add mailauth@5.0.3` de dentro de `apps/worker-transportada`).

**Rodou sob o Bun:** sim, sem ajuste nenhum — nem polyfill, nem `--bun`, nem troca de API. A suíte
roda com `bun test`, e `dkimSign`/`dkimVerify` funcionam exatamente como o `lib/*.js` da biblioteca
descreve.

**API usada:** `dkimVerify(rawMessage, { resolver })` de `mailauth`, que devolve
`{ headerFrom, envelopeFrom, results: DKIMResult[] }`. Cada `DKIMResult` traz `signingDomain` e
`status: { result, aligned }`, onde:

- `status.result` seguindo o vocabulário do RFC 8601 (`pass`, `fail`, `neutral`, `none`,
  `temperror`, `permerror`, …);
- `status.aligned`: **o domínio organizacional se alinhar com o `From`** (alinhamento relaxado,
  calculado pela própria `mailauth` com `tldts` — `lib/mailauth.js` importa `getAlignment` de
  `lib/tools.js`), ou `false` caso não alinhe.

`resolveDkimAlignment` (`src/contractor-mail/domain/dkim-alignment.policy.ts`) não reimplementa a
PSL: só lê o veredito que a `mailauth` já calculou.

**Domínio organizacional:** resolvido inteiramente pela `mailauth` (via `tldts`), nunca por nós.
Medido com uma assinatura `d=mail.exemplo.com.br` e `From: contratante@exemplo.com.br` — o mesmo
domínio organizacional —, e `status.aligned` voltou `"mail.exemplo.com.br"` (truthy), confirmando o
alinhamento relaxado sem qualquer lógica nossa de sufixo público.

**Os cinco casos, medidos em `test/contractor-mail/dkim-verification.contract.ts`:**

| Caso                                                                    | `status.result` medido                                                                                                                                    | Resultado da política                                                                                                                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assinada pelo domínio do `From`                                         | `pass`, `aligned` truthy                                                                                                                                  | `aligned`                                                                                                                                                            |
| Assinada por outro domínio (`d=` diferente)                             | `pass`, `aligned: false`                                                                                                                                  | `not_aligned`                                                                                                                                                        |
| Corpo adulterado depois de assinar                                      | `neutral`, comentário `"body hash did not verify"`                                                                                                        | `not_aligned` (a `mailauth` não classifica isso como `temperror`; é falha permanente de verificação, não falta de dado — por isso `not_aligned`, não `unverifiable`) |
| Sem assinatura                                                          | `none`, comentário `"message not signed"`, `results` com uma entrada só                                                                                   | `absent`                                                                                                                                                             |
| Resolvedor de DNS lança                                                 | `temperror`, comentário `"DNS failure: …"`                                                                                                                | `unverifiable`                                                                                                                                                       |
| Resolvedor de DNS demora (`dnsTimeoutMs: 20`, resolvedor nunca resolve) | mesmo caminho do lançamento — o gateway rejeita a promessa do resolvedor por `setTimeout`, e a `mailauth` trata a rejeição do resolvedor como `temperror` | `unverifiable`                                                                                                                                                       |

**Revisão do `architect` (opus, obrigatória por ser task 🧠):** achou uma lacuna real antes do
commit — `resolveDkimAlignment` decidia `unverifiable` só quando **todas** as assinaturas davam
falha transitória (`every`). Com duas assinaturas (comum: o provedor de saída assina com o próprio
domínio, e o domínio da contratante assina também), uma vinda de outro domínio com `pass` e a do
`From` com `temperror` (DNS fora do ar) caía em `not_aligned` — errado, porque a assinatura que
decidiria o alinhamento é justamente a que não deu para verificar. Corrigido para `some`: uma falha
transitória entre as assinaturas já basta para "não deu para verificar", nunca "verificado e não
alinhado". Acrescentado o sétimo teste (`duas assinaturas: uma de outro domínio…`) cobrindo esse
caso. As outras observações do `architect` (tag `l=`, `From` duplicado, prazo global por mensagem no
consumidor) são de tasks futuras (T010 em diante) e ficam registradas aqui para não se perderem.

**Gates (depois da correção):**

- `bun test ./test/contractor-mail.contract.test.ts` (worker) — 7 pass, 0 fail.
- `bun run --cwd apps/worker-transportada test` (suíte inteira) — 1050 pass, 0 fail, 2811 expect()
  (a suíte cresceu de 1043 para 1050 com os sete casos novos).
- `bun run typecheck` (raiz, as seis apps) — limpo.
- `bunx prettier --check` nos quatro arquivos tocados — limpo, depois de `--write` nos dois que
  vieram com alertas do generator inicial.
- `bun run lint` (raiz, todas as apps) — limpo.

Regra de parada: **não se aplicou.** A `mailauth` rodou sob o Bun 1.3.14 sem contorno nenhum; a
única surpresa foi o `.d.ts` incorreto de `dkimSign`, documentada acima, e ela não bloqueia o uso em
produção porque `dkimSign` só existe do lado do teste.

## T005 — vermelho — 2026-09-13

**Padrão encontrado, e seguido:** o repositório já tem precedente consistente e repetido de
"contrato antes da implementação, vermelho pelo motivo certo" atravessando várias specs
(`specs/013-fleet-and-mdfe/evidence.md`, `specs/032-nota-de-servico-municipal/evidence.md`,
`specs/050-o-cep-vem-de-casa/evidence.md`): o contrato novo — schema **e** query pura — entra no
`package.json` já na lista explícita, importa um módulo de produção que ainda não existe
(`drizzle-*.repository.ts`), o arquivo inteiro falha ao carregar com `Cannot find module ...`, e
essa falha isolada (a suíte inteira da app continua verde fora dela) é o que se registra como
evidência do vermelho. A tarefa só fecha (`tasks.md`) quando o módulo nasce e o contrato passa a
importar de verdade — aqui isso é a T008. Segui esse padrão à risca, sem inventar um mecanismo novo
(sem `test.todo`, sem excluir da lista do `package.json`): é exatamente a forma que a T013 do
`plan.md` já previa ("teste de aceite/contrato antes da implementação").

Arquivos:

- `apps/api-transportada/test/contractor-mail-schema/tenant-safety.contract.ts` — cobre as quatro
  tabelas do plan.md (`contractor_mail_settings`, `contractor_contacts`, `contractor_mail_threads`,
  `contractor_mail_messages`): FK de `company_id` para `companies` (restrict/cascade) em cada uma,
  as FKs compostas `(company_id, contractor_id)`/`(company_id, thread_id)` que impedem apontar para
  o contratante ou a conversa de outra empresa, e a asserção deliberada de que
  `reply_token_hash` é único **global** (não por empresa) — documentando por que essa unicidade
  sozinha não prova isolamento nenhum. O último teste é o caso da spec: importa
  `buildContractorMailThreadByReplyTokenFilters` de
  `apps/api-transportada/src/contractor-mail/infrastructure/drizzle-contractor-mail.repository.ts`
  (T008, ainda não existe) e, quando existir, vai exigir que a consulta pelo hash do token leve
  `company_id` na mesma condição — um token de conversa de outra empresa não pode achar nada.
- `apps/api-transportada/test/contractor-mail-schema.contract.test.ts` — entrypoint fino, no padrão
  dos demais `test/<area>.contract.test.ts`.
- `apps/api-transportada/package.json` — a entrada `./test/contractor-mail-schema.contract.test.ts`
  entrou na lista literal do script `test` (senão o arquivo não roda, como o `CLAUDE.md` avisa).

Saída do vermelho, isolada:

```
$ bun test ./test/contractor-mail-schema.contract.test.ts

test/contractor-mail-schema.contract.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find module '../../src/contractor-mail/infrastructure/drizzle-contractor-mail.repository.js' from
'.../apps/api-transportada/test/contractor-mail-schema/tenant-safety.contract.ts'
-------------------------------

 0 pass
 1 fail
 1 error
Ran 1 test across 1 file. [42.00ms]
```

Saída do vermelho, suíte inteira da API (mostrando que só o contrato novo está vermelho):

```
$ bun run --cwd apps/api-transportada test
 5543 pass
 23 skip
 1 fail
 1 error
 38549 expect() calls
Ran 5567 tests across 169 files. [22.16s]
error: script "test" exited with code 1
```

`bun run typecheck` (raiz) para na mesma causa, pelo mesmo motivo — o `import` type-only também não
acha o módulo:

```
$ bun run typecheck
test/contractor-mail-schema/tenant-safety.contract.ts(17,62): error TS2307: Cannot find module
'../../src/contractor-mail/infrastructure/drizzle-contractor-mail.repository.js' or its
corresponding type declarations.
```

`bunx prettier --check` nos três arquivos tocados (os dois contratos e o `package.json`) — limpo.

Este é o vermelho esperado e correto: a T005 fica `[ ]` no `tasks.md`, e só vira `[x]` quando a
T008 criar `drizzle-contractor-mail.repository.ts` com `buildContractorMailThreadByReplyTokenFilters`
filtrando por `companyId`, fazendo o import resolver e o contrato passar a exercer a asserção de
verdade.

## T005 — verde — 2026-09-13

**Motivo da antecipação:** com o vermelho do `17c54f15`, `bun run typecheck` na raiz e a suíte da
API ficam vermelhos até a T008 existir — e a T006/T007 viriam antes dela sem conseguir fechar com
gates verdes, empurrando um push quebrado para o CI. Decidido antecipar só a parte de persistência
da T008 (o repositório e a porta), sem rotas, caso de uso nem nada de segredo — isso continua sendo
da T008, que fecha por cima do que já existe.

Arquivos novos:

- `apps/api-transportada/src/contractor-mail/application/contractor-mail.port.ts` —
  `ContractorMailRepositoryPort`, com `findSettings`, `findSettingsByWebhookId`,
  `findThreadByReplyTokenHash` e `upsertSettings`. `secretEnvelope` é tipado `unknown`: quem sela e
  quem abre o jsonb é a T006, este repositório só transporta.
- `apps/api-transportada/src/contractor-mail/infrastructure/drizzle-contractor-mail.repository.ts`
  — `DrizzleContractorMailRepository`, no padrão de `DrizzleCargoSettingsRepository` (upsert por
  `onConflictDoUpdate` no único de `company_id`) e de `DrizzlePasswordResetRepository` (a busca sem
  tenant). Exporta `buildContractorMailThreadByReplyTokenFilters`, a função pura que o contrato da
  T005 importa — `and(eq(company_id), eq(reply_token_hash))`, as duas condições na mesma consulta.

**Exceção declarada:** `findSettingsByWebhookId` é o único método sem `companyId` de entrada, porque
é ele que **descobre** a empresa a partir do `webhookId` opaco da URL anônima do webhook — a mesma
forma de `findByCodeHash` em `identity/infrastructure/drizzle-password-reset.repository.ts` ("a
própria linha encontrada é quem estabelece o tenant"). O comentário de uma linha que justifica isso
está acima do método, e o contrato passou a travá-lo por texto de fonte (`declares
findSettingsByWebhookId as the one lookup without companyId, on purpose`), para a ausência de
`companyId` não virar "esqueceram" no diff de alguém que só olhar a assinatura.

Ajuste no contrato da T005 (sem afrouxar nenhuma asserção existente): o `import` de
`buildContractorMailThreadByReplyTokenFilters` passou a resolver de verdade, e ganhou o teste acima
sobre a exceção declarada.

**Saída do verde:**

```
$ bun test ./test/contractor-mail-schema.contract.test.ts
 7 pass
 0 fail
 15 expect() calls
Ran 7 tests across 1 file. [240.00ms]

$ bun run typecheck        # raiz, as seis apps
$ bunx tsc --noEmit        (api-transportada)   → limpo
$ bunx tsc --noEmit        (worker-transportada) → limpo
$ bunx tsc --noEmit        (cron-transportada)   → limpo
$ tsc --noEmit             (frontend-transportada, frontend-client, frontend-landing) → limpo

$ bun run --cwd apps/api-transportada test
 5550 pass
 23 skip
 0 fail
 38564 expect() calls
Ran 5573 tests across 169 files. [25.97s]

$ bun run lint             # raiz, as seis apps → limpo
```

`bunx prettier --check` nos quatro arquivos tocados (`contractor-mail.port.ts`,
`drizzle-contractor-mail.repository.ts`, `tenant-safety.contract.ts`,
`contractor-mail-schema.contract.test.ts`) — limpo.

Não rodei `bun --env-file=../../.env.test test --timeout 120000`: o contrato da T005 continua sendo
SQL puro sobre `PgDialect().sqlToQuery()`, sem tocar Postgres — o mesmo formato de
`nfse-schema/invoice-selection-query-tenant-safety.contract.ts`. Teste de integração contra banco de
verdade fica para a T008, quando existirem rotas e caso de uso para exercitar de ponta a ponta.

## T006 — 2026-09-13

Serviço que sela `{ apiKey, webhookSigningSecret }` na API, no mesmo desenho da credencial da Nota
RP (`nfse-profiles/application/nfse-credential-secret.service.ts`), e a cópia que só abre no worker.

Arquivos novos:

- `apps/api-transportada/src/contractor-mail/domain/contractor-mail.error.ts` —
  `ContractorMailCredentialUnavailableError` (500, uma resposta só para chave errada, envelope
  adulterado e AAD de outro tenant — diferenciar contaria a um atacante o que tentar depois) e
  `ContractorMailWebhookSecretFormatError` (422, o segredo do webhook sem o prefixo `whsec_` do
  Svix, recusado **ao selar**, antes de qualquer criptografia).
- `apps/api-transportada/src/contractor-mail/application/contractor-mail-credential-secret.service.ts`
  — `createContractorMailCredentialSecretService`, com `encrypt`/`decrypt`. AAD:
  `transportada:contractor-mail-credential:v1:${companyId}:${settingsId}`. `secretSchema` (Zod,
  `.strict()`) valida os dois campos como string não vazia, até 500 caracteres, com
  `webhookSigningSecret` obrigado a começar com `whsec_` — conferido tanto ao abrir (evita que um
  envelope adulterado devolva um formato impossível sem ninguém notar) quanto, via checagem
  dedicada, ao selar. O plaintext é zerado no `finally`, como na Nota RP.
- `apps/worker-transportada/src/contractor-mail/application/contractor-mail-credential-secret.service.ts`
  — cópia por valor, só com `decrypt` (o worker nunca sela, igual à cópia da Nota RP em
  `nfse-issuance/application/nfse-credential-secret.service.ts`). Mesmo AAD, mesmo `secretSchema`,
  comentário de topo avisando que o AAD precisa ser idêntico. `envelope` chega como `unknown` (o
  jsonb cru do banco) e é validado pelo `envelopeSchema` antes do `provider.decrypt`.

Testes novos:

- `apps/api-transportada/test/contractor-mail/credential-secret.contract.ts` — ida e volta com
  provedor real; AAD canônico e DTO estrito capturados com um provedor fake, plaintext zerado;
  falha fechada (mesma `ContractorMailCredentialUnavailableError`, sem detalhe) em: AAD de outra
  empresa, `settingsId` trocado, ciphertext adulterado, plaintext com campo fora da allowlist,
  envelope de saída com campo fora da allowlist; `webhookSigningSecret` sem `whsec_` recusado ao
  selar sem tocar o provedor (`CONTRACTOR_MAIL_WEBHOOK_SECRET_FORMAT_INVALID`, 422); o mesmo formato
  inválido vindo de um envelope aberto (simulando adulteração) cai na falha fechada genérica. Todo
  teste de falha confere que nem a chave, nem o segredo, nem os UUIDs aparecem na serialização do
  erro nem no `stack`.
- `apps/worker-transportada/test/contractor-mail/credential-secret.contract.ts` — não importa o
  código da API (as apps não importam código uma da outra): recria o que a API produziria ao selar
  — mesmo AAD, mesmo JSON — com `createSecretEnvelopeProvider` puro, e prova que o worker abre esse
  envelope "vindo da API". Falha fechada em AAD de outra empresa, `settingsId` trocado e ciphertext
  adulterado; confere que o erro capturado não carrega os valores dos segredos.
- `apps/worker-transportada/test/contractor-mail/credential-secret-parity.contract.ts` — o contrato
  de paridade pedido pela task, no molde de `test/whatsapp-code/aad-parity.contract.ts` (comparação
  textual, não diff de arquivo inteiro — a API expõe `encrypt`+`decrypt` e o worker só `decrypt`, uma
  assimetria que um diff de corpo inteiro, como o de `physical-destination-parity.contract.ts`, não
  acomodaria). Confere, nas duas fontes: o template literal do AAD, a constante do prefixo `whsec_`,
  o limite de 500 caracteres e a forma do campo do `secretSchema`; e que o arquivo do worker declara
  `decrypt` e nunca `encrypt`.

Registro nos entrypoints e no `package.json`:

- `apps/api-transportada/test/contractor-mail.contract.test.ts` (novo) importa
  `./contractor-mail/credential-secret.contract.js`; adicionado ao `"test"` do `package.json` logo
  depois de `contractor-mail-schema.contract.test.ts`.
- `apps/worker-transportada/test/contractor-mail.contract.test.ts` (já existia, da T004) ganhou os
  imports de `./contractor-mail/credential-secret-parity.contract.js` e
  `./contractor-mail/credential-secret.contract.js`, ao lado do `dkim-verification.contract.js`
  existente. Já estava no `"test"` do `package.json` do worker.

**Desvio do padrão da Nota RP:** a Nota RP não tem contrato de paridade entre as duas cópias (o AAD
delas é conferido só implicitamente, pelo teste de ida e volta de cada lado). Como a task pediu
explicitamente um contrato de paridade, e nenhum existia para copiar entre `nfse-credential-secret`
de cada app, usei o molde de `whatsapp-code/aad-parity.contract.ts` (comparação textual de
fragmentos, não diff do arquivo inteiro) em vez de `physical-destination-parity.contract.ts`, porque
lá as duas cópias têm exatamente a mesma forma (uma função pura) e aqui a API sela e o worker só
abre — formas diferentes de propósito (§ "o padrão da Nota RP no worker também só abre").

A validação de `whsec_` **ao selar** não existe na Nota RP (lá `encryptSecret` não valida o
conteúdo, só o formato do envelope de saída); foi acrescentada aqui porque a task pediu
explicitamente a recusa nesse ponto, com um erro de domínio próprio (422) em vez de colapsar no
mesmo "indisponível" genérico do decrypt — um segredo colado sem o prefixo é erro de quem está
configurando, não falha do cofre, e por isso merece resposta distinta.

**Saída do verde:**

```
$ bun run typecheck        # raiz, as seis apps → limpo

$ bun run --cwd apps/api-transportada test
 5557 pass
 23 skip
 0 fail
 38610 expect() calls
Ran 5580 tests across 170 files. [62.22s]

$ bun run --cwd apps/worker-transportada test
 1058 pass
 0 fail
 2831 expect() calls
Ran 1058 tests across 81 files. [11.83s]

$ bun run lint             # raiz, as seis apps → limpo

$ bunx prettier --check apps/api-transportada/src/contractor-mail/domain/contractor-mail.error.ts \
    apps/api-transportada/src/contractor-mail/application/contractor-mail-credential-secret.service.ts \
    apps/worker-transportada/src/contractor-mail/application/contractor-mail-credential-secret.service.ts \
    apps/api-transportada/test/contractor-mail/credential-secret.contract.ts \
    apps/api-transportada/test/contractor-mail.contract.test.ts \
    apps/worker-transportada/test/contractor-mail/credential-secret.contract.ts \
    apps/worker-transportada/test/contractor-mail/credential-secret-parity.contract.ts \
    apps/worker-transportada/test/contractor-mail.contract.test.ts \
    apps/api-transportada/package.json
All matched files use Prettier code style!   (dois arquivos de teste precisaram de --write antes;
conteúdo idêntico, só quebra de linha)
```

Não rodei `bun --env-file=../../.env.test test --timeout 120000`: este serviço não toca banco, é
função pura sobre o `SecretEnvelopeProvider` injetado — não há integração para exercitar aqui. A
gravação/leitura do jsonb `secretEnvelope` continua sendo da T008.

## T007 — 2026-09-13

**Parte 1, confirmado na documentação oficial do Resend (WebFetch, ver as fontes registradas em
`plan.md` § "O que já está no DNS e na documentação"):**

- `GET /emails/receiving/{id}` é o caminho exato de "retrieve received email" — não
  `/emails/{id}`. Campos usados: `from`, `to` (array), `subject`, `text` (nulo), `headers`,
  `message_id`, `raw.download_url` e `raw.expires_at`. Fonte:
  https://resend.com/docs/api-reference/emails/retrieve-received-email.
- O host de `raw.download_url` é descrito como "Signed CloudFront URL", sem subdomínio fixo. A
  allowlist ficou provisória: `.cloudfront.net`, isolada em
  `resend-download-allowlist.constant.ts` (worker), com o comentário
  `// confirmar com payload real na T012`.
- Escopo mínimo: `full_access`. `sending_access` "só pode enviar e-mails"
  (https://resend.com/docs/api-reference/api-keys/create-api-key) — não alcança `GET /domains` nem
  a leitura de recebidos. Uma chave de envio usada em `resend-account.gateway.ts` responde
  401/403, e isso é o comportamento certo para o RF12.
- O domínio verificado sai de `GET /domains` (https://resend.com/docs/api-reference/domains/list-domains),
  cada entrada com `name` e `status`; `status === 'verified'` é o único valor que
  `resend-account.gateway.ts` assume como sucesso — a documentação consultada não enumerou a lista
  fechada de estados, então qualquer outro valor vira "ainda não verificado", sem inventar um
  vocabulário de estados intermediários.
- `POST /emails` aceita `reply_to`, `headers` e o cabeçalho `Idempotency-Key` (24 h) — confirma o
  que o `plan.md` já registrava
  (https://resend.com/docs/api-reference/emails/send-email).

Nenhuma divergência com o `plan.md` apareceu — a implementação seguiu direto para o código.

**Parte 2, arquivos criados:**

- `apps/api-transportada/src/contractor-mail/infrastructure/resend-account.gateway.ts`
- `apps/api-transportada/src/contractor-mail/infrastructure/mx-lookup.gateway.ts`
- `apps/api-transportada/src/contractor-mail/domain/resend-provider.error.ts`
- `apps/worker-transportada/src/contractor-mail/infrastructure/resend-mail.gateway.ts`
- `apps/worker-transportada/src/contractor-mail/domain/resend-provider.error.ts`
- `apps/worker-transportada/src/contractor-mail/domain/resend-download-allowlist.constant.ts`

`checkApiKeyAndSenderDomain` nunca devolve `apiKeyAccepted: false`: uma chave recusada (401/403)
lança `ResendProviderUnauthorizedError` antes de qualquer resultado existir — o campo continua no
retorno porque o RF12 o lista como item da lista de verificação, e o `reason` é quem diferencia
`sender_domain_not_found` de `sender_domain_not_verified`. `downloadRawEmail` nunca segue
redirecionamento nenhum (`redirect: 'manual'`, qualquer 3xx é recusado), mesmo que o `Location`
aponte para outro host da própria allowlist — é mais estrito do que o mínimo pedido, e evita ter que
inspecionar o cabeçalho `location` do lado de cá.

**Parte 3, arquivos de teste criados e registrados nos entrypoints
(`contractor-mail.contract.test.ts` de cada app) e nas listas de `package.json`:**

- `apps/api-transportada/test/contractor-mail/resend-account-gateway.contract.ts` — chave recusada
  (401 e 403), domínio verificado, domínio não verificado (`pending`), domínio não encontrado,
  casamento por nome sem diferenciar caixa, timeout/falha de rede, corpo fora do schema, corpo que
  não é JSON, e status 5xx que não é 401/403.
- `apps/api-transportada/test/contractor-mail/mx-lookup-gateway.contract.ts` — MX encontrado, MX
  ausente (`[]`), `ENOTFOUND`/`ENODATA` como ausência, qualquer outra falha do resolvedor e timeout
  do resolvedor como `unreachable`.
- `apps/worker-transportada/test/contractor-mail/resend-mail-gateway.contract.ts` — envio monta o
  corpo certo (`reply_to`, `headers`, `Idempotency-Key`), envio com falha de rede,
  `fetchReceivedEmail` válido e falhando quando falta um campo obrigatório (`raw`),
  `downloadRawEmail` aceito quando o host está na allowlist, recusado fora da allowlist (sem tocar a
  rede), recusado em `http:`, recusado em qualquer redirecionamento (mesmo para outro host
  CloudFront), abortado acima do teto de 25 MiB, e recusado por timeout.

**Gates, executados na raiz do worktree:**

```
$ bun run typecheck
$ tsc --noEmit                       # api-transportada, worker-transportada, cron-transportada
$ tsc --noEmit                       # frontend-transportada, frontend-client, frontend-landing
# limpo nas seis apps

$ bun run --cwd apps/api-transportada test
 5574 pass
 23 skip
 0 fail
 38631 expect() calls
Ran 5597 tests across 170 files. [21.40s]

$ bun run --cwd apps/worker-transportada test
 1068 pass
 0 fail
 2853 expect() calls
Ran 1068 tests across 81 files. [6.06s]

$ bun run lint                       # raiz, as seis apps → limpo

$ bunx prettier --check apps/api-transportada/src/contractor-mail \
    apps/api-transportada/test/contractor-mail \
    apps/worker-transportada/src/contractor-mail \
    apps/worker-transportada/test/contractor-mail \
    apps/api-transportada/test/contractor-mail.contract.test.ts \
    apps/worker-transportada/test/contractor-mail.contract.test.ts
All matched files use Prettier code style!
```

Um `error TS2305` inicial (`MxRecord` importado de `node:dns/promises`, que não o exporta — o tipo
mora em `node:dns`) e um `error TS2379` (`body: undefined` não cabe em `RequestInit` sob
`exactOptionalPropertyTypes`, corrigido para `body: null`) foram corrigidos antes deste gate; um
`no-unused-vars` no teste do worker (`_raw` desestruturado e descartado) também. Não rodei a
integração de banco (`bun --env-file=../../.env.test test`): estes gateways não tocam banco, só
`fetch` e `dns` injetados.

## T008 — 2026-09-13

As três rotas de `/contractor-mail-settings` (`GET`, `PUT`, `GET .../checks`), todas
`settings.manage`/`company` e `cache-control: no-store`, compostas em `main.ts` pela primeira vez —
até aqui o módulo só existia como port/repositório/gateways sem consumidor HTTP.

**Arquivos novos:**

- `src/contractor-mail/application/contractor-mail-settings.use-case.ts` — `read`, `save` e
  `runChecks`. `save` gera o `settingsId` (novo ou reaproveitado) **antes** de selar, porque o AAD do
  envelope amarra a ele; quando um segredo vem omitido, abre o envelope existente com o mesmo
  serviço da T006 e preserva só o que faltou. A trilha de auditoria (`contractor-mail.settings.saved`)
  grava `changedFields` — nomes dos campos, nunca valor — e o `before`/`after` só carrega
  `id`/`version`. `runChecks` isola cada verificação externa (`Promise.all` com uma função por
  chamada) e nunca deixa uma falha de rede propagar: vira item `failed` com motivo tipado.
- `src/contractor-mail/presentation/contractor-mail-settings.schema.ts` — `PUT` `strict()`, com
  `apiKey`/`webhookSigningSecret` opcionais (mantêm o selado quando ausentes — o formato do `whsec_`
  é conferido pelo serviço da T006, não duas vezes), e `replyDomain` com regex de no mínimo três
  rótulos, minúsculo.
- `src/contractor-mail/presentation/contractor-mail-settings.routes.ts` — serialização por lista
  fechada de campos (como a Nota RP); sem configuração, `GET` devolve `{ data: null }` com `200`
  (mesmo padrão da Nota RP, não `404`).

**Arquivos estendidos:**

- `contractor-mail.port.ts`: `upsertSettings` (void) virou `saveSettings` (retorna o registro),
  agora recebendo `settingsId` e o bloco de auditoria; `findSetupTestStatus` novo, para o RF13 dos
  três checks de teste (T009/T010 ainda não escrevem nada, então ele devolve `undefined` até lá — o
  caso de uso lê isso como `pending`, que é o esperado por `tasks.md`).
- `drizzle-contractor-mail.repository.ts`: `saveSettings` faz upsert + `audit_logs` **na mesma
  transação** (`this.database.transaction`), com `version` incrementado por SQL
  (`version + 1`) e `id` explícito no insert (nunca `defaultRandom()`, porque o caso de uso precisa
  do id antes de selar). `findSetupTestStatus` busca a conversa `setup_test` da empresa e, se
  existir, agrega o estado das mensagens dela.
- `contractor-mail.error.ts`: `ContractorMailSecretRequiredError` (422) — a primeira configuração
  não tem segredo anterior para preservar, então omitir os dois é erro, não "manter o que já
  estava".
- `shared/api.constant.ts`: `API_CONTRACTOR_MAIL_SETTINGS_PATH` e `..._CHECKS_PATH`.
- `main.ts`: composição do módulo dentro de `createApplicationRoutes` (onde `database` já é o
  drizzle cru) — repositório, os dois gateways da T007, o serviço de segredo da T006 e o caso de uso,
  registrados perto do `createFuelPriceRoutes`.

**Decisão registrada (para o `architect` conferir):** o `whsec_` de resposta ao P0 pedia
"a whitelist da Nota RP" para o `GET`; segui a mesma para o corpo sem segredo — `data: null` com
`200`, nunca `404`.

**Testes:**

- `test/contractor-mail/settings-routes.contract.ts` — permissão (`403` sem `settings.manage` nas
  três rotas), `no-store`, corpo do `GET` sem segredo (chave a chave), `PUT` com e sem os dois
  segredos, `replyDomain` com dois rótulos recusado (`400`), corpo desconhecido/sem `senderAddress`
  recusado, `checks` devolvendo as sete chaves do RF12 na ordem, e a resposta **nunca** contém os
  valores sintéticos de `apiKey`/`webhookSigningSecret` nem `secretEnvelope`/`ciphertext` em texto
  cru de nenhuma das três rotas.
- `test/contractor-mail/settings-use-case.contract.ts` — a primeira configuração exige os dois
  segredos (`ContractorMailSecretRequiredError`); a auditoria da primeira grava os cinco campos como
  alterados e nunca carrega o valor do segredo; omitir os dois num `PUT` seguinte preserva o que
  estava selado (provado abrindo o envelope de volta com a `secretService` real); um
  `webhookSigningSecret` sem `whsec_` é recusado com o erro da T006 mesmo vindo pelo `save`; sem
  configuração, os sete checks saem `pending`/`not_configured`; um provedor saudável + MX encontrado
  - teste totalmente respondido dão os sete `ok`; `ResendProviderUnauthorizedError` falha `api_key`
    **e** `sender_domain` com o mesmo motivo; uma falha de rede não mapeada ainda responde (nunca
    rejeita a Promise) como `failed`/`provider_unreachable`; MX ausente é `pending`, MX inalcançável é
    `failed`; os três `dkimResult` que não são `aligned` falham `test_dkim` cada um com o motivo certo.
- `test/contractor-mail/no-secret-exposure.contract.ts` — contrato por texto de fonte: varre todo
  `src/contractor-mail/**/*.ts` e reprova qualquer chamada de `logger`/`log` que mencione `apiKey`,
  `webhookSigningSecret` ou `secretEnvelope` (nenhuma existe hoje — o teste é guarda contra o futuro);
  e confere que `contractor-mail-settings.routes.ts` nunca nomeia o envelope selado
  (`secretEnvelope`/`ciphertext`) — ele só repassa os dois segredos como texto opaco do corpo já
  validado até o caso de uso, que é quem sela. A garantia sobre os _valores_ reais é o teste
  funcional de `settings-routes.contract.ts` citado acima.
- `test/integration/contractor-mail-settings-repository.integration.ts` (novo, registrado em
  `package.json` → `test:integration`) — banco descartável de verdade: cria + atualiza a
  configuração e confere que `id`/`webhook_id` não mudam e `version` incrementa, que exatamente duas
  linhas de `audit_logs` nascem (uma por chamada) sem `ciphertext` no `afterSnapshot`, isolamento
  entre duas empresas, e `findSetupTestStatus` (undefined antes de qualquer mensagem, depois lendo
  `hasOutboundSent`/`hasInboundReply`/`dkimResult` de linhas inseridas à mão simulando o que a
  T009/T010 gravarão).
- O contrato de tenant da T005 (`test/contractor-mail-schema/tenant-safety.contract.ts`) continua
  verde sem alteração — `buildContractorMailThreadByReplyTokenFilters` e a documentação de
  `findSettingsByWebhookId` não mudaram.

**Gates:**

```
$ bun run typecheck                  # raiz, as seis apps → limpo
$ bun run --cwd apps/api-transportada test
 5608 pass
 23 skip
 0 fail
Ran 5631 tests across 170 files.

$ bun --env-file=../../.env.test test ./test/integration/contractor-mail-settings-repository.integration.ts --timeout 120000
 3 pass
 0 fail
Ran 3 tests across 1 file.

$ bun run lint                       # raiz → limpo
$ bunx prettier --check apps/api-transportada/src/contractor-mail apps/api-transportada/test/contractor-mail \
    apps/api-transportada/test/fixtures/contractor-mail-http.fixture.ts \
    apps/api-transportada/test/contractor-mail.contract.test.ts \
    apps/api-transportada/test/integration/contractor-mail-settings-repository.integration.ts \
    apps/api-transportada/src/main.ts apps/api-transportada/src/shared/api.constant.ts \
    apps/api-transportada/package.json
All matched files use Prettier code style!
```

**Decisões que o `architect` deve olhar:**

1. Como os segredos omitidos são preservados: `save` decripta o envelope existente com a mesma
   `secretService` da T006 (mesmo AAD, `companyId:settingsId`) só quando algum dos dois campos vem
   ausente, e mescla; nunca decripta à toa quando os dois vêm preenchidos.
2. O que vai para a trilha de auditoria: `changedFields` (nomes) e `id`/`version` — nunca o valor de
   `senderAddress`/`senderName`/`replyDomain` nem, é claro, dos segredos.
3. O comportamento sem configuração: `GET` devolve `200` com `{ data: null }` (padrão da Nota RP, não
   `404`); `GET .../checks` devolve as sete chaves `pending`/`not_configured` sem chamar gateway
   nenhum.
4. Os motivos tipados dos checks: `provider_unauthorized`/`_unreachable`/`_unexpected_response` do
   Resend; `sender_domain_not_found`/`_not_verified`; `mx_absent` (pendente) vs `mx_unreachable`
   (falho); `webhook_never_received`; `test_not_sent`/`test_not_replied` (os três checks de teste
   ficam presos em pendente enquanto T009/T010 não gravarem nada); e os três motivos de DKIM
   (`dkim_not_aligned`/`_unverifiable`/`_absent`), todos falhos porque um DKIM que não alinha não
   decide (RF13).
5. `saveSettings` faz upsert + auditoria na mesma transação, mas ainda não há `expectedVersion` de
   concorrência otimista — o `plan.md`/`spec.md` não pediram, e a versão só serve à leitura, não a um
   `PUT` que compete consigo mesmo (o auditor deve confirmar que isso é aceitável para esta task, ou
   se P0 precisa de bloqueio de escrita concorrente).

### Revisão do architect — 2026-09-13

**Veredito: APROVADO COM RESSALVAS.** Cinco correções obrigatórias, cinco opcionais e um achado de
segurança de escopo maior que a task. Todas aplicadas neste commit.

**Obrigatórias:**

1. **Corrida da primeira configuração.** O achado do item 5 acima ("ainda não há `expectedVersion`")
   era o sintoma de um problema mais sério do que "falta bloqueio otimista": com o `onConflictDoUpdate`
   antigo, dois `PUT` concorrentes na primeira configuração cada um gerava um `settingsId` e selava
   o segredo com um AAD diferente; o perdedor da corrida do banco tinha o corpo dele — **inclusive o
   envelope selado com o próprio id, que não é o da linha** — gravado por cima da linha do vencedor.
   O resultado persistido nunca mais abria: `secret_envelope`/AAD apontava para um `settingsId` que
   não existe em lugar nenhum.
2. **Concorrência otimista.** Resolvida junto com o item 1: `SaveContractorMailSettingsUseCaseInput`
   e `SaveContractorMailSettingsInput` ganharam `expectedVersion: string | undefined`. O `PUT` aceita
   o campo no corpo (`POSITIVE_BIGINT`, mesmo padrão do `nfse-profiles.schema.ts`); `GET` já devolvia
   (e continua devolvendo) `version` na resposta. No repositório, `saveSettings` bifurca:
   `expectedVersion` ausente vira `INSERT ... ON CONFLICT (company_id) DO NOTHING RETURNING *`
   (nunca sobrescreve uma linha existente); presente vira
   `UPDATE ... WHERE company_id = $1 AND version = $2 RETURNING *`. As duas devolvem `undefined`
   quando perdem a corrida, e o repositório levanta `ContractorMailSettingsVersionConflictError`
   (`CONTRACTOR_MAIL_SETTINGS_VERSION_CONFLICT`, novo em `contractor-mail.error.ts`, `409`) —
   **sem** tocar em `audit_logs`: perder a corrida não é evento auditável. Defesa extra dentro da
   transação: `row.id !== input.settingsId` também vira o mesmo `409` (o `RETURNING` do
   `ON CONFLICT DO NOTHING` já garante isso por construção, mas a conferência fica explícita, como
   pedido). Dois testes de integração contra Postgres real provam a corrida:
   `test/integration/contractor-mail-settings-repository.integration.ts` — "two concurrent
   first-time creations" (duas criações simultâneas via `Promise.allSettled`, uma `409`, a outra
   abre com o próprio segredo, só uma linha de auditoria) e "an update with a stale expectedVersion"
   (versão velha rejeitada, o segredo atual sobrevive intacto). Os dois passam com
   `bun --env-file=../../.env.test test --timeout 120000`.
3. **Auditoria.** `saveSettings` agora grava `permission: 'settings.manage'`,
   `targetType: 'contractor_mail_settings'` e `targetId: input.audit.entityId`, no molde de
   `drizzle-cte-emission-profile.repository.ts:66-68`. Coberto pelo teste de integração (os três
   campos conferidos em cada linha de `audit_logs`).
4. **O contrato de "nenhum segredo" passava por vácuo.**
   `test/contractor-mail/no-secret-exposure.contract.ts` tinha
   `if (!LOG_CALL_PATTERN.test(source)) return` antes de checar os identificadores — um
   `console.log(secretEnvelope)` solto, sem nenhuma outra chamada de log por perto, não acionava
   checagem nenhuma. Reescrito: `LOG_CALL_PATTERN` agora inclui `console` (com o método `log`), e a
   asserção é **incondicional** — `expect(LOG_CALL_PATTERN.test(source)).toBe(false)` para todo
   arquivo do módulo, sempre, nunca "se houver chamada, ela não pode conter X". A checagem de que
   `contractor-mail-settings.routes.ts` nunca nomeia o envelope selado (`secretEnvelope`/`ciphertext`)
   continua.
5. **Tenant-safety.** Acrescentada `test/contractor-mail-schema/tenant-safety.contract.ts` →
   "the setup_test status lookup filters both the thread and its messages by company id", no molde
   do teste da linha 116 original: confere por geração de SQL que `findSetupTestStatus` filtra tanto
   a busca da conversa quanto a das mensagens por `company_id`. Isso exigiu exportar dois filtros
   novos do repositório — `buildContractorMailSetupTestThreadFilters` e
   `buildContractorMailSetupTestMessageFilters` —, no mesmo molde de
   `buildContractorMailThreadByReplyTokenFilters`.

**Opcionais, todas aplicadas:**

- `apiKey`/`webhookSigningSecret` ganharam `.trim()` antes do `.min(1)` no schema do `PUT`.
- Teste de `PUT` com um segredo só ("sending only the api key preserves the previously sealed
  webhook secret") em `settings-use-case.contract.ts`.
- Teste do `PUT` parcial quando o envelope não abre: uma chave de keyring diferente da que selou o
  envelope existente faz `save` rejeitar com `ContractorMailCredentialUnavailableError` (não um
  `ContractorMailSecretRequiredError` nem um 500 sem explicação), e nada é gravado
  (`savedSettingsCalls` fica vazio); reenviar os dois segredos na sequência recupera a configuração.
- Motivo próprio `credential_unavailable` em `checkProvider`: o cofre não abrir (chave do keyring
  removida/girada, envelope adulterado) agora é distinguido de o **Resend** recusar — os dois
  `try/catch` de `checkProvider` foram separados, e o gateway nunca é chamado quando o segredo nem
  sai do envelope (`expect(gatewayCalls).toBe(0)` no teste "a vault that cannot decrypt...").
- Conferido: `sender_domain_not_found`/`sender_domain_not_verified` de `ResendAccountCheckReason`
  (T007) são literalmente os mesmos dois valores de `ContractorMailCheckReason` — o `tsc --noEmit`
  já provava isso por tipagem estrutural antes desta revisão; nenhuma mudança de código foi
  necessária, só a conferência.

**Achado de segurança registrado, fora do escopo desta task:** `docs/SECURITY.md` ganhou o achado
datado "`audit_logs` não guarda IP" — o §10 do baseline pede IP na trilha de ação sensível, e
`audit_logs` só tem ator/alvo/timestamp; o IP só se recupera cruzando `correlationId` com o log de
acesso. Vale para o produto inteiro, não só para `contractor_mail_settings`; registrado porque foi
a revisão da T008 que o notou.

**Gates depois da revisão:**

```
$ bun run typecheck                  # raiz, as seis apps → limpo
$ bun run --cwd apps/api-transportada test
 5616 pass
 23 skip
 0 fail
Ran 5639 tests across 170 files.

$ bun --env-file=../../.env.test test ./test/integration/contractor-mail-settings-repository.integration.ts --timeout 120000
 5 pass
 0 fail
Ran 5 tests across 1 file.

$ bun run lint                       # raiz → limpo
$ bunx prettier --check apps/api-transportada/src/contractor-mail apps/api-transportada/test/contractor-mail \
    apps/api-transportada/test/contractor-mail-schema \
    apps/api-transportada/test/fixtures/contractor-mail-http.fixture.ts \
    apps/api-transportada/test/integration/contractor-mail-settings-repository.integration.ts \
    apps/api-transportada/test/contractor-mail.contract.test.ts \
    apps/api-transportada/src/main.ts docs/SECURITY.md
All matched files use Prettier code style!
```

## T009 — 2026-09-13

O trilho `contractor-mail-outbound.v1` no worker e o `POST /contractor-mail-settings/test-email` na
API. Molde: `aggregate-attachment.v1` (relay em `application/`, repositório de outbox em
`infrastructure/`, envelope Zod versionado em `messaging/`, consumidor em `runtime/`).

**API — `POST /contractor-mail-settings/test-email` (`settings.manage`/`company`, `202`):**

- `src/contractor-mail/domain/reply-token.policy.ts` (novo, só o que a T009 precisa — a T014
  completa): `generateReplyToken()` gera 128 bits em base32 minúsculo sem padding (RFC 4648, quinze
  linhas de `node:crypto`, sem biblioteca), `hashReplyToken()` usa o mesmo `Bun.CryptoHasher('sha256')`
  de `invitation.policy.ts`, e `buildReplyAddress()` monta `<token>@<replyDomain>`.
- `src/contractor-mail/infrastructure/actor-email.repository.ts` (novo): lê `identity_user_profiles.email`
  pelo `userId`, sempre juntando `user_company_memberships` ativo daquela empresa — o mesmo molde de
  `notification/infrastructure/identity-recipient.resolver.ts` — para o mesmo `userId` noutra empresa
  não vazar o e-mail daqui.
- `src/contractor-mail/application/send-contractor-mail-test-email.use-case.ts` (novo): lê a
  configuração (`ContractorMailNotConfiguredError`, 409, se ausente), resolve o e-mail do ator
  (`ContractorMailTestRecipientUnavailableError`, 422, se ausente), gera o token e o `replyToAddress`,
  e chama `repository.openTestEmailThread`. `buildContractorMailTestEmailBody` é a função pura do
  corpo — texto simples, só o `senderName` configurado como referência à empresa (Objetivo item 3).
- `contractor-mail.port.ts`/`drizzle-contractor-mail.repository.ts`: `openTestEmailThread` faz, numa
  transação só: `INSERT ... ON CONFLICT (company_id, subject_type, subject_id) DO UPDATE SET
reply_token_hash = ...` na conversa `setup_test` (subject_id = o próprio `companyId` — não há um
  segundo objeto para apontar, e fixar o valor faz o unique existente garantir "uma conversa de teste
  por empresa" sem consulta extra); insere a mensagem `outbound`/`queued`; insere o evento em
  `contractor_mail_outbox`.
- Rota nova em `contractor-mail-settings.routes.ts`, `no-store`, `202` com `{ data: { threadId } }`;
  `jsonResponse` ganhou parâmetro `status` (as três rotas antigas viraram `jsonResponse({ body: ... })`).

**Decisão que desvia do `plan.md`, registrada conforme pedido — o destinatário e o Reply-To
viajam no `payload` do evento, não só `{ messageId }`:** `contractor_mail_messages` (T003) não tem
coluna de destinatário, e o token em claro nunca é persistido (RF2 — só o hash). Para as mensagens do
P1 (T015) o destinatário sairá de `contractor_contacts` via `thread.contractorId`; o e-mail de teste
(`setup_test`, sem contratante) não tem esse caminho, e o endereço só existe no instante da
requisição HTTP. A saída: `contractor_mail_outbox.payload` (jsonb, já existente) grava
`{ toAddress, replyToAddress }`, e o envelope Zod do worker os declara — o `messageId` continua
sendo a chave para tudo que é "corpo" de verdade (o texto vem do banco, pelo `messageId`). Um
clique novo em "Enviar e-mail de teste" **gira** o token (o `ON CONFLICT DO UPDATE` troca o hash):
reaproveitar o hash antigo sem o texto plano correspondente deixaria o Reply-To do envio atual sem
token nenhum para responder — só o clique atual conhece o texto plano.

**Worker — trilho `contractor-mail-outbound.v1`:**

- `src/database/contractor-mail.schema.ts` (novo, cópia por valor, como as outras catorze): só as
  colunas que este trilho lê e escreve — `contractor_mail_outbox` inteira, e de `contractor_mail_settings`/
  `contractor_mail_threads`/`contractor_mail_messages` apenas o necessário para montar e marcar o envio.
- `src/messaging/contractor-mail-outbound-envelope.schema.ts` e
  `contractor-mail-outbound-rabbitmq-topology.ts` (novos): fila
  `${QUEUE_PREFIX}.contractor-mail-outbound.v1.{main,retry,dead}.{exchange,queue}`, retry com 5s de
  atraso e três tentativas — mesmo molde do anexo do agregado.
- `src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-outbox.repository.ts` (novo):
  `claimDueEntries`/`markPublished` com `FOR UPDATE SKIP LOCKED`, cópia estrutural de
  `DrizzleAggregateAttachmentOutboxRepository`.
- `application/contractor-mail-outbound-outbox-{relay,publisher}.service.ts` (novos): mesmo par de
  classes do anexo do agregado, publicando `{ messageId, toAddress, replyToAddress }`.
- `infrastructure/drizzle-contractor-mail-outbound-worker.repository.ts` (novo): as quatro leituras
  do Objetivo item 5 (`findMessageById`, `findThreadById`, `findSettingsByCompanyId`,
  `findLastInboundReferenceHeaders` — a última mensagem `inbound` da conversa, para `In-Reply-To`/
  `References` do RF7) e as duas escritas (`markMessageSent`, `markMessageFailed`), toda leitura e
  escrita filtrando `company_id` na mesma condição.
- `domain/contractor-mail-subject.constant.ts` (novo): `resolveContractorMailSubject` — o assunto é
  fixo por `subject_type` da conversa (a tabela não guarda assunto). Só `setup_test` existe até aqui;
  o P1 (T015) acrescenta os outros e o mapa cresce com ele. Tipo desconhecido lança
  (`ContractorMailUnknownThreadSubjectTypeError`) em vez de mandar um assunto genérico — nenhuma
  mensagem deveria existir com um `subject_type` sem assunto registrado antes da T015 escrevê-lo.
- `application/send-contractor-mail-outbound-message.use-case.ts` (novo): carrega mensagem → conversa
  → configuração, abre a credencial (T006), monta `In-Reply-To`/`References` quando há mensagem
  `inbound` anterior, e chama `sendEmail` (T007) com `from` de `settings.senderName`/`senderAddress`,
  `reply_to` do payload, `Idempotency-Key = messageId`. **`ResendProviderUnauthorizedError` é o único
  erro tratado como permanente** — marca `failed` e devolve sem relançar; qualquer outro erro
  (`ResendProviderUnreachableError`, `ResendProviderUnexpectedResponseError`, falha do cofre) propaga
  para o consumidor decidir o retry, sem tocar `delivery_status` (continua `queued`).
- `runtime/contractor-mail-outbound-consumer.service.ts` (novo): `ack` em `sent` e em `failed`
  permanente (o caso de uso já persistiu o resultado — reentregar não mudaria nada), `retry` em
  qualquer exceção. Loga `contractor_mail_sent`/`_failed` com `companyId`, `eventId`, `messageId`,
  `threadId` e o `reason` quando falho — nunca endereço, assunto ou corpo (contrato
  "never logs the recipient address, the subject or the body").
- `main.ts`: topologia, publisher, `OutboxRelayLoop` (1s de polling, 30s de lease, como o do anexo) e
  consumidor registrados ao lado do trilho de anexo — em `WorkerRuntimeDependencies`, na lista de
  `consumers`, no grupo fechável de `provider` e nos dois blocos de desligamento (o de erro no boot e
  o de shutdown normal). `test/nfe-runtime.contract.test.ts` e `test/shutdown-signals.contract.test.ts`
  precisaram do override `startContractorMailOutboundConsumer` e das linhas novas na ordem esperada de
  `cancel`/`provider.close` — o mesmo comentário que a linha do anexo do agregado já carrega sobre
  publisher esquecido do grupo de fechamento.

**Testes:**

- API: `test/contractor-mail/reply-token-policy.contract.ts` (token, hash, endereço),
  `test/contractor-mail/send-test-email-use-case.contract.ts` (sem configuração → 409, sem e-mail do
  ator → 422, destinatário do contexto nunca do corpo, corpo do e-mail, hash de 64 hex, endereço no
  domínio de resposta), extensões em `test/contractor-mail/settings-routes.contract.ts` (a rota nova
  nos três loops existentes — sem segredo, `no-store`, `403` sem permissão — mais `202`+`threadId`,
  409 e 422 mapeados). `test/integration/contractor-mail-test-email-thread.integration.ts` (novo,
  Postgres de verdade): a conversa/mensagem/evento nascem juntos; um segundo clique reaproveita o
  `threadId`, gira o hash e enfileira mensagem nova; isolamento por empresa.
- Worker: `test/contractor-mail/outbound-envelope.contract.ts` (schema Zod: aceita, recusa corpo no
  payload, recusa campo desconhecido), `outbound-message.contract.ts` (o caso de uso: corpo do
  `sendEmail` exato, `In-Reply-To`/`References` quando há histórico, erro permanente vira `failed`
  sem relançar, erro transitório propaga), `outbound-relay.contract.ts` (publica e marca, corrida de
  claim perdida não publica nem marca, falha de publish nunca marca), `outbound-consumer.contract.ts`
  (`ack` em sucesso e em falha permanente, `retry` em falha transitória, nenhum log leva endereço/
  assunto/corpo). `test/contractor-mail-outbound-outbox.integration.test.ts` (novo, `DATABASE_URL`
  direto, molde de `cte-issuance-write-back.integration.test.ts`): reivindica e marca publicada uma
  linha real, e uma segunda reivindicação não rouba a linha já arrendada por outro dono.
- Os overrides de consumidor em `test/nfe-runtime.contract.test.ts`/`shutdown-signals.contract.test.ts`
  foram estendidos (não são testes da spec 143, mas quebravam sem o override do consumidor novo).

**Gates:**

```
$ bun run typecheck                        # raiz, as seis apps → limpo
$ bun run lint                             # raiz, as seis apps → limpo
$ bunx prettier --write <arquivos tocados> # sem mudança de lógica, só formatação

$ bun run --cwd apps/api-transportada test
 5633 pass, 23 skip, 0 fail — 5656 testes em 170 arquivos

$ bun --env-file=../../.env.test test \
    ./test/integration/contractor-mail-test-email-thread.integration.ts \
    ./test/integration/contractor-mail-settings-repository.integration.ts --timeout 120000
 8 pass, 0 fail

$ bun run --cwd apps/worker-transportada test
 1083 pass, 0 fail — 1083 testes em 81 arquivos

$ make worker-integration
 74 pass, 2 fail (não relacionados: "invitation-delivery-channel" — timeout de 5s por concorrência de
 host, e "osrm-routing-matrix" — geometria do serviço OSRM local diverge do fixture, os dois já
 preexistentes e independentes desta task). O par de testes de
 contractor-mail-outbound-outbox.integration.test.ts passou nas duas execuções.
```

**Filas criadas:** `${QUEUE_PREFIX}.contractor-mail-outbound.v1.main.{exchange,queue}`,
`...v1.retry.{exchange,queue}` (atraso de 5s, três tentativas) e `...v1.dead.{exchange,queue}`.

**Erro permanente × transitório:** só `ResendProviderUnauthorizedError` (a chave foi recusada) é
permanente — o caso de uso grava `delivery_status = 'failed'` e devolve `{ outcome: 'failed', reason:
'provider_unauthorized' }` sem relançar, e o consumidor faz `ack` (reentregar não mudaria o resultado).
Qualquer outro erro (`ResendProviderUnreachableError`, `ResendProviderUnexpectedResponseError`, falha
ao abrir o cofre, exceção inesperada) propaga: o consumidor devolve `retry`, a mensagem segue
`queued`, e o broker reencaminha com o backoff da topologia (5s, até três vezes, depois `dead`).

**Desvios do molde (`aggregate-attachment.v1`), todos registrados acima com a razão:**

1. O payload de saída carrega `{ messageId, toAddress, replyToAddress }`, não só `{ messageId }` —
   decisão forçada pela ausência de coluna de destinatário em `contractor_mail_messages` (T003).
2. O token de resposta é girado a cada "Enviar e-mail de teste", nunca reaproveitado — consequência
   de RF2 (só o hash é persistido) cruzada com a necessidade de montar o Reply-To a cada envio.
3. O assunto do e-mail é uma constante por `subject_type` (`contractor-mail-subject.constant.ts`),
   porque a tabela de mensagens não tem coluna de assunto — molde novo, não presente no anexo do
   agregado (que não envia e-mail).

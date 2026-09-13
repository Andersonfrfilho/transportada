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

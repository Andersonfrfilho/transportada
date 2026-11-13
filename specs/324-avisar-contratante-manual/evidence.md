# Evidência — Feature 324

## T0 — Leitura (13/11/2026, lido em `origin/staging` d34dcd5)

### 1. Permissão da mensagem à contratante (D5/D9)

`occurrence-conversation/presentation/occurrence-conversation.routes.ts:57` — `WRITE_POLICY = { permission: 'occurrences.resolve', scope: 'company' }`,
usada para escrever à contratante e ver a prévia. Papéis: `company-admin`, `operator`, `finance` (nunca `separator`). O botão usa **`occurrences.resolve`**; nenhuma permissão nova.
(O robô do aviso automático usa `occurrence.automatic-mail`, só-serviço — não serve ao botão.)

### 2. O que `send-automatic-occurrence-mail.use-case.ts` já oferece (D1)

- `findPlan` (`drizzle-occurrence-mail.repository.ts:620`) devolve `null` para parada, nota sem contratante casada ou etapa `stop`. **Só lê contatos, modelo e grupo quando `emailsContractor = true`** (`:665`, `:681`, `:697`): com o tipo desligado, `recipients=[]`, `suggested=null`, `groupChannel=null`. **`sendManual` não pode só pular o `type_off`: precisa de um `findPlan` com opção `ignoreTypeOff`** (ou uma leitura irmã), senão cai em `no_recipient`/`no_template_selected`.
- `sendByEmail` e `sendThroughGroup` são funções **internas** da factory, não exportadas; reaproveitar = expor `sendManual` dentro da mesma factory. `sendByEmail` envia com `automatic: true`, `actorUserId: null` e chave `occurrence-auto-mail:<id>` — o manual precisa de `actorUserId`, `automatic: false` e chave `occurrence-manual-notice:<id>`; `SendOccurrenceMailUseCase.send` já aceita esses campos, mas conferir se `automatic:false` exige corpo/assunto vindos do operador (T1/T2).
- `sendThroughGroup` usa `group.claim(input)` e grava em `idempotency_records` (`occurrence-contractor-group.send`, chave `occurrence-auto-mail:<id>`). O grupo manual **não pode reusar essa chave**: se o automático já falhou (`failed`), o `claim` do botão é o que a varredura também disputa. D3 pede chave própria — a porta `ContractorOccurrenceGroupPort` precisa receber a chave (hoje é fixa no repositório `contractor-occurrence-group.repository.ts`).
- O modelo do grupo: `group.readMessage` → `ocorrencia.contratante-grupo` (ou a versão `whatsapp` da chave do tipo). Sem modelo → `template_missing`. **O fallback para `ocorrencia.contratante-aviso-manual` (D10) entra aqui e em `readSuggestedMail`** (`findOccurrenceNotificationTemplateSource`): hoje devolve `null` sem chave no tipo.
- A guarda `occurrenceTypeNeverNotifiesContractor` é checada primeiro no `send` e dentro do `findPlan` (devolve plano bloqueado); `sendManual` mantém as duas → 409 na rota (RF6).

### 3. Estado "já avisada" (RF1/RF4)

Hoje não há leitura única de "avisada". Fontes: `contractor_mail_messages` (e-mail, `automatic` ou não, ligado à ocorrência) e `idempotency_records` do grupo (`sent`/`email_fallback`/`failed`). T3 precisa unir as duas; `failed` do grupo **sem** e-mail enviado = pode avisar (D8).

### 4. Paridade das frases de andamento (D4) — achado

- API: `trips/domain/occurrence-timeline.policy.ts` (união de `kind`, `KEY` por prioridade, `isKey`) e `trips/infrastructure/trip-occurrence-timeline.query.ts` (uma `list*Sources` por fonte). Contrato: `test/trip-occurrence/timeline*.contract.ts`.
- Painel: `modules/trip/shared/tripOccurrenceTimeline.validation.ts` tem `KNOWN_EVENT_KINDS` e um `switch` por `kind`; **kind fora da lista é descartado em silêncio** (`events.filter(isKnownEventKind)`, linha 150). Não existe contrato de paridade API↔painel dessa lista.
- **Defeito existente (spec 318): `contractor.group.whatsapp` sai da API mas não está em `KNOWN_EVENT_KINDS` nem no `switch`** — o aviso no grupo some da linha do tempo do painel. Não é tocado por esta spec, mas a frase nova do manual cairia no mesmo buraco. Proposta: a T2/T4 acrescenta o kind novo **e** `contractor.group.whatsapp` ao painel e cria o contrato de paridade (skill `contrato-de-paridade`) que compara a união da API com a lista do painel. O `frontend-client` e o `frontend-driver` não citam esses kinds (não precisam espelhar).
- Dois caminhos para a frase do manual: (a) kind novo `contractor.notice.manual` com ator humano (quem enviou, canal, resultado) — recomendado, pois os kinds de e-mail (`contractor.mail.sent`) já mostram o envio por e-mail mas sem dizer "aviso manual"; (b) reaproveitar `contractor.mail.sent`/`contractor.group.whatsapp`. Com (a), `KEY` e `isKey` (só `sent`) ganham a linha.

### 5. Outras constatações

- A spec 324 vive no PR #730; `specs/324-*` não existe em `staging` ainda.
- Runbook `docs/runbooks/producao.md`: T0 não tocou produção, nada a registrar.
- Modelos HTML: `occurrence-mail-templates/*.html` + `scripts/occurrence-mail-templates-publish.ts` (chave `ocorrencia.<arquivo>`); o modelo geral D10 segue esse molde (T1b).

## T1 — Rota e envio manual (13/11/2026, sobre `origin/staging` d34dcd5)

### O que entrou

- **Rota** `POST /trip-occurrences/:id/contractor-notice` (`occurrence-contractor-notice.routes.ts`): `occurrences.resolve` (D9), corpo vazio `.strict()` (canal, texto e empresa nunca vêm do cliente), `companyId` e autor do contexto, `cache-control: no-store`, balde Postgres `occurrence-conversation` (30/300 s, o das mensagens da ocorrência). Desfechos: 200 com o resultado do envio (`sent`, `sent_to_group`, `group_failed` com a reserva por e-mail, ou `skipped` com o motivo — D6); 409 `OCCURRENCE_CONTRACTOR_NOTICE_BLOCKED` no tipo da 321 (RF6); 409 `OCCURRENCE_CONTRACTOR_NOTICE_ALREADY_SENT` com `notifiedBy: 'automatic' | 'manual'` (D3, D8); 404 para parada, nota sem contratante ou outra empresa.
- **Caso de uso** `sendManual` dentro da factory do automático (`send-automatic-occurrence-mail.use-case.ts`), reaproveitando `sendByEmail`/`sendThroughGroup` (D1). Ordem: `findPlan` com `ignoreTypeOff` → marca da 321 → tipo ligado já avisado pelo automático (D8) → reserva do botão (D3) → o canal do automático (D2). E-mail sai com `actorUserId` do operador, `automatic: false` e chave `occurrence-manual-notice:<id>`; o carimbo `isRegisteredBeforeTemplate` só segura o automático. Grupo reserva e grava em `occurrence-contractor-group.send` com a chave do botão (`keyPrefix`), nunca a do automático.
- **`findPlan({ ignoreTypeOff })`** lê contatos, modelo e grupo com o tipo desligado; `emailsContractor` no plano segue o real.
- **Reserva do botão** (`contractor-manual-notice.repository.ts`): `idempotency_records`, operação `occurrence-contractor-manual-notice.send`, no molde da reserva do grupo (nasce `processing`; `failed` ou `processing` parado há 10 min é retomado; `completed` nunca). Só o que chegou à contratante fecha (`isManualNoticeDelivered`); sem destinatário, sem modelo, e-mail não configurado, grupo falho sem reserva e exceção gravam `failed` e liberam o próximo clique. Chave do e-mail já usada com outro texto = o aviso já saiu: fecha `completed` e responde já avisada.
- **O automático não repete o botão:** `send` responde `skipped/manual_notice_sent` quando a reserva do botão está `completed`, e a fila da varredura do worker (`drizzle-occurrence-automatic-mail-queue.repository.ts`) exclui essas ocorrências (operação e prefixo copiados por valor; paridade cobrada no contrato da API).

### Fora desta etapa (seguem nas próximas)

- **T1b:** o modelo geral `ocorrencia.contratante-aviso-manual` (D10). Até lá, tipo sem modelo responde `skipped/no_template_selected` (e-mail) ou `group_failed/template_missing` (grupo sem `ocorrencia.contratante-grupo`).
- **T2:** tabela própria do registro, auditoria e a frase na linha do tempo (o botão ainda não aparece na linha do tempo como "aviso manual"; o e-mail aparece como mensagem enviada pelo operador, e o grupo manual não aparece porque a fonte `contractor.group.whatsapp` lê só a chave do automático).
- **T3/T4:** leitura do estado no detalhe e o botão no painel.

### Testes

- Contrato (sem banco): `test/occurrence-conversation/manual-contractor-notice.contract.ts` (CA01–CA05, D8, carimbo, chave reusada, grupo falho, varredura, paridade com o worker — 16 casos) e `test/occurrence-automatic-mail/contractor-notice-routes.contract.ts` (403 sem `occurrences.resolve`, 400 corpo, contexto, 200/409/404 — 10 casos); `test/rate-limited-routes.contract.test.ts` ganhou a rota.
- `bun run test` da API: **15110 pass, 0 fail** (229 arquivos).
- Integração contra Postgres 16 local (`test/integration/contractor-manual-notice.integration.ts`, novo na lista do `package.json`): CA01/CA03/CA04 (tipo desligado: o automático é `type_off`, o botão manda um e-mail com o operador como autor, o segundo clique é recusado, e ligar o tipo depois não faz a varredura repetir), CA02 (grupo pela chave do botão, nenhum e-mail), D8 e CA05 — **4 pass**. `contractor-occurrence-group.integration.ts` segue verde (6 pass).
- Worker: `occurrence-automatic-mail-sweep.integration.test.ts` com os cenários `manualNoticeSent` (fora da fila) e `manualNoticeFailed` (na fila) — **11 pass**; `occurrence-automatic-mail-sweep.contract.test.ts` 35 pass.
- `tsc --noEmit` da API e do worker sem erro; `eslint` e `prettier --check` nos arquivos tocados limpos.
- Produção não foi tocada; nada a registrar no runbook.

## T2 — Registro, auditoria e linha do tempo (13/11/2026, sobre `origin/staging` 09c6659)

### O que entrou

- **`sendManual` já existia (T1).** A T2 não mexe no fluxo do envio: só o que acontece ao fechar a reserva.
- **Tabela `occurrence_contractor_manual_notices`** (migration `20261113142806_contractor_manual_notices`, aditiva): uma linha por clique que passou da reserva, só inserção — quem clicou (`actor_user_id`), quando (`created_at`, `clock_timestamp()`), canal (`email`, `whatsapp_group`, `email_fallback`, ou nulo quando nada foi tentado), `status` (`sent`/`failed`), `outcome` e `reason` do envio. CHECK: `sent` sempre tem canal. FK composta para `trip_document_occurrences` (cascade, como a coleta da 321) e para `identity_users`. Nunca texto, endereço, grupo ou número. O rollback recusa rodar com linha gravada.
- **Registro e auditoria numa instrução só** (`contractor-manual-notice.repository.ts` → `record`): um `WITH` fecha a reserva em `idempotency_records`, insere o clique e grava `audit_logs` (`occurrence.contractor-notice.manual`, permissão `occurrences.resolve`, `correlation_id` da requisição, metadados só com id do registro, status, canal, outcome e motivo). Os três ou nenhum. O canal e o motivo vêm de `describeManualNoticeAttempt` (puro, no caso de uso).
- **Frase de andamento (D4):** kind novo `contractor.notice.manual` na linha do tempo da ocorrência (`occurrence-timeline.policy.ts`, fonte `listManualNoticeSources` em `trip-occurrence-timeline.query.ts`), ator `operation` com o nome de quem clicou, canal, status e motivo. Só o enviado é marco; não muda a etapa (o e-mail que o botão manda já entra como `contractor.mail.sent`). Mesma prioridade do grupo (4): no mesmo instante vem depois do e-mail.
- **Painel:** `KNOWN_EVENT_KINDS` ganhou `contractor.notice.manual` **e** `contractor.group.whatsapp` (defeito da 318 achado na T0: o aviso no grupo sumia da linha do tempo). Frases em pt-BR e en ("Fulano avisou a contratante por e-mail / no grupo do WhatsApp / o grupo falhou e saiu por e-mail", "tentou avisar, sem sucesso" com o motivo); os dois entram no filtro Contratante.
- **Contrato de paridade API ↔ painel** (`test/trip-occurrence/timeline-kind-parity.contract.ts`): `OCCURRENCE_TIMELINE_EVENT_KINDS` (exportada da política, com trava de typecheck que reprova `kind` novo fora da lista) contra o `KNOWN_EVENT_KINDS` do painel, nos dois sentidos e sem duplicidade. O `frontend-client` e o `frontend-driver` não leem esses kinds.
- **Staging-refresh:** a tabela entra no recorte como `empty`, igual a `idempotency_records` (onde mora a reserva), para o refresh não deixar registro sem reserva.

### Testes

- API, contrato: `bun run test` **15125 pass, 4 fail** na primeira rodada — 1 era o recorte do staging-refresh (a tabela nova sem política, corrigido) e 3 foram timeouts de 5 s do `toll-booths` sob carga (sozinho: 137 pass, 0 fail). Depois da correção, `deploy.contract.test.ts` 214 pass.
- Novos: `manual-contractor-notice.contract.ts` (+2: canal/motivo por desfecho e o `correlationId` no registro), `timeline-automatic.contract.ts` (+2: frase do aviso manual e a ordem no mesmo instante), `timeline-kind-parity.contract.ts` (3), `contractor-manual-notices.static.contract.ts` (2); `static-migration.contract.ts` e o snapshot do schema conferem a migration.
- Integração contra Postgres 16 local: `contractor-manual-notice.integration.ts` **5 pass** (novo caso T2: falha e depois envio viram dois registros, duas linhas de auditoria sem `@`, e as duas frases na linha do tempo; CA02 confere o registro `whatsapp_group`); `trip-occurrence-timeline`, `trip-timeline`, `trip-crew-transfer-timeline` e `contractor-occurrence-group` **59 pass**; `db:test` (migrations em banco descartável) **263 pass**.
- Rollback contra Postgres: com uma linha gravada o `rollback.sql` recusa (`refusing to drop the spec 324 T2 table`); vazio, derruba a tabela e a entrada do journal.
- Painel: `bun run test` **8829 + 1496 pass, 0 fail**; novo `occurrence-timeline-contractor-notice.contract.ts` (7 casos).
- `tsc --noEmit` da API e do painel sem erro; `eslint` e `prettier --check` nos arquivos tocados limpos.
- Sem tela nem componente novo (só frases numa linha do tempo existente): sem prints nesta etapa; os da T4 cobrem o botão.
- Produção não foi tocada; nada a registrar no runbook.

## T1b — Modelo geral do aviso manual (13/11/2026, empilhado sobre a T1)

### O que entrou

- **Modelo geral `ocorrencia.contratante-aviso-manual` (D10)** em dois arquivos versionados: e-mail
  `occurrence-mail-templates/contratante-aviso-manual.html` (assunto na linha 1, mesma família visual dos modelos de
  ocorrência, área `<!-- mensagem -->`) e WhatsApp `occurrence-whatsapp-templates/contratante-aviso-manual.txt`.
- **Régua de variáveis** (`domain/contractor-manual-notice-template.policy.ts`): o e-mail usa só tipo, contratante,
  nota, cliente (`razaoSocial`), valor, data, observação e a moldura do sistema (logo, nome de exibição, cidade,
  razão social da transportadora, assinatura, rodapé, faixa de resposta, aviso de nova data); o WhatsApp, só a lista
  fechada do grupo da 318. Nenhum CPF, CNPJ (nem o da transportadora), telefone, motorista ou número do documento do
  cliente. O publicador soma a régua à validação de sempre e recusa a publicação inteira se algum arquivo falhar.
- **Publicador** (`occurrence-mail-templates-publish.service.ts` + script): cada modelo diz o canal; o texto WhatsApp
  é publicado pela mesma rotina (versão nova, nunca `UPDATE` de texto; `differs` só com `--overwrite`). O plano mostra o
  canal ao lado da chave.
- **Fallback só no botão:** `findOccurrenceNotificationTemplateSource` recebe `fallbackKey` (o modelo do tipo
  utilizável vence; sem ele, o geral); o plano manual (`ignoreTypeOff`) e o envio manual (`templateFallbackKey` em
  `SendOccurrenceMailInput`) passam a chave. No grupo, `readMessage` recebe `fallbackTemplateKey` e
  `findContractorOccurrenceGroupTemplate` ordena por posição: chave do tipo → `ocorrencia.contratante-grupo` → geral.
  O automático nunca passa a chave: continua `no_template_selected` / `template_missing` sem modelo.
- **Staging:** script com simulação primeiro, `staging-324-publica-modelo-aviso-manual.sh` (runbook § 5.32).

### Testes

- Contrato: `test/occurrence-conversation/manual-notice-template.contract.ts` (arquivos passam na validação e na
  régua; régua recusa variável proibida, HTML no WhatsApp, vazio e marcador malformado; render do WhatsApp; publicador
  nos dois canais com create/same/differs; só o botão passa a chave ao e-mail e ao grupo). `manual-contractor-notice`
  (CA03 com `templateFallbackKey`) e `mail-templates-publish` (chave nova na lista). `occurrence-conversation`,
  `occurrence-contractor-mail`, `occurrence-automatic-mail` e `test-registry`: 1367 pass, 0 fail.
- Integração contra Postgres 16: `contractor-manual-notice.integration.ts` (9 pass depois do rebase sobre a T2, 4 da T1b: tipo sem modelo manda pelo geral e
  grava a chave na mensagem; o automático segue `no_template_selected`; o do tipo vence o geral; no grupo, sem o modelo
  da 318 sai o texto geral e o automático fica `template_missing`; com os dois, o da 318 vence),
  `occurrence-mail-templates-publish.integration.ts` e `contractor-occurrence-group.integration.ts` verdes.
- Script de staging rodado contra um banco local migrado: simulação `create/create`, `--confirm` grava v1 nos dois
  canais, segunda rodada `same/same`; o publicador do repositório vê os dois como `same` (mesmo texto byte a byte).
- `tsc --noEmit` e `eslint` dos arquivos tocados limpos.

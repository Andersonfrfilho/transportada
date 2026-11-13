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

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

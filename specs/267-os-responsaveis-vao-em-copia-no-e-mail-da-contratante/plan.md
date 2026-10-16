# Plano — 267 Os responsáveis vão em cópia no e-mail da contratante

## Contexto e premissas

O levantamento contra `origin/staging` (d6459e4cd, 2026-10-15) está em [`evidence.md`](evidence.md) § Levantamento. Os
fatos que moldam o plano:

- **Não existe `Cc` em lugar nenhum da saída.** `SendResendEmailInput` (`resend-mail.gateway.ts:67-79`) não tem `cc`
  nem `bcc`; `contractor_mail_messages` só tem `to_addresses` (`contractor-mail.schema.ts:475`, CHECK em :587); a rota de
  envio é `.strict()` e um contrato exige `cc` → 400.
- **Todo envio para a contratante passa por um de dois caminhos.** Ocorrência: `executeSend`
  (`send-occurrence-mail.use-case.ts:139`), usado pelo envio manual, pelo automático (`send-automatic-occurrence-mail`,
  :87-97) e pelo reenvio da 248 (`resend-contractor-reply-request`, que reenvia os `contactIds` do envio original).
  Correção de endereço: `send-address-correction-mail.use-case.ts:141-195`. O encaminhamento a terceiro
  (`forward-contractor-reply-by-email.use-case.ts:274`) é um terceiro caminho, sem fio, e fica de fora.
- **A entrada já lê `To` + `Cc` para achar o token** (`recipient-reply-token.policy.ts:24`), mas o remetente só é
  identificado na leitura da conversa (`identifyContractorSender`, `contractor-sender.policy.ts:58-100`): quem não é
  contato vira `unknown` com sugestão de cadastro. É aí que o responsável precisa ser reconhecido.
- **Não há lista de usuários com endereço real para o painel.** `GET /company-users` exige `users.manage` e devolve
  e-mail mascarado (`company-user.policy.ts:24-34`). O endereço é resolvido **só no servidor**, pelo mesmo caminho do
  `identity-recipient.resolver.ts` (perfil + vínculo, por empresa).
- **Trilha de auditoria existe:** `audit_logs` (`fiscal-operation.schema.ts:37`, `actor_user_id NOT NULL`), já usada
  pelos repositórios de configuração.

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`)

| Camada       | Arquivo (novo ou alterado)                                                                                                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema       | `src/database/contractor-mail.schema.ts`: tabelas `company_occurrence_watchers` e `contractor_occurrence_watchers`; coluna `cc_addresses` em `contractor_mail_messages` + migration Drizzle                                                                                            |
| Domínio      | `src/contractor-mail/domain/occurrence-watcher.policy.ts` (pura): `resolveEffectiveWatchers`                                                                                                                                                                                           |
| Domínio      | `src/contractor-mail/domain/occurrence-watcher.error.ts`: `OccurrenceWatcherNotEligibleError` (400), `OccurrenceWatcherListTooLongError` (400), `ContractorMailTooManyRecipientsError` (400); códigos em `shared/errors/codes.ts`                                                      |
| Infra        | `drizzle-occurrence-watcher.repository.ts`: ler/trocar as duas listas; candidatos elegíveis; endereços dos elegíveis em lote (molde do `identity-recipient.resolver.ts`); `audit_logs` na mesma transação da troca                                                                     |
| Aplicação    | `list-occurrence-watcher-candidates.use-case.ts`, `replace-company-occurrence-watchers.use-case.ts`, `replace-contractor-occurrence-watchers.use-case.ts`, `resolve-mail-copy.service.ts` (lista efetiva com endereços)                                                                |
| Apresentação | `occurrence-watchers.routes.ts` (`settings.manage`)                                                                                                                                                                                                                                    |
| Envio        | `send-occurrence-mail.use-case.ts` (`executeSend` + preview), `drizzle-occurrence-mail.repository.ts` (`recordMail` grava `ccAddresses`), `occurrence-conversation.routes.ts` (`excludedWatcherUserIds`; `MAX_RECIPIENTS` local :77 passa a importar `CONTRACTOR_MAIL_MAX_RECIPIENTS`) |
| Envio        | `send-address-correction-mail.use-case.ts` + seu repositório e schema (`excludedWatcherUserIds`, `cc` no preview/form)                                                                                                                                                                 |
| Entrada      | `contractor-sender.policy.ts`: novo `kind: 'internal'`; `occurrence-conversation.query.ts` carrega os endereços dos usuários da empresa citados                                                                                                                                        |

### Worker (`apps/worker-transportada`)

- `resend-mail.gateway.ts`: `cc?: readonly string[]` em `SendResendEmailInput`; validação por endereço igual à do `to`
  e `to.length + cc.length ≤ CONTRACTOR_MAIL_MAX_RECIPIENTS`; schema de e-mail **recebido** passa a declarar `cc`.
- `send-contractor-mail-outbound-message.use-case.ts:136-146`: passa `message.ccAddresses` deduplicado (vazio → sem
  campo `cc`).
- `record-contractor-mail-inbound-message.use-case.ts`: grava `cc_addresses` do e-mail recebido.

### Painel (`apps/frontend-transportada`)

- `company-settings`: painel `occurrenceWatchers` em `SETTINGS_PANELS` (:3-30), `SETTINGS_PANEL_PLACEMENT` (:88+),
  tab id em `COMPANY_SETTINGS_TAB_IDS` (:274-285), ramo em `pages/CompanySettings.page.tsx` (molde do `quickReplies`,
  :256). Componente `OccurrenceWatchersPanel.component.tsx` + `occurrenceWatchersClient.service.ts` + query.
- `delivery-clients`: `ContractorOccurrenceWatchersPanel.component.tsx` ao lado do `ContractorContactsPanel` em
  `DeliveryClientWorkspace.page.tsx:125`, com o aviso "substitui a lista da empresa" e a indicação de qual lista vale.
- `occurrence-conversation/components/SendToContractorDialog.component.tsx` e o diálogo de envio da correção de
  endereço: linha "Cópia:" com chips removíveis; o envio manda `excludedWatcherUserIds`.
- Histórico: "Cópia:" na mensagem; mensagem interna por e-mail com o selo "só para a equipe" quando couber.

## Contratos/API/eventos

### Configuração (`settings.manage`)

Endpoints por item (revisão T0.2: PUT da lista inteira trocaria linhas que outro operador acabou de mexer e não
carrega o estado ativo/inativo).

```ts
type WatcherItem = {
  userId: string
  name: string
  maskedEmail: string | null
  status: 'active' | 'inactive'
  eligible: boolean
}

// GET    /company-settings/occurrence-watchers              → { data: { watchers: WatcherItem[] } }
// POST   /company-settings/occurrence-watchers              { userId } .strict() → 201 WatcherItem (200 se já existe)
// PATCH  /company-settings/occurrence-watchers/:userId      { status } .strict() → 200 WatcherItem
// DELETE /company-settings/occurrence-watchers/:userId      → 204
// GET    /company-settings/occurrence-watchers/candidates   → { data: Array<{ userId; name; maskedEmail }> }

// Mesmo desenho sob /contractors/:id/occurrence-watchers[/:userId]; o GET acrescenta effectiveSource.
// GET /contractors/:id/occurrence-watchers → { data: { watchers: WatcherItem[]; effectiveSource: 'contractor' | 'company' } }
```

Erros: `400 OCCURRENCE_WATCHER_NOT_ELIGIBLE` (POST e PATCH para `active`), `400 OCCURRENCE_WATCHER_LIST_TOO_LONG`,
`404 OCCURRENCE_WATCHER_NOT_FOUND`, `404 CONTRACTOR_NOT_FOUND` (inclui contratante de outra empresa).
`candidates` não colide com `:userId`: o parâmetro é validado como uuid, não existe `GET /:userId`, e há teste de rotas
com o roteador real (`createRouter` + `allowedMethods`; a 266 mostrou que contrato que contorna o roteador não pega).

Limites (decisão delegada ao dono): no máximo **10 ativos** e **30 linhas no total** por lista. Só linhas **ativas**
vão em cópia; inativas continuam listadas; remover apaga a linha. **Lista da contratante sem nenhuma linha ativa herda
a da empresa** (`effectiveSource` acompanha). `maskedEmail` usa `maskEmailAddress` (248). `eligible: false` marca quem
está gravado mas perdeu vínculo, permissão ou e-mail: continua listado com o selo "não elegível" e o envio o ignora.

### Envio

O preview existente (`POST /trip-occurrences/:id/conversations/contractor/mail-preview`) e o dado do formulário da
correção de endereço ganham:

```ts
cc: Array<{ userId: string; name: string; maskedEmail: string }>
ccSource: 'contractor' | 'company' | null // null = nenhuma lista
```

A rota de envio aceita `excludedWatcherUserIds?: string[]` (0..10, uuid), continua `.strict()`. Id que não está na lista
efetiva é ignorado (só remove). `cc` livre continua 400.

### Pipeline

```text
executeSend(contactIds, excludedWatcherUserIds = [], automatic)
  to  = contatos válidos (como hoje)
  cc  = resolveEffectiveWatchers({ contractorList, companyList, eligible, excluded, toAddresses: to })
  manual e |to|+|cc| > 50 → 400 CONTRACTOR_MAIL_TOO_MANY_RECIPIENTS (nada gravado)
  automático e > 50       → corta o cc até caber, log warn com contagens (T0.2 valida)
  recordMail({ toAddresses: to, ccAddresses: cc, ... })   // outbox continua { messageId }
worker: to = message.toAddresses, cc = message.ccAddresses
```

`resolveEffectiveWatchers` (pura): lista da contratante se não vazia, senão a da empresa → só elegíveis com e-mail →
menos `excluded` → menos endereço (minúsculo, sem espaço) presente no `to` → sem duplicata, na ordem de nome.

Reenvio da 248: chama `executeSend` sem `excludedWatcherUserIds` (lista recalculada, não copiada da mensagem original).
Encaminhamento a terceiro: não chama o resolvedor; `cc_addresses` fica `{}` (contrato).

### Entrada

`identifyContractorSender` ganha a entrada `companyUsers: Array<{ userId; name; emails: string[] }>` e o resultado
`{ kind: 'internal', userId, name, arrivedAs, reachedContractor: boolean }`. Ordem: contato da contratante → usuário da
empresa (só com DKIM alinhado, mesma regra do contato) → `unknown`. `reachedContractor` = algum endereço de contato ativo
da contratante está no `to_addresses` ∪ `cc_addresses` da mensagem recebida. A mensagem é a mesma linha já gravada pelo
worker; muda só a leitura — **nenhum e-mail de saída é gerado** e nenhum aviso é disparado por ela.

## Dados, migration e rollback

```sql
CREATE TABLE company_occurrence_watchers (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  user_id    uuid NOT NULL,
  status     varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by_user_id uuid NOT NULL,
  updated_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id),
  FOREIGN KEY (user_id, company_id) REFERENCES user_company_memberships (user_id, company_id) ON DELETE CASCADE
);
CREATE TABLE contractor_occurrence_watchers (
  company_id    uuid NOT NULL,
  contractor_id uuid NOT NULL,
  user_id       uuid NOT NULL,
  status        varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by_user_id uuid NOT NULL,
  updated_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, contractor_id, user_id),
  FOREIGN KEY (company_id, contractor_id) REFERENCES contractors (company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, company_id) REFERENCES user_company_memberships (user_id, company_id) ON DELETE CASCADE
);
-- saída: a cópia enviada; entrada: o Cc do e-mail recebido (RF9). Sem CHECK de tamanho: vazio é o normal.
ALTER TABLE contractor_mail_messages ADD COLUMN cc_addresses text[] NOT NULL DEFAULT '{}';
```

Tabelas de junção (N:N interno) com PK composta, sem enum nem coluna de tipo. A FK para
`user_company_memberships (user_id, company_id)` usa o único existente
(`user_company_memberships_user_company_unique`). Vínculo `disabled` não apaga a linha (o vínculo é `restrict`): a
elegibilidade é conferida no envio.

**Aditiva.** `ADD COLUMN ... DEFAULT '{}'` não reescreve a tabela no Postgres 11+. Rollback: `DROP TABLE` das duas e
`DROP COLUMN cc_addresses` — perde só o registro das cópias já enviadas. Migration com prefixo posterior a
`20261015120000_occurrence_type_default_icons` (reconferir em `origin/staging` antes de gerar).

## Publicação

1. **API + migration.** Coluna com default: o worker antigo ignora a coluna e envia sem `cc` (a cópia "se perde" só
   nessa janela, sem erro). O painel antigo não manda `excludedWatcherUserIds`; a T0.1 confere que o validador do
   preview no painel ignora campo novo (`cc`); se for estrito, entra uma Fase de tolerância antes, como na 266.
2. **Worker** (depois da migration aplicada pelo `preDeployCommand` da API): passa a enviar `cc` e a gravar `cc` na
   entrada.
3. **Painel:** configurações, seção da contratante, chips e histórico. O painel novo contra a API antiga daria 400 no
   envio (`.strict()`), por isso vai por último.

## Segurança e tenant

- Toda leitura e escrita filtra por `company_id` do token; `:id` da contratante conferido na empresa; `userIds` do PUT
  conferidos como elegíveis **na mesma empresa** (usuário de outra empresa → 400 `OCCURRENCE_WATCHER_NOT_ELIGIBLE`, sem
  revelar se existe).
- Endereço real só no servidor; o painel recebe mascarado.
- Nenhum endereço em log; o log do corte por limite e do responsável descartado leva só contagens e ids.
- A identificação `internal` na entrada exige DKIM alinhado (mesma regra do contato): sem ela, um e-mail forjado com o
  endereço do atendente seria lido como mensagem interna.
- `audit_logs` na troca de lista: `action` `occurrence_watchers.{company|contractor}.{add|activate|deactivate|remove}`, permissão `settings.manage`,
  `before_snapshot`/`after_snapshot` com `userId`, `status` e `contractorId` — nunca endereço.

## Idempotência e concorrência

- POST é idempotente (200 se a linha existe); PATCH para o mesmo estado é no-op; DELETE de linha ausente é 404. Cada escrita e o seu `audit_logs` vão na mesma transação.
- Envio: a idempotência existente do envio (`Idempotency-Key`) passa a incluir `excludedWatcherUserIds` (ordenados) na
  impressão digital.
- A lista efetiva é lida no envio, não no preview: o que o operador viu pode mudar entre os dois (aceito; o histórico
  mostra o que saiu).

## Observabilidade

- Log `info` `contractor_mail.copy.resolved` com `messageId`, `ccCount`, `droppedCount`, `source`. Sem endereço.
- Log `warn` `contractor_mail.copy.truncated` no automático que estoura o limite.

## Estratégia de testes

| Camada        | Teste                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Política pura | `occurrence-watcher.policy.contract.ts`: contratante vence empresa; vazia herda; inelegível sai; excluído sai; endereço no `to` sai; duplicata sai; excluído fora da lista não adiciona  |
| Rotas         | GET/PUT das duas listas e candidatos: 200, 400 inelegível, 400 > 10, 404 outra empresa; `cc` livre → 400 (contrato existente mantido); `excludedWatcherUserIds` aceito; colisão de rotas |
| Integração    | `occurrence-watchers.integration.ts`: troca + `audit_logs`; envio manual, automático, reenvio 248 e correção gravam `cc_addresses`; encaminhamento a terceiro grava `{}`; limite 50      |
| Worker        | gateway com e sem `cc`; soma ao limite; outbound passa `cc`; inbound grava `cc`; paridade do limite mantida                                                                              |
| Entrada       | `contractor-sender.policy`: usuário da empresa com DKIM → `internal`; sem DKIM → `unknown`; contato vence usuário; `reachedContractor`                                                   |
| Painel        | aba de configurações, seção da contratante (qual lista vale), chips removíveis, histórico com "Cópia:"                                                                                   |

Integração da API com `bun --env-file=../../.env.test run test:integration`; migration com `make migration-test` e
`db:generate` esperando `no_changes`.

## Riscos

| Risco                                                                 | Mitigação                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A 211 publica antes e o transporte vira a porta do núcleo             | T0.1 confere; o `cc` entra na porta, e o "byte a byte" da 211 ganha esse campo |
| E-mail forjado com o endereço do atendente lido como interno          | Só com DKIM alinhado; senão `unknown`                                          |
| Resposta só ao token (sem a contratante) parece ter ido à contratante | Selo "só para a equipe — a contratante não recebeu" (`reachedContractor`)      |
| Atendente cai em spam ou lista enorme                                 | Máximo de 10 por lista; `To`+`Cc` ≤ 50                                         |
| Janela entre API e worker envia sem cópia                             | Aceito e registrado; o worker vai logo depois                                  |

## Revisão de arquitetura (T0.2) — veredito: aprovado com mudanças

Sem ADR: a decisão é aditiva e local (duas tabelas de junção, uma coluna, um campo de e-mail), sem contrato novo entre
apps nem mudança de modelo de dados que outras specs herdem. As mudanças abaixo já estão incorporadas ao plano.

1. **Gateway sandbox.** `sandbox-smtp-mail.gateway.ts` ganha `cc?: readonly string[]` em `SendSandboxSmtpEmailInput` e em
   `SandboxSmtpMessage` (vazio → omite; repassa a `cc` do nodemailer). `send-contractor-mail-outbound-message` confere
   `to + cc ≤ CONTRACTOR_MAIL_MAX_RECIPIENTS` **uma vez, antes de escolher o transporte**; os dois gateways mantêm a
   guarda própria. O sandbox não tem `Reply-To`: a resposta de um responsável não volta (documentado, aceito).
2. **Cópia do schema no worker.** `apps/worker-transportada/src/database/contractor-mail.schema.ts` ganha
   `ccAddresses: text('cc_addresses').array().notNull().default(sql\`'{}'\`)`junto a`to_addresses`, e o repositório do
worker (`drizzle-contractor-mail-outbound-worker.repository.ts`) a seleciona.
3. **T2.1** passa `message.ccAddresses` nos **dois** ramos (Resend e sandbox), com teste do sandbox com `cc` e de
   `to + cc > 50` recusado nos dois transportes.
4. **`recordMail`** mantém `transport: delivery.transport` (268). O corte/limite ocorre antes de a entrega ser escolhida.
   A correção de endereço não tem caminho sandbox (usa `resend` por padrão): aceito e documentado.
5. **Tabelas** ganham `status` (`active`/`inactive`, CHECK), `updated_at` e `updated_by_user_id` (ver § Dados). Só ativas
   vão em cópia; inativas continuam listadas; remover apaga. Teto: 10 ativas, 30 no total. Lista da contratante sem
   ativa herda a da empresa.
6. **Endpoints por item** no lugar do PUT da lista inteira (ver § Contratos), com teste de roteador real.
7. **Auditoria** na mesma transação, ações `occurrence_watchers.{company|contractor}.{add|activate|deactivate|remove}`.
8. **Painel:** cada linha mostra o usuário, o interruptor Ativo/Inativo (PATCH) e "Remover" com confirmação na página
   (`AlertDialog` do shadcn; nunca `window.confirm`); adicionar a partir dos candidatos (POST). Seção da contratante em
   `ContractorFicha.component.tsx` logo depois do `ContractorContactsPanel`; sem ativo: "nenhum ativo — vale a lista da
   empresa". Inelegível continua listado com o selo "não elegível".
9. **T1.2** acrescenta os casos: inativo não vai em cópia; lista da contratante só com inativos herda a da empresa.
10. **T2.2:** `excludedWatcherUserIds` entra, ordenado, na impressão digital da idempotência (`send-occurrence-mail.use-case.ts`).

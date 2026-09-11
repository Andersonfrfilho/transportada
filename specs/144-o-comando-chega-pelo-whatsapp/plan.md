# Plano técnico

## Contexto e premissas

Premissas herdadas de dois mapeamentos feitos em 2026-09-11. **Não foram medidas contra o banco**;
quem pegar a task confere antes de construir em cima:

- O webhook chama `module.webhook.receive.execute` e não passa `hooks`.
  `whatsapp-webhook.routes.ts:131`, confirmado por leitura.
- `meta-whatsapp-module` instalado na 0.1.0; a fonte está em 0.2.0-rc.22. A 0.2 exige
  `runMetaWhatsAppMigrations({ db, migrate })`.
- `login_identifiers` sem unicidade de telefone entre usuários.
- `cte_emission_profiles` sem noção de documento de saída; `nfse_emission_profiles` sem casamento
  com nota. Confirmado por leitura dos dois schemas.

## Arquitetura

```
Meta ──POST──> whatsapp-webhook.routes.ts (HMAC, nonce, companyId pelo phone_number_id)
                  └─> module.webhook.receive.execute
                         └─ hook onMessageReceived ──> WhatsAppCommandDriver
                                  ├─ resolveWhatsAppActor (telefone → membership → permissões)  D1/D2
                                  ├─ flows.interpreter.step(...)                               grafo
                                  └─ FlowActions registradas por módulo
                                        ├─ fiscal:  classify · preview · confirm             D3–D6
                                        ├─ trip:    list · transition · occurrence            D7
                                        └─ core:    menu raiz · handoff · verificação
worker: cte/nfse autorizados ──> whatsapp-command-settlement ──> billing + resumo ao número
```

Novo módulo de domínio **`whatsapp-commands/`** na API, em quatro camadas:

- `domain/`: `whatsapp-phone.policy.ts` (canonicalização E.164), `document-output.policy.ts`
  (classificação D3, pura), `command-request.policy.ts` (expiração, hash da prévia),
  `whatsapp-menu.policy.ts` (botão × lista, teto de título, paginação).
- `application/`: `resolve-whatsapp-actor.use-case.ts`, `verify-whatsapp-phone.use-case.ts`,
  `preview-document-selection.use-case.ts`, `confirm-document-selection.use-case.ts`,
  `whatsapp-command-driver.service.ts`, `register-*-flow-actions.ts` por contexto.
- `infrastructure/`: `drizzle-whatsapp-command.repository.ts`, `whatsapp-flow-graph.seed.ts`.
- `presentation/`: `whatsapp-phone-verification.routes.ts` (pedir e confirmar código, autenticado).

⚠️ **As `FlowActions` chamam use-case, nunca repositório.** Transição de nota é
`transition-trip-document.use-case.ts`; ocorrência é `register-driver-occurrence` /
`register-trip-occurrence`; lote é o use-case do `POST /cte-batches`. É isso que faz o AC7 (PWA e
WhatsApp gravam o mesmo evento) valer por construção.

A classificação D3 mora em `cte-profiles/domain/`, ao lado de `resolveMunicipalServicePolicy`, e é
consumida pelo `whatsapp-commands` **e** pela listagem de notas. Um lugar só.

## Contratos/API/eventos

- `POST /me/whatsapp-phone/verification` → `{ phone }`: abre o pedido e devolve `{ code,
companyNumber, expiresAt }` para a tela mostrar. A confirmação **não é rota HTTP**: é a mensagem
  que o usuário manda do próprio WhatsApp, e a primeira `FlowAction` do despachante a confere contra
  o `from` (verificação de entrada, A3). Nenhum template sai.
- `DELETE /me/whatsapp-phone` → desvincula.
- `DELETE /company-users/:id/whatsapp-phone` (`users.manage`) → só desvincula, nunca verifica.
- `GET/PUT /company-settings/cte-profiles/:id` passam a aceitar `outputDocument` e
  `nfseEmissionProfileId`.
- `GET /nfe-documents` ganha `documentOutput` por linha (paridade com o bot).
- Evento de outbox novo: `transportada.whatsapp.command.settled`, com o payload **só com
  referência** (`requestId`).

Nenhuma rota pública nova além do webhook que já existe.

## Dados, migration e rollback

Migrations aditivas, com default. Nenhuma instalação muda de comportamento só por aplicá-las:

1. `cte_emission_profiles`: `output_document text not null default 'cte'` com CHECK;
   `nfse_emission_profile_id uuid null` com FK composta `(company_id, id)`; CHECK de coerência
   (`nfse` ⇔ id presente).
2. **`user_whatsapp_phones`** (nova, e `login_identifiers` **não é tocada**, porque é projeção
   reconstruída por delete + insert, não única e não canônica). Colunas: `id`, `user_id` (FK para
   `identity_users`, cascade), `phone` com CHECK `^55[1-9][0-9]{9,10}$`, `verified_at`, timestamps.
   Constraints: `unique(user_id)` e unique parcial `(phone) where verified_at is not null`, global na
   instalação (ADR-0021).
3. **`whatsapp_phone_verification_requests`**, no molde de `password_reset_requests`: `company_id`,
   `user_id`, `phone` canônico declarado, `code_hash`, `attempt_count`, `expires_at` (10 min),
   `consumed_at`. FK composta para a membership e pedido vivo único por `(company_id, user_id)`.
   **Sem** unique de `code_hash`: com 6 dígitos só há um milhão de códigos, e lá ele existe porque a
   rota é anônima. Aqui a busca é pelo pedido vivo do número que enviou.
4. `whatsapp_command_requests`: `id`, `company_id`, `actor_user_id`, `membership_id`, `kind`,
   `selection` jsonb (só ids), `classification` jsonb, `preview_sha256`, `status`
   (`previewed · confirmed · settled · expired · superseded`), `expires_at`, `period`, timestamps.
5. `whatsapp_command_documents`: `request_id`, `document_kind` (`cte_batch · nfse_invoice ·
billing_invoice`), `document_id`, com unique `(request_id, document_kind, document_id)`.

O rollback fica ao lado de cada migration e derruba só as colunas e tabelas novas. As cópias no
worker (`src/database/`) dos schemas lidos ali: `whatsapp-command`, `cte-emission-profile` (se ainda
não houver) e `login-identifier`.

## Segurança e tenant

- `companyId` sai do canal (webhook) e é conferido contra a membership do número. Divergência é
  resposta neutra.
- Todo repositório novo recebe `context.companyId`, e `whatsapp-command` ganha
  `tenant-safety.contract.ts`.
- Código de verificação: 6 dígitos, uso único, 10 minutos, 5 tentativas, comparação
  `timingSafeEqual` sobre digest.
- Teto de ações por número: 30 por 10 minutos, no despachante. **Não é o rate limit global**, que
  continua sendo achado aberto em `docs/SECURITY.md`; esta spec atualiza a data do achado.
- Log: `companyId`, `requestId`, `correlationId` e telefone mascarado por `maskPhone`. Nunca o corpo
  da mensagem nem o parâmetro digitado.

## Idempotência e concorrência

- Idempotência de emissão: chave derivada de `request_id` (`whatsapp:${requestId}:cte:${profileId}`).
- Confirmação concorrente: `update … set status='confirmed' where status='previewed' and
preview_sha256 = $hash returning`; quem não pega a linha responde com o estado atual.
- Liquidação: o worker fecha o pedido quando todos os documentos estão em estado final; unique +
  `status='settled'` torna a repetição inofensiva.

## Observabilidade

`whatsapp.command.{previewed,confirmed,superseded,expired,settled,denied}` com contagens por saída.
O `denied` carrega a razão (`unverified · no_membership · permission · rate_limited`), e a razão
nunca é enviada ao número.

## Estratégia de testes

1. Contrato da canonicalização do telefone, com `55`, sem `55`, 10 e 11 dígitos, lixo.
2. Contrato da classificação D3 e paridade listagem × bot sobre as mesmas notas.
3. Contrato do menu: nenhum título acima do teto; ≤3 vira botão com emoji; 4–10 vira lista; >10
   pagina.
4. Contrato de autorização: cada `FlowAction` recusa sem a permissão, mesmo quando chamada fora do
   menu.
5. Integração: faixa → prévia → confirmação → lote criado; confirmação dupla → um lote; hash mudado →
   nova prévia.
6. Integração worker: liquidação com 1 rejeitado gera a fatura dos autorizados.
7. E2E de conversa com Graph API fake: motorista entrega e o `GET /me/trips/current` reflete.

## Riscos

- **Upgrade 0.1.0 → 0.2.0-rc.22** pode trazer mais quebras além da migration. É T001, isolado, com
  `make check` verde antes de qualquer outra task.
- **A classificação mexe na listagem de notas.** Um defeito ali muda a tela do painel. O default
  `cte` e a paridade por contrato seguram isso.
- **Liquidação depende de estado final.** CT-e preso em `requested` para sempre deixa o pedido
  aberto. O resumo sai com timeout de 2 horas marcando os pendentes, sem faturá-los.

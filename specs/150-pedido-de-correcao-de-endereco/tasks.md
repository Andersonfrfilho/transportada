# Tasks

Toda task fecha com typecheck (`bun run typecheck`), os testes da app (a integração da API com
`bun --env-file=../../.env.test test --timeout 120000`), um commit isolado e a evidência em
`evidence.md`. Teste novo entra na lista explícita do `package.json`.

## Fase 0 — Decisões

> 🤖 Modelo: `opus`

- [x] **T001** Decisões tomadas com o usuário em 2026-09-15: o e-mail pode ser unitário ou completo
      (RF6a), os destinatários são escolhidos a cada envio (RF5a), e o texto e o desenho estão
      aprovados (RF9–RF12, `email-template.html`).

## Fase 1 — O pedido guardado

> 🤖 Modelo: `sonnet` (T102 é 🧠)

- [x] **T101** Migration aditiva `address_correction_requests` e a ampliação do CHECK de
      `contractor_mail_threads.subject_type`, com `rollback.sql`. Evidência: `make migration-test`.
- [x] **T102** 🧠 Contrato de tenant, **vermelho primeiro**: um pedido de outra empresa responde 404,
      e a contratante é resolvida pelo CNPJ do emitente dentro da empresa do token.
- [x] **T103** `PUT` e `GET /address-correction-requests`, com a validação de CEP, UF e município e
      `details[]` por campo. O "como veio" é lido do banco. Evidência: contratos de rota.
- [x] **T104** O relatório expõe `recipientName` (RF11). Evidência: contrato do repositório e do
      tipo de resposta.

## Fase 2 — O formulário na aba

> 🤖 Modelo: `sonnet`

- [x] **T201** Formulário "Informar endereço correto" no `AddressReportPanel`, preenchido com o
      endereço como veio, com máscara de CEP, `Select` de UF e erro ancorado no campo. Evidência:
      contrato do serviço de validação e do mapa de erros por campo.
- [x] **T202** O estado do pedido em cada endereço (sem pedido, rascunho, enviado). Evidência:
      contrato do view-model.

## Fase 3 — O envio

> 🤖 Modelo: `sonnet` (T302 é 🧠)

- [x] **T301** CRUD de contatos da contratante, se a 143 T013 ainda estiver aberta; senão, marcar
      como feita por ela. Evidência: contratos de rota.
- [x] **T302** 🧠 O worker envia a todos os `toAddresses` e manda `html` e `text` juntos, com
      contrato que **falha** se só o primeiro destinatário receber ou se o HTML se perder.
      Coordenar com a 143 T015.
- [x] **T303** `buildAddressCorrectionMail`, função pura que devolve `{ subject, html, text }`
      seguindo `email-template.html`. Evidência: contrato de texto (como veio, correto e motivo
      sempre presentes; assunto no singular e no plural; escape de `<`, `&` e `"` vindos da nota).
- [x] **T304** `POST /address-correction-requests/mail`, com outbox na mesma transação,
      `Idempotency-Key`, e recusa com código estável sem contratante ou sem contato marcado.
      Evidência: contrato de caso de uso e de rota, e o contrato de que nenhum log leva PII.
- [x] **T305** Os dois botões: "Enviar este endereço" em cada item (unitário) e "Enviar todos" na
      contratante (completo), a mesma confirmação com os contatos marcáveis e a prévia, e a
      invalidação do relatório. Evidência: contrato do serviço e smoke Playwright do envio.
- [x] **T306** Marcar a T20 da `specs/084-agenda-de-enderecos/tasks.md` como realizada por esta spec
      e atualizar `docs/ai-context/` e os `CLAUDE.md` das apps tocadas.

## Fase 4 — Modelos, liberação do envio e limitador (RF13–RF19)

> 🤖 Modelo: `sonnet` (T401, T402 e T406 são 🧠 — `opus`)

- [x] 🧠 **T401** Liberação do envio: a coluna `sending_verified_at` (migration aditiva), gravada
      pela lista de verificação e zerada quando a chave ou o remetente mudam; a função pura
      `resolveMailSendReadiness`; o envio deixa de exigir `status = 'active'`. Contrato **vermelho
      primeiro**: com a configuração em `pending` e o envio verificado, o pedido sai. Evidência:
      contratos da política, da rota de envio e da lista de verificação.
- [x] 🧠 **T402** Modelos na API: a tabela `contractor_mail_templates`, `template_id` na mensagem, as
      rotas CRUD, o padrão e a prévia, e a renderização das variáveis (lista fechada, escape). O
      envio usa o modelo padrão ou o `templateId`, e sem modelo recusa com
      `CONTRACTOR_MAIL_TEMPLATE_MISSING`. Evidência: contrato de tenant, contratos de rota, de
      renderização e integração.
- [x] **T403** Seção "Modelos" na página "E-mail com contratantes": lista por tipo, criar a partir
      do padrão, editar com as variáveis, prévia, marcar como padrão e arquivar. Evidência:
      contratos de serviço e de validação.
- [x] **T404** A lista de verificação mostra "Pronto para enviar", com o motivo quando não está.
      Evidência: contrato do serviço da lista.
- [ ] **T405** Confirmação de envio (T305): seletor de modelo, prévia com o modelo escolhido, e a
      recusa por liberação levando à página de configuração. Evidência: contratos de serviço.
- [ ] 🧠 **T406** Limitador de taxa com estado no Postgres (`rate_limit_windows`), declarado na
      rota, aplicado ao envio de correção e ao e-mail de teste, `429` com `Retry-After`, tetos vindos
      do env, e limpeza no cron. Evidência: contratos do limitador (janela, concorrência atômica,
      `Retry-After`), da rota e do env, mais integração.
- [ ] **T407** `docs/SECURITY.md`: M1 fechado para as rotas de e-mail, M2 (auditoria) e B3
      registrados como pendentes antes de produção. Atualizar `docs/ai-context/` e os `CLAUDE.md`
      tocados.

## Prompt de execução

### Fase 4 (modelos, liberação do envio e limitador)

```text
/oh-my-claudecode:autopilot Execute a Fase 4 da spec specs/150-pedido-de-correcao-de-endereco/
(leia spec.md — RF13 a RF19 —, plan.md — seção "Fase 4" —, tasks.md, evidence.md e
email-template.html antes de começar). Continue na branch work/spec-150-address-correction, sem
criar outro worktree. Antes da T401, confira no evidence.md que a seção "Correções da revisão
final" está fechada e com commits; se não estiver, pare e pergunte. Uma task por vez, na ordem
T401 → T407.
Modelos: T401 🧠 → executor model=opus (contrato vermelho primeiro: configuração em pending com
envio verificado sai) · T402 🧠 → executor model=opus (contrato de tenant dos modelos vermelho
primeiro) · T403, T404, T405 → executor model=sonnet · T406 🧠 → validar o desenho com architect
model=opus antes, depois executor model=opus · T407 → executor model=sonnet · revisão final →
code-reviewer, security-reviewer e architect em model=opus, em paralelo, sobre git diff
origin/staging...HEAD.
Cada task fecha com bun run typecheck + bun run lint + testes das apps tocadas + integração da API
com bun --env-file=../../.env.test test --timeout 120000 (se o Postgres do Docker em 65432 der I/O
error, usar um Postgres nativo descartável e DRIZZLE_TEST_DATABASE_URL) + commit isolado, com
evidência em evidence.md. Teste novo entra na lista explícita do package.json. A falha conhecida
cte-profile-output-constraints (23001 em vez de 23503 no Postgres 18 local) é alheia; registrar e
seguir.
Migrations só aditivas. O primeiro commit leva também as mudanças pendentes em spec.md, plan.md e
tasks.md.
Pare e pergunte antes de: deploy em produção, migration destrutiva, qualquer decisão de produto que
a spec não cubra (catálogo de tipos além de address_correction, tetos do limitador diferentes do
padrão de 20 por hora), e antes de publicar em staging se alguma revisão final reprovar.
```

```text
/oh-my-claudecode:autopilot Execute a spec specs/150-pedido-de-correcao-de-endereco/ (leia spec.md,
plan.md, tasks.md e email-template.html antes de começar). Trabalhe num worktree próprio
(make worktree NAME=spec-150). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 1 → executor model=sonnet · T102 🧠 → opus (contrato de tenant vermelho primeiro) ·
Fase 2 → executor model=sonnet · Fase 3 → executor model=sonnet · T302 🧠 → opus (validar com
architect antes, coordenando com a 143 T015) · revisão final → code-reviewer model=opus.
Cada task fecha com bun run typecheck + testes da app (integração da API com
bun --env-file=../../.env.test test --timeout 120000) + commit isolado, com evidência em evidence.md.
Teste novo entra na lista do package.json.
Pare e pergunte antes de: deploy em produção, migration destrutiva, e se a T301 esbarrar em
trabalho em andamento da spec 143.
```

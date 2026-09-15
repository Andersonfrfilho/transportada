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
- [ ] **T305** Os dois botões: "Enviar este endereço" em cada item (unitário) e "Enviar todos" na
      contratante (completo), a mesma confirmação com os contatos marcáveis e a prévia, e a
      invalidação do relatório. Evidência: contrato do serviço e smoke Playwright do envio.
- [ ] **T306** Marcar a T20 da `specs/084-agenda-de-enderecos/tasks.md` como realizada por esta spec
      e atualizar `docs/ai-context/` e os `CLAUDE.md` das apps tocadas.

## Prompt de execução

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

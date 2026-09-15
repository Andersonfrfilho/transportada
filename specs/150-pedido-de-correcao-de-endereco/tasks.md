# Tasks

Toda task fecha com typecheck (`bun run typecheck`), os testes da app (a integração da API com
`bun --env-file=../../.env.test test --timeout 120000`), um commit isolado e a evidência em
`evidence.md`. Teste novo entra na lista explícita do `package.json`.

## Fase 0 — Decisões

> 🤖 Modelo: `opus`

- [ ] **T001** ⛔ Responder P1 do `spec.md` com o usuário: o modelo do e-mail. **Nada da Fase 3
      começa sem isso.** (P2 decidida: unitário e completo, RF6a. P3 decidida: destinatários
      escolhidos a cada envio, RF5a.)

## Fase 1 — O pedido guardado

> 🤖 Modelo: `sonnet` (T102 é 🧠)

- [ ] **T101** Migration aditiva `address_correction_requests` e a ampliação do CHECK de
      `contractor_mail_threads.subject_type`, com `rollback.sql`. Evidência: `make migration-test`.
- [ ] **T102** 🧠 Contrato de tenant, **vermelho primeiro**: um pedido de outra empresa responde 404,
      e a contratante é resolvida pelo CNPJ do emitente dentro da empresa do token.
- [ ] **T103** `PUT` e `GET /address-correction-requests`, com a validação de CEP, UF e município e
      `details[]` por campo. O "como veio" é lido do banco. Evidência: contratos de rota.

## Fase 2 — O formulário na aba

> 🤖 Modelo: `sonnet`

- [ ] **T201** Formulário "Informar endereço correto" no `AddressReportPanel`, preenchido com o
      endereço como veio, com máscara de CEP, `Select` de UF e erro ancorado no campo. Evidência:
      contrato do serviço de validação e do mapa de erros por campo.
- [ ] **T202** O estado do pedido em cada endereço (sem pedido, rascunho, enviado). Evidência:
      contrato do view-model.

## Fase 3 — O envio

> 🤖 Modelo: `sonnet` (T302 é 🧠)

- [ ] **T301** CRUD de contatos da contratante, se a 143 T013 ainda estiver aberta; senão, marcar
      como feita por ela. Evidência: contratos de rota.
- [ ] **T302** 🧠 O worker envia a todos os `toAddresses`, com contrato que **falha** se só o primeiro
      receber. Coordenar com a 143 T015.
- [ ] **T303** O modelo do e-mail definido na T001, em função TS pura, com contrato de texto:
      endereço como veio, o proposto e o motivo, sempre os três.
- [ ] **T304** `POST /address-correction-requests/mail`, com outbox na mesma transação,
      `Idempotency-Key`, e recusa com código estável sem contratante ou sem contato ativo.
      Evidência: contrato de caso de uso e de rota, e o contrato de que nenhum log leva PII.
- [ ] **T305** Os dois botões: "Enviar este endereço" em cada item (unitário) e "Enviar todos" na
      contratante (completo), a mesma confirmação com os contatos marcáveis e a prévia, e a
      invalidação do relatório. Evidência: contrato do serviço e smoke Playwright do envio.
- [ ] **T306** Marcar a T20 da `specs/084-agenda-de-enderecos/tasks.md` como realizada por esta spec
      e atualizar `docs/ai-context/` e os `CLAUDE.md` das apps tocadas.

## Prompt de execução

Esta spec ainda tem `[NEEDS CLARIFICATION]` aberto (P1 do `spec.md`), então não tem prompt de
autopilot. A pergunta pendente é:

1. **P1** — Qual é o modelo do e-mail (assunto, abertura, formato da lista, assinatura)?

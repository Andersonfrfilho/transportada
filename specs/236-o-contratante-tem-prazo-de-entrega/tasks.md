# Tarefas — 236

> Bloqueada por **[NEEDS CLARIFICATION] D1–D5** em `spec.md`. Nenhuma task começa antes de D1, D2 e D3
> serem respondidas; D4 vira spec própria; D5 tem recomendação. Sem prompt de execução até lá.

## Fase 1 — API: dado, política e leitura

> 🤖 Modelo: `sonnet` (T1.2 é 🧠 — validar com `opus` antes)

- [ ] **T1.1** Migration aditiva `contractors.delivery_deadline_days` (1..60, nulo) com `rollback.sql`,
      snapshot; `make migration-test`; `db:generate` = `no_changes`.
- [ ] **T1.2** 🧠 `delivery-deadline.policy.ts` (âncora de [D1], dias de [D2], fuso da empresa, estados do
      RF5): contrato em tabela **antes**, vermelho, depois a política; mutação.
- [ ] **T1.3** `contractor.port`/repositório/rotas: `deliveryDeadlineDays` em GET/POST/PATCH com Zod
      `.strict()`; contrato de validação (CA2).
- [ ] **T1.4** Leitura por nota no detalhe da viagem: `deliveryDeadline` por documento, no join que já traz
      `contractorId`; integração contra Postgres (CA4); sem N+1.
- [ ] **T1.5** Não-regressão (CA7): `computeDriverScore`, `missingAfterHours` e CT-e intactos.
- [ ] **T1.6** Revisão final da fase com `code-reviewer` em `opus` (passada separada) e publicação em
      staging só com tudo verde (fetch + rebase limpo + `bun install --frozen-lockfile` + typecheck);
      **confirmar o deploy** antes da Fase 2.

## Fase 2 — Painel: contratantes e selo

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Contrato **antes**: paridade das chaves do agregado nas três cópias (RF3) e o formulário da
      ficha (validação 1..60, vazio = `null`).
- [ ] **T2.2** Aba "Contratantes" em `/clientes`: lista, busca e ficha (prazo, fechamento, e-mail,
      observações, status), locale pt-BR e en.
- [ ] **T2.3** Selo do prazo na nota da viagem, no padrão dos selos existentes; smoke Playwright.
- [ ] **T2.4** Prova por mutação (cada fase) e evidência em `evidence.md`.
- [ ] **T2.5** **Revisão de design e usabilidade** (web.md §15): vizinhos, contraste nos dois temas,
      375/768/1280 px, **print enviado ao usuário e aprovado antes de publicar**.
- [ ] **T2.6** Publicar em staging depois do print aprovado.

## Pendências de decisão

D1 (âncora), D2 (corridos/úteis), D3 (só informar), D4 (prazo do comprovante: spec própria), D5 (prazo
vale para nota antiga).

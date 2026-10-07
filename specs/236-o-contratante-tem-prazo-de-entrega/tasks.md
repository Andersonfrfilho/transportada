# Tarefas — 236

> Sem dúvidas abertas. **Depende** das specs **238** (calendário) e **237 Fases 1–2** (perfil e chegada)
> estarem publicadas. O prompt de execução sai quando a 237 Fase 2 estiver em staging.

## Fase 1 — API: política e leitura

> 🤖 Modelo: `sonnet` (T1.1 é 🧠 — validar com `opus` antes)

- [ ] **T1.1** 🧠 `delivery-deadline.policy.ts`: contrato em tabela **antes** (CA1), vermelho pelo motivo
      certo, depois a política; mutação (CA4).
- [ ] **T1.2** Leitura por nota no detalhe da viagem (`deliveryDeadline`), no join existente; integração
      contra Postgres (CA2) e contrato de contagem de consultas (CA5).
- [ ] **T1.3** Não-regressão (CA6): `computeDriverScore`, `missingAfterHours` e CT-e intactos.
- [ ] **T1.4** Revisão final da fase com `code-reviewer` em `opus` (passada separada); publicar em staging
      só com tudo verde (fetch + rebase limpo + `bun install --frozen-lockfile` + typecheck) e **confirmar o
      deploy** antes da Fase 2.

## Fase 2 — Painel: selo e filtro

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Contrato **antes**: o selo (estados, textos pt-BR/en) e o filtro "vencidas/vencem hoje".
- [ ] **T2.2** Selo na nota da viagem e filtro na lista, no padrão dos selos existentes; smoke Playwright.
- [ ] **T2.3** Prova por mutação e evidência em `evidence.md`.
- [ ] **T2.4** **Revisão de design e usabilidade** (web.md §15): vizinhos, contraste nos dois temas,
      375/768/1280 px, **print enviado ao usuário e aprovado antes de publicar**.
- [ ] **T2.5** Publicar em staging depois do print aprovado e confirmar o deploy.

# Tarefas — 238

> Sem dúvidas bloqueantes (premissas na spec). Prompt de execução ao fim de `tasks.md`.

## Fase 1 — Domínio e dado

> 🤖 Modelo: `sonnet` (T1.1 é 🧠 — validar com `opus` antes)

- [x] **T1.1** 🧠 `business-calendar.policy.ts` + contrato em tabela **antes** (CA1, CA2, extremos);
      feriados nacionais por Páscoa; mutação.
- [x] **T1.2a** Caracterização do roteirizador **antes** da migration: integração do worker contra Postgres fixando
      como `municipal_holidays` fecha (ou não) o cliente — data, cidade, empresa e `2000-MM-DD`; mutação.
- [x] **T1.2** Migration aditiva (forma B1, ADR-0096 §Modelo de dados): tabelas `municipal_holiday_rules`,
      `state_holidays` e `company_business_calendar_settings`; em `municipal_holidays` só `kind`, `source_rule_id`,
      o CHECK de `kind`, a FK composta com `ON DELETE CASCADE` e o índice parcial; `rollback.sql` (as datas
      materializadas ficam); `make migration-test`; `db:generate` = `no_changes`; integração do roteirizador
      continua verde, com o caso novo da data materializada. Lista linha a linha em `evidence.md` § T1.2.
- [ ] **T1.3** Repositório e rotas (RF8), Zod `.strict()`, contratos de validação (CA4): regra "todo ano" gera as
      datas de 10 anos na escrita (29/02 só nos bissextos; colisão com data digitada é ignorada), ação idempotente
      "gerar próximos anos", feriado estadual e configuração de sábado; a leitura da política usa as regras como
      `yearly` e só as datas **sem** `source_rule_id` como `once`; integração contra Postgres incluindo que o solver
      continua lendo as datas.
- [ ] **T1.4** Revisão da fase com `code-reviewer` em `opus` (passada separada); publicar em staging com
      tudo verde e **confirmar o deploy**.

## Fase 2 — Tela

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Contrato **antes** da tela (formulário, validação, tabela com filtro/ordenação).
- [ ] **T2.2** Tela de feriados em Configurações (municipal, estadual, aniversário), locale pt-BR/en.
- [ ] **T2.3** Prova por mutação e evidência em `evidence.md`.
- [ ] **T2.4** **Revisão de design e usabilidade** (web.md §15) com print enviado ao usuário e aprovado antes
      de publicar; publicar em staging.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/238-os-dias-uteis-contam-feriado-e-aniversario-da-cidade/
(leia spec.md, plan.md e tasks.md inteiros antes de começar). Uma task por vez, na ordem do tasks.md, em
worktree/branch próprios a partir de origin/staging (git fetch antes; confira que o número 238 e o próximo ADR
continuam livres em origin/staging e nos outros worktrees).
Modelos: Fase 1 → T1.1 🧠 model=opus (validar contrato com architect model=opus antes de implementar); T1.2 e
T1.3 executor model=sonnet; revisão final de cada fase com code-reviewer model=opus em passada separada.
Fase 2 → executor model=sonnet; o print da T2.4 é enviado ao usuário e só publica depois de aprovado.
Reaproveite o calendário que já existe no painel (apps/frontend-transportada/src/components/ui/
brazilianHoliday.service.ts) como fonte da lista nacional, com contrato de paridade painel × backend.
Cada task fecha com: contrato antes (vermelho pelo motivo certo), typecheck, lint com cwd na app, teste pelo
script do package.json (nunca bun test cru; API: contrato e integração são dois comandos), format:check na
raiz, prova por mutação, commit isolado com caminhos explícitos (--no-verify, nunca git add -A), evidência em
evidence.md. Migration aditiva com rollback.sql: make migration-test e db:generate = no_changes; integração
contra um Postgres que responda (pular não é passar). Publicar em staging só com tudo verde (fetch + rebase
limpo + bun install --frozen-lockfile + typecheck) e CONFIRMAR o deploy antes da Fase 2.
Pare e pergunte antes de: produção, migration destrutiva, qualquer [NEEDS CLARIFICATION], mudar o contrato do
solver que lê municipal_holidays, e qualquer mudança visível de tela sem print aprovado.
```

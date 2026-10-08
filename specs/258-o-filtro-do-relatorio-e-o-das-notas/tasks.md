# Tasks — Spec 258

Gates de **toda** task: typecheck (`tsc --noEmit`) da app tocada, testes do módulo (lista explícita no
`package.json` da app), commit isolado, linha em `evidence.md`. Escalada: gate falhou 2x → sobe um nível e registra.
Executar em worktree própria: `make worktree NAME=spec-258` (já existe). Tarefa de tela fecha com revisão de design
(`web.md` §15) e print.

## Fase 1 — Rede de segurança e contrato

> 🤖 Modelo: `sonnet` (T1.1 🧠 → `opus`)

- **T1.1 🧠** Validar com `architect`: interface do controlador, contrato HTTP, estratégia de facetas. Ajustar
  `plan.md`. Aceite: parecer em `evidence.md`.
- **T1.2** Rodar e registrar a linha de base: contratos de `nfe-workspace`, smoke da aba de notas, relatório.
  Aceite: números em `evidence.md` (todos verdes antes de mexer).

## Fase 2 — Mover o painel (sem mudar comportamento)

> 🤖 Modelo: `sonnet`

- **T2.1** Criar `NfeFilterPanelController` e mover `NfeDocumentFilterPanel` para `modules/shared`; aba de notas e
  criação de viagem passam o controlador. Aceite: linha de base da T1.2 **idêntica**; diff do JSX só em props.
- **T2.2** Contrato novo: o painel renderiza os 14 controles a partir de um controlador falso e chama o setter
  certo em cada um. Aceite: 14 casos verdes.

## Fase 3 — API (entrega 1)

> 🤖 Modelo: `sonnet` · T3.1 → `haiku`

- **T3.1** Zod dos novos parâmetros + 400 para chave desconhecida, faixa invertida e data inválida. Teste primeiro.
- **T3.2** Condições SQL de RF2 em `buildTripReportConditions` (ilike escapado, número seguro, data, igualdade).
  Teste de integração por filtro e uma combinação; "situação da entrega só dentro do intervalo".
- **T3.3** `GET /trip-document-report/facets`. Teste: respeita tenant e filtros de viagem; `EXPLAIN` registrado.

## Fase 4 — Front do relatório (entrega 1)

> 🤖 Modelo: `sonnet`

- **T4.1** `useTripReportFilters` expõe o controlador; opções vêm das facetas; URL e pílulas cobrem os novos
  campos. Aceite: contratos de estado/pílulas atualizados.
- **T4.2** `TripReportFilterPanel` = painel compartilhado + seção de viagem (contratante, situação da entrega);
  "sem vínculo" oculto. Aceite: smoke do relatório com os novos filtros (mock `page.route`).
- **T4.3** `translateNfeFiltersToTripReport` sem `unsupported` para o suportado; exportar da aba de notas leva tudo.
- **T4.4** Revisão de design (comparar com a aba de notas, contraste, print em 375/768/1280).

## Fase 5 — Avançado (entrega 2)

> 🤖 Modelo: `sonnet` · T5.1 🧠 → `opus`

- **T5.1 🧠** Decidir o transporte da árvore (querystring × corpo) e os limites; validar com `architect`.
- **T5.2** Zod da árvore + tradutor Drizzle com mapas fechados. Teste de integração **por operador** e por tipo.
- **T5.3** Tabela de casos única executada no cliente (`evaluateAdvancedFilter`) **e** no servidor. Aceite: paridade.
- **T5.4** Front: modo avançado no relatório (reusa `AdvancedFilterBuilder` do painel compartilhado).
- **T5.5** `security-reviewer` (opus) sobre T5.1–T5.4 **antes do push**; achados em `evidence.md` e
  `docs/SECURITY.md`.

## Fase 6 — Fechamento

> 🤖 Modelo: `haiku` (T6.2 → `sonnet`)

- **T6.1** Atualizar `docs/ai-context/*` e os `CLAUDE.md` das duas apps (regra 14); spec 256 passa a herdar a
  entrega 1 (nota no `spec.md` dela).
- **T6.2** `code-reviewer` (sonnet) na entrega inteira; CI verde em staging; baixar relatório de staging e conferir.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/258-o-filtro-do-relatorio-e-o-das-notas/ (leia spec.md,
plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md. Entrega 1 = Fases 1–4; entrega 2 =
Fases 5–6 (só depois da 1 em staging).
Modelos: Fase 1 → T1.1 🧠 opus (validar com architect), T1.2 executor model=sonnet · Fases 2 e 4 → executor
model=sonnet · Fase 3 → executor model=sonnet (T3.1 haiku) · Fase 5 → executor model=sonnet, T5.1 🧠 opus,
T5.5 security-reviewer model=opus · Fase 6 → T6.1 haiku, T6.2 code-reviewer model=sonnet.
Regra de ouro: os filtros que existem hoje na aba de notas NÃO podem mudar — só se mover. Linha de base da T1.2
tem de ser idêntica depois da T2.1.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```

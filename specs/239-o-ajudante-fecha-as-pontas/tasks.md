# Tasks — Spec 239

Uma task por vez, na ordem. Contrato vermelho antes do código; teste novo entra no `package.json` da app;
commit isolado e evidência em `evidence.md`. Tela só vai a staging depois de o usuário ver.

## Fase 1 — API

> 🤖 Modelo: `opus` 🧠 (T1) · `sonnet` (T2)

- [x] **T1** 🧠 Cobrança é do escritório (D1): `CHARGE_READ_POLICY = trip.financials`; contrato positivo
      (company-admin, finance, operator) e negativo (driver, aggregate, separator, helper → 403) nas duas
      rotas; revisar o contrato do helper (:120-121); fechar a entrada de `docs/SECURITY.md`. Provar por
      mutação. Confirmar por busca que nenhum consumidor de campo perde acesso.
- [x] **T2** `crewRole` por viagem em `/me/trips/current` (D3): serializador, caso de uso e porta, com
      contrato (ajudante, motorista, mesma pessoa nos dois papéis em viagens diferentes) e integração
      contra Postgres.

## Fase 2 — Painel

> 🤖 Modelo: `sonnet`

- [x] **T3** Diária geral do ajudante (D2, RF-2): cliente, hook, painel e montagem na aba de motoristas.
- [x] **T4** `NoWorkspaceAccess` com variante de acompanhamento e botão para o app do motorista (D5).
- [x] **T5** A3, A6 e A7 (D6, D7, D8) — um commit por achado.
      Extra **T6b**: legenda "Dados pessoais do ajudante" na ficha (observação da T5 A7).

## Fase 3 — App do motorista

> 🤖 Modelo: `sonnet` (parar e perguntar se exigir reescrever a fila offline)

- [x] **T6** Tipo e cliente com `crewRole`; aviso "Você acompanha esta viagem como ajudante" e ações
      escondidas para o ajudante; contrato de componente (D4). Confirmar o comportamento da fila para 403.

## Fase 4 — Fechamento

> 🤖 Modelo: `opus` 🧠 (T7) · `haiku` (T8)

- [x] **T7** 🧠 Revisão de design e usabilidade com prints (diária geral, sem acesso, app do motorista com
      o aviso, A6 e A7), 375 px, claro e escuro; aprovada pelo usuário em 03/10/2026 depois das
      correções da revisão final, de D1 e de N1. Só o README dos prints é versionado.
- [x] **T8** Documentação viva: ADR (próximo número livre em `origin/staging`) registrando D1 e D2,
      `docs/ai-context/*`, `CLAUDE.md` das três apps, nota na 235.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/239-o-ajudante-fecha-as-pontas/ (leia spec.md, plan.md e
tasks.md antes de começar). Uma task por vez, na ordem do tasks.md, em branch work/spec-239-ajudante-pontas
a partir de origin/staging.
Modelos: T1 🧠 opus (validar com architect antes) · T2 a T6 executor model=sonnet · T7 🧠 opus ·
T8 executor model=haiku · revisão final → code-reviewer model=opus.
Cada task fecha com contrato vermelho antes, bun run typecheck, testes da app (API: contrato e integração
cada um pelo seu comando, com --env-file=../../.env.test; painel e app do motorista pelo script test),
teste novo no package.json, commit isolado, evidência em evidence.md; make check ao fim de cada fase.
Pare e pergunte antes de: deploy, push para staging, mudar D1/D4, e qualquer [NEEDS CLARIFICATION].
```

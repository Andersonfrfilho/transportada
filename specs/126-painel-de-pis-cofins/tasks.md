# Tasks — 126

> 🤖 Modelo: `sonnet`

- [x] **T1 — Contrato da API antes do código.** `test/companies/federal-tax-settings.contract.ts`:
      fração aceita; percentual digitado como fração recusado com todos os campos; Simples só zero;
      regime desconhecido e `companyId` no corpo recusados; gravar audita antes/depois pela empresa
      do contexto; limpar audita só o que existia; três rotas sob `settings.manage`/`company`; a rota
      só lê a empresa do contexto; toda instrução do repositório filtra pelo tenant; federal segue a
      origem da receita. _Verificação:_ vermelho antes (módulos inexistentes).
- [x] **T2 — API.** Política, porta, casos de uso, repositório, schema, rotas e fiação no `main.ts`.
- [x] **T3 — Conta.** `buildTripTaxParcels` recebe `revenueSource`; federal `estimated` sobre receita
      prevista.
- [x] **T4 — Frontend.** Validação, sugestão/rascunho puros, cliente, hooks, painel, aba `taxes` em
      `SETTINGS_PANEL_PLACEMENT`, página, locales pt/en, CSS por token.
      ⚠️ Aqui o contrato (`test/company-settings/federal-tax-panel.contract.ts`) foi escrito na mesma
      leva do código, sem rodada vermelha isolada — registrado, não escondido.
- [x] **T5 — Medição.** Conta nas viagens reais com o Presumido simulado em memória (nada gravado no
      banco compartilhado).
- [x] **T6 — Gate.** Testes, typecheck, lint e `make check`.

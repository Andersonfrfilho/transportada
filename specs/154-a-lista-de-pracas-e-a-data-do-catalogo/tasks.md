# Tasks — 154

Cada task: contrato vermelho → implementação → `bun run typecheck` + `bun run lint` + testes da app
(API com `--env-file=../../.env.test`) → evidência em `evidence.md` → commit isolado.
⚠️ Teste novo só roda se for acrescentado à lista explícita do `package.json` da app.

## Fase 0 — Confirmar as premissas

> 🤖 Modelo: `sonnet`

- [x] T001 Confirmar a **P1**: o objeto `toll-booths/osm/sudeste/2026-09-14/toll-booths.json` existe
      no bucket de staging, e com que forma. Resultado em `evidence.md`. Não existindo, parar e
      perguntar — a Fase 3 depende disso.
- [x] T002 Medir o catálogo de staging (`count(*)`, `max(observed_on)`) para conferir o registro de
      15/09 do runbook (592 / 571 / 2026-09-14). Só leitura.

## Fase 1 — Dados

> 🤖 Modelo: `sonnet` (T101 é 🧠 — validar com `architect` antes)

- [x] T101 🧠 Migration aditiva `toll_booth_extracts` + schema Drizzle + `rollback.sql` —
      `make migration-test`. Decidir com o `architect` a chave e os índices antes de escrever.
- [x] T102 `tenant-safety.contract.ts` atualizado para cinco tabelas sem `company_id`, com a
      justificativa escrita no contrato. **Não afrouxar a asserção, não apagar a suíte.**

## Fase 2 — O catálogo em leitura

> 🤖 Modelo: `sonnet`

- [x] T201 Consulta do catálogo paginada com busca (nome, operador), `seen` e ajuste da empresa —
      contrato de repositório. O valor efetivo continua saindo da política, nunca do SQL.
- [x] T202 `src/toll-booths/presentation/toll-booth.routes.ts`: `GET /v1/toll-booths` com `fleet.read`,
      resumo do catálogo no corpo, teto de 100 por página — contrato HTTP + `403` sem permissão.
- [x] T203 `list-toll-booth-charges` passa a ser filtro `onlySeen` da consulta nova, com a rota de
      `company-settings` intacta — contrato afirmando que as duas listas concordam na mesma praça.
- [x] T204 Frontend: busca, paginação e cabeçalho com total, data e estado do catálogo na aba de
      pedágio. Locales nos quatro dicionários. **Aceite 1 e 2 fecham aqui.**

## Fase 3 — O extrato e o botão de puxar

> 🤖 Modelo: `sonnet` (T302 é 🧠 — validar com `architect` antes)

- [x] T301 `POST /v1/toll-booths/extracts`: Zod sobre o JSON, sha256, `put` em `create-only`, linha
      registrada, `409` no duplicado — contrato + integração com o MinIO local.
- [x] T302 🧠 `POST /v1/toll-booths/reload`: lê a linha, baixa, valida, chama o seed existente,
      grava `reloaded_*`, serializa concorrentes (RNF3). Erros de domínio próprios. Contratos:
      idempotência, nada apagado (D7), extrato desconhecido, objeto ausente.
- [x] T303 Frontend: bloco de recarga só com `settings.manage`, seletor de extrato, resultado da
      execução e a frase de "nenhum extrato registrado" com catálogo populado (caso extremo).
      **Aceites 3, 4, 5 e 8 fecham aqui.**

## Fase 4 — Da rota para a correção

> 🤖 Modelo: `sonnet`

- [x] T401 `RouteTollSummary`: ação de ajuste na praça sem tarifa conhecida, ausente sem
      `settings.manage` — contrato de componente. **Aceite 6 fecha aqui.**

## Fase 5 — Documentação e revisão

> 🤖 Modelo: `haiku` para T501, `opus` para T502

- [x] T501 `docs/runbooks/osrm-extract.md` (subida e recarga pelo produto), `apps/api-transportada/CLAUDE.md`
      e `docs/ai-context/` — §14 do code-standart.
- [ ] T502 Revisão final com `code-reviewer` em `opus`: auditoria do §15 (N+1 na lista paginada,
      logs sem PII — nome de operador de praça não é PII, ator é id opaco, sanitização das rotas
      novas) e conferência dos oito aceites contra a evidência.

## Parar e perguntar

- Extrato de staging ausente (T001).
- Qualquer migration destrutiva — a D7 proíbe apagar praça, e nada aqui remove coluna.
- Deploy em produção: o catálogo de produção **nunca foi carregado**, e carregá-lo é ação com efeito
  para todas as empresas da instalação.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/154-a-lista-de-pracas-e-a-data-do-catalogo/ (leia
spec.md, plan.md e tasks.md antes de começar). Crie o worktree com `make worktree NAME=spec-154`.
Uma task por vez, na ordem do tasks.md.
Modelos: Fases 0–4 → executor model=sonnet · T101 e T302 🧠 → opus (validar com architect antes de
implementar) · T501 → haiku · revisão final → code-reviewer model=opus.
Cada task fecha com teste de contrato escrito antes + bun run typecheck + bun run lint + testes da
app (teste novo adicionado à lista do package.json) + commit isolado, evidência em evidence.md.
T101 exige make migration-test.
Pare e pergunte antes de: deploy em production, qualquer migration destrutiva, apagar ou afrouxar
suíte existente, extrato ausente no bucket de staging (T001), ou se as premissas da seção "Premissas
a confirmar" da spec forem contrariadas pelo código.
Gates verdes → push para staging.
```

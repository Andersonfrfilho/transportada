# Evidência — 325 Contas

## T1.1 — contratos vermelhos (2026-11-13)

Comando (de dentro de `apps/api-transportada`):

```bash
bun --env-file=../../.env.test test ./test/expenses/red-entrypoint.ts
```

Resultado: **0 pass, 22 fail** — vermelho pelo motivo certo (casos de uso e política de vencimento lançam
`not implemented`; `expenses.read`/`expenses.manage` ainda não existem na política de autorização).
`bunx tsc --noEmit` e `bunx eslint` limpos nos arquivos novos.

| Contrato                                    | Cobre                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `expenses/due-date.contract.ts`             | dia 31 em fev (28/29), mês de 30 dias, dia fora de 1–31                                  |
| `expenses/create-expense.contract.ts`       | RF1b/CA05b: motorista obrigatório/recusado; motorista e categoria de outra empresa → 404 |
| `expenses/settle-occurrence.contract.ts`    | baixa única (409), valor ≤ 0 (400), cancelada (409), outra empresa (404)                 |
| `expenses/generate-occurrences.contract.ts` | CA01: mês corrente + 3, rotina duas vezes sem duplicar, inativa, variável com uma        |
| `expenses/permissions.contract.ts`          | RF7/CA03: permissões declaradas, só `company-admin`                                      |

Decisões de forma fixadas pelo contrato (a T1.2/T1.4 seguem): a categoria carrega `requiresDriver`; a porta de
ocorrência tem `insertIfAbsent` (unique conta+competência, `ON CONFLICT DO NOTHING`); o `today` é injetado.

Pendência para a T1.4: a recorrência **quinzenal** tem duas datas por mês, mas a ocorrência é única por
(conta, competência) — a T1.2 precisa decidir a chave (ex.: competência `yyyy-mm` + `slot`). Não está coberta aqui.

## T1.2 — Schema, migration e semente (2026-11-13)

- `bun test ./test/database-migration.contract.test.ts` com Postgres 16 descartável: 227 pass / 0 fail (contrato estático novo `company-expenses.static.contract.ts` + registro na cadeia).
- Migration aplicada por `db:migrate` e rollback por `rollback.sql` num banco real: tabelas somem, entrada do journal removida; reaplicada, semeou as 8 categorias para a empresa existente (só "Pagamento de motorista/agregado" com `requires_driver`).
- `tsc --noEmit`, `eslint` e `prettier --check` limpos. O `make migration-test` roda na CI (sem Docker nesta sessão).

## T1.3 — Permissões (2026-11-13)

**Decisão:** `expenses.read` e `expenses.manage` só no papel `company-admin` (dúvida 4 da spec); concedíveis por grupo,
fora de `SERVICE_ONLY_PERMISSIONS`. Nenhuma herda de outra permissão: o `finance` tem `trip.financials` e `billing.*` e
continua sem ver as contas. Registro de segurança em `docs/SECURITY.md` (2026-11-13).

O que mudou:

- API: `authorization.policy.ts` (catálogo + `company-admin`); contratos exatos em `authorization.contract.test.ts`,
  teste novo "só o company-admin" ali, no `separator-role.contract.test.ts` (separador e ajudante) e no
  `role-permissions.contract.ts` (o catálogo da tela de grupos as oferece).
- `test/expenses/permissions.contract.ts` saiu de `red-entrypoint.ts` e roda por `test/expenses.contract.test.ts`,
  **registrado** na lista `test` do `package.json`.
- Painel: `COMPANY_PERMISSIONS` (`useAuthMe.query.ts`; o guard recusa `/auth/me` com permissão desconhecida, e o
  contrato de paridade com a API cobra a lista), grupo `expenses` em `permissionGroups.constant.ts`, rótulos pt/en.
  Contrato novo `test/identity/expenses-permission.contract.ts`. Sem tela nova (nenhum print a tirar).

Comandos (de dentro de cada app):

```bash
# api-transportada — lista completa de contrato
bun --env-file=../../.env.test run test        # 15150 pass, 35 skip, 0 fail (230 arquivos)
bun --env-file=../../.env.test test ./test/expenses/red-entrypoint.ts   # 0 pass, 20 fail (os 2 de permissão saíram)
# frontend-transportada — identidade, paridade com a API e locales
bun test ./test/identity.contract.test.ts ./test/frontend-contract.test.ts ...   # 5551 pass, 0 fail
```

`tsc --noEmit` nas duas apps, `eslint` nos arquivos tocados e `prettier --check` limpos. Integração não roda nesta task
(nada mudou em banco nem em `test/integration/**`).

### Notas para a T1.4

- **Entrypoint:** acrescente os imports de `due-date`, `create-expense`, `settle-occurrence` e `generate-occurrences` em
  `test/expenses.contract.test.ts` (já está na lista do `package.json`) e apague `test/expenses/red-entrypoint.ts`.
- **Rotas:** leitura (`GET` de contas, categorias, ocorrências e totais) com `expenses.read`; escrita (criar, editar,
  baixar, cancelar, categorias) com `expenses.manage`. Uma permissão **não implica** a outra na política: se quiser que
  quem só tem `expenses.manage` (por grupo) também leia, a rota de leitura usa "qualquer uma de"
  (`grantsAnyPermission`), como outras rotas fazem; o `company-admin` tem as duas e não sente diferença.
- **Contrato de rota:** cobrir 403 sem a permissão (CA03) e 404 de outra empresa (CA04) em cada rota nova; `companyId`
  só do contexto.
- **Categorias de empresa nova** (pendência da T1.2): garantir a semente ao primeiro uso. `insertIfAbsent` recebe `slot`.
- **Auditoria (RF9):** a trilha grava a permissão usada; use `expenses.manage` (ver como
  `contractor-manual-notice.repository.ts` fixa a sua).
- **Painel (T2.2):** o item "Contas" do menu entra em `WORKSPACE_PERMISSIONS` (`workspaceAccess.service.ts`) com
  `expenses.read`; o `satisfies` reprova o typecheck se faltar.
- **Publicação:** o painel recusa `/auth/me` com permissão que não conhece, por isso esta task levou API e painel no mesmo
  PR. Na promoção para a `main`, API e painel vão juntos (o painel antes, se forem separados).

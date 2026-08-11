# 031 — Tasks

Uma task por vez. Teste de contrato **antes** da implementação. Evidência em `evidence.md`.

## Fase A — banco

> 🤖 Modelo: `sonnet` (T001 é 🧠 — tabela nova e backfill)

- [x] **T001** 🧠 Migration aditiva: tabela `billing_description_templates` (`id` uuid,
      `company_id`, `name`, `body`, `is_default`, `created_at`, `updated_at`), unique
      `(company_id, name)`, unique parcial `(company_id) where is_default`, CHECK de tamanho de
      `name` e `body`, FK para `companies` com `on delete restrict` — o invariante de
      `test/billing-schema/tenant-safety.contract.ts` vale para toda tabela de billing e vence o
      `cascade` que a spec supunha. Backfill: um modelo `Padrão` por
      empresa com `billing_observations` não vazio. Schema Drizzle em
      `src/database/billing-description-template.schema.ts` + agregação em `database.schema.ts`.
      Rollback ao lado. Contrato de schema em `test/billing-schema/description-template.contract.ts`.
      Verificação: `make migration-test`.

## Fase B — domínio

> 🤖 Modelo: `sonnet`

- [ ] **T002** Contrato do catálogo de variáveis e do resolvedor em
      `test/billing-application/description-template.contract.ts`: substituição de cada variável
      automática, variável manual ausente é erro tipado, variável desconhecida é erro tipado,
      automática vazia não deixa rótulo órfão na linha, texto sem variável passa intacto.
- [ ] **T003** Implementar `invoice-description-template.policy.ts` (catálogo `as const` com origem
      `auto`/`manual`), `invoice-description-template.error.ts` e a função de extração das variáveis
      usadas por um corpo de modelo. Sem I/O.

## Fase C — API

> 🤖 Modelo: `sonnet`

- [ ] **T004** Contrato de rota em `test/billing/description-templates.contract.ts`:
      `GET`/`POST`/`PATCH`/`DELETE /company-settings/description-templates` com `settings.manage`
      escopo `company`; 403 sem permissão; 409 no nome duplicado; 422 na variável desconhecida e na
      exclusão do padrão com catálogo não vazio; troca de padrão desmarca o anterior; isolamento
      entre empresas.
- [ ] **T005** Use cases, repositório Drizzle, serializer e rotas do catálogo. Trilha de auditoria na
      escrita.
- [ ] **T006** Contrato da criação/prévia da fatura com modelo: `descriptionTemplateId` +
      `descriptionVariables` resolvem para `observations`; conflito com `observations` é 422; manual
      faltando é 422; prévia devolve o mesmo texto sem gravar.
- [ ] **T007** Implementar a resolução no `billing.use-case.ts` (criação e prévia), buscando modelo e
      perfil fiscal pelo `companyId` do contexto.

## Fase D — frontend

> 🤖 Modelo: `sonnet`

- [ ] **T008** Tela **Modelos de descrição** em Configurações: lista, criar, editar, excluir, marcar
      padrão, ajuda com a lista de variáveis e prévia com valores de exemplo. Esqueleto de
      carregamento, campos e select pelos tokens, locales pt-BR acentuados + en. Remove o campo
      **Observações padrão da fatura** de `BillingDefaultsFields`.
- [ ] **T009** Seletor de modelo + um campo por variável manual + prévia na criação da fatura.
- [ ] **T010** Contrato das duas telas (render, permissão, submit, erro 422, prévia).

## Fase E — fechamento

> 🤖 Modelo: `sonnet`

- [ ] **T011** `make check` verde, evidência em `evidence.md`, `CLAUDE.md` atualizado na seção de
      billing, PR e deploy.

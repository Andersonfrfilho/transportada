# Plano — Feature 024

## O que já existe (levantado antes de planejar)

| Peça                            | Onde                                                                                                  | Estado                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Checkbox do design system       | `src/components/ui/checkbox.tsx` + `.module.css`                                                      | **Criado nesta feature (fase A)**; 14 componentes migrados, contrato proíbe `<input type="checkbox">` cru |
| `color-scheme: dark`            | `src/styles/index.css`                                                                                | Criado nesta feature; era a causa raiz do widget branco                                                   |
| Parser dos filtros de elegíveis | `shared/billingEligibleFilterValue.service.ts`                                                        | `parseCteNumberList` só faz lista por vírgula e devolve `undefined` (silêncio) em erro                    |
| Estado da tabela de elegíveis   | `hooks/useBillingEligibleTable.hook.ts`                                                               | Filtro simples + avançado, cursor, seleção; sem pílulas                                                   |
| Filtros da tela                 | `components/BillingEligibleFilters.component.tsx`                                                     | Grid de campos; sem faixa, sem número de nota                                                             |
| Colunas/serialização            | `shared/billingEligibleTable.service.ts`                                                              | Colunas persistidas, query string só com chave preenchida                                                 |
| Allowlist da API                | `billing.schema.ts` → `ELIGIBLE_LIST_KEYS`, `ELIGIBLE_LIST_CONFLICTS`, `LIST_FILTER_MAX_VALUES = 100` | Aceita `cteNumber` e `cteNumberIn`; não conhece faixa nem nota                                            |
| Query de elegíveis              | `drizzle-billing.repository.ts` → projeção + joins + `where`                                          | Junta `cte_batch_items`, `fiscal_documents`, `nfe_participants`; **não** junta `nfe_documents`            |
| Número da nota                  | `nfe_documents.number` (`text`, sem zero à esquerda, sem índice)                                      | Existe e é numérico no banco real                                                                         |
| Pílulas removíveis              | `NfeDocumentTable.component.tsx:195` (`buildPills`) e `:694` (render)                                 | Única implementação; montada **dentro do componente**, contra a regra "lógica no hook/serviço"            |
| Faixa numérica no servidor      | `cte-batch` → `cteNumberGte`/`cteNumberLte` em `cteBatchItemTable.service.ts`                         | Precedente vivo de faixa serializada em query string                                                      |

## Dependências novas

Nenhuma. Faixa é `gte`/`lte` do Drizzle; a comparação de nota é `lpad` via `sql` parametrizado; a pílula
é markup com os tokens já existentes.

## Migrations

Nenhuma. Nenhuma tabela nova, nenhuma coluna nova — o join com `nfe_documents` usa
`cte_batch_items.nfe_document_id`, que já existe e já é usado pelo join de participantes.

## Riscos e como o plano cobre cada um

| Risco                                       | Cobertura                                                                                                                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filtro inválido continuar silencioso        | O parser passa a devolver `{ ok: true, value } \| { ok: false, reason }`; o componente **precisa** tratar `reason` para compilar, e o contrato exige a mensagem no locale                     |
| `lpad` sobre `text` não usar índice         | Aceito e registrado: a lista de elegíveis já é limitada por empresa, por `status` e por cursor de 100. Se medir lento, o índice funcional entra em feature própria com `EXPLAIN` na evidência |
| `::bigint` derrubar a query                 | Não usamos cast — `lpad` compara texto com texto e não lança em nenhuma linha                                                                                                                 |
| Lista + faixa virarem interseção vazia      | O `where` combina os dois por `or(...)`; o contrato tem caso explícito com lista e faixa disjuntas devolvendo a união                                                                         |
| Faixa pela metade passar                    | `ELIGIBLE_LIST_CONFLICTS` ganha pares novos e o schema exige os dois lados; `400` testado                                                                                                     |
| Migrar `buildPills` quebrar a tela de Notas | A migração acontece **depois** que o componente compartilhado está verde, e o contrato de `nfe-workspace` já cobre o comportamento das pílulas                                                |
| Regredir o checkbox                         | `test/design-system/checkbox.contract.ts` falha se qualquer `<input type="checkbox">` cru voltar                                                                                              |

## Arquivos por fase

**Fase A — checkbox do design system (concluída)**

- `src/components/ui/checkbox.tsx`, `checkbox.module.css` (novos)
- `src/styles/index.css` (`color-scheme: dark`)
- 14 componentes migrados em `billing`, `cte-batch`, `mdfe-manifest`, `cte-profiles`, `nfe-workspace`
- `test/design-system/checkbox.contract.ts` (novo), `test/cte-profiles/layout.contract.ts` (ajustado)
- `docs/frontend/checkboxes.md`, `CLAUDE.md`

**Fase B — faixa e lista de número de CT-e**

- API: `billing.schema.ts` (allowlist, conflitos, `cteNumberFrom`/`cteNumberTo`),
  `billing.use-case.ts` (repasse do filtro), `drizzle-billing.repository.ts` (`or(inArray, and(gte, lte))`)
- API teste: `test/billing-schema/eligible-list-filters.contract.ts`, `test/billing-schema/tenant-safety.contract.ts`
- Frontend: `billingEligibleFilterValue.service.ts` (parser `3, 7, 10-40` com erro tipado),
  `billingEligibleTable.service.ts` (serialização), `useBillingEligibleTable.hook.ts`,
  `BillingEligibleFilters.component.tsx`, `billingClient.service.ts`, locales pt/en
- Frontend teste: `test/billing/eligible-number-filter.contract.ts`

**Fase C — filtro e coluna por número da nota**

- API: `billing.schema.ts` (`nfeNumberIn`/`nfeNumberFrom`/`nfeNumberTo`),
  `drizzle-billing.repository.ts` (join `nfe_documents`, projeção `nfeNumber`, `where` por `lpad`),
  `billing.schema.ts`/serializador da resposta
- API teste: os mesmos dois contratos da fase B, estendidos
- Frontend: `billingResponse.validation.ts` (campo novo), `billingEligibleTable.service.ts` (coluna),
  `BillingEligibleTable.component.tsx`, `BillingEligibleFilters.component.tsx`, locales
- Frontend teste: `test/billing/eligible-number-filter.contract.ts` estendido

**Fase D — pílulas de filtro**

- `src/components/ui/filter-pills.tsx` + `.module.css` (novos)
- `shared/*FilterPills.service.ts` por módulo (descritores puros)
- `billing` (elegíveis e faturas), `nfe-workspace` (migração do `buildPills`), `cte-batch` (lotes e CT-es),
  `mdfe-manifest`
- `test/design-system/filter-pills.contract.ts` (novo), contratos de módulo estendidos
- `docs/frontend/data-tables.md` (§ 1 e § 2), `CLAUDE.md`

## Ordem e por quê

A → B → C → D. A já estava fechada e é pré-requisito visual das outras (as pílulas herdam o mesmo
vocabulário quadrado). B antes de C porque C copia a sintaxe e o parser de B — escrever os dois juntos
duplicaria o parser. D por último porque a pílula precisa saber quais filtros existem, e B e C criam
filtros novos: fazer pílula antes obrigaria a refazê-la duas vezes.

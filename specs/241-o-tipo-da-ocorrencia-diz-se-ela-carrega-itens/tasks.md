# Tasks

Uma task por vez, na ordem. Cada uma fecha com typecheck, teste e commit isolado, e registra a
evidência em `evidence.md`. Teste antes da implementação. As tasks de mutação só fecham com a
execução vermelha colada, não com a afirmação de que falharia.

| Fase | Tasks     | Modelo                      | Etapa de publicação |
| ---- | --------- | --------------------------- | ------------------- |
| 0    | T0.1–T0.3 | `opus` 🧠                   | —                   |
| 1    | T1.1–T1.6 | `sonnet`                    | 1 — painel          |
| 2    | T2.1–T2.9 | `sonnet` (T2.1 é 🧠 `opus`) | 2 — banco e API     |
| 3    | T3.1–T3.3 | `sonnet`                    | —                   |

## Fase 0 — Fechar as decisões antes do código

> 🤖 Modelo: `opus` 🧠 — decisões de modelo de dados e reconciliação com a 239.

- [ ] **T0.1** 🧠 Responder as dúvidas D1 e D2 da `spec.md` com o usuário. Sem resposta, nenhuma
      outra task começa.
- [ ] **T0.2** 🧠 Conferir em `origin/staging` se a 239 (`items_mode`) já entrou. Se entrou, a 241
      reaproveita a coluna e corrige o default (D-B); se não, registrar em
      `specs/239-a-exigencia-da-ocorrencia-chega-na-rua/plan.md` (quando estiver em staging) que
      `items_mode` vem da 241 com default `optional`.
- [ ] **T0.3** Medir, só leitura, quantos tipos têm o nome exato da segunda via em staging e em
      produção (Postgres-Hqfu), e quantos tipos renomeados ficariam de fora. Colar em `evidence.md`.

## Fase 1 — Painel tolerante (etapa 1)

> 🤖 Modelo: `sonnet`

- [ ] **T1.1** Contrato primeiro: os guards aceitam `occurrenceTypeId`, `typeItemsMode`,
      `typeAllowsMultipleItems` e `itemsMode` presentes ou ausentes; ausência lê `optional`/`true`
      (`tripResponse.validation.ts`, `TRIP_OCCURRENCE_OPTIONAL_KEYS`).
- [ ] **T1.2** Contrato primeiro, depois RF7 em `resolveOccurrenceCorrectionActions` (CA05).
- [ ] **T1.3** Mutação: voltar o RF7 para `hasItems || wasCorrected` deixa o contrato da T1.2
      vermelho. Colar a execução.
- [ ] **T1.4** RF8: registro esconde produtos e quantidades em tipo `off` e limpa a seleção ao trocar
      (CA06). RF9: formulário de correção com seleção única por `typeAllowsMultipleItems`.
- [ ] **T1.5** RF10: Produtos (Desligado / Opcional) no cadastro de tipos, com `Select` do design
      system, só quando a listagem trouxer `itemsMode`; "um ou vários" só com Opcional. Mensagem
      pt-BR/en para `OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED` por `getApiErrorCode()`.
- [ ] **T1.6** Gates do painel: `bun run --cwd apps/frontend-transportada test`, typecheck, lint,
      prettier; contrato do painel contra a resposta da API atual (sem os campos novos).

## Fase 2 — Banco e API (etapa 2)

> 🤖 Modelo: `sonnet`; T2.1 é 🧠 (`opus`, ou validar com `architect` antes).

- [ ] **T2.1** 🧠 Integração vermelha da CA01 (tipo semeado antes da coluna) e da CA02 (seed).
      Schema `itemsMode` + migration com o `UPDATE` da D-C + `rollback.sql`.
- [ ] **T2.2** Mutação: arrancar o `UPDATE` deixa a CA01 vermelha. Colar a execução.
- [ ] **T2.3** Catálogo: `itemsMode` por entrada, a prorrogação (conforme a resposta da D2), constante
      do nome da segunda via; seeders gravam `itemsMode` (CA02).
- [ ] **T2.4** Contrato primeiro, depois o cadastro: `itemsMode` opcional sem default, `required` →
      400 (CA07).
- [ ] **T2.5** Contrato primeiro, depois RF6 nos casos de uso de registro, registro em nome do
      motorista (se aceitar produto) e correção (CA03).
- [ ] **T2.6** Mutação: arrancar a guarda da correção deixa a CA03 vermelha.
- [ ] **T2.7** Leituras (RF5): detalhe, feed, lista da nota, cadastro e `/me/.../occurrence-types`,
      em lote, junção por `(company_id, id)` (CA04).
- [ ] **T2.8** Mutação: arrancar o filtro de empresa da junção deixa a CA04 vermelha.
- [ ] **T2.9** Gates da API: contrato (`bun --env-file=../../.env.test test --timeout 120000`) **e**
      integração (`bun --env-file=../../.env.test run test:integration`), typecheck,
      `make migration-test`, rebase em `origin/staging` + `bun install --frozen-lockfile` +
      `db:generate` = `no_changes`, OpenAPI gerado, `docs/ai-context/api-transportada.md`.

## Fase 3 — Fechamento

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** Revisão de design e usabilidade com print nas três larguras (375, 768, 1280): cadastro
      com Produtos, registro com tipo `off`, detalhe de ocorrência sem itens com Corrigir (tipo
      `optional`) e só Cancelar (tipo `off`). Prints em `prints/`, achados em `evidence.md` (CA08).
- [ ] **T3.2** Ordem de publicação em `evidence.md`: SHAs por etapa (1 painel, 2 API), conforme o
      `plan.md`. Nada publicado nesta task.
- [ ] **T3.3** Revisão final por `code-reviewer` (`opus`) e atualização de
      `docs/ai-context/frontend-transportada.md`.

⚠️ Todo arquivo de teste novo entra na lista do `package.json` da app — fora dela, não roda.

## Perguntas pendentes (no lugar do prompt de execução)

A spec tem `[NEEDS CLARIFICATION]` aberto e por isso **não** tem prompt de execução
(`model-economy.md` §4). Responder antes:

1. **D1 — Tipo sem itens pode abrir tratativa?** (a) CHECK `items_mode = 'off' ⇒ redelivery_policy =
'unset'`, como o tipo `charge` da 204; (b) livre, a cargo do operador; (c) outra regra.
2. **D2 — A prorrogação entra na empresa que já existe?** (a) mantém a regra de bootstrap da 208 e o
   operador cadastra; (b) a migration insere o tipo em toda empresa que ainda não o tem, como
   exceção à 208.

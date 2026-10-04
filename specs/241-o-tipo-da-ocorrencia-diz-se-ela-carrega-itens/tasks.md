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

- [x] **T0.1** 🧠 D1 e D2 decididas **por delegação em 2026-10-03** (o usuário respondeu "pode fazer
      os itens faltantes"): D1 = (a) CHECK `off ⇒ unset`; D2 = (a) sem `INSERT` na migration, o
      operador cadastra. O usuário pode reverter antes da execução (custos em `spec.md` § Dúvidas).
      Nenhuma `[NEEDS CLARIFICATION]` aberta.
- [x] **T0.2** 🧠 Conferir em `origin/staging` se a 239 (exigência na rua; hoje só em `work/spec-239`,
      número em colisão com `239-o-expurgo-se-liga-na-tela`) já criou `items_mode`. Se não: a 241 vai
      primeiro e **registrar** (sem executar a 239) a mudança que a 239 precisa — tirar o `ADD COLUMN
items_mode` da migration e o default `off` do plano. Se criou com default `off`: parar e
      perguntar (a 241 teria de reescrever linhas). Critério: nota em `evidence.md` com o SHA do
      `origin/staging` conferido.
- [ ] **T0.3** Medir, só leitura, em staging e em produção (Postgres-Hqfu): (i) quantos tipos têm o
      nome exato da segunda via e **qual `redelivery_policy` cada um tem** (a migration a zera);
      (ii) se o nome "Cliente pediu prorrogação do boleto" já existe; (iii) quantos tipos
      renomeados ficariam de fora. Critério: três números colados em `evidence.md`; (i) com
      política ≠ `unset` avisa o usuário antes da etapa 2.

## Fase 1 — Painel tolerante (etapa 1)

> 🤖 Modelo: `sonnet`

- [x] **T1.1** Contrato primeiro: os guards aceitam `occurrenceTypeId`, `typeItemsMode`,
      `typeAllowsMultipleItems` e `itemsMode` presentes ou ausentes; ausência lê `optional`/`true`
      (`tripResponse.validation.ts`, `TRIP_OCCURRENCE_OPTIONAL_KEYS`).
- [x] **T1.2** Contrato primeiro, depois RF7 em `resolveOccurrenceCorrectionActions` (CA05).
- [x] **T1.3** Mutação: voltar o RF7 para `hasItems || wasCorrected` deixa o contrato da T1.2
      vermelho. Colar a execução.
- [x] **T1.4** RF8: registro esconde produtos e quantidades em tipo `off` e limpa a seleção ao trocar
      (CA06). RF9: formulário de correção com seleção única por `typeAllowsMultipleItems`.
- [x] **T1.5** RF10 e RF12: Produtos (Desligado / Opcional) no cadastro de tipos, com `Select` do
      design system, só quando a listagem trouxer `itemsMode`; "um ou vários" só com Opcional; com
      Desligado a política de reentrega some e o `PUT` leva `redeliveryPolicy: 'unset'`. Mensagens
      pt-BR/en para `OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED` e `OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY`
      por `getApiErrorCode()`. Aceite (CA10, painel): com Produtos = Desligado, Foto desligada e
      "deixa a nota" desligado, o formulário monta o corpo que a 208 usa para a segunda via, sem itens
      e sem política; contrato verifica a política escondida e o `unset` enviado.
- [ ] **T1.6** Gates do painel: `bun run --cwd apps/frontend-transportada test`, typecheck, lint,
      prettier; contrato do painel contra a resposta da API atual (sem os campos novos).

## Fase 2 — Banco e API (etapa 2)

> 🤖 Modelo: `sonnet`; T2.1 é 🧠 (`opus`, ou validar com `architect` antes).

- [ ] **T2.1** 🧠 Integração vermelha da CA01 e da CA09 (tipo da segunda via semeado **antes** da
      coluna, inclusive um com `redelivery_policy = 'blocked'`) e da CA02 (seed). Schema `itemsMode` +
      CHECKs + migration, nesta **ordem**: (1) `ADD COLUMN items_mode`; (2) CHECK de vocabulário;
      (3) `UPDATE` que põe `items_mode = 'off'` **e** `redelivery_policy = 'unset'` na mesma
      instrução; (4) CHECK `company_occurrence_types_items_off_shape_check` — só depois do (3), ou a
      migration falha em dado existente. `rollback.sql` em ordem inversa (derruba as duas CHECKs
      antes da coluna). Aceite: `make migration-test` aplica e reverte; `db:generate` = `no_changes`.
- [ ] **T2.2** Mutação: arrancar o `UPDATE` deixa a CA01 vermelha; arrancar só o `redelivery_policy =
'unset'` do `UPDATE` deixa a CA09 vermelha (a CHECK recusa a linha). Colar as duas execuções.
- [ ] **T2.3** Catálogo: `itemsMode` por entrada, o tipo da prorrogação (`delivery`, `off`, defaults da 208) **só no catálogo de bootstrap** — nenhuma migration o insere (D2) —, constante do nome da
      segunda via; seeders gravam `itemsMode` (CA02). Aceite: empresa que já tem qualquer tipo
      continua sem receber a prorrogação (teste existente da 208/CA3 segue verde).
- [ ] **T2.4** Contrato primeiro, depois o cadastro: `itemsMode` opcional sem default, `required` →
      400 (CA07); validação do estado resultante `off` ⇒ `unset` com
      `OccurrenceTypeItemsOffRedeliveryPolicyError` (`422 OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY`)
      antes de gravar, campo ausente lendo o valor gravado (CA09); e `PUT` que cria a prorrogação
      (`off`, foto `off`, sem soltar a nota, `unset`) grava (CA10).
- [ ] **T2.4b** Mutação: arrancar a validação `off` ⇒ `unset` do cadastro deixa a CA09 vermelha (a
      CHECK do banco ainda segura, mas o código da resposta passa a ser 500). Colar a execução.
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
      `plan.md`, mais o **passo 3 operacional** (cadastrar a prorrogação em produção, `spec.md` §
      Passo operacional) como pendente humano. Nada publicado nesta task.
- [ ] **T3.3** Revisão final por `code-reviewer` (`opus`) e atualização de
      `docs/ai-context/frontend-transportada.md`.

⚠️ Todo arquivo de teste novo entra na lista do `package.json` da app — fora dela, não roda.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/241-o-tipo-da-ocorrencia-diz-se-ela-carrega-itens/
(leia spec.md, plan.md e tasks.md antes de começar; D1 e D2 estão decididas por delegação, nenhuma
[NEEDS CLARIFICATION] aberta). Uma task por vez, na ordem do tasks.md, em worktree próprio
(make worktree NAME=spec-241), uma branch por etapa de publicação a partir de origin/staging.
Modelos: Fase 0 → opus (T0.1–T0.3 🧠, decisões; T0.3 só leitura) · Fase 1 → executor model=sonnet
(painel tolerante, etapa 1) · Fase 2 → executor model=sonnet, com T2.1 🧠 → opus (validar com
architect antes: ordem coluna → UPDATE com política → CHECK, e rollback inverso) · Fase 3 → executor
model=sonnet, revisão final → code-reviewer model=opus.
Ordem de publicação (ADR-0081 §9): etapa 1 = painel tolerante (Fase 1) publicada e com o autoUpdate do
PWA no ar ANTES da etapa 2 = migration + API (Fase 2). Nunca a API/banco primeiro. Depois da etapa 2, o
passo 3 é humano: o operador cadastra "Cliente pediu prorrogação do boleto" em produção pela tela, com
Produtos = Desligado (spec.md § Passo operacional); nenhuma migration insere esse tipo.
A 241 vai antes da 239: ela cria items_mode (default optional); não edite a 239.
Cada task fecha com: typecheck (bun run typecheck) + testes da app tocada + commit isolado com caminhos
explícitos, e evidência em evidence.md (mutações com a execução vermelha colada). Fase 2 ainda exige
make check, make migration-test (há migration, com rollback.sql), db:generate = no_changes depois de
git fetch + rebase em origin/staging + bun install --frozen-lockfile, contrato E integração da API
(bun --env-file=../../.env.test test --timeout 120000 e ... run test:integration), prettier nos .md.
Todo arquivo de teste novo entra na lista do package.json da app.
Pare e pergunte antes de: deploy (staging ou produção), migration destrutiva, qualquer ação em
produção (inclusive cadastrar a prorrogação ou rodar a medição T0.3 em produção), política da segunda
via diferente de unset encontrada na medição, e qualquer [NEEDS CLARIFICATION] que apareça.
```

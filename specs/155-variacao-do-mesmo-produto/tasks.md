# Spec 155 — Tarefas

Uma task por vez, nesta ordem. Toda task fecha com typecheck + testes + commit isolado e uma linha
em `evidence.md`. Contrato vermelho antes da implementação, sem exceção.

| Modelo    | Papel nesta spec                                                 |
| --------- | ---------------------------------------------------------------- |
| `opus` 🧠 | A heurística de família (T1/T2) — é a única decisão irreversível |
| `sonnet`  | Migration, API, tela                                             |
| `haiku`   | Locales e documentação                                           |

---

## Fase 1 — A regra de família

> 🤖 Modelo: `opus` 🧠 (a fase inteira)

### T1.1 🧠 — Contrato de `resolveBoxFamily`

`apps/api-transportada/test/nfe-package-box/family.contract.ts` (novo) + import em
`test/nfe-package-box.contract.test.ts`. O entrypoint já está no `package.json`; a suíte nova só
precisa ser importada ali.

Casos obrigatórios, todos tirados de produção: `SAB FARNESE 180G ERVA DOCE HORTE` →
prefixo `SAB FARNESE 180G`, rótulo `ERVA DOCE HORTE`; `AMAC CONC DOWNY 500ML BRISA SUAVE` →
`AMAC CONC DOWNY 500ML` + `BRISA SUAVE`; `REFR TANG 18G MANGA`; `CHOC LACTA 80G OREO`. Bordas:
descrição sem dígito (família só dela, rótulo vazio); dígito no primeiro token; descrição só
numérica; espaços duplos e caixa mista normalizados; `ALCOOL FLOPS 1L 46.2` (o último token com
dígito vence, família de um). Chave inclui `commercialUnit`: `CX36` e `FR12` do mesmo prefixo são
famílias diferentes.

Aceite: suíte vermelha, `bun run --cwd apps/api-transportada test` reprovando por função ausente.

### T1.2 🧠 — `package-box-family.policy.ts`

`apps/api-transportada/src/nfe-documents/domain/package-box-family.policy.ts`. `resolveBoxFamily` e
`resolvePackagingUnitCount`, puras, sem I/O, tipos em `PackageBoxFamily`/`ResolveBoxFamilyParams`.

Aceite: T1.1 verde; `bun run typecheck`; nenhum outro teste quebra.

---

## Fase 2 — API

> 🤖 Modelo: `sonnet` (T2.1 é 🧠 — a compatibilidade do check de `measurement_source` com linha já gravada passa por `opus` antes de gerar o SQL)

### T2.1 🧠 — Schema e migration de `replicated`

`'replicated'` em `PACKAGE_BOX_MEASUREMENT_SOURCES`, nos checks de `measurement_source` das duas
tabelas e nos dois checks de pareamento de margem. `nfe_package_box_measurements` ganha
`replicated_from_box_id uuid` nullable, FK composta `(company_id, replicated_from_box_id)` →
`nfe_package_boxes_company_id_id_unique`, e check de que só vem preenchido com `source =
'replicated'`. Editar `apps/api-transportada/src/database/nfe.schema.ts` **e** a cópia
`apps/worker-transportada/src/database/nfe.schema.ts`. Migration aditiva em
`apps/api-transportada/drizzle/<timestamp>_package_box_replicated_source/` **com `snapshot.json`** —
pasta sem snapshot faz o `db:generate` seguinte recriar tabela já aplicada.

Aceite: `make migration-test`; `test/database-migration/schema-snapshot.contract.ts` verde;
`bun run --cwd apps/api-transportada db:check`.

### T2.2 — Contadores de família na listagem

CTE com as janelas da D9 em `DrizzlePackageBoxRepository.list`, **antes** do `LIMIT`:
`familyPendingCount`, `familyMeasuredCount`, `packagingSiblingCount`, mais `familyKey`,
`variantLabel`, `packagingUnitCount`. Propagar por `PackageBoxRepositoryPort`, `PackageBoxView` e
`buildMeasurementQueue`.

Contrato: `test/nfe-package-box/family.contract.ts` ganha o caso de paridade — a mesma descrição
resolvida em SQL e em TypeScript dá a mesma chave, senão a tela conta uma coisa e a rota de irmãs
devolve outra. Integração em `test/integration/` (roda com `bun --env-file=../../.env.test test
--timeout 120000` de dentro de `apps/api-transportada`; sem a flag ela **pula em silêncio**).

Aceite: contrato de paridade verde contra Postgres; `test/nfe-package-box/measurement-queue.contract.ts`
continua verde.

### T2.3 — `GET /nfe-package-boxes/:id/siblings`

`application/list-package-box-siblings.use-case.ts` + rota com `CARGO_MEASURE_POLICY`,
`cache-control: no-store`, `companyId` do `context.scope`. Resposta
`{ data: { family: [...], packaging: [...] } }`. Caixa de outra empresa → 404.

Contrato: `test/nfe-package-box/routes.contract.ts` (rota registrada, política) +
`test/nfe-package-box/replicate.contract.ts` (novo, forma da resposta). Teste negativo de tenant em
`test/nfe-documents-schema/tenant-safety.contract.ts` — obrigatório em qualquer query nova.

### T2.4 — `POST /nfe-package-boxes/:id/replicate`

Body `{ targetIds: string[] }` (`.strict()`, 1..200 UUIDs únicos). Uma transação: origem sem medida →
422; alvo de outra empresa → 404; alvo fora da família → 422; alvo já medido → 409 (D4, é o
"não remover medida que já existe" do operador virado invariante). Grava dimensões, peso,
`unitsPerBox`, `measurement_source = 'replicated'`, `measured_at`, e uma linha de histórico por alvo
com `replicated_from_box_id`. Resposta `{ data: { replicatedCount } }`. Erros novos em
`domain/package-box-measurement.error.ts`. Registrar os dois use cases no `createPackageBoxRoutes`
de `apps/api-transportada/src/main.ts`.

Contrato: `test/nfe-package-box/replicate.contract.ts` cobrindo os quatro caminhos de recusa, o
caminho feliz, e **repetir a mesma chamada** (segunda vez não reescreve nada — a idempotência cai de
graça da regra do 409).

### T2.5 — Regressão da G007

`test/integration/` : caixa medida → reimportar NF-e do mesmo produto → dimensão, `measured_at`,
`units_per_box` e `measurement_source` inalterados, só `carton_gtin` podendo sair de nulo. Hoje isso
é verdade por construção nos três caminhos de escrita e não tem teste com esse nome.

---

## Fase 3 — Tela

> 🤖 Modelo: `sonnet`

### T3.1 — Cliente e hook

`shared/packageBoxClient.service.ts`: campos novos em `PackageBox`, `listSiblings`, `replicate`,
guards de resposta, códigos de erro novos em `packageBoxErrorCode`.
`hooks/usePackageBoxQueue.hook.ts`: mutação `replicate` invalidando `['nfe-package-boxes']`;
irmãs carregadas sob demanda, nunca junto da fila de 50 linhas.
Contrato: `apps/frontend-transportada/test/nfe-workspace/client-and-queries.contract.ts`.

### T3.2 — Unidade visível e agrupamento (G008)

`components/PackageBoxMeasurementPanel.component.tsx`: badge de unidade com contagem em toda linha —
é o que resolve a queixa de "produto duplicado", já que as 91 duplicatas aparentes são o mesmo
`cProd` em duas unidades comerciais. Linhas do mesmo grupo de embalagem sob o mesmo produto, e o
contador de família na linha.
Contrato novo: `test/nfe-workspace/package-box-family.contract.ts`, importado em
`test/nfe-workspace.contract.test.ts`.

### T3.3 — Botão rápido (G009)

`components/PackageBoxMeasurementForm.component.tsx`: "usar a medida de {rótulo}" preenche os campos
e **não** salva (D7). O operador confere e clica em salvar como sempre.

### T3.4 — Diálogo de replicar (G010)

Depois do salvar, lista das variações sem medida pré-marcada, com o rótulo de cada uma. Confirmar
chama `replicate`; cancelar não escreve nada (D5). Reaproveita o padrão do `ImpreciseConfirmDialog`
que já existe no formulário.

---

## Fase 4 — Locales e documentação

> 🤖 Modelo: `haiku`

### T4.1 — Locales

`locales/nfeWorkspace.locale.json` e `nfeWorkspace.en.locale.json`, chaves sob `packageBoxes.*`
(`family.*`, `packaging.*`, `replicate.*`). Nenhuma string solta no componente.

### T4.2 — Documentação

Comentário de `nfe_packageBoxes` no schema (a identidade agora tem leitura em dois eixos),
`docs/ai-context/api-transportada.md` e `docs/ai-context/frontend-transportada.md`, e a D10
registrada em `specs/PERGUNTAS-ABERTAS.md` — o `carton_gtin` guardar o GTIN da unidade de consumo
precisa de spec própria e não pode sumir no histórico do chat.

---

## Gates de toda task

```bash
bun run typecheck
bun run --cwd apps/<app> test
cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000   # integração
make check                                                                         # antes de publicar
```

Worktree próprio antes de começar: `make worktree NAME=box-variants`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/155-variacao-do-mesmo-produto/ (leia spec.md,
plan.md e tasks.md antes de tocar em código). Crie o worktree primeiro: make worktree
NAME=box-variants. Uma task por vez, na ordem do tasks.md, contrato vermelho antes da implementação.
Modelos: Fase 1 (T1.1, T1.2 🧠) → opus, validar a heurística com architect antes de implementar ·
Fase 2 → executor model=sonnet, com T2.1 🧠 → opus (o check de measurement_source tem de aceitar as
linhas já gravadas) · Fase 3 → executor model=sonnet · Fase 4 → executor model=haiku ·
revisão final → code-reviewer model=opus.
Cada task fecha com bun run typecheck + testes da app + commit isolado, e evidência em evidence.md.
A integração da API só conta se rodada com bun --env-file=../../.env.test test --timeout 120000 de
dentro de apps/api-transportada — sem a flag ela pula em silêncio e parece verde.
Invariante que não se negocia: replicar nunca sobrescreve caixa que já tem medida (D4/G007).
Pare e pergunte antes de: deploy, migration destrutiva, apagar qualquer linha de nfe_package_boxes,
ou mexer em carton_gtin (é a D10, fora de escopo).
```

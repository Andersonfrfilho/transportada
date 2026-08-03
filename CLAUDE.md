# CLAUDE.md

Contexto operacional do monorepo **TransportAdA**. Para regras de processo completas leia
`AGENTS.md`; para o produto e o domínio, `PROJECT.MD` e `docs/spec/constitution.md`.

## Produto

TMS multiempresa (SaaS) para transportadoras: importa NF-e → organiza em lotes → calcula frete →
emite CT-e 4.00 em lote via `@adatechnology/fiscal-provider` → armazena XMLs fiscais → gera faturas.
Genérico e parametrizável — nenhuma regra ou CNPJ de transportadora específica no código.

## Estrutura

```
apps/api-transportada/       Bun.serve + Drizzle + Zod (sem framework HTTP)
apps/worker-transportada/    consumidor RabbitMQ + outbox relay
apps/frontend-transportada/  React 19 + Vite 7 (PWA)
docs/spec/                   constitution, architecture, domain-model, fiscal-integration
docs/adr/                    NNNN-titulo.md (0001..0010)
specs/NNN-nome/              spec.md · plan.md · tasks.md · evidence.md
realm/                       contrato versionado do realm Keycloak
```

Não existe `packages/` aqui. Bibliotecas reutilizáveis vão para
`~/Documents/personal/adatechnology-packages`. **Nenhuma app importa código-fonte de outra.**

## Comandos

```bash
make bootstrap      # .env a partir do .env.example + bun install --frozen-lockfile
make config         # valida .env, schema de env, Bun 1.3.14, docker compose — pré-requisito
make up / down / ps # infra Docker
make dev            # identity-bootstrap + up + API, worker e frontend em paralelo
make check          # format:check + lint + typecheck + test + build (gate completo)
make migration-test # migration + rollback em Postgres descartável
make smoke          # healthchecks da stack + smoke Playwright
make worker-integration
make e2e-up / e2e-down          # infra dedicada de E2E (.env.test)
bun run --cwd apps/<app> test   # testes de uma app só
```

Não há target isolado de lint/typecheck — use `bun run lint` / `bun run typecheck` na raiz.

Portas (bind em 127.0.0.1): postgres 55432 · rabbitmq 55672/55673 · minio 59000/59001 ·
mailpit 51025/58025 · keycloak 58080 · frontend 53000 · api 53001 · worker 53002.

## api-transportada

Módulo de domínio = até 4 camadas em `src/<modulo>/`:

- `presentation/` — `*.routes.ts` (`defineRoute`), `*.schema.ts` (Zod). Única camada que vê `Request`/`Response`.
- `application/` — `*.use-case.ts`, `*.service.ts`, `*.port.ts`.
- `domain/` — regras puras, `*.error.ts`, `*.policy.ts`. Sem I/O.
- `infrastructure/` — `drizzle-*.repository.ts`, `*.mapper.ts`, `*.gateway.ts`.

Módulos: `billing`, `companies`, `cte-batches`, `cte-issuance`, `freight`, `freight-calculations`,
`freight-rules`, `identity`, `nfe-documents`, `nfe-imports`, `operations`, `storage`, `health`.
Transversais: `config`, `database`, `http`, `logging`, `server`, `shared`.

Fluxo de request: `src/main.ts` (composition root) → `server/server.service.ts` (`Bun.serve`, limite
2 MiB) → `http/request-handler.service.ts` (correlation-id, 1 MiB → 413, CORS) →
`http/router.service.ts`: autentica → `matchRoute` → `tenantContext.resolveCompany` → `authorize` →
`route.execute` → `parse` (Zod) → `handle` → use-case → repositório.

**Multi-tenant:** Bearer JWT (Keycloak/JWKS) → identidade externa por issuer+subject →
`tenantContext.resolveCompany` busca membership ativo; sem membership → 403. Todo repositório recebe
`context.companyId` e filtra por ele. Testes de isolamento em `test/*-schema/tenant-safety.contract.ts`
são obrigatórios em qualquer mudança de query.

**Banco:** schemas em `src/database/*.schema.ts`, agregados em `database.schema.ts`. Migrations SQL
versionadas em `drizzle/`. `bun run db:generate --name x` · `db:check` · `db:migrate` · `db:seed:local`.
O startup **não** roda migrations; rollback é manual, ao lado da migration.

## worker-transportada

RabbitMQ via `@adatechnology/rabbitmq-provider` — **sem BullMQ/Redis**. Topologias em
`src/messaging/`, cada trilho com main/retry/dead: `nfe-import.v1`, `nfe-distribution.v1`,
`cte-issuance.v1` (+ `synthetic.v1`, proibido em production). Padrão de nome:
`${QUEUE_PREFIX}.<rota>.v1.{main,retry,dead}.{exchange,queue}`.

Envelopes Zod versionados (`*-envelope.schema.ts`), backoff por política, idempotência via tabela
`processed_messages`, outbox relay (polling 1s, lease 30s) sobre `processing_outbox` e
`cte_issuance_outbox`.

Entrypoint `src/main.ts` → `startWorkerRuntime`. Cada consumer é `start*Consumer` em `src/runtime/`,
recebe `{config, logger, provider}` e devolve `{cancel()}`; a lógica fica em `src/<contexto>/application/`.
Dependências injetáveis via `WorkerRuntimeDependencies` — é assim que os contract tests substituem
RabbitMQ e banco.

⚠️ O schema Drizzle das tabelas consumidas é **duplicado por cópia** no worker
(`src/database/processing.schema.ts`, `cte-issuance-execution.schema.ts`). Mudou tabela na API? confira
a cópia do worker — migrations só rodam na API.

## frontend-transportada

React 19.2 + Vite 7.3 + TanStack Query 5 (`retry: false`, `staleTime` 30s). **Sem router**: navegação
manual em `src/main.tsx` (`pushState` + `popstate` + `sessionStorage`). **Sem Tailwind e sem zod** —
`tailwind-merge`/`clsx`/`cva` estão no package.json mas não são usados; `cn()` é reimplementado em
`src/lib/utils.ts`; validação é type guard manual em `*.validation.ts`.

Módulos em `src/modules/`: `billing`, `company-settings`, `cte-batch`, `cte-issuance`, `foundation`,
`freight`, `identity`, `nfe-workspace`, `operations`, `shared`. `shared/` concentra client HTTP +
validação + view-model. Um client HTTP **por módulo** (`shared/<modulo>Client.service.ts`), com `fetch`
injetado por dependência. Auth via `KeycloakAuthProvider`.

Tokens de design em `:root` de `src/styles/index.css` (`--color-*`, `--font-*`, `--space-1..16`), tema
escuro único. Design system caseiro em `src/components/ui/`. Estilos por módulo em `*.module.css`.

Todo container de tela usa `width: var(--layout-width)` — nenhum módulo declara largura própria, para
o cabeçalho da aplicação e os painéis fecharem na mesma borda. Detalhes em `docs/frontend/layout.md`,
contrato em `test/design-system/layout-width.contract.ts`.

Todo campo (`input`, `textarea`, gatilho de select) tira altura, padding e corpo de texto dos tokens
`--field-height`/`--field-padding`/`--field-font-size` (e suas variantes `*-compact`) — nenhum módulo
inventa altura própria. Detalhes em `docs/frontend/fields.md`, contrato em
`test/design-system/field-metrics.contract.ts`.

Todo checkbox usa `@/components/ui/checkbox` — `<input type="checkbox">` cru é **proibido** em
`src/**/*.tsx` e o contrato `test/design-system/checkbox.contract.ts` falha se algum reaparecer.
Props, variante com/sem rótulo e estado indeterminado em `docs/frontend/checkboxes.md`.

Todo ícone vem de `@/components/ui/icon` — `<svg>` cru é **proibido** em `src/**/*.tsx` fora de
`src/components/ui/` e o contrato `test/design-system/icon.contract.ts` falha se algum reaparecer.
Tamanho por token (`--icon-size-sm`/`--icon-size-md`), cor por `currentColor`, botão só de ícone com
`aria-label` obrigatório. Nomes disponíveis e como criar um novo em `docs/frontend/icons.md`.

Todo campo de seleção usa `@/components/ui/select` — `<select>` nativo é **proibido** em
`src/**/*.tsx` e o contrato `test/design-system/select.contract.ts` falha se algum reaparecer.
Contrato de props, teclado e ARIA em `docs/frontend/selects.md`.

Todo painel que abre sobre a tela (lista do select, calendários) é renderizado em portal no
`document.body` e posicionado pelo hook `useFloatingLayer` — dentro de modal ou tabela rolável o
`position: absolute` era recortado pelo `overflow` do ancestral. Contrato em
`test/design-system/floating-layer.contract.ts`, regra na seção "Camada flutuante" de
`docs/frontend/selects.md`.

Tabelas com muitas informações seguem `docs/frontend/data-tables.md` (contrato obrigatório: ordenação,
filtros multi-valor, filtro simples + avançado com grupos E/OU aninhados, reordenação/visibilidade de
colunas persistida em `localStorage`, seleção em massa, teste de contrato). Duas referências vivas: o
módulo `nfe-workspace` (tabela "Notas") — hook `useNfeDocumentTable.hook.ts` +
`AdvancedFilterBuilder.component.tsx` — e o módulo `cte-batch` (tabela de CT-es) — hook
`useCteItemTable.hook.ts`, que acrescenta paginação por cursor, soma decimal da seleção entre páginas
e status escondido por padrão (`CTE_ITEM_DEFAULT_HIDDEN_STATUSES`).

Todo filtro ativo aparece como pílula removível vinda de `@/components/ui/filter-pills`
(`components/ui/filter-pills.tsx`) — nenhum módulo desenha a sua. Os descritores ficam em
`shared/<modulo>FilterPills.service.ts` (sem tradução, com `formatDay` injetado) e a remoção por campo
em `clearFilterField` do hook; no modo simples o badge do filtro usa `pills.length`. Regra completa na
§ 8 de `docs/frontend/data-tables.md`, contrato em `test/design-system/filter-pills.contract.ts`.

Texto pt-BR nos `*.locale.json` vai **acentuado**. O contrato `test/shared/locale-accents.contract.ts`
varre por glob todo `src/modules/*/locales/*.locale.json` que não seja `.en.` e falha se achar palavra
de uma blocklist de formas que não existem sem acento (`nao`, `possivel`, `numero`, `pagina`, …).
Módulo novo entra na varredura sozinho; palavra nova que escapar se acrescenta à blocklist.

Envs: `VITE_API_URL`, `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID`.

## Convenções

Sufixos em uso: `.use-case.ts` · `.service.ts` · `.schema.ts` · `.repository.ts` (sempre prefixo
`drizzle-`) · `.routes.ts` · `.port.ts` · `.gateway.ts` · `.error.ts` · `.policy.ts` · `.mapper.ts` ·
`.persistence.ts` · `.types.ts` · `.constant.ts`. Frontend: `.page.tsx` · `.component.tsx` · `.hook.ts` ·
`.query.ts` · `.validation.ts` · `.locale.json` · `.module.css`.

Testes ficam em `test/`, sem colocation: entrypoint fino `test/<area>.contract.test.ts` importando
suítes `test/<area>/*.contract.ts`; `test/fixtures/*.fixture.ts`; `test/integration/*.integration.ts`.
⚠️ A lista de arquivos de teste é **explícita** no `package.json` de cada app — teste novo não roda se
não for adicionado ali.

Use cases e rotas são factories `create*`; classes de repositório são `PascalCase`
(`DrizzleBillingRepository`). Imports ESM sempre com extensão `.js`. TS `NodeNext`, `strict` +
`exactOptionalPropertyTypes`.

## Regras que não se negociam

- Uma task por vez, tirada do `tasks.md` da feature. Nada de implementar com `[NEEDS CLARIFICATION]`
  aberto. Task só fecha com evidência de teste em `evidence.md`.
- Teste de aceite/contrato **antes** da implementação.
- API HTTP usa `Bun.serve`. Importar o addon V8 `uWebSockets.js` é proibido.
- Dinheiro é `Decimal`/`numeric` — nunca float binário.
- `companyId` vem do contexto autenticado, nunca do payload do cliente.
- XML fiscal original é preservado. Nunca logar certificado, senha ou XML sensível.
- Não importar internals `src/sefaz/*` do pacote fiscal — encapsular em gateway da aplicação. Não
  inventar regra legal nem método que o pacote não expõe.
- Frontend é PWA e usa `shadcn/ui`; UI paralela ao design system exige ADR.
- Proibido: deploy em production sem gates e aprovação humana, migration destrutiva automática,
  misturar tenants / ambientes fiscais / buckets.
- `.env` e `.env.test` nunca são commitados nem têm conteúdo exposto.

## Explorando este repo sem estourar contexto

652 arquivos versionados, 509 `.ts`/`.tsx`, ~67k linhas. Ler tudo direto estoura a janela. Delegue a
exploração para subagentes `Explore` escopados por app — eles leem no contexto deles e devolvem só a
conclusão. Ignore `graphify-out/` (1.9M), `specs/` (672K), `example/`, `realm/`, `tmp/`, `.history/`.

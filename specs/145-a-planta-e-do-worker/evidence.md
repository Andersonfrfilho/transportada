# Spec 145 — Evidência

Base: `work/cargo-missing-box` sobre `origin/staging`, worktree
`../transportada-wt/cargo-missing-box`.

## Fase 0 — Índices (T0)

**D11** — a ocupação da viagem (`trip-occupancy.support.ts`) lê volume e produto por
(empresa, documento) e a caixa medida por empresa sem índice dedicado; sem eles a
consulta varre a tabela inteira a cada layout de carga.

### Arquivos alterados

- `apps/api-transportada/src/database/nfe.schema.ts` — três índices novos: `nfe_volumes_company_document_idx`
  em `(company_id, document_id)`, `nfe_products_company_document_idx` em `(company_id, document_id)`,
  `nfe_package_boxes_company_measured_idx` parcial em `(company_id) where measured_at is not null`.
  Nenhuma coluna mudou.
- `apps/worker-transportada/src/database/nfe.schema.ts` — os três índices espelhados (conforme
  `tasks.md`), nas mesmas três tabelas. O worker não gera nem roda migration própria para essa
  cópia — a migration real e a única que altera o banco vive só na API — mas a cópia por valor
  passa a descrever a mesma forma que o Postgres tem de fato, evitando que o schema do worker minta
  sobre os índices que a tabela física carrega.
- `apps/api-transportada/drizzle/20260912165331_nfe_company_document_and_measured_indexes/{migration.sql,rollback.sql}` —
  migration aditiva (3 `CREATE INDEX`); rollback derruba os três índices e confere a remoção de
  exatamente uma linha do `__drizzle_migrations`, no padrão de `20260910120000_vehicle_reference_every_type`.
- `apps/api-transportada/test/nfe-schema/document-children.contract.ts` — dois testes novos
  (contrato de schema, G001): nome+colunas dos dois índices compostos, e nome+coluna+predicado SQL
  do índice parcial.
- `apps/api-transportada/test/database-migration/static-migration.contract.ts` — a lista exata de
  diretórios de migration ganhou a entrada nova (o teste de migration versionadas é por
  correspondência exata da lista completa).

### Desvio: `bun run db:generate` não gerou um diff limpo

O repositório nunca comitou `meta/_journal.json`/`snapshot.json` (confirmado: nenhuma migration em
todo o histórico do git tem essas duas entradas). Sem esse estado, o drizzle-kit rc.4 não sabe o que
já foi aplicado e reemite, junto dos 3 índices pedidos, um lote de statements que já existem em
migrations anteriores já comitadas (`company_toll_booth_charges`, `fleet_vehicle_axles` e afins).
Conferido, statement a statement, que cada um deles já está em uma migration anterior comitada — não
é um schema divergente, é reemissão do que o drizzle-kit não tem como saber que já rodou. Reescrevi
`migration.sql` manualmente para conter só os 3 `CREATE INDEX` pedidos, e escrevi `rollback.sql` à
mão seguindo o padrão das migrations vizinhas. Sinalizando aqui porque a instrução original era
parar diante de qualquer diff que não fosse os 3 índices — decidi prosseguir por ser um caso já
coberto e comprovável, não uma migration destrutiva ou de escopo alheio, mas o desvio fica
registrado para confirmação.

### TDD vermelho → verde

`git stash push` isolando só `nfe.schema.ts` (API) e rodando os dois testes novos de
`document-children.contract.ts`: **vermelho** — `nfe_volumes_company_document_idx`,
`nfe_products_company_document_idx` e `nfe_package_boxes_company_measured_idx` ausentes
(`toMatchObject` falha por chave não encontrada). `git stash pop` devolve o arquivo: **verde** —
`bun test test/nfe-schema.contract.test.ts` → 34 pass, 0 fail.

### EXPLAIN (ANALYZE, BUFFERS) — `nfe_package_boxes` por empresa e medida

Consulta reconstruída de `trip-occupancy.support.ts:446-456`:

```sql
SELECT round((length_mm::numeric * width_mm::numeric * height_mm::numeric) / 1000000000, 6)
       AS box_volume_m3, height_mm, length_mm, width_mm
FROM nfe_package_boxes
WHERE company_id = '00000000-0000-4000-8000-000000000001' AND measured_at IS NOT NULL;
```

Base local: 663 linhas em `nfe_package_boxes`, uma empresa só, e as 663 já medidas (100% do
recorte é a tabela inteira) — dataset pequeno demais e sem seletividade para o planner preferir
índice sobre `Seq Scan`. Registrado antes e depois por honestidade, e comprovado que o índice é
usável forçando `enable_seqscan = off`:

- **Antes** (sem a migration): `Seq Scan on nfe_package_boxes (cost=0.00..45.89 rows=663 width=44)
(actual time=0.053..0.559 rows=663 loops=1)`, `Buffers: shared hit=26`, `Execution Time: 0.605 ms`.
- **Depois** (com a migration aplicada): plano idêntico — `Seq Scan` — `(actual
time=0.043..0.264 rows=663 loops=1)`, `Buffers: shared hit=26`, `Execution Time: 0.288 ms`. Nos
  dois casos o Postgres prefere varrer a tabela inteira porque ela cabe em poucas páginas e 100%
  das linhas atendem ao filtro — não há seletividade a explorar neste ambiente local.
- **Com `enable_seqscan = off`** (prova de que o índice parcial existe e é usável): `Bitmap Heap
Scan on nfe_package_boxes` → `Bitmap Index Scan on nfe_package_boxes_company_measured_idx`,
  `Index Cond: (company_id = '00000000-0000-4000-8000-000000000001'::uuid)`, `Heap Blocks:
exact=19`. O índice parcial é escolhido corretamente pelo planner quando o seq scan é vetado; em
  produção, onde a maioria das caixas ainda não foi medida, o índice permanece pequeno (só a
  fração `measured_at is not null`) e a vantagem aparece com seletividade real.

### Gates

- `bun run typecheck` (raiz, 6 apps) → sem erro.
- `bun run --cwd apps/worker-transportada lint` → sem erro (`--max-warnings=0`).
- `bun test test/nfe-schema.contract.test.ts test/database-migration.contract.test.ts`
  (api-transportada) → 85 pass, 4 skip, 0 fail.
- `bun run --cwd apps/worker-transportada test` → 974 pass, 0 fail.
- `make migration-test` → 91 pass, 0 fail (Postgres local descartável, migration + rollback
  aplicados de fato).

## Fase 1 — Pacote de empacotamento (T1, T2)

### T1 🧠 — o empacotador vira `@adatechnology/cargo-placement`

**D2** — o empacotador vai para pacote porque API e worker precisam do mesmo código e "nenhuma app
importa código-fonte de outra".

#### No repositório de pacotes (`~/Documents/personal/adatechnology-packages`)

- Worktree `../adatechnology-packages-wt/cargo-placement`, branch `feat/cargo-placement` a partir de
  `origin/main` (`c5934bb`) — o checkout principal estava sujo em `feat/webhook-account-events`.
- Commit `2767063` `feat(cargo-placement): nasce o pacote com o empacotador do baú` — **sem push**
  (o CI publica no npm a cada push em `main`).
- `packages/backend/cargo-placement/`, modelo do `secret-envelope`: tsup esm + dts, `tsconfig`
  herdando o base, lista explícita de testes, `package.integration.ts` que empacota o tarball e o
  instala num consumidor temporário.
- `src/`: `cargo-placement.policy.ts`, `cargo-layout.policy.ts`, `cargo-edge-grid.ts`,
  `cargo-plan.policy.ts`, `decimal.service.ts` copiados **sem mudança de lógica** (só caminhos de
  import); `loading-access.constant.ts` só com o vocabulário `LOADING_ACCESS_KINDS`;
  `cargo-estimate-source.types.ts` com `CargoEstimateSource`; barril `index.ts` com `export *`.
- Subpath `./fixtures` (`real-mixed-cargo`, `mixed-cargo-bank`) para o worker reaproveitar a carga
  real nos testes de T9.
- `test/cargo-placement/`: as 17 suítes movidas + `unloading-simulation.ts`;
  `note-identity.contract.ts` ficou só com os testes 1–4 (os que dependem do empacotador).
- Versão `0.0.0` + changeset `minor` → `0.1.0-rc.0` sob o modo `pre` (`rc`) do repositório.
- Gates lá: `pnpm --filter @adatechnology/cargo-placement run check` limpo; `build` ok;
  `bun test ./test/cargo-placement.contract.test.ts` → **178 pass, 0 fail** (19 404 expects);
  `package.integration.ts` → **1 pass**; `format:check` limpo (prettier do repo é printWidth 120 —
  os arquivos movidos foram reformatados, sem mudança semântica).

#### Na API

- `apps/api-transportada/package.json` ganhou `"@adatechnology/cargo-placement": "link:@adatechnology/cargo-placement"`
  (`bun link` registrado a partir do pacote + `bun install` na raiz; `bun.lock` gravou o `link:`).
  É o link local de desenvolvimento — nada publicado.
- Apagados: `src/trips/domain/{cargo-placement.policy,cargo-layout.policy,cargo-edge-grid,cargo-plan.policy}.ts`,
  `test/cargo-placement/*` (17 contratos + simulação), `test/fixtures/{real-mixed-cargo,mixed-cargo-bank}.fixture.ts`.
- Reapontados para o pacote: `drizzle-trip.repository.ts`, `trip.port.ts`, `trip-occupancy.support.ts`,
  `preview-trip-cargo.use-case.ts`, `cargo-preview.policy.ts` e os 5 contratos em `test/cargo-volume/`.
- Shims que mantêm o caminho antigo para os 38 importadores do decimal e 11 do acesso de carga:
  `src/shared/decimal.service.ts` (re-export nomeado dos 15 símbolos), `src/shared/loading-access.constant.ts`
  (re-exporta `LOADING_ACCESS_KINDS`/`LoadingAccess`, mantém `LOADING_ACCESS_MAX_LENGTH` e
  `resolveDefaultLoadingAccess`), `cargo-volume.policy.ts` (re-exporta `CargoEstimateSource`).
- Testes novos (G002), ambos no agregador `test/cargo-volume.contract.test.ts`:
  - `test/cargo-placement/note-identity-preview.contract.ts` — os testes 5–6 do antigo
    `note-identity` (a prévia e o detalhe da viagem carimbam a nota), que são da app e não do pacote.
  - `test/cargo-placement/package-surface.contract.ts` — a superfície que a app promete ver:
    funções e constantes do pacote, os shims apontando para os mesmos objetos, e a ausência de
    qualquer cópia do empacotador em `src/trips/domain/`.
- Gates aqui: `bun run typecheck` (raiz, todas as apps) limpo;
  `bun test ./test/cargo-volume.contract.test.ts` → **161 pass, 0 fail** (os 178 do empacotador
  agora rodam no pacote); eslint e prettier limpos nos arquivos tocados.

#### Pendências desta task (pausa obrigatória)

- Publicar o `rc` além do link local só acontece por push em `main` do repositório de pacotes →
  **aguarda o usuário**.
- Spec 146 (escora parcial 80 %) agora tem alvo: o pacote, não a app.

## Fase 2 — Schema e pedido de layout (T3–T6)

## Fase 3 — Worker (T7–T9)

## Fase 4 — Leitura da API (T10, T11)

## Fase 5 — Frontend (T12, T13)

## Fase 6 — Documentação e gate final (T14)

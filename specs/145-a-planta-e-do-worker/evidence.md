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

## Fase 2 — Schema e pedido de layout (T3–T6)

## Fase 3 — Worker (T7–T9)

## Fase 4 — Leitura da API (T10, T11)

## Fase 5 — Frontend (T12, T13)

## Fase 6 — Documentação e gate final (T14)

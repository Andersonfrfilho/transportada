# Evidência — 163

## T001 — `package-box-estimate.policy.ts` (CA01, CA02)

- Vermelho: `bun test ./test/package-box-estimate.contract.test.ts` → 0 pass, 1 erro (módulo inexistente).
- Verde: mesmo comando → **8 pass, 0 fail** (CA01: Lux 60×90×30, 24 un., 85 g → `188×188×128`,
  `2x2x6`, 4 524 cm³, 2 142 g; CA02: `unitsPerBox` 1/0/ausente e unidade incompleta → `undefined`).
- `test-registry.contract.test.ts` verde (entrypoint novo na lista explícita do `package.json`);
  `bun run typecheck` verde; eslint/prettier sem apontamento nos arquivos novos.

## T002 — `package-box-unit-sanity.policy.ts` (CA03, CA04)

- Vermelho: `bun test ./test/package-box-estimate.contract.test.ts` → erro de módulo inexistente.
- Verde: mesmo comando → **19 pass, 0 fail**. CA03: aresta 2160 mm → `UNIT_EDGE_OUT_OF_RANGE`
  (faixa 5–1500 mm, inteiro), peso ≤ 0 → `UNIT_WEIGHT_NOT_POSITIVE`. CA04: caixa com volume
  menor que 24 × unidade → `VOLUME_BELOW_CONTENT`; peso bruto abaixo → `GROSS_WEIGHT_BELOW_CONTENT`
  (tipos extraídos de `PackageBoxCatalogSanityRejectionCode` da 160, sem código novo para a conferência).
- Políticas da 160 (`-catalog-sanity`, `-consensus`) intocadas. Typecheck, eslint e prettier verdes.

## T003 — `package-box-cubage-dimensions.policy.ts` (RF07)

- Vermelho: `bun test ./test/package-box-estimate.contract.test.ts` → erro de módulo inexistente.
- Verde: **24 pass, 0 fail**. Real vence estimada; real incompleta cai na estimada (`isEstimated: true`);
  nenhuma das duas → `undefined`; leitor sem campos de estimativa só vê a medida real.
- Typecheck, eslint e prettier verdes.

## T004 — Migration aditiva RF01 + schema TS

- `bun run db:generate --name package_box_unit_and_estimate` → `drizzle/20260922140709_package_box_unit_and_estimate/`
  (12 `ADD COLUMN` nulas + 4 CHECKs: unidade 5–1500 mm e peso > 0; origem `typed|catalog|manual:%`;
  estimada 20–2500 mm, volume/peso > 0; estimativa "três arestas + data ou nada"). Sem ENUM.
- Segundo `bun run db:generate` → `{"status":"no_changes"}`.
- `rollback.sql` escrito à mão. Contra Postgres 18 nativo (`127.0.0.1:56998/s163`): migrate → 13 colunas
  `unit%`/`estimated_%` (12 novas + `units_per_box`); rollback → 1; reaplicação → 13.
- `make migration-test` usa o Postgres do Docker (quebrado localmente); rodado o mesmo alvo direto:
  `DRIZZLE_TEST_DATABASE_URL=postgres://test@127.0.0.1:56998/s163mt bun --env-file=../../.env.test run db:test`
  → **110 pass, 0 fail** (inclui `database-migration.contract.test.ts` com a lista explícita atualizada).
- `test/nfe-schema/package-boxes.contract.ts`: lista de colunas atualizada; a regra "sem coluna de
  volume" passa a valer para a medida real (a caixa estimada guarda `estimated_volume_cm3`, RF01).
- Contratos da API completos: **6858 pass, 9 fail** — as 9 são as pré-existentes do
  "toll booth catalog repository" (dependem do Docker). Typecheck verde.

## T005 — `record-package-box-unit.use-case.ts` + `DrizzlePackageBoxUnitRepository`

- Vermelho: `bun test ./test/package-box-estimate.contract.test.ts` → erro de módulo inexistente
  (`test/package-box-estimate/record-unit.contract.ts`, repositório falso).
- Verde: **31 pass, 0 fail**. Cobre: grava unidade + estimativa `2x2x6` com `estimatedAt`; **RNF02** —
  o objeto que chega ao repositório não tem `lengthMm/widthMm/heightMm/measurementSource`;
  `unitsPerBox` informado recalcula; `unitsPerBox = 1` → estimativa `null`; estimativa fora de
  20–2500 mm (1×1×97) não é gravada; CA03 2160 mm → 422 `UNIT_EDGE_OUT_OF_RANGE` sem gravar;
  empresa alheia → `PackageBoxNotFoundError`.
- Repositório: `SELECT … FOR UPDATE` e só escreve `estimated_*` quando `length_mm` é nulo; nenhum
  `set` toca a medida real. Provado contra Postgres na T006.
- Typecheck, eslint e prettier verdes.

## T006 — Integração CA05, CA06

- `test/integration/package-box-unit-estimate.integration.ts` (na lista explícita de `test:integration`).
- De `apps/api-transportada`, Postgres 18 nativo (o do Docker está quebrado localmente):
  `U=postgres://test@127.0.0.1:56998/s163; DRIZZLE_TEST_DATABASE_URL=$U API_TEST_DATABASE_URL=$U DATABASE_URL=$U bun --env-file=../../.env.test test --timeout 120000 ./test/integration/package-box-unit-estimate.integration.ts`
  → **3 pass, 0 fail, 26 expects**.
  - CA05: depois da unidade, `length_mm/width_mm/height_mm/measured_at/measurement_source` seguem
    `null` e `estimated_*` = 188×188×128, 2x2x6, 4 524 cm³, 2 142 g; cubagem → estimada. Medida real
    via `DrizzlePackageBoxRepository.measure` → cubagem lê a real (`isEstimated: false`), estimativa
    preservada; nova unidade depois disso não recalcula a estimativa nem toca a medida.
  - CA06: `companyId` de outra empresa → `PackageBoxNotFoundError`, e `saveUnit` direto devolve `false`
    sem gravar nada.
  - CA03 contra o banco: 2160 mm → `PackageBoxUnitRejectedError`, nada gravado.

## T007 🧠 — Pontos de consumo da cubagem

- Mapeamento isolado primeiro (commit `docs(spec)`, tabela "Pontos de consumo" no `plan.md`): um único
  leitor de dimensão para cubagem (`trips/infrastructure/trip-occupancy.support.ts`, `loadMeasuredItems`);
  worker não lê dimensão de `nfe_package_boxes`; fila, réplica, exportação e guarda da importação
  ficam só com medida real.
- Troca: `loadMeasuredItems` lê `estimated_*` e resolve cada linha por `resolveCubageBoxRow` →
  `resolveBoxDimensionsForCubage`; nota com caixa estimada `measured` → `partial`
  (`markDocumentsWithEstimatedBoxes`); mediana e formas medidas continuam só com medida real.
- Vermelho: `test/package-box-estimate/cubage-consumer.contract.ts` → erro de export inexistente.
  Verde: `bun test ./test/package-box-estimate.contract.test.ts` → **37 pass, 0 fail**.
- Integração (Postgres nativo): `package-box-unit-estimate.integration.ts` → **4 pass, 0 fail**
  (novo caso: `loadTripOccupancy` desenha 2 caixas 188×188×128, m³ `0.009048`, ocupação `partial`,
  sem entrar na mediana; depois da medida real, 190×185×130, `0.009140`, `measured`). Texto do m³
  conferido contra o Postgres: `select round((190::numeric*185*130)/1000000000, 6)` → `0.004570`.
- Regressão das consumidoras de `loadTripOccupancy`: `trip-cargo-layout-read`, `trip-cargo-preview-layout`,
  `trip-detail-query-count`, `trip-document-review`, `mixed-cargo-end-to-end`, `trip-repository`
  → **42 pass, 0 fail**.
- Contratos da API: **6871 pass, 9 fail** (as 9 pré-existentes do toll booth). Typecheck, eslint verdes.

## T008 — Rota da unidade + fila com `unit`, `estimate`, `isEstimated`

- Vermelho: `test/package-box-estimate/unit-route.contract.ts` → erro de módulo (`package-box-unit.mapper`)
  e export inexistente (`parsePackageBoxUnit`).
- Verde: `bun test ./test/package-box-estimate.contract.test.ts ./test/nfe-package-box.contract.test.ts ./test/separator-role.contract.test.ts ./test/composition.contract.test.ts`
  → **209 pass, 0 fail**. Cobre: `PUT /nfe-package-boxes/:id/unit` pede `cargo.measure`; grava como
  `typed` com a empresa do **contexto**; corpo `.strict()` recusa `companyId`, `source` e
  `measurementSource`; resposta `{ data: { estimate } }` (null sem estimativa); mapeador da fila
  (`isEstimated` só sem medida real). Lista de rotas atualizada em `routes.contract.ts` e na lista
  do separador (`separator-role.contract.test.ts`, mesma `cargo.measure`).
- Integração (Postgres nativo): `package-box-unit-estimate` + `package-box-pending-export` +
  `package-box-replication` + `measurement-history` + `package-box-catalog-import` → **26 pass, 0 fail**;
  depois, com a leitura da fila no CA05, `package-box-unit-estimate` → **4 pass, 39 expects**.
- Contratos da API: **6880 pass, 9 fail** (as 9 pré-existentes do toll booth). Typecheck 0 erros.
- `apps/api-transportada/CLAUDE.md` ganhou a invariante da spec 163 (rota nova, §14 do code-standart).

## T009 — Importador da 162 aceita a unidade (RF05)

- Formato: `extracted.unitEdges` (mesmas formas de `edges`: `comprimento/largura/altura` do Cosmos ou
  `lado1..3` da seleção manual) e `extracted.unitGrossWeight` opcionais. Status que carregam unidade:
  `found`, `no_dimensions` (origem `catalog`), `found_manual`, `found_unit_manual` (origem `manual:<domínio>`).
  Linha só com unidade não conta mais como `ignored_status` nem como `EDGES_INCOMPLETE`.
- Vermelho: `test/package-box-catalog/capture-unit.contract.ts` → erro de export inexistente
  (`mapPackageBoxCatalogCaptureUnit`).
- Verde: `bun test ./test/package-box-catalog.contract.test.ts ./test/package-box-estimate.contract.test.ts`
  → **85 pass, 0 fail**. Cobre: linha "Unidade" do Cosmos → `catalog` em mm/g; a caixa da mesma
  linha mapeia exatamente como na 162; `no_dimensions` + unidade aceita; `found_unit_manual` →
  `manual:www.drogaria.com.br`; sem unidade declarada → `UNIT_MISSING`; aresta faltando →
  `EDGES_INCOMPLETE`; unidade 216 cm → `UNIT_EDGE_OUT_OF_RANGE` (sanidade da T002), nada vai ao repositório.
- Repositório: unidade gravada em toda caixa do `cartonGtin`, depois das caixas da mesma execução;
  unidade `typed` nunca é sobrescrita (`unit_skipped_typed`); estimativa só sem medida real; nenhuma
  escrita em `length_mm`/`measurement_source` nem em `nfe_package_box_measurements`.
- Integração (Postgres nativo): `package-box-catalog-import` + `package-box-unit-estimate` → **11 pass, 0 fail**
  (novos: simulação não grava; aplicação grava 60×90×30, 85 g, `manual:www.drogaria.com.br`, estimativa
  `2x2x6`/188 mm, `length_mm` nulo e histórico vazio; unidade `typed` preservada).
- Refatoração pequena: `estimateStorablePackageBoxFromUnit` (faixa do CHECK) na política, usada pelo
  caso de uso da T005 e pelo importador. Contratos da API: **6891 pass, 9 fail** (toll booth, pré-existentes).
  Typecheck 0, eslint limpo.
- Políticas `-catalog-sanity`/`-catalog-consensus` da 160 intocadas.

## T010 — Userscript Alt+U + servidor `found_unit_manual` (RF06)

- `cosmos-capture.user.js` (1.2.0): **Alt+U** captura a **seleção** como unidade (`kind: 'unit'`,
  `extracted.unitEdges`/`unitGrossWeight`, `edges: {}`), mesmo fluxo do Alt+C (`kind: 'carton'`).
  A unidade não encerra a espera da caixa (Alt+C continua valendo). Nenhuma navegação, clique ou
  avanço automático foi adicionado — só o `keydown` com Alt, disparado pela pessoa.
- `assisted-capture-server.ts`: `/capture-manual` aceita `kind` (`carton` padrão → `found_manual`;
  `unit` → `found_unit_manual`); `kind` desconhecido → 400 `INVALID_CAPTURE`; `kind` não vai ao JSONL.
- Verificação: `bun build --target=bun scripts/box-catalog-harvest/assisted-capture-server.ts` ok;
  `node --check scripts/box-catalog-harvest/cosmos-capture.user.js` ok.
- Fumaça local do servidor com `HOME`, fila e JSONL isolados no scratchpad (porta 53998, fila já
  capturada para o servidor não abrir navegador): `kind: unit` → linha `found_unit_manual`
  (`source: www.drogaria.com.br`); `kind: carton` → `found_manual`; `kind: bogus` → `INVALID_CAPTURE`.
  A linha `found_unit_manual` gravada passou por `mapPackageBoxCatalogCaptureUnit` (T009) →
  `{accepted: true, 60×90×30 mm, source: manual:www.drogaria.com.br}`.
- Só os três arquivos de `scripts/box-catalog-harvest/` tocados nesta task entram no commit.

## T011 — UI da fila: selo "Estimada", arranjo, medir/confirmar (RF09)

- `PackageBoxEstimateNotice.component.tsx` (novo): selo **Estimada** (`Badge` do design system),
  "Estimada pela unidade (2 × 2 × 6)", medidas estimadas em cm, volume em L e peso ~kg, frase "não é
  medida", e a linha da unidade informada. As ações ficam na linha: **Medir** (o de sempre) e
  **Confirmar estimativa**, que grava pelo mesmo `PUT` da medida com `source: 'typed'` (decisão humana).
- `packageBoxClient.service.ts`: tipos `PackageBoxUnit`/`PackageBoxEstimate`; campos opcionais no
  tipo e no guard (API anterior continua passando), mas campo presente e torto derruba a fila.
- `packageBoxEstimate.service.ts` (puro): descrição da estimativa/unidade e a confirmação `typed`.
- Vermelho: `test/nfe-workspace/package-box-estimate.contract.ts` → erro de módulo inexistente; depois
  1 falha (guard aceitava estimate torta). Verde: `bun test ./test/nfe-workspace.contract.test.ts` → **573 pass**.
- `bun run --cwd apps/frontend-transportada test` → **4806 pass, 0 fail** (contratos, inclusive os de
  design system e acentuação de locale) + **44 pass** (hooks). `bun run typecheck` e eslint limpos.

## T012 🧠 — Revisão de design e usabilidade da fila (CA08) — **BLOQUEADA no print**

**Bloqueio (sem print):** a stack local de login não está de pé nesta máquina — `curl` em
`127.0.0.1:53000` (frontend) e `127.0.0.1:58080` (Keycloak) → sem resposta; `docker ps` só mostra
containers de outros projetos, e o Postgres do Docker deste repositório está quebrado localmente
(memória do projeto). Sem Keycloak não há login, e sem login a aba Caixas não abre. **Nenhum print foi
tirado nem simulado.** CA08 fica pendente de um print feito com a stack de pé (`make dev`, aba
Notas → Caixas, uma caixa com unidade informada e sem medida).

**Revisão feita contra o código da própria tela** (`web.md` §15, elemento tocado × vizinhos):

- Selo "Estimada": `Badge variant="secondary"`, o mesmo primitivo do selo de embalagem (`CX24 · 24 un`)
  da mesma linha — sem primitivo cru. Para não se confundir com ele, o bloco da estimativa tem fundo
  e borda à esquerda cobre (`--color-copper`, o mesmo tom de "fora da cobertura" da fila), que marca
  "atenção, não é medida" sem usar o vermelho de erro.
- "Confirmar estimativa": `Button size="sm" variant="secondary"` com `Icon name="check"`, igual aos
  vizinhos "Medir" (`edit`) e "Medir pela câmera" (`camera`); desabilitado enquanto grava, como o form.
- Texto: arranjo por extenso (`2 × 2 × 6`), medidas em cm com vírgula (mesmo `toCentimetres` da
  medida real), e a frase "Calculada a partir da medida do produto — não é medida" — o conferente
  nunca lê a estimativa como medida. Locale acentuado (contrato `locale-accents` verde).
- Layout estreito: `.estimateHeader` e `.actions` com `flex-wrap`; nenhum `max-width`/largura própria.
- Estado com medida real: o bloco estimado some (`isEstimated` falso) e volta a valer só a linha
  "medida · origem" de sempre; a unidade continua visível como referência.
- Contraste: texto `.hint` (`--color-slate`) sobre fundo cobre a 6% — mesma base do `.item`; não
  verificado em pixel por falta do print.

# 038 — Tasks

Uma task por vez. Teste de contrato **antes** da implementação. Evidência em `evidence.md`.
Arquivo de teste novo entra na lista literal do `package.json` da app, ou não roda.

✅ **Liberado para implementar.** O último `[NEEDS CLARIFICATION]` — a janela do CronJob semanal —
fechou em T019: `0 9 * * 6`, sábado de manhã, porque a semana da ANP dá nome ao arquivo e domingo
pediria uma semana que só é publicada seis dias depois.

Três decisões fecharam o resto: o R$/km soma **um** custo opcional por km
(`other_costs_per_kilometer`, "outros custos"); `cost_per_kilometer` **é removida agora** — o único
passo destrutivo desta migration, com `rollback.sql` que devolve a coluna mas não os valores; e o
veículo **declara o combustível dele**, o que traz o catálogo `FUEL_TYPES` para as três apps e faz o
ajuste manual de preço ser por produto. O GNV está no catálogo, e é por causa dele que cada entrada
carrega a **unidade** — R$/m³ e km/m³ contra R$/litro e km/l — em vez de a palavra "litro" ficar
escrita nas colunas, nos campos da API e nos rótulos.

## Fase 0 — sondar a fonte antes de escrever adaptador

> 🤖 Modelo: `sonnet` — leitura e registro; nada de código

- [x] **T000** 🧠 — Sondar a ANP de verdade e colar em `evidence.md`: (a) a URL corrente da série em
      CSV, (b) a **linha de cabeçalho literal**, (c) três linhas de dado, (d) separador, encoding e
      formato de decimal, (e) **como cada um dos cinco produtos do catálogo aparece na coluna de
      produto** — diesel S-10, diesel S-500, gasolina comum, etanol hidratado e GNV — **e em que
      unidade cada um é publicado**, que para o GNV é m³, (f) a granularidade real (posto, município
      ou UF) e, se não for UF, onde entra a agregação, (g) a data de publicação mais recente
      disponível. A 035 já gastou uma task por sondar a FIPE com código inventado — aqui não se
      escreve parser sobre suposição.
      Verificação: os sete itens na evidência, com data da coleta; o item (e) com os cinco rótulos
      literais e a unidade de cada um, porque é deles que sai a tabela de tradução do parser — e
      porque uma linha de GNV lida como litro entra no banco sem reclamar de nada.
- [x] **T001** — ADR-0033 registrando a escolha: ANP como fonte pública gratuita, arquivo em vez de
      API, e o ponto que decide o desenho — preço de bomba no varejo é sugestão, não verdade.
      Contexto de comparação: Base dos Dados exige credencial Google e atrasa; Apify cobra crédito;
      Kaggle está paralisado.
      ⚠️ T000 desmentiu a premissa do plano: a série em CSV é **semestral** e atrasa até seis meses; a
      semanal por UF só existe em **XLSX**. A ADR decidiu pelo resumo semanal em XLSX, lido por código
      nosso (ZIP + `inflateRawSync`), sem dependência nova — T012 e T013 seguem a ADR, não o plano.
      Verificação: `docs/adr/0033-*.md` no formato dos anteriores, status aceito, data.

## Fase A — banco: referência pública e ajuste da empresa

> 🤖 Modelo: `sonnet`

- [x] **T002** — Contrato (escrito antes): `test/fleet-schema/` recebe colunas, checks e a unicidade
      natural de `fuel_price_references` e a PK composta `(company_id, product)` de
      `company_fuel_prices`; `test/fleet-schema/tenant-safety.contract.ts` passa a **listar
      `fuel_price_references` como referência compartilhada sem `company_id`**, de propósito, e a
      exigir o FK com `restrict` em `company_fuel_prices`; `test/fleet-schema/vehicles.contract.ts`
      recebe `other_costs_per_kilometer` em `numeric(19,4)`, não nulo e com default zero, `fuel_type`
      em `varchar(20)` não nulo com default `diesel-s10`, e **exige a ausência** de
      `cost_per_kilometer`; `test/database-migration/static-migration.contract.ts` recebe o diretório
      novo, com o `drop column` reconhecido como o único passo destrutivo e o rollback guardado.
      Verificação: `bun test ./apps/api-transportada/test/fleet-schema.contract.test.ts` — vermelho
      pelos motivos certos.
- [x] **T002b** — Contrato do catálogo: `FUEL_TYPES` com a mesma lista literal nos três lugares
      (`api/src/shared/fuel.constant.ts`, `frontend/src/modules/shared/fuel.constant.ts`,
      `cron/src/fuel-price-pull/domain/fuel.constant.ts`), na mesma ordem, e nenhum produto fora dela
      aceito na coluna `product`. Cada entrada declara a `unit`, e o contrato assere a unidade de cada
      produto: `gnv` é `cubic-metre`, os outros quatro são `litre`. É cópia por valor entre apps que
      não se importam — a paridade só existe se for assertada, como na política de elegibilidade da
      distribuição.
      Verificação: vermelho nas três apps; depois verde com o catálogo escrito.
- [x] **T003** — As duas tabelas em `src/database/`, agregadas em `database.schema.ts`, e as duas
      colunas novas mais a removida em `fleet.schema.ts`; `bun run db:generate --name fuel_price_reference`;
      `rollback.sql` escrito à mão com o guarda de `ROW_COUNT`, recriando `cost_per_kilometer` vazia
      e derrubando o que foi criado. O timestamp do diretório é o que o gerador escolher — a lista do
      contrato se ajusta ao gerado, nunca o contrário.
      Verificação: `make migration-test` e `db:check` sem drift; T002 verde.

## Fase B — domínio: o preço efetivo e o R$/km

> 🤖 Modelo: `sonnet`

- [x] **T004** — Contrato `test/companies/fuel-price-policy.contract.ts`: preço efetivo **por
      produto** é `manual ?? referência da UF`; ajuste no diesel não altera o etanol; produto sem
      linha nenhuma devolve não informado; UF sem linha devolve não informado; referência de outra
      UF ou de outro produto nunca é usada.
      Verificação: vermelho.
- [x] **T005** — `src/companies/domain/fuel-price.policy.ts`.
      Verificação: T004 verde.
- [x] **T006** — Contrato `test/fleet-domain/vehicle-cost.contract.ts`: `deriveCostPerKilometer`
      devolve `preço ÷ consumo` na escala 4 meio-para-cima, **somado** aos outros custos por km; a
      divisão arredonda antes da soma; parcela em `0.0000` não entra na composição e não vira
      `"0.0000"` na resposta; tudo zerado devolve `null`; consumo `0.00` com outros custos informados
      devolve só a parcela de outros custos; `hasInformedCosts` troca `costPerKilometer` por
      `otherCostsPerKilometer`. Tabela de casos com arredondamento na quarta casa que será **copiada
      literalmente** para o contrato do frontend.
      Verificação: vermelho.
- [x] **T007** — `deriveCostPerKilometer` em `src/fleet/domain/vehicle-cost.policy.ts`, ao lado de
      `deriveMonthlyFixedCost` e com a mesma forma; a troca do campo em `FleetVehicleCostFields` e em
      `hasInformedCosts`.
      Verificação: T006 verde.

## Fase C — API: rotas de preço e veículo derivado

> 🤖 Modelo: `sonnet`

- [x] **T008** — Contrato `test/companies/fuel-price.contract.ts`: `GET /company-settings/fuel-prices`
      devolve **os cinco produtos sempre**, com `unit`, `effectivePricePerUnit`, `source`, `updatedAt` e
      `reference` (ou nulos); `PUT`/`DELETE` em `…/{produto}` sob `settings.manage` escopo `company`;
      `403` sem membership; produto fora do catálogo é `400`; `PUT` recusando valor fora da escala;
      `DELETE` devolvendo `204`, a origem daquele produto voltando a `anp` e **os outros intactos**.
      Verificação: vermelho.
- [x] **T009** — Rotas, schema, use cases, porta e repositório de preço por produto.
      Verificação: T008 verde.
- [x] **T010** — Contrato `test/fleet-http/vehicles.contract.ts`: `POST`/`PUT` de veículo **recusam**
      `costPerKilometer` no corpo (`400`, pelo `strict()`), **exigem** `fuelType` do catálogo
      (ausente ou fora da lista é `400`) e **aceitam** `otherCostsPerKilometer` como opcional na
      escala 4, persistido e devolvido; a resposta traz o campo derivado, `costPerKilometerBreakdown`
      e `fuelPrice` ao lado de `monthlyFixedCost`, coerentes com o preço efetivo **daquele
      combustível** na empresa, e omite parcela não informada; dois veículos de combustíveis
      diferentes na mesma empresa derivam de preços diferentes.
      Verificação: vermelho.
- [x] **T011** — `costPerKilometer` fora de `vehicleFieldsSchema`, `fuelType` e
      `otherCostsPerKilometer` dentro; o preço efetivo por produto chega ao mapper pela porta;
      `fleet.mapper.ts` deriva na resposta e para de ler a coluna removida. Varrer `fleet.port.ts`, o
      repositório e as fixtures atrás do campo antigo — a coluna sumiu do banco, então qualquer
      leitor esquecido quebra em runtime, não em `tsc`. Na listagem, resolver os preços **uma vez por
      empresa** e não por veículo: é o N+1 que a auditoria de T020 procura.
      Verificação: T010 verde; suíte de fleet inteira verde.

## Fase D — cron: o trilho semanal

> 🤖 Modelo: `sonnet` (T012 é 🧠 — o parser é fronteira com arquivo de terceiro)

- [x] **T012** 🧠 — Contrato `test/fuel-price-pull/anp-series.contract.ts` usando a **aba `ESTADOS`
      real de T000** como fixture: as seis linhas de preâmbulo são puladas e o cabeçalho é lido na
      linha 7; linha válida vira referência; o preço nativo da planilha vira `Decimal` sem passar por
      float e a data em serial Excel (época 1899-12-30) vira a semana certa; a tradução do rótulo da
      ANP para cada um dos cinco produtos do catálogo é assertada nos cinco, com o GNV chegando em m³
      e não sendo convertido para litro em lugar nenhum, e com `OLEO DIESEL` seco caindo em diesel
      S-500; a UF chega por nome por extenso sem acento e vira sigla; `GASOLINA ADITIVADA` e `GLP`
      são descartados sem erro; produto com menos de 27 UFs grava as que vieram; cabeçalho inesperado
      aborta em vez de gravar; contagem de linhas descartadas é reportada.
      Verificação: vermelho.
- [x] **T013** — `anp-series.client.ts` (HTTP + leitor de XLSX próprio — diretório central do ZIP +
      `inflateRawSync` + varredura do XML da aba — e Zod na fronteira), a tabela de tradução de
      produto e de UF, e a política de semana de referência (domingo a sábado, URL derivada, 404 com
      `application/json` tratado antes do parser).
      Verificação: T012 verde.
- [x] **T014** — Contrato `test/fuel-price-pull/run-cycle.contract.ts`: sem lock é no-op com código
      0; semana já gravada é no-op pela chave natural; falha da coleta sai com código 1 e **deixa a
      referência anterior intacta**; a agregação por `(produto, UF)` confere a média e a contagem, e
      um produto ausente do arquivo não derruba a gravação dos outros.
      Verificação: vermelho.
- [x] **T015** — `run-cycle.ts`, use case, porta, gateway Drizzle, advisory lock e `*.job.ts`;
      `FUEL_PRICE_PULL_JOB` em `cron.constant.ts`, no `job-registry.ts` e o bloco de env da ANP
      **gated por `CRON_JOB`** em `environment.schema.ts`, como o bloco de NFS-e; cópia por valor de
      `fuel-reference.schema.ts` no `src/database/` do cron.
      Verificação: T014 verde; `bun run --cwd apps/cron-transportada test` verde.

## Fase E — tela

> 🤖 Modelo: `sonnet`

- [x] **T016** — Contrato: `test/fleet/vehicle-cost.contract.ts` com a **mesma tabela de casos de
      T006** sobre o espelho do frontend, incluindo `VEHICLE_COST_FIELD_SCALE` com a chave nova na
      escala 4/4 e `summarizeTypedVehicleCosts` sem quebrar com valor pela metade; e
      `test/fleet/screen-standards.contract.ts` exigindo que não exista campo editável de custo por
      quilômetro **total**, que exista o campo de outros custos como opcional, que o combustível seja
      um `Select` do design system alimentado pelo catálogo, e que o resumo mostre a composição, o
      combustível, a origem e a semana da referência; mais `test/fleet/fuel-unit.contract.ts`, onde
      trocar o combustível para `gnv` troca o rótulo do consumo e o do preço para m³.
      Verificação: vermelho.
- [x] **T017** — `deriveCostPerKilometer` em `fleetVehicleCost.service.ts` e a troca da chave em
      `VEHICLE_COST_FIELD_SCALE`; `<input>` do R$/km total sai de `VehicleCostFields.component.tsx`,
      entram o select de combustível — logo antes do consumo, porque os dois se leem juntos — e o
      `FleetField` opcional de outros custos; resumo ganha composição, combustível, origem e semana;
      rótulos novos nos `*.locale.json` **acentuados** (`test/shared/locale-accents.contract.ts`
      varre por glob). O rótulo do consumo médio e o do preço saem da unidade do combustível
      selecionado — "km/l" e "R$/litro" viram chaves por unidade, não texto fixo, senão o veículo a
      GNV mostra m³ debaixo de um rótulo que diz litro.
      Verificação: T016 verde.
- [x] **T018** — Preço por combustível em `company-settings`, **uma linha por combustível**: valor efetivo,
      origem, referência da ANP ao lado como comparação, e ação de limpar o ajuste daquele produto.
      Campo, select e ícone vêm do design system — `<input type="checkbox">`, `<select>` nativo e
      `<svg>` cru são reprovados por contrato. Esqueleto no carregamento, nunca texto solto.
      Verificação: `bun run --cwd apps/frontend-transportada test` verde.

## Fase F — deploy

> 🤖 Modelo: `haiku` — mecânico, três arquivos

- [x] **T019** — `cron-fuel` na tabela de build de `docs/spec/railway.md`, em `INTERNAL_SERVICES` de
      `test/deploy/service-naming.contract.ts`, e o passo em `.github/workflows/deploy.yml` gated em
      staging, como `cron-nfse` e `cron-notifications` estão. Janela do schedule conforme a terceira
      dúvida da spec.
      Verificação: `bun test ./apps/api-transportada/test/deploy.contract.test.ts` verde.

## Fase G — fechamento

> 🤖 Modelo: `sonnet`

- [x] **T020** — `make check` nas quatro apps, `make migration-test`, e a auditoria de go-live: N+1 na
      leitura do preço efetivo dentro da listagem de veículos (é uma leitura por empresa, não por
      veículo), log sem PII e sem corpo de CSV, ausência de stack trace em 500.
      Verificação: saída dos gates colada em `evidence.md`.
- [x] **T021** — Atualizar `CLAUDE.md`: o trilho novo do cron (e a contagem de jobs, que hoje diz
      "dois jobs" e já são três), a tabela de referência sem tenant, e `costPerKilometer` como campo
      derivado ao lado de `monthlyFixedCost` — com a nota de que a coluna homônima **não existe
      mais** e que os campos persistidos são `fuelType` e `otherCostsPerKilometer` —, e o catálogo
      `FUEL_TYPES` na lista de cópias por valor entre apps, junto da política de elegibilidade e das
      cópias do trilho de NFS-e. Registrar em `docs/SECURITY.md` se a sondagem tiver levantado algo.
      Verificação: `make check` verde; a regra inquebrável de documentação viva cumprida.

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos arquivos. Marque como
concluída apenas após registrar evidência.

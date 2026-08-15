# 038 — Evidência

Uma seção por task, com o comando rodado e a saída colada. Task sem evidência aqui não está
concluída.

## T000 — Sondagem da ANP

Coleta de **14/08/2026**. A sondagem achou **duas** séries públicas, não uma, e a diferença entre elas
decide o desenho — por isso os sete itens estão respondidos para as duas.

### O achado que muda o plano

O `plan.md` supunha "CSV em vez de XLSX (dependência)". A sondagem desmente a premissa:

- A série em **CSV** é **semestral** e sai com o semestre fechado. O arquivo do 1º semestre de 2026
  tem data de **03/07/2026** e a última coleta dentro dele é **30/06/2026** — o atraso chega a seis
  meses. Não alimenta cron semanal.
- A série **semanal agregada por UF existe e está fresca**, mas é oferecida **só em XLSX**. Não há
  equivalente em CSV.

Ou o preço é semanal e o parser lê XLSX, ou o parser lê CSV e o preço tem meio ano de atraso. T001
decide isso na ADR-0033.

### (a) URLs correntes

| Série               | URL                                                                          | Formato   | Tamanho                           |
| ------------------- | ---------------------------------------------------------------------------- | --------- | --------------------------------- |
| Semestral por posto | `.../dados-abertos/arquivos/shpc/dsas/ca/ca-2026-01.zip`                     | ZIP → CSV | 8.488.624 B (72 MB descompactado) |
| **Semanal por UF**  | `.../precos/arquivos-lpc/2026/resumo_semanal_lpc_2026-08-09_2026-08-15.xlsx` | XLSX      | 298.388 B                         |

A URL semanal é **derivável**: `arquivos-lpc/<ano>/resumo_semanal_lpc_<domingo>_<sábado>.xlsx`, semana
de domingo a sábado (09/08/2026 é domingo, 15/08/2026 é sábado — conferido). Semana passada
(`2026-08-02_2026-08-08`) responde 206; semana futura (`2026-08-16_2026-08-22`) responde **404 com
`content-type: application/json`** — a ausência não vem como XLSX vazio, vem como JSON de erro, e o
cliente tem de tratar isso antes de entregar bytes ao parser.

### (b) Cabeçalho literal

CSV semestral — linha 1, com **BOM UTF-8** (`\xef\xbb\xbf`) grudado no primeiro campo:

```
Regiao - Sigla;Estado - Sigla;Municipio;Revenda;CNPJ da Revenda;Nome da Rua;Numero Rua;Complemento;Bairro;Cep;Produto;Data da Coleta;Valor de Venda;Valor de Compra;Unidade de Medida;Bandeira
```

XLSX semanal, aba `ESTADOS` — o cabeçalho **não está na primeira linha**: seis linhas de preâmbulo
institucional vêm antes, e a linha 7 é que tem os rótulos:

```
DATA INICIAL | DATA FINAL | REGIAO | ESTADOS | PRODUTO | NÚMERO DE POSTOS PESQUISADOS | UNIDADE DE MEDIDA | PREÇO MÉDIO REVENDA | DESVIO PADRÃO REVENDA | PREÇO MÍNIMO REVENDA | PREÇO MÁXIMO REVENDA | COEF DE VARIAÇÃO REVENDA
```

A linha 6 do preâmbulo carrega a nota que responde a pergunta do S-500:
`OBS: ATUALMENTE, O PRODUTO 'ÓLEO DIESEL' SE REFERE AO ÓLEO DIESEL B S500 COMUM.`

### (c) Três linhas de dado

CSV semestral:

```
N;AC;CRUZEIRO DO SUL;AMAZONIA COMERCIO DE DERIVADOS DE PETROLEO LTDA; 01.492.748/0003-83;AVENIDA COPACABANA;440;;COPACABANA;69980-000;GASOLINA;02/01/2026;7,97;;R$ / litro;IPIRANGA
N;AC;CRUZEIRO DO SUL;AMAZONIA COMERCIO DE DERIVADOS DE PETROLEO LTDA; 01.492.748/0003-83;AVENIDA COPACABANA;440;;COPACABANA;69980-000;DIESEL;02/01/2026;8,15;;R$ / litro;IPIRANGA
N;AC;CRUZEIRO DO SUL;AMAZONIA COMERCIO DE DERIVADOS DE PETROLEO LTDA; 01.492.748/0003-83;AVENIDA COPACABANA;440;;COPACABANA;69980-000;DIESEL S10;02/01/2026;8,17;;R$ / litro;IPIRANGA
```

XLSX semanal, aba `ESTADOS` (valores como saem da planilha, sem formatação aplicada):

```
46243 | 46249 | NORTE    | ACRE      | ETANOL HIDRATADO | 10  | R$/l | 5    | 0.68799999999999994 | 4.65 | 6.6  | 0.137
46243 | 46249 | NORDESTE | ALAGOAS   | ETANOL HIDRATADO | 53  | R$/l | 5.01 | 0.247               | 4.79 | 5.98 | 0.049
46243 | 46249 | SUDESTE  | SAO PAULO | OLEO DIESEL S10  | 833 | R$/l | 6.89 | 0.413               | 5.97 | 9.19 | 0.06
```

### (d) Separador, encoding e decimal

|              | CSV semestral        | XLSX semanal                                                                   |
| ------------ | -------------------- | ------------------------------------------------------------------------------ |
| Separador    | `;`                  | — (células)                                                                    |
| Encoding     | UTF-8 **com BOM**    | XML UTF-8 dentro do zip                                                        |
| Fim de linha | `\r\n`               | —                                                                              |
| Decimal      | **vírgula** (`7,97`) | **ponto**, número nativo, com ruído de ponto flutuante (`0.68799999999999994`) |
| Data         | `dd/mm/aaaa`         | **serial Excel**, época 1899-12-30 (`46243` = 09/08/2026)                      |

O nome do arquivo dentro do ZIP está gravado em **latin-1** (`Pre\x87os semestrais - AUTOMOTIVOS_2026.01.csv`)
e o `unzip`/`bsdtar` do macOS recusa criá-lo com `Illegal byte sequence`. Extrair exige ler a entrada
programaticamente e gravar com nome próprio.

### (e) Os cinco produtos do catálogo, rótulo e unidade

**Os rótulos são diferentes nas duas séries.** A tabela de tradução do parser depende de qual fonte
T001 escolher.

| Catálogo         | CSV semestral | XLSX semanal       | Unidade publicada           |
| ---------------- | ------------- | ------------------ | --------------------------- |
| Diesel S-10      | `DIESEL S10`  | `OLEO DIESEL S10`  | `R$ / litro` · `R$/l`       |
| Diesel S-500     | `DIESEL` ⚠️   | `OLEO DIESEL` ⚠️   | `R$ / litro` · `R$/l`       |
| Gasolina comum   | `GASOLINA`    | `GASOLINA COMUM`   | `R$ / litro` · `R$/l`       |
| Etanol hidratado | `ETANOL`      | `ETANOL HIDRATADO` | `R$ / litro` · `R$/l`       |
| GNV              | `GNV`         | `GNV`              | **`R$ / m³`** · **`R$/m³`** |

⚠️ **Nenhuma das duas séries escreve "S-500" em lugar nenhum.** O S-500 aparece como `DIESEL` /
`OLEO DIESEL` seco, e só a nota do preâmbulo diz que é ele. Um parser que procure a string `S500`
não acha nada e deixa o produto sem preço, calado.

Há ainda dois produtos publicados que **não** estão no catálogo e precisam ser descartados
explicitamente: `GASOLINA ADITIVADA` (nas duas séries) e `GLP` (só na semanal, em `R$/13kg` — se
entrar por engano, entra um preço de botijão como se fosse combustível de rodagem).

O GNV é o único em m³ e é a razão de `unit` ser atributo do catálogo.

### (f) Granularidade real

- CSV semestral: **posto** — 422.418 linhas no semestre, com CNPJ, rua e bandeira da revenda. Cobre
  as 27 UFs. Agregar por UF seria trabalho nosso, sobre 72 MB.
- XLSX semanal: já vem agregado. Cinco abas — `CAPITAIS`, `MUNICIPIOS`, `ESTADOS`, `REGIOES`,
  `BRASIL`. A aba `ESTADOS` traz **177 linhas**, as 27 UFs, com média, mínimo, máximo, desvio padrão
  e número de postos pesquisados. É a granularidade que a spec pede, pronta.

⚠️ **A cobertura não é retangular.** Na semana sondada: gasolina comum, aditivada, GLP e óleo diesel
S10 têm as 27 UFs; **óleo diesel** e **etanol hidratado** têm **26**; **GNV tem 17**. Dez UFs não têm
preço de GNV. O parser não pode assumir 27 linhas por produto, e a tela tem de saber dizer "sem preço
publicado para esta UF" em vez de mostrar zero.

Outro detalhe da aba `ESTADOS`: a UF vem por **nome por extenso, em caixa alta e sem acento**
(`SAO PAULO`, `CEARA`, `ESPIRITO SANTO`), não por sigla. São mais 27 traduções.

### (g) Publicação mais recente

- Semestral: `ca-2026-01.zip`, entrada datada de **03/07/2026 13:20**, coletas de 01/01 a 30/06/2026.
- Semanal: semana **09/08/2026 a 15/08/2026**, já disponível em 14/08/2026 — ou seja, a ANP publica o
  arquivo da semana **antes de a semana fechar**, na sexta. Isso é insumo direto para a janela do
  CronJob que está em `[NEEDS CLARIFICATION]`: sábado de manhã já pega o arquivo da semana corrente.

### Comportamento do host (não estava na task, mas condiciona o cliente)

- `HEAD` responde **403 Forbidden**, inclusive com User-Agent de navegador. `GET` responde 200 (206
  com `Range`). **Não há sondagem barata de frescor** — o cliente precisa baixar.
- Não há cabeçalho `Last-Modified`. O frescor tem de sair **do dado** (a coluna de semana), nunca do
  cabeçalho HTTP.

### Comandos

```
curl -sS -o ca-2026-01.zip .../shpc/dsas/ca/ca-2026-01.zip          # 8.488.624 B
python3 -c "import zipfile; ..."                                     # extração (nome latin-1)
curl -sS -o resumo_semanal.xlsx .../resumo_semanal_lpc_2026-08-09_2026-08-15.xlsx  # http=200, 298.388 B
```

## T001 — ADR-0033

`docs/adr/0033-preco-de-combustivel-vem-do-resumo-semanal-da-anp.md`, status aceito, data 14/08/2026,
no formato das anteriores.

A ADR **contraria o plano** onde a sondagem o contrariou: a fonte é o resumo semanal em XLSX, não a
série semestral em CSV. A justificativa está em T000 — CSV com até seis meses de atraso não alimenta
um custo por quilômetro.

Prova de que o XLSX não exige dependência nova, rodada sobre o arquivo real:

```
$ bun run zipprobe.ts
method: 8 | inflado: 89203 bytes
trecho: <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ...
entradas: [Content_Types].xml(m=8) _rels/.rels(m=8) xl/workbook.xml(m=8) ... xl/sharedStrings.xml(m=8)
```

Todas as 16 entradas do arquivo são deflate puro (método 8), lidas com o diretório central do ZIP e
`inflateRawSync` de `node:zlib`. Nenhuma app do monorepo tem hoje dependência de xlsx ou de zip —
conferido nos quatro `package.json` —, e nenhuma passa a ter.

T001 também ajustou T012 e T013 no `tasks.md` para seguirem a ADR em vez do plano.

## T002 — Contrato de schema, escrito antes

`test/fleet-schema/fuel-prices.contract.ts` é novo e entra pelo entrypoint `fleet-schema.contract.test.ts`,
que já está na lista explícita do `package.json` — arquivo de suíte não precisa de registro próprio.
`tenant-safety.contract.ts` ganhou o FK com `restrict` de `company_fuel_prices` e a asserção de que
`fuel_price_references` **não tem** `company_id` nem FK nenhum; `vehicles.contract.ts` trocou
`cost_per_kilometer` por `fuel_type` e `other_costs_per_kilometer` na lista de colunas, exige os dois
defaults e assere a ausência da coluna antiga.

```
$ bun test ./test/fleet-schema.contract.test.ts
SyntaxError: Export named 'fuelPriceReferences' not found in module '.../src/database/database.schema.ts'.
 0 pass · 1 fail · 1 error
```

Vermelho pelo motivo certo: as tabelas são de T003.

```
$ bun test ./test/database-migration.contract.test.ts
(fail) Drizzle migrations > drops the stored cost per kilometer as the single destructive step, …
  expect(received).toBeString() — Received: undefined
 36 pass · 3 skip · 1 fail
```

O contrato da migration acha o diretório **pelo sufixo** `_fuel_price_reference`, não pelo timestamp:
o nome exato só existe depois de `db:generate`, e é a lista ordenada que se ajusta ao gerado em T003.
Ali o `drop column` é reconhecido como o único passo destrutivo — a asserção conta as ocorrências
(`toHaveLength(1)`) e continua proibindo `drop table`/`index`/`type`, `delete` e `truncate`. O
rollback recria `cost_per_kilometer` **vazia**: o valor antigo era digitado, e restaurá-lo com
qualquer número seria inventar dinheiro.

## T002b — Contrato de paridade do catálogo `FUEL_TYPES`

O catálogo é cópia por valor entre três apps que não importam código umas das outras, então a
paridade não existe por construção: ela existe porque cada app repete a lista literal no próprio
contrato e assere a sua contra ela. É a mesma disciplina de
`test/companies/scheduled-distribution-parity.contract.ts` e de
`test/shared/alphanumeric-tax-id.contract.ts`.

Arquivos novos:

- `api-transportada/test/fuel-catalog/catalog.contract.ts` (+ entrypoint
  `test/fuel-catalog.contract.test.ts`, registrado no `package.json`)
- `cron-transportada/test/fuel-price-pull/catalog.contract.ts` (+ entrypoint
  `test/fuel-price-pull.contract.test.ts`, registrado no `package.json`)
- `frontend-transportada/test/shared/fuel-catalog.contract.ts` (importado por
  `test/shared.contract.test.ts`, que já roda)

```
$ bun test ./test/fuel-catalog.contract.test.ts            # api
error: Cannot find module '../../src/shared/fuel.constant.js'
 0 pass · 1 fail · 1 error

$ bun test ./test/fuel-price-pull.contract.test.ts         # cron
error: Cannot find module '../../src/fuel-price-pull/domain/fuel.constant.js'
 0 pass · 1 fail · 1 error

$ bun test ./test/shared.contract.test.ts                  # frontend
error: Cannot find module '@/modules/shared/fuel.constant'
 0 pass · 1 fail · 1 error
```

Vermelho nas três pelo motivo certo: o catálogo ainda não foi escrito.

A `unit` é atributo do produto, não coluna: o GNV é vendido em metro cúbico e os outros quatro em
litro, e é daí que a tela tira "R$/m³" e "km/m³" sem nenhum rótulo escrever "litro" literal.

O contrato da API fecha ainda a coluna `product` das duas tabelas sobre o catálogo — a contagem de
literais no `CHECK` (`toHaveLength(CATALOG.length)`) recusa tanto produto faltando quanto produto a
mais. Isso acrescenta dois checks ao DDL do `plan.md`
(`fuel_price_references_product_check`, `company_fuel_prices_product_check`), que T003 escreve
junto com `station_count >= 0` e `state ~ '^[A-Z]{2}$'`.

## T003 — tabelas, colunas e a migration com rollback

`src/shared/fuel.constant.ts` (catálogo), `src/database/fuel-reference.schema.ts`,
`src/database/company-fuel-prices.schema.ts`, ambas agregadas em `database.schema.ts`; em
`fleet.schema.ts`, `cost_per_kilometer` sai e entram `fuel_type` e `other_costs_per_kilometer`,
com `fleet_vehicles_cost_check` reescrito sobre a coluna nova e `fleet_vehicles_fuel_type_check`
fechando o combustível sobre o catálogo.

Migration gerada em `drizzle/20260815001423_fuel_price_reference/`.

```
$ bun run db:generate --name fuel_price_reference
{"status":"missing_hints","unresolved":[{"type":"rename_or_create","kind":"column",
 "entity":["public","fleet_vehicles","fuel_type"]}, ...]}
```

O gerador não sabe decidir se a coluna nova é renome da que sumiu no mesmo diff. A resposta aceita
não leva chave `decision` — é `{"type":"create","kind":"column","entity":[schema,tabela,coluna]}`:

```
$ bun run db:generate --name fuel_price_reference --hints '[{"type":"create","kind":"column",
  "entity":["public","fleet_vehicles","fuel_type"]},{"type":"create","kind":"column",
  "entity":["public","fleet_vehicles","other_costs_per_kilometer"]}]'
{"status":"ok","dialect":"postgresql",
 "migration_path":"drizzle/20260815001423_fuel_price_reference/migration.sql"}
```

**A ordem gerada não roda.** O drizzle-kit emitiu `DROP CONSTRAINT "fleet_vehicles_cost_check",
ADD CONSTRAINT ...` **depois** do `DROP COLUMN "cost_per_kilometer"` — e o Postgres já derruba
sozinho o check que cita a coluna removida:

```
PostgresError: constraint "fleet_vehicles_cost_check" of relation "fleet_vehicles" does not exist
  errno: 42704
 53 pass · 15 fail
```

Corrigido à mão para o que é explícito e independente da limpeza implícita: derrubar o check
**antes** da coluna, e recriá-lo no fim. O `rollback.sql` segue a mesma ordem ao contrário.

```
$ make migration-test
 68 pass · 0 fail · 700 expect() calls

$ bun run db:check
Everything's fine

$ bun test ./test/fuel-catalog.contract.test.ts ./test/fleet-schema.contract.test.ts \
          ./test/database-migration.contract.test.ts
 81 pass · 3 skip · 0 fail · 575 expect() calls
```

Três desvios do DDL do `plan.md`, todos deliberados:

- a PK composta chama-se `company_fuel_prices_company_id_product_pk`, não `company_fuel_prices_pkey`
  — é a convenção do repositório (`membership_roles_membership_id_role_pk`,
  `nfe_distribution_cursors_company_environment_pk`). Nenhum contrato assere o nome, só as colunas;
- checks a mais: os dois de `product` que T002b forçou, `station_count >= 0`, `state ~ '^[A-Z]{2}$'`
  e `fleet_vehicles_fuel_type_check`;
- a FK sai nomeada `company_fuel_prices_company_id_companies_id_fkey`. O sufixo é o que este
  drizzle-kit emite; o repositório tem os dois (`_fkey` em `20260722024645`, `_fk` em
  `20260811164234`), e o contrato de tenant-safety lê o nome pelo schema, não pelo SQL.

`fuel_price_references` é a segunda tabela sem `company_id` da API, depois de
`identity_user_profile`: preço da ANP é dado público de mercado, idêntico para toda empresa da
instalação. A ausência é assertada em T002, não esquecida.

**Quebra conhecida e deliberada:** sem `costPerKilometer` no schema, seis referências da API não
tipam mais — `fleet.port.ts:38`, `fleet.mapper.ts:34` e `:84`,
`drizzle-fleet-vehicle.repository.ts:122`, `vehicle-cost.policy.ts:20` e `:50`, `fleet.routes.ts:269`,
`fleet-request.schema.ts:71`. São exatamente o que T007 e T011 fecham; o frontend tem o conjunto
paralelo, que é T017. Fazer agora seria trabalho de task futura.

Os contratos do catálogo no cron e no frontend seguem vermelhos de propósito: os catálogos deles
nascem em T013 e T017.

## T004 — contrato do preço efetivo por produto

`test/companies/fuel-price-policy.contract.ts`, registrado no entrypoint
`test/companies.contract.test.ts`.

```
$ bun test ./test/companies.contract.test.ts
error: Cannot find module '../../src/companies/domain/fuel-price.policy.js'
 0 pass · 1 fail · 1 error
```

Vermelho pelo motivo certo: a policy ainda não existe.

A forma que o contrato fixa: `resolveEffectiveFuelPrices({ adjustments, references, state })` devolve
**uma entrada por produto do catálogo, na ordem do catálogo** — produto sem preço nenhum aparece com
os quatro campos nulos em vez de sumir da lista, que é o que a tela precisa para desenhar as cinco
linhas sempre.

A UF entra nos fatos porque "referência de outra UF nunca é usada" só é assertável se a policy for
quem filtra. Um caso além dos cinco pedidos pela task: quando a UF tem mais de uma semana coletada do
mesmo produto, vence a de `weekEndingOn` maior — a tabela guarda uma linha por semana, e alguém tinha
de decidir qual vale.

## T005 — a policy do preço efetivo

`src/companies/domain/fuel-price.policy.ts`.

```
$ bun test ./test/companies.contract.test.ts
 80 pass · 0 fail · 183 expect() calls
```

A UF é filtro da policy, não da query: o repositório entrega as linhas e quem recusa a referência de
outra UF é a regra, que é onde o contrato consegue alcançá-la. Entre duas semanas do mesmo produto
vence a de `weekEndingOn` maior — comparação de string ISO, que ordena igual à data.

`null` em vez de `undefined` nos quatro campos ausentes: a saída da policy é a entrada do corpo da
rota, e converter duas vezes só criaria oportunidade de divergir.

O `typecheck` da API baixou de cinco erros para três — os dois que sobravam eram do próprio contrato
de T002b (`referenceCheck` possivelmente `undefined`), corrigidos aqui. Os três restantes são a
quebra deliberada de T003, que T007 e T011 fecham.

## T006 — o contrato do R$/km derivado

`test/fleet-domain/vehicle-cost.contract.ts`.

```
$ bun test ./test/fleet-domain.contract.test.ts
SyntaxError: Export named 'deriveCostPerKilometer' not found in module
  src/fleet/domain/vehicle-cost.policy.ts
 0 pass · 1 fail
```

Vermelho pelo motivo certo: a função ainda não existe.

A tabela `ROUNDING_CASES` é a que vai literal para o contrato do frontend em T016. Dois casos dela
existem só para prender o meio-para-cima na quarta casa: `5.4802 ÷ 4,00 = 1,370050` sobe para
`1.3701`, e `5.4801 ÷ 4,00 = 1,370025` fica em `1.3700`. O caso do plano (`5.4800 ÷ 12,00` +
`0.5000` = `0.9567`) abre a lista.

A forma do retorno: `{ breakdown, total }`, com `breakdown` omitindo a parcela zerada em vez de
escrever `"0.0000"` — a ausência é a informação, e um zero ali diria que a manutenção custa zero.
Consumo `0.00` e preço ausente caem no mesmo caminho: sem parcela de combustível, o total é só a de
outros custos; as duas zeradas devolvem `null`.

`hasInformedCosts` troca `costPerKilometer` por `otherCostsPerKilometer` — um teste novo fixa que a
parcela de outros custos sozinha já conta como custo informado, que era o papel do campo antigo.

## T007 — o R$/km derivado

`src/fleet/domain/vehicle-cost.policy.ts`, ao lado de `deriveMonthlyFixedCost`.

```
$ bun test ./test/fleet-domain.contract.test.ts
 19 pass · 0 fail · 31 expect() calls
```

A divisão é inteira em `bigint`, como o resto do módulo: preço na escala 4 multiplicado por
`10^2` (a escala do consumo) e dividido pelo consumo com `divideHalfUp` devolve direto a parcela na
escala 4 — nenhum ponto flutuante no caminho.

Três portas para a mesma saída sem parcela de combustível: preço ausente, consumo `'0.00'` e consumo
que faz a divisão fechar em zero. As três devolvem `null` da parcela em vez de `'0.0000'`, e é a
composição que decide se ainda sobra total.

`FleetVehicleCostFields` perdeu `costPerKilometer` e ganhou `otherCostsPerKilometer`. O `typecheck`
da API subiu de três para quatro erros, todos na infraestrutura da frota
(`drizzle-fleet-vehicle.repository.ts` 39 e 122, `fleet.mapper.ts` 34 e 84) — o quarto é o
`FleetVehicleInput` da porta, que ainda não declara o campo novo. É o escopo de T011.

## T008 — contrato das rotas de preço de combustível

`test/companies/fuel-price.contract.ts`, com `test/fixtures/fuel-price-http.fixture.ts` sobre o
roteador e o request handler reais. Registrado no entrypoint `test/companies.contract.test.ts`.

```
$ bun test ./test/companies.contract.test.ts
 80 pass · 20 fail · 183 expect() calls
error: Cannot find module '../../src/companies/presentation/fuel-price.routes.js'
```

Vermelho pelo motivo certo: as vinte falhas são as novas, todas na ausência do módulo de rotas que
T009 cria; as oitenta que passam são as suítes que já existiam no entrypoint.

Os casos de uso do fixture são falsos mas guardam o ajuste numa tabela em memória e resolvem o preço
efetivo pela política de verdade. É o que dá dente à asserção do `DELETE`: 204 sem corpo, e o `GET`
seguinte mostra aquele produto de volta na origem `anp` com os outros quatro byte a byte iguais.

Forma fixada para T009: `GET /company-settings/fuel-prices` devolve `{data: [...]}` com os cinco
produtos do catálogo **na ordem do catálogo**, cada um com `product`, `unit`,
`effectivePricePerUnit`, `source`, `updatedAt` e `reference` — nulos quando não há preço, nunca
linha ausente. `PUT …/{produto}` responde `200` com `{data: <entrada daquele produto>}` (a resposta
é por produto porque o caminho é por produto) e `DELETE …/{produto}` responde `204` sem corpo.
Produto fora do catálogo é `400`, não `404`: o conjunto é fechado e conhecido, então o cliente
errou o pedido em vez de pedir algo que poderia existir.

O segmento do produto é slug, então a rota precisa de `pathParameterFormat: 'raw'` — no formato
padrão (`canonicalUuid`) o roteador nem casa o caminho, e o preflight do navegador responde 403
antes de a chamada existir. Os dois testes de preflight guardam isso.

## T009 — as rotas de preço de combustível

Arquivos novos, na ordem em que o request os atravessa:

- `src/companies/presentation/fuel-price.routes.ts` · `.../fuel-price.schema.ts`
- `src/companies/application/fuel-price.port.ts` · `list-fuel-prices.use-case.ts` ·
  `adjust-fuel-price.use-case.ts` · `clear-fuel-price.use-case.ts`
- `src/companies/infrastructure/drizzle-fuel-price.repository.ts`

```
$ bun test ./test/companies.contract.test.ts
 100 pass · 0 fail · 261 expect() calls

$ bun test
 2527 pass · 15 skip · 0 fail · 107 files
```

`typecheck` continua com os mesmos quatro erros da frota herdados de T003
(`drizzle-fleet-vehicle.repository.ts` 39 e 122, `fleet.mapper.ts` 34 e 84) — nenhum novo. `format`
reformatou os onze arquivos da spec; `format:check` limpo.

**Primeira execução: 95 pass · 5 fail.** O `GET` registrava `pathname: "<unmatched>"` no log e quatro
respostas construídas fora da rota (três 403 de permissão e o 500) saíam sem `cache-control`. A causa
não estava na rota: `src/http/request-path.service.ts` casa `/company-settings` por igualdade exata,
em duas listas duplicadas (`isNoStorePath` e `resolveLogPathname`), e o sub-caminho não estava em
nenhuma. As duas ganharam o caminho da coleção e o `startsWith` do sub-caminho. A suíte inteira da
API confirma que alargar não regrediu nada.

O ajuste é por produto, então o `PUT` relê os fatos depois de gravar e devolve **aquele** produto por
`resolveEffectiveFuelPrice`, novo na política ao lado do plural. A unidade sai de
`FUEL_UNIT_BY_PRODUCT`, derivado de `FUEL_TYPES` por `Object.fromEntries` — um `find` devolveria
`| undefined` e um segundo literal do catálogo é exatamente o que o contrato de paridade de T002b
existe para impedir. A releitura é o que faz a resposta trazer a referência da ANP ao lado do preço
digitado: a tela mostra as duas.

O repositório lê uma linha por produto com `selectDistinctOn([product])` ordenado por
`weekEndingOn desc` — a série da ANP acumula uma semana por vez e o histórico inteiro nunca entra em
memória. A UF vem de `companyFiscalProfiles.state`; empresa sem perfil fiscal resolve `''` e nenhuma
referência casa, que é o estado correto e não um erro.

`bun run lint` segue com seis erros em `frontend-transportada/test/shared/fuel-catalog.contract.ts` —
`FUEL_TYPES` não resolve porque `src/modules/shared/fuel.constant.ts` ainda não existe. É o vermelho
de T002B, e quem o fecha é T017.

## T010 — o veículo recusa o R$/km digitado

Arquivos tocados: `test/fixtures/fleet-http-payload.fixture.ts` (o corpo perde `costPerKilometer` e
ganha `fuelType` + `otherCostsPerKilometer`; três veículos de resposta — sem custo, com composição
completa e só com outros custos), `test/fixtures/fleet-http.fixture.ts` (parâmetro `vehicle`, para o
dublê devolver o veículo que o teste quer serializado), `test/fleet-http/vehicles.contract.ts`,
`test/fleet-http/vehicle-cost.contract.ts` e o arquivo novo
`test/fleet-infrastructure/vehicle-mapper.contract.ts`, importado por
`test/fleet-infrastructure.contract.test.ts`.

**A divisão em duas suítes é deliberada.** A fixture HTTP dubla os use cases: o que passa por ela é
parsing de request e serialização de resposta, e nada mais. "Coerente com o preço efetivo **daquele**
combustível" e "dois veículos de combustíveis diferentes derivam de preços diferentes" são junção de
registro com tabela de preços — vivem no mapeador, e é lá que o contrato as cobra, com
`mapVehicle({ fuelPrices, record })`.

```
$ bun test ./test/fleet-http.contract.test.ts ./test/fleet-infrastructure.contract.test.ts
 38 pass · 21 fail · 135 expect() calls
```

Vermelho pelos motivos certos, em três grupos:

- **13 na suíte de veículos e 4 na de custo** — `vehicleFieldsSchema` ainda exige `costPerKilometer`
  e ainda não conhece `fuelType` nem `otherCostsPerKilometer`, então todo corpo da fixture nova volta
  `400`. Inclusive os testes antigos que nada têm a ver com custo (o 409 de conflito de versão, o
  RNTRC com zero à esquerda): eles mandam o corpo padrão, e o corpo padrão mudou.
- **4 no mapeador** — `TypeError: undefined is not an object (evaluating 'record.capacityM3')`.
  `mapVehicle` ainda recebe o registro posicionalmente; o contrato o chama com objeto, porque agora
  são dois parâmetros.

Um teste **já nasce verde, e pelo motivo errado**: "refuses a costPerKilometer sent in the body"
passa hoje porque o resto do corpo é desconhecido do `strict()`, não porque o campo derivado seja
recusado. Ele vale como regressão depois de T011 — quando o corpo for válido e só o `costPerKilometer`
sobrar, é o `strict()` do campo que responde.

`format:check` limpo. `typecheck` continua com os erros herdados de T003 na frota, agora acompanhados
dos do contrato novo — todos fecham em T011, que é quem tira o campo do schema, da porta e do mapa.

## T011 — o R$/km deixa de ser digitado

O campo saiu do corpo da requisição e passou a nascer da leitura. `vehicleFieldsSchema` não aceita
mais `costPerKilometer`; `fuelType` e `otherCostsPerKilometer` entraram no lugar, e a resposta
carrega `costPerKilometer`, `costPerKilometerBreakdown` e o `fuelPrice` que sustentou a conta.

Arquivos tocados:

- `src/fleet/application/fleet.port.ts` — `FleetVehicleInput` sem o campo antigo; `FleetVehicle`
  ganhou os três derivados; e a porta nova `FleetFuelPricePort`.
- `src/fleet/infrastructure/company-fuel-price.gateway.ts` — adaptador novo: a frota não conhece o
  repositório de preços, ela pede a tabela efetiva da empresa indexada por produto, e é aqui que
  `resolveEffectiveFuelPrices` (a mesma política da tela de configurações) a resolve.
- `src/fleet/infrastructure/drizzle-fleet-vehicle.repository.ts` e
  `.../drizzle-fleet-driver-vehicle.repository.ts` — construtor virou objeto tipado (`database` +
  `fuelPrices`); o `case when` de `costsUpdatedAt` troca `costPerKilometer` por
  `otherCostsPerKilometer`.
- `src/fleet/presentation/fleet.routes.ts` — `serializeVehicle` enumera campo a campo, então os três
  derivados precisaram entrar à mão.
- `src/main.ts` — o gateway é construído uma vez e injetado nos dois repositórios de frota.
- `test/integration/fleet-vehicle-repository.integration.ts` — monta o gateway real sobre
  `DrizzleFuelPriceRepository`, para o banco descartável exercitar o `loadFacts` de verdade.

**Por que a porta devolve um mapa, e não uma lista.** `resolveByProduct` retorna
`ReadonlyMap<FuelProduct, EffectiveFuelPrice>`: o mapper precisa de busca O(1) pelo `fuelType` do
veículo, e o mapa é montado **uma vez por operação**. Na listagem ele é resolvido fora do `map` dos
registros — é o N+1 que a auditoria de T020 procura, e a forma do tipo é o que o impede, não a
disciplina de quem escreve a query.

`fuelType` ficou **de fora** do detector de mudança de `costsUpdatedAt`: ele muda o número derivado,
mas não é custo informado, e `hasInformedCosts` também o ignora — acrescentá-lo de um lado só faria
criação e atualização discordarem.

Verificação:

```
$ bun test ./test/fleet-http.contract.test.ts ./test/fleet-infrastructure.contract.test.ts
 59 pass · 0 fail · 173 expect() calls

$ bun test            # suíte inteira da api
 2536 pass · 15 skip · 0 fail · 10490 expect() calls (107 arquivos)

$ bun run --cwd apps/api-transportada lint
 limpo

$ bun run format:check
 All matched files use Prettier code style!
```

Os quatro erros de `typecheck` que T003 deixou na frota sumiram. O que resta no `typecheck` da raiz é
o vermelho combinado de T002b no cron — `test/fuel-price-pull/catalog.contract.ts` importando
`src/fuel-price-pull/domain/fuel.constant.js`, que só existe a partir de T015 — e o do frontend, que
fecha em T017.

## T012 — o contrato do parser da série da ANP

Três arquivos novos em `apps/cron-transportada/test/fuel-price-pull/`:
`anp-series.contract.ts`, `workbook.fixture.ts` e `xlsx-writer.fixture.ts`.

A fixture é a planilha **construída em TypeScript**, não o `.xlsx` de 298 KB da sondagem: um binário
versionado é opaco no diff e impossível de ajustar numa revisão. `xlsx-writer.fixture.ts` monta o ZIP
de verdade (entradas em deflate cru, CRC-32, diretório central), porque comprimir é justamente o que
o leitor do T013 tem de saber desfazer — `unzip -l` e `unzip -p` abrem o arquivo gerado.

`workbook.fixture.ts` reproduz a aba `ESTADOS` como ela é: preâmbulo nas linhas `1,2,3,6,7,8` — com
os buracos de numeração reais em 4, 5 e 9 —, a nota do S500 em `E8`, cabeçalho em `r="10"`, dados a
partir de `r="11"` e a linha estilizada vazia no fim. Vieram da sondagem os textos, os seriais
(`46243`/`46249`) e os números com ruído de float (`4.3899999999999997` do GNV de Alagoas, o
coeficiente em notação científica `4.9000000000000002E-2`); as linhas de `GASOLINA COMUM`,
`GASOLINA ADITIVADA`, `GLP` e a do Espírito Santo têm forma real e preço plausível — T000 não os
capturou.

Duas decisões do contrato que valem registro:

- **O cabeçalho é achado pelos rótulos, não pela linha.** "Cabeçalho na linha 7" do plano é a sétima
  linha _povoada_; no XML ele está em `r="10"`. Em vez de escolher uma das duas leituras, o teste
  parseia a fixture normal e a mesma fixture com uma linha de preâmbulo a mais e exige resultado
  idêntico — as duas contagens quebram, só a busca por rótulo sobrevive.
- **A aba sai do `rels`, não do índice.** No arquivo real `ESTADOS` é `rId3` → `sheet3.xml`, e um
  parser que chutasse "terceira aba = `sheet3.xml`" passaria. O teste roda a fixture uma segunda vez
  com o alvo trocado com o de `MUNICIPIOS` e exige o mesmo resultado.

A UF chega como T000 mediu — caixa alta e sem acento (`SAO PAULO`, `ESPIRITO SANTO`) — e vira sigla.
As cinco abas têm os nomes reais (`CAPITAIS`, `MUNICIPIOS`, `ESTADOS`, `REGIOES`, `BRASIL`).

Verificação — vermelho, como a task pede:

```
$ bun test ./test/fuel-price-pull/anp-series.contract.ts
error: Cannot find module '../../src/fuel-price-pull/infrastructure/anp-series.client.js'
 0 pass, 1 fail
```

⚠️ Achado no caminho: `test/fuel-price-pull.contract.test.ts` **não estava** na lista do `test` do
`package.json` do cron — o contrato de T002b nunca tinha rodado, em nenhum momento. O entrypoint foi
acrescentado; agora a suíte do cron falha nos dois módulos ausentes (`fuel.constant.js` de T013/T015
e `anp-series.client.js` de T013), que é o vermelho esperado. `lint` do cron limpo, Prettier limpo.

## T013 — o cliente da série da ANP

Nove arquivos em `apps/cron-transportada/src/fuel-price-pull/`, nenhuma dependência nova:

| Arquivo                                 | Papel                                                              |
| --------------------------------------- | ------------------------------------------------------------------ |
| `domain/fuel.constant.ts`               | cópia por valor do catálogo da API — fecha o vermelho de T002b     |
| `domain/anp-sheet.constant.ts`          | os doze rótulos literais do cabeçalho, medidos em T000             |
| `domain/anp-translation.constant.ts`    | rótulo → produto, o descarte, e as 27 UFs por extenso → sigla      |
| `domain/decimal-cell.policy.ts`         | célula nativa → `Decimal` na escala 4, meio-para-cima, em `bigint` |
| `domain/reference-week.policy.ts`       | serial Excel → data, semana domingo–sábado, caminho derivado       |
| `infrastructure/xlsx-archive.ts`        | diretório central do ZIP + `inflateRawSync`                        |
| `infrastructure/xlsx-sheet.reader.ts`   | varredura de `<row>`/`<c>` e da tabela de texto compartilhado      |
| `infrastructure/anp-workbook.reader.ts` | resolve a aba pelo `rels` e indexa a linha pelo rótulo             |
| `infrastructure/anp-series.client.ts`   | HTTP, Zod na fronteira, tradução e a série da semana               |

Quatro decisões que valem registro:

- **O preço nunca passa por `Number`.** A célula guarda o ruído do float que gerou a planilha
  (`4.3899999999999997`); `readCellDecimal` lê o texto como dígito, reduz de 16 casas para 4 em
  `bigint` com arredondamento meio-para-cima e devolve `4.3900`. `5` vira `5.0000` pelo mesmo
  caminho. A escala é a do `numeric(19,4)` da API.
- **A unidade sai do catálogo, não da coluna.** A planilha escreve `R$/l` e `R$/m³`, mas quem
  responde qual é a unidade do GNV é `FUEL_UNIT_BY_PRODUCT` — duas linhas do mesmo produto não têm
  como discordar entre si, e uma variação de grafia da ANP não derruba o ciclo.
- **Rótulo desconhecido aborta; rótulo descartado é contado.** `GASOLINA ADITIVADA` e `GLP` saem em
  `discardedRows`, porque a ausência deles é decisão nossa. Um produto ou uma UF fora do vocabulário
  medido levanta `ANP_UNKNOWN_PRODUCT` / `ANP_UNKNOWN_STATE`: é o arquivo mudando de forma, e é a
  mesma escolha do guarda de cabeçalho — falhar o ciclo deixa a referência anterior de pé, gravar
  meia série não.
- **A semana ausente morre antes do parser.** T000 mediu que a semana futura responde 404 com
  `application/json`; `readWorkbookBytes` recusa por status e por `content-type` antes de qualquer
  byte virar planilha, e a URL é derivada de `arquivos-lpc/<ano>/resumo_semanal_lpc_<domingo>_<sábado>.xlsx`.
  A base fica em configuração — T015 a coloca no bloco de env fechado por `CRON_JOB`.

Correção de T012 encontrada aqui: o filtro do teste da linha estilizada final ainda procurava
`SÃO PAULO` com acento, e a fixture já tinha sido corrigida para `SAO PAULO` — o teste passava por
um caminho que nunca teria linha nenhuma. Agora casa.

Verificação — T012 verde:

```
$ bun test ./test/fuel-price-pull.contract.test.ts
 13 pass · 0 fail · 25 expect()

$ bun run --cwd apps/cron-transportada test
 169 pass · 0 fail · 310 expect() · 8 arquivos
```

`lint` e `typecheck` do cron limpos, Prettier limpo.

## T014 — o contrato do ciclo do cron

`apps/cron-transportada/test/fuel-price-pull/run-cycle.contract.ts`, importado por
`test/fuel-price-pull.contract.test.ts`. Seis testes, um por comportamento da task:

| Teste           | O que ele fixa                                                                      |
| --------------- | ----------------------------------------------------------------------------------- |
| lock ocupado    | `acquiredLock: false`, `failedCount: 0` (código 0), coleta não roda, nada a liberar |
| gravação        | uma referência por par, chave natural completa, lock liberado no `finally`          |
| semana repetida | gateway devolve `insertedCount: 0` → `skippedCount` igual ao total, nada escrito    |
| falha da coleta | `failedCount: 1` (código 1) e **`insertMissing` nunca chamado**                     |
| agregação       | média ponderada por número de postos e soma da contagem                             |
| produto ausente | `GLP` conta em `discardedRows` e o diesel é gravado assim mesmo                     |

Decisões que o contrato fixa, e por quê:

- **A falha da coleta não chega ao gateway.** A semana só é escrita depois da planilha inteira
  parseada; é isso que deixa a referência anterior de pé quando a ANP muda de layout ou some.
- **A agregação é média ponderada pelo número de postos**, não média das médias: cada linha da ANP
  já é uma média sobre os postos dela, e somar sem peso daria à UF de um posto o mesmo peso da de
  oitocentos. É aritmética, não regra legal. Na planilha real o par `(produto, UF)` vem uma vez só e
  a agregação degenera em cópia — ela existe para o dia em que não vier.
- **O arredondamento continua em `bigint`, meia-para-cima, na escala 4**: 3 postos a `5.0000` e 1 a
  `5.0010` fecham em `5.0003`, não em `5.0002`.
- **O código de saída sai de `failedCount`**, como em `main.ts` — o contrato assere a contagem, não
  o `process.exit`, para não duplicar a regra do runtime.

Verificação — vermelho pelo motivo certo (o ciclo ainda não existe):

```
$ bun test ./test/fuel-price-pull.contract.test.ts
error: Cannot find module '../../src/fuel-price-pull/application/pull-fuel-reference.use-case.js'
 0 pass · 1 fail
```

## T015 — o trilho `fuel.price.pull` de pé

Arquivos criados em `apps/cron-transportada/`:

| Arquivo                                                                | Papel                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------- |
| `src/fuel-price-pull/domain/fuel-price-pull.constant.ts`               | `FUEL_PRICE_PULL_JOB`                             |
| `src/fuel-price-pull/domain/fuel-reference.policy.ts`                  | agregação ponderada em `bigint`, escala 4         |
| `src/fuel-price-pull/application/fuel-series.port.ts`                  | contrato da coleta semanal                        |
| `src/fuel-price-pull/application/fuel-reference.port.ts`               | contrato da gravação (`insertMissing`)            |
| `src/fuel-price-pull/application/pull-fuel-reference.use-case.ts`      | semana → planilha → agregação → gravação          |
| `src/fuel-price-pull/application/run-cycle.ts`                         | lock, `CronCycleResult`, `finally` que libera     |
| `src/fuel-price-pull/infrastructure/drizzle-fuel-reference.gateway.ts` | `onConflictDoNothing` na chave natural            |
| `src/fuel-price-pull/fuel-price-pull.job.ts`                           | composição do ciclo                               |
| `src/database/fuel-reference.schema.ts`                                | cópia por valor, reduzida ao que a coleta escreve |

Quatro pontos de ligação, os mesmos de todo job novo: `config/cron.constant.ts` (`CRON_JOBS`),
`job-registry.ts` (`JOB_REGISTRY`), `config/cron.types.ts` (`CronFuelPricePullEnvironment`) e
`config/environment.schema.ts` (`ANP_BASE_URL`, `ANP_TIMEOUT_MS` + `resolveFuelPricePullEnvironment`).

Decisões desta task:

- **`anp-series.client.ts` virou adaptador da porta, não um tipo paralelo.** `AnpSeriesClient` é
  `FuelSeriesPort` por alias, e os tipos antigos continuam exportados — nenhum import de teste
  quebrou e não sobrou um segundo contrato para divergir.
- **O `advisory lock` é reutilizado, não copiado**: `createDrizzleAdvisoryLock` do trilho de
  distribuição, chave `cron:fuel.price.pull`. Lock ocupado não libera nada e sai com código 0.
- **O bloco de env é gated por `CRON_JOB`**, como o de NFS-e: o deploy da busca de notas e o de
  NFS-e continuam subindo sem `ANP_BASE_URL`; o de preço falha no boot sem ela. Preço de combustível
  é dado público — aqui não há segredo, só endereço e tempo de espera.
- **Linha publicada com zero postos entra com peso 1**, em vez de sumir da média ou dividir por zero.

`.env.example` ganhou o bloco da ANP. O endereço foi conferido vivo antes de entrar no arquivo:

```
$ curl -s -o /dev/null -w '%{http_code} %{size_download}' \
    https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos
200 298388
```

Verificação:

```
$ bun run --cwd apps/cron-transportada typecheck   # limpo
$ bun run --cwd apps/cron-transportada lint        # limpo
$ bun run --cwd apps/cron-transportada test
 175 pass · 0 fail · 328 expect() · 8 arquivos

$ bun test --cwd apps/api-transportada test/env-example.contract.test.ts
 2 pass · 0 fail
```

## T016 — os contratos de tela do custo derivado

Três arquivos, um por pergunta que a tela precisa responder:

- **`test/fleet/vehicle-cost.contract.ts`** — a tabela de arredondamento de T006 reescrita sobre o
  espelho do frontend: preço ÷ consumo fecha na quarta casa **antes** de somar os outros custos, e é
  esse último dígito que o operador confere contra a planilha. Cobre também a parcela zero fora da
  composição, `VEHICLE_COST_FIELD_SCALE` sem a chave do total, e `summarizeTypedVehicleCosts` com
  valor pela metade (`'2,'`) sem derrubar a tela.
- **`test/fleet/fuel-unit.contract.ts`** — trocar o combustível para `gnv` troca o rótulo do consumo
  e o do preço para m³. O que o contrato fixa é o **par de chaves** (`consumptionByUnit.*`,
  `fuelPriceByUnit.*`), resolvido por `resolveFuelLabelKeys`, e a existência dos dois rótulos nos
  dois dicionários — rótulo fixo põe o número certo debaixo da unidade errada.
- **`test/fleet/screen-standards.contract.ts`** — o campo editável de R$/km **total** sai, o de
  outros custos entra como opcional, o combustível é `FleetSelectField` alimentado por
  `FUEL_PRODUCTS`, e o resumo mostra composição, combustível, origem e semana. O teste antigo de
  `summarizeTypedVehicleCosts` saiu daqui: ele agora mora no contrato do custo, com a assinatura nova.

Os dois arquivos novos entraram na lista explícita de `test/fleet.contract.test.ts` — teste que não
está no entrypoint não roda.

Verificação — **vermelho, como a task pede**:

```
$ bun test --cwd apps/frontend-transportada test/fleet.contract.test.ts
 69 pass · 27 fail

fleet vehicle cost per kilometer contract   7 fail   (deriveCostPerKilometer ainda não existe)
fleet fuel unit contract                    4 fail   (resolveFuelLabelKeys ainda não existe)
fleet screen standards contract             3 fail   (o R$/km ainda é <input> editável)
fleet vehicle cost fields contract          5 fail   (fixture já sem costPerKilometer de entrada)
fleet client / driver vehicles / …          8 fail   (mesma fixture, DTO novo)

$ bun test --cwd apps/frontend-transportada test/shared.contract.test.ts
 1 fail   Cannot find module '@/modules/shared/fuel.constant'
```

## T017 — o R$/km derivado no cadastro do veículo

O total deixou de ser campo. `deriveCostPerKilometer` em `fleetVehicleCost.service.ts` é o espelho da
regra do domínio da API: preço do combustível ÷ consumo fecha na quarta casa **antes** de somar os
outros custos, e a parcela zerada fica fora da composição — `'0.0000'` ali diria custo zero, e o que
houve foi não informar. `VEHICLE_COST_FIELD_SCALE` perdeu `costPerKilometer` e ganhou
`otherCostsPerKilometer` em 4/4: escala de campo para um derivado seria promessa de edição.

Na tela, o `<input>` do total saiu; entraram o `FleetSelectField` de combustível — logo antes do
consumo, porque "diesel S10, 2,5 km/l" é uma frase só — e o `FleetField` opcional de outros custos. O
resumo passou de duas para cinco linhas: custo fixo mensal, R$/km total, parcela do combustível,
parcela de outros custos e o preço da referência com a origem (`Referência ANP` / `Ajuste da
transportadora`) e a semana encerrada.

Três decisões que o contrato não pedia e a tela exigia:

- **O rótulo do consumo e o do preço saem da unidade do produto**, por `resolveFuelLabelKeys` —
  `km/m³` e `R$/m³` para o GNV. Rótulo fixo põe o número certo debaixo da unidade errada.
- **O preço vem do detalhe do veículo, não do endpoint de configurações.** `GET
/company-settings/fuel-prices` exige `settings.manage`; o formulário da frota só tem
  `fleet.manage`. O `fuelPrice` que a API já serializa no veículo é a fonte.
- **`resolveFormFuelPrice` devolve o preço só enquanto o combustível escolhido é o salvo.** Trocar o
  combustível na tela sem salvar deixaria o R$/km sendo calculado com o preço do produto anterior —
  número certo para a pergunta errada.

Os contratos anteriores a 038 foram reconciliados, não duplicados: `vehicle-cost-fields.contract.ts`
perdeu o teste de resumo (agora em `vehicle-cost.contract.ts`, com a assinatura nova) e passou a ler
`otherCostsPerKilometer` e `fuelType` onde lia o total digitado.

Verificação — **T016 verde**:

```
$ bun run --cwd apps/frontend-transportada typecheck
tsc --noEmit — sem erro

$ bun run --cwd apps/frontend-transportada test
 1240 pass · 0 fail · 6446 expect() calls — 18 arquivos

$ bun run --cwd apps/frontend-transportada lint
eslint . — exit 0

$ bun run format:check
All matched files use Prettier code style!
```

## T018 — o preço do combustível em `company-settings`

Contrato antes da implementação: `test/company-settings/fuel-prices.contract.ts`, importado pelo
entrypoint `test/company-settings.contract.test.ts` (já na lista literal do `package.json`). Primeira
execução vermelha — `168 pass · 15 fail`, todas por módulo e chave de tradução inexistentes.

Quatro arquivos novos e um estendido:

- `shared/fuelPrice.validation.ts` — guardas que espelham o serializador da API. A unidade não é
  aceita solta: ela tem de ser a do produto (`FUEL_UNIT_BY_PRODUCT`), senão a linha é recusada.
- `shared/fuelPrice.service.ts` — `toFuelPricePerUnit` normaliza vírgula e ponto para as quatro
  casas da ANP, com arredondamento meio-para-cima em `BigInt` (nada de float em dinheiro), e
  `formatFuelPricePerUnit` formata em BRL.
- `hooks/useFuelPrices.hook.ts` — leitura, ajuste e limpeza.
- `components/FuelPricePanel.component.tsx` — **uma linha por combustível**, tirada de
  `FUEL_PRODUCTS`, não da resposta: produto sem preço ainda ganha a sua linha em vez de sumir.
- `shared/companySettingsClient.service.ts` — `getFuelPrices`, `adjustFuelPrice`, `clearFuelPrice`.

Duas decisões que o contrato não pedia:

- **A limpeza não passa pelo `requestJson`.** O `DELETE` responde `204` sem corpo, e pedir JSON ali
  transformaria sucesso em `COMPANY_SETTINGS_RESPONSE_INVALID` — sucesso lido como erro de formato.
- **Ajustar corrige a linha no cache; limpar invalida a consulta.** O `PUT` devolve a entrada nova e
  ela substitui a linha do produto; o `DELETE` não devolve nada, e só a releitura sabe qual preço da
  ANP voltou a valer.

A linha só mostra "Limpar ajuste" quando `source === 'manual'` — não há o que limpar numa linha que
já está na referência da ANP. Campo, ícone e esqueleto vêm do design system; os contratos de
`<svg>` cru, `<select>` nativo e `<input type="checkbox">` seguem verdes.

Verificação — **T018 verde**:

```
$ bun run --cwd apps/frontend-transportada test
 1255 pass · 0 fail · 6542 expect() calls — 18 arquivos

$ bun run --cwd apps/frontend-transportada typecheck
tsc --noEmit — sem erro

$ bun run --cwd apps/frontend-transportada lint
eslint . — exit 0

$ bun run --cwd apps/frontend-transportada build
vite build + generateSW — 12 entradas em precache

$ bun run format:check
All matched files use Prettier code style!
```

## T019 — o serviço `cron-fuel` no pipeline

Contrato primeiro: `cron-fuel` entrou em `INTERNAL_SERVICES` de
`test/deploy/service-naming.contract.ts` e o passo entrou em `.github/workflows/deploy.yml`. A
execução seguinte ficou vermelha pelo motivo certo — o pipeline endereçava um serviço que a tabela de
build de `docs/spec/railway.md` não declarava:

```
Expected to contain: "cron-fuel"
Received: Set(7) { "api", "worker", "cron", "cron-nfse", "cron-notifications", … }
 76 pass · 1 fail
```

**A janela resolveu o `[NEEDS CLARIFICATION]` da spec, e não por preferência.** `0 9 * * 6` —
sábado, 09:00 UTC, 06:00 no Brasil. A semana da ANP vai de domingo a sábado e **dá nome ao
arquivo**; `resolveReferenceWeek` deriva a URL da semana que contém o dia de hoje. No sábado, isso é
a semana que fecha naquele mesmo dia, publicada na sexta anterior (ADR-0033: semana de 09/08 a
15/08, no ar em 14/08). No domingo, seria a semana que **acabou de começar** — arquivo que só existe
seis dias depois, 404 a cada ciclo. Domingo não era a outra opção; era a opção quebrada.

**Este cron sobe nos dois ambientes**, diferente de `cron-nfse`, que é production-only por ADR-0035.
A referência da ANP é dado público de mercado: sem certificado, sem tenant e sem efeito fiscal.
Staging coletando a mesma semana é o que faz o R$/km derivado ter número para mostrar antes de
production existir.

`docs/spec/railway.md` ganhou a linha na tabela de build, o bloco do serviço, o serviço na lista do
ambiente, a ordem de deploy corrigida (os três crons estavam de fora) e `cron-fuel` na frase de
serviço interno sem domínio. O par serviço/ambiente do config-as-code passou de doze para dezesseis.

Verificação — **T019 verde**:

```
$ bun test ./apps/api-transportada/test/deploy.contract.test.ts
 77 pass · 0 fail · 298 expect() calls

$ bun run format:check
All matched files use Prettier code style!
```

⚠️ O deploy em si continua pendente da janela semanal: o serviço `cron-fuel` precisa ser criado no
dashboard da Railway com `RAILWAY_DOCKERFILE_PATH`, o config-as-code apontando para
`deploy/cron-fuel/railway.json` e `CRON_JOB=fuel.price.pull`. Enquanto o par não existir, o passo do
pipeline falha por serviço inexistente.

## T020 — gates e auditoria de go-live

### Os gates

```
$ make check
[exited with code 0]   # format:check → lint → typecheck → test → build, nas quatro apps

  api-transportada       2536 pass · 15 skip · 0 fail · 10494 expect() — 107 arquivos
  worker-transportada     449 pass ·  0 fail — 59 arquivos
  cron-transportada       175 pass ·  0 fail —  8 arquivos
  frontend-transportada  1255 pass ·  0 fail — 18 arquivos

$ make migration-test
 70 pass · 0 fail · 703 expect() — 6 arquivos
```

`migration-test` é o gate que importa nesta feature: a migration desta spec tem o único passo
destrutivo do repositório (`drop column cost_per_kilometer`), e o que ele exercita é migration **e**
rollback em Postgres descartável.

### N+1 na listagem de veículos — **não existe**

`DrizzleFleetVehicleRepository.list` resolve o preço **uma vez por página**, não por linha:

```ts
const pageRecords = records.slice(0, input.limit)
const fuelPrices = await this.resolvePrices(input.companyId)   // uma leitura
return { items: pageRecords.map((record) => mapVehicle({ fuelPrices, record })), … }
```

`mapVehicle` recebe o mapa pronto e só faz `fuelPrices.get(record.fuelType)` — busca em memória.
Abaixo, `CompanyFuelPriceGateway.resolveByProduct` chama `loadFacts`, que são **três** consultas
constantes (UF da empresa, ajustes, referências), paralelizadas no que dá:

```ts
const state = await this.resolveState(input.companyId)
const [adjustments, references] = await Promise.all([…])
```

Três consultas para uma página de 20 veículos ou de 200 — o custo não anda com o tamanho da página.
`listLiveLinks`, no repositório de vínculos motorista/veículo, segue o mesmo desenho.

### Log sem PII e sem corpo de planilha

O trilho da ANP não loga nada nas fronteiras: `anp-series.client.ts`, `anp-workbook.reader.ts` e as
rotas de preço da API não têm uma chamada de logger sequer. O que existe são três logs de ciclo, e
todos carregam **contagem e semana**, nunca conteúdo:

- `cron_cycle_lock_not_acquired` — `{ lockKey }`
- `fuel_reference_pull_completed` — `{ discardedRows, insertedCount, referenceCount, weekEndingOn }`
- `cron_cycle_fuel_reference_pull_failed` — `{ correlationId, error.message }`

O `error.message` ali é seguro porque **nenhum erro do trilho é interpolado**: `ANP_MALFORMED_ROW`,
`ANP_UNKNOWN_PRODUCT`, `ANP_UNKNOWN_STATE`, `ANP_EMPTY_SHEET`, `ANP_WEEK_UNAVAILABLE` e
`ANP_UNEXPECTED_STATUS` são literais — a linha que quebrou o parser não viaja dentro da mensagem.
Vale notar que a planilha da ANP é dado público de mercado: não tem pessoa, não tem tenant e não tem
documento fiscal. O risco aqui não era PII, era despejar quilobytes de planilha no log.

### 500 sem stack trace

O caminho do erro desconhecido em `http/response.service.ts` responde com código constante,
`correlationId` e mensagem fixa — nada do erro real atravessa:

```ts
safeLogError({
  logger,
  message: 'http_request_failed',
  metadata: { correlationId, ...describeErrorForLog(error) },
})
return jsonResponse({
  body: {
    error: { code: HTTP_ERROR.internal.code, correlationId, message: HTTP_ERROR.internal.message },
  },
  status: HTTP_ERROR.internal.status,
})
```

E o próprio log é descrito, não despejado: `describeErrorForLog` extrai `errorName`, `sqlState` e
`constraint` — "nunca a mensagem, o stack ou parâmetro de query", como o comentário do arquivo já
dizia. O `correlationId` é o que liga a resposta ao log, e é o único fio entre os dois.

## T021 — documentação viva

`CLAUDE.md` atualizado em cinco pontos:

1. **A contagem de jobs do cron estava errada por dois, não por um.** O texto dizia "Dois jobs" e
   listava `nfe.distribution.pull` e `nfse.status.pull`; o `job-registry.ts` tem quatro —
   `notification.schedules.run` já tinha entrado sem passar pela documentação. Agora são quatro,
   descritos, com `fuel.price.pull` explicando a janela de sábado (`0 9 * * 6`), o motivo dela (a
   semana da ANP dá nome ao arquivo) e a chave natural que torna reexecução idempotente.
2. **`fuel_price_references` como exceção declarada de tenant**, na seção da API: é a única tabela do
   produto sem `company_id`, porque a publicação da ANP é dado público de mercado — e
   `test/fleet-schema/tenant-safety.contract.ts` a lista nominalmente, de modo que sumir da lista
   volta a cobrar o tenant.
3. **`costPerKilometer` como campo derivado**, ao lado de `monthlyFixedCost`, com a nota de que a
   coluna homônima não existe mais e de que o que o veículo persiste é `fuelType` e
   `otherCostsPerKilometer` — mais o `strict()` que recusa o campo derivado no corpo.
4. **`FUEL_TYPES` na lista de cópias por valor**, junto da política de elegibilidade da distribuição
   e das cópias do trilho de NFS-e, nomeando os três arquivos, os três contratos que guardam a
   paridade e a razão de a unidade ser atributo do produto.
5. Ajustes de contagem e de inventário que a feature invalidou: o cron passou a ter **nove** cópias
   de schema (entrou `fuel-reference.schema.ts`), a linha da árvore de pastas deixou de descrever o
   cron como "busca automática de NF-e", e `fleet` entrou na lista de módulos da API — ele já
   existia e nunca tinha sido listado.

`docs/SECURITY.md` **não recebeu nada**: a auditoria de T020 não levantou achado. O trilho da ANP não
tem PII para vazar (planilha pública, sem pessoa e sem tenant), não loga corpo de arquivo, e o
caminho de 500 já respondia com código constante e `correlationId`.

```
$ make check
[exited with code 0]
```

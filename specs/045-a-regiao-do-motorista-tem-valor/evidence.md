# 045 — Evidência

## T001 — Contrato da zona acumulativa

`test/freight-regions-domain/coverage.contract.ts` escrito antes da regra. Vermelho registrado:

```
error: Cannot find module '../../src/freight-regions/domain/region-coverage.policy.js'
```

## T002 — `region-coverage.policy.ts`

```
$ bun test ./test/freight-regions-domain.contract.test.ts
7 pass · 0 fail · 26 expect() calls
```

Entrypoint `test/freight-regions-domain.contract.test.ts` registrado no `test` do
`apps/api-transportada/package.json` — sem isso a suíte não roda.

## T003 — Schema e migration

Aceite do contrato escrito antes do `rollback.sql`; vermelho pelo motivo certo:

```
ENOENT: .../drizzle/20260820000830_freight_regions_and_vehicle_freight_class/rollback.sql
(fail) versions the freight regions and the vehicle freight class as an additive migration with a guarded rollback
```

Depois de escrever o caminho de volta:

```
$ make migration-test
73 pass · 0 fail · 783 expect() calls (6 arquivos, Postgres descartável)

$ bun run --cwd apps/api-transportada test
2626 pass · 15 skip · 0 fail · 10812 expect() calls (108 arquivos)

$ bun run typecheck   # verde
$ bun run lint        # verde
```

O que a migration faz, e por quê:

- Cria `freight_regions`, `freight_region_cities`, `freight_region_driver_rates` e
  `fleet_driver_regions`, todas com FK de `company_id` para `companies`.
- `freight_regions_company_id_code_unique` é a chave natural da importação: reimportar a tabela do
  cliente atualiza, nunca duplica rota.
- A cidade é única em `(company_id, region_id, city, state)` e **não** em `(company_id, city)` —
  BARRINHA/SP aparece em `1.000` (Barretos) e em `5.000` (Jaboticabal) na tabela real, com preços
  diferentes; a unicidade por cidade recusaria a importação na segunda linha.
- `fleet_vehicles.freight_class` nasce preenchida pelo rodado onde as duas tabelas coincidem
  (`01→truck`, `02→toco`, `04→van`, `05→utility`) e fica vazia em `03` e `06` — é onde o VUC e o 3/4
  se escondem hoje, e escolher por eles poria valor de pagamento errado no cadastro sem ninguém
  saber. Nada de `07`/`08` no `tipoRodado`: o código é da SEFAZ e vai para dentro do MDF-e.
- `rollback.sql` derruba filho antes de pai, sem `CASCADE`, e exige exatamente uma linha no diário
  de migrations.

## T004 — Contrato de tenant

`test/freight-regions-schema/tenant-safety.contract.ts` (6 testes · 17 `expect()`), entrypoint
`test/freight-regions-schema.contract.test.ts` registrado no `test` do `package.json`.

O que ele prova, e o que ele recusa:

- As quatro tabelas novas têm `company_id` com FK para `companies` — a coluna existir não basta,
  sem a FK o tenant é texto solto.
- Os três filhos amarram no par `(region_id, company_id) → (id, company_id)`, não só em `region_id`:
  é isso que impede uma cidade de uma empresa apontar para a rota de outra. `fleet_driver_regions`
  usa `restrict` (região com motorista atendendo não some por acidente), cidades e valores usam
  `cascade` (são partes da rota, não vida própria).
- A unicidade da cidade é `['company_id','region_id','city','state']`, e o contrato **também**
  afirma que nenhuma unique é `['company_id','city']` — a regra negativa é a que BARRINHA/SP quebra.

O contrato lê o schema Drizzle, então remover o filtro de `company_id` de uma query não o derruba;
quem guarda a query é `test/database-migration/freight-region-constraints.assertion.ts`, que insere
contra Postgres de verdade e exige `23503` quando a cidade aponta para a região de outro tenant.

## T005 — Repositórios Drizzle

Contrato escrito antes da implementação; vermelho pelo motivo certo:

```
error: Cannot find module '../../src/freight-regions/infrastructure/drizzle-fleet-driver-region.repository.js'
0 pass · 1 fail
```

Depois de escrever os dois repositórios:

```
$ bun test ./test/integration/freight-region-repository.integration.ts
9 pass · 0 fail · 21 expect() calls   (Postgres descartável, migrations aplicadas por ciclo)

$ bun run --cwd apps/api-transportada test
2632 pass · 15 skip · 0 fail · 10829 expect() calls (109 arquivos)

$ bun run typecheck   # verde
$ bun run lint        # verde
```

Entrypoint `test/integration/freight-region-repository.integration.ts` acrescentado ao
`test:integration` do `package.json` — sem isso ele não roda no gate.

O aceite da task é "uma consulta por página, nunca por linha", e o problema é que o corpo devolvido
é **idêntico** dos dois jeitos: um `await` dentro do `map` passa em qualquer asserção de conteúdo.
Por isso o teste conta as consultas — envolve o `db` do drizzle num `Proxy` que soma cada `select`
e afirma **três** para uma página de três rotas (rotas, cidades, valores) e **uma** para a cobertura
do motorista. Com 84 cidades na tabela do cliente, a regressão custaria centenas de idas ao banco
sem mudar uma linha da tela.

Decisões que o contrato fixa:

- A zona sai do código impresso dentro do mapper (`toRegionColumns`), nunca do corpo da requisição:
  aceitá-la digitada deixaria uma rota `1.002` nascer como zona 1, válida para todas as constraints
  e errada no preço.
- Cidade é dobrada na escrita (`normalizeRegionCity` + UF em caixa alta), então `" barrinha "` e
  `"BARRINHA"` são a mesma linha — e a unicidade por `(company_id, region_id, city, state)` continua
  deixando BARRINHA/SP existir nas duas rotas.
- `update` **substitui** cidades e valores: o que saiu da tabela do cliente deixa de valer no mesmo
  passo, e a versão otimista recusa a escrita de quem leu a tela antes.
- `listByDriver` junta `freight_regions` na mesma consulta e devolve zona inteira e cidade solta na
  mesma lista, com código e nome da rota — foi o que o usuário pediu, e duas listagens separadas
  dariam duas verdades para a mesma pergunta.
- `listExistingRegionIds` responde quais ids são desta empresa em vez de deixar o `23503` da FK
  virar 500: cobertura apontando para rota de outro tenant é 422 de fronteira, não defeito nosso.

## T006 — Rotas de região

Vermelho antes da implementação:

```
$ bun test ./test/freight-regions-http.contract.test.ts
0 pass · 12 fail
error: Cannot find module '../../src/freight-regions/presentation/freight-region.routes.js'
```

Depois de escrever schema, use case e rotas:

```
$ bun test ./test/freight-regions-http.contract.test.ts
12 pass · 0 fail · 33 expect() calls

$ bun run --cwd apps/api-transportada test
2648 pass · 15 skip · 1 fail · 10867 expect() calls (110 arquivos)

$ bun run typecheck   # verde
$ bun run lint        # verde
```

⚠️ A única falha da suíte é `test/database-migration/static-migration.contract.ts:54` e **não é
desta task**: a lista fixa de migrations não conhece `20260820002947_fleet_driver_address_and_dates`,
migration ainda não versionada do trabalho em curso de endereço/datas do motorista. Nenhum arquivo
de T006 aparece nesse contrato.

Entrypoint `test/freight-regions-http.contract.test.ts` acrescentado ao `test` do `package.json` —
sem isso ele não roda no gate.

Decisões que o contrato fixa:

- **`GET` é `fleet.read`, escrita é `settings.manage`.** A tabela de rotas é cadastro de
  configuração, mas quem preenche a cobertura do motorista é o `operator`, que não tem
  `settings.manage`: uma leitura sob a permissão de configuração entregaria um campo de região
  permanentemente vazio para quem mais precisa dele. O contrato de autorização prova os dois lados
  com um contexto que só tem `fleet.read`/`fleet.manage`.
- **`PUT`, não `PATCH`.** Cidades e valores são substituídos inteiros pelo repositório; cidade
  retirada da tabela do cliente tem de deixar de valer no mesmo passo, e o vocabulário de `PATCH`
  descreveria outra coisa.
- **A zona não entra no corpo.** `strict()` recusa `zone`, e o mapper a deriva do código impresso —
  uma rota `1.002` cadastrada como zona 1 não contradiz constraint nenhuma e passaria a valer como
  preço.
- **Cidade repetida e classe repetida são 400, não 500.** As duas unicidades do banco
  (`freight_region_cities_region_city_unique`,
  `freight_region_driver_rates_region_class_unique`) ganharam `refine` na fronteira, com a mesma
  dobra da escrita — `'  barretos '/'sp'` colide com `'Barretos'/'SP'` antes de chegar ao Postgres.
- **UF é normalizada antes de ser validada** (`transform` e só então `refine`): a planilha do
  cliente traz `sp` em caixa baixa, e recusá-la seria recusar pelo motivo errado.
- Dinheiro entra com quatro casas obrigatórias (`812.4500`); `'1086.12'` é 400.

## T007 — Cobertura do motorista

Vermelho antes da implementação:

```
$ bun test ./test/fleet-driver-regions-http.contract.test.ts
0 pass · 13 fail
error: Cannot find module '../../src/freight-regions/presentation/fleet-driver-region.routes.js'
```

Depois de escrever a política, o schema, o caso de uso e as rotas:

```
$ bun test ./test/fleet-driver-regions-http.contract.test.ts
13 pass · 0 fail · 31 expect() calls

$ bun run --cwd apps/api-transportada test
2661 pass · 15 skip · 1 fail · 10898 expect() calls (111 arquivos)

$ bun run typecheck   # verde
$ bun run lint        # verde
$ bun run format      # reescreveu três arquivos do T006 que tinham escapado do prettier
```

⚠️ A falha continua sendo a mesma de T006 — `test/database-migration/static-migration.contract.ts`
sem `20260820002947_fleet_driver_address_and_dates`, migration ainda não versionada de outro
trabalho. Nada de T007 entra nesse contrato.

Decisões que o contrato fixa:

- **Cobertura é dado da frota, não da tabela de preços.** Ler é `fleet.read`, escrever é
  `fleet.manage`, e `settings.manage` não entra: quem cadastra motorista atribui onde ele roda; quem
  muda o valor da rota é que precisa da permissão de configuração. O contrato prova os dois lados
  com um contexto que só tem `fleet.read`.
- **As duas metades do CHECK `fleet_driver_regions_city_check` são ditas na fronteira, com código
  próprio cada uma.** Cidade sem cidade é `FLEET_DRIVER_REGION_CITY_REQUIRED`; zona carregando
  cidade é `FLEET_DRIVER_REGION_CITY_UNEXPECTED`. Deixar o `23514` do Postgres chegar viraria 500
  genérico, sem dizer qual das duas linhas está errada. Por isso cidade e UF são **opcionais no
  Zod** e obrigatórias na política: exigi-las no schema devolveria o 400 genérico e perderia o
  código.
- **Zona com cidade é recusa, não faxina.** O mapper apaga a cidade da linha de zona porque o banco
  exige, mas aceitar o corpo e apagar em silêncio guardaria uma cobertura diferente da que o
  operador pediu.
- **`PUT` substitui a cobertura inteira**, e lista vazia é operação legítima: motorista que deixou
  de rodar em qualquer rota é lista vazia, não rota ausente.
- **Motorista de outra empresa é 404 (`FLEET_DRIVER_NOT_FOUND`) e rota de outra empresa é 422
  (`FREIGHT_REGION_UNKNOWN`)** — as duas perguntadas antes da escrita, senão as FKs devolveriam
  `23503` como 500 e o vazamento de tenant viraria defeito nosso.
- O caso de uso conhece a frota por uma porta de uma pergunta só (`FleetDriverExistencePort`), não
  pelo repositório inteiro de motoristas: o módulo de regiões não precisa saber o que é um motorista
  para saber se ele existe.
- Identificador de motorista fora do uuid canônico **não casa rota** (404): é o roteador que
  recusa, antes de qualquer parse — o contrato registra isso para ninguém "consertar" para 400.

## T008 — Classe de frete no veículo

```
$ bun test ./test/fleet-http.contract.test.ts
49 pass · 0 fail · 159 expect() calls

$ bun run --cwd apps/api-transportada test
2663 pass · 15 skip · 1 fail · 10908 expect() calls (111 arquivos)

$ bun run typecheck   # verde
$ bun run format      # verde
```

⚠️ A falha é a mesma de T006 e T007 — `test/database-migration/static-migration.contract.ts` sem
`20260820002947_fleet_driver_address_and_dates`, migration ainda não versionada de outro trabalho.
`bun run lint` também acusa um erro fora desta feature, em
`frontend-transportada/src/modules/fleet/shared/driverAddress.service.ts`, arquivo **não rastreado**
do mesmo trabalho pendente. Nada de T008 entra em nenhum dos dois.

Esta task **não mudou `src/`**: a coluna `fleet_vehicles.freight_class`, o campo na porta, o mapper,
o `serializeVehicle` e o `z.literal('').or(z.enum(FREIGHT_VEHICLE_CLASSES))` do schema de request já
tinham nascido no T003, junto da migration. O que faltava era a prova de fronteira — e ela é o que
impede alguém de tirar o campo do corpo achando que ele é derivado do rodado.

Decisões que o contrato fixa:

- **Classe de frete não é `tipoRodado`.** A tabela da SEFAZ não tem VUC nem 3/4, e é exatamente aí
  que os dois se separam: o rodado descreve o veículo para o fisco, a classe casa o veículo com a
  coluna da tabela do cliente. O teste percorre criar → atualizar → listar com `vuc` e
  `three_quarter`, nenhum dos dois expressável em rodado.
- **Vazio é valor legítimo, e não é "não informado".** Cavalo mecânico e "Outros" não têm classe na
  tabela do cliente; obrigar o campo faria a tela inventar uma. A sugestão pelo rodado é do
  frontend (T012) — a API aceita `''` e não corrige ninguém.
- **Classe fora da tabela é 400 e não chega ao caso de uso.** `carreta` parece plausível e não é uma
  das colunas; o contrato prova que o `createVehicleCalls` fica vazio, senão a recusa seria só do
  banco, tarde e como 500.
- **A atualização é `PATCH`.** O `tasks.md` dizia `PUT`; o roteador não casa método trocado e
  devolveria 404. Corrigido no texto da task para o T012 não sair procurando uma rota que não existe.

## T009 — Importação da tabela do cliente

Vermelho antes: `bun test ./test/freight-regions-import.contract.test.ts` falhou com
`Cannot find module '.../freight-region-csv.parser.js'` antes da implementação existir.

Verde depois: 19 testes de `freight-regions-import` (parser + caso de uso), 18 de
`freight-regions-http` (a importação entrou na suíte que já existia), 10 de
`freight-region-repository.integration` com Postgres descartável, e a suíte inteira da API em
2689 pass / 0 fail.

Quatro decisões que o aceite não pedia e o arquivo do cliente cobrou:

1. **O resumo mede mudança, não passagem.** Reimportar o mesmo arquivo devolve
   `{created: 0, deactivated: 0, updated: 0}` e não escreve nada — nem sobe versão. O aceite
   literal (`created: 0`) passaria com 29 updates cegos, e cada um deles é uma versão nova numa
   tabela que a tela mostra por data de alteração.
2. **Arquivo de rotas vazio é recusado**, não é "a transportadora parou de atender tudo". Sem essa
   guarda, um upload trocado inativaria as 29 rotas e deixaria todo motorista ligado a rota morta.
   A checagem vem **antes** da leitura de valores: com a lista vazia todo valor é órfão, e
   "código sem rota" seria uma verdade que esconde a que importa.
3. **Zero não vira valor.** `0,00` na planilha é classe que não roda aquela rota; guardar
   `0.0000` diria que a transportadora paga nada por ela, e a tela ofereceria utilitário para
   Barretos. Dos 174 pares (29 rotas × 6 classes), 28 são zero e ficam de fora — 146 valores.
4. **Vírgula decimal é recusada, não adivinhada.** `1.086,12` e `1.086` são o mesmo texto até o
   fim do campo; escolher um dos dois erra por um fator de mil em valor de pagamento.

Medido contra o arquivo real do cliente (`data/regioes.csv` + `data/valores.csv`, pelo próprio
parser): **29 rotas, 83 cidades, 146 valores**. `0.001` (Ribeirão Preto, a matriz) sai com as seis
classes; `7.003` (Franca, zona 3) sai com cinco — não há utilitário para lá.

A escrita é **uma transação por rota**, não uma pelo arquivo. Ciclo interrompido no meio se corrige
reimportando, porque o diff é sobre o estado e não sobre o que já foi gravado. Escrita perdida por
versão (edição concorrente durante a importação) aborta com `FREIGHT_REGION_VERSION_CONFLICT` —
o resumo não pode dizer que gravou o que não gravou.

`listAll` no repositório lê a empresa inteira em **três** consultas (rotas, cidades, valores),
contadas no teste de integração. Paginar aqui daria diff parcial: rota fora da página seria lida
como rota ausente do arquivo e inativada sem motivo.

## T010 — Aba **Regiões** na frota

```
$ bun run --cwd apps/frontend-transportada test
1429 pass · 0 fail · 7640 expect() calls (18 arquivos)

$ bun run typecheck   # quatro apps
$ bun run lint        # quatro apps
$ bun run format:check
$ bun run --cwd apps/frontend-transportada build   # ✓ built in 2.02s
```

Os dois contratos que o aceite pedia (`test/fleet/regions-tab.contract.ts` e
`test/fleet/region-table.contract.ts`, escritos vermelhos na abertura da fase) fecharam verdes
dentro de `test/fleet.contract.test.ts`, junto de `company-settings/tabs`.

Cinco decisões que a implementação cobrou e o aceite não escrevia:

1. **A aba puxa a tabela inteira, não uma página.** `loadEveryFreightRegion` percorre o cursor até
   o fim (teto de `FREIGHT_REGION_LOAD_LIMIT`, para cursor que não anda não virar laço). Com uma
   página só, "ordenar pelo valor do truck" ordenaria as 25 primeiras rotas e mentiria sobre o
   resto — e é o valor que o operador vem conferir aqui.
2. **Ordenar e filtrar é no cliente.** Consequência da decisão acima e do tamanho real do dado:
   29 rotas, 83 cidades. Trazer `sortBy` para a rota HTTP seria contrato novo para uma tabela que
   cabe na memória do navegador.
3. **Classe sem linha de valor é "Não informado", nunca R$ 0,00** — e vai para o fim da ordenação
   nas duas direções. Zero não entra no banco (T009), então célula vazia é falta de cadastro; um
   `0,00` na tela diria que a transportadora paga nada por aquela rota.
4. **A ação em massa não muda status.** Exporta a seleção em CSV (`;`, vírgula decimal e BOM — o
   que o Excel pt-BR abre sem assistente) e copia a lista de cidades, uma por linha, que é o que se
   cola na conversa de quem vai combinar a viagem. Editor de rota não entra na 045: o caminho do
   dado é a importação.
5. **A aba entra na lista só com `settings.manage`** — ausente, não desabilitada. A consulta sobe
   com `enabled: canManageSettings && settingsScope.freightRegions`: permissão **e** aba aberta,
   que é o que faz o painel abrir preenchido em vez de vazio.

Nenhuma variável de ambiente nova — nem em staging, nem em produção.

## T011 — Cobertura no formulário de motorista

```
$ bun test ./test/fleet/driver-coverage.contract.ts   # vermelho na abertura, 9 testes
$ bun run --cwd apps/frontend-transportada test        # 1439 pass · 0 fail · 7702 expect()
$ bunx tsc --noEmit                                    # limpo em fleet
$ bun run format
```

O contrato `test/fleet/driver-coverage.contract.ts` foi escrito vermelho antes da implementação e
entrou em `test/fleet.contract.test.ts`.

Quatro decisões que a implementação cobrou:

1. **A chave da cobertura é byte a byte a da API** — `${regionId}:${scope}:${cidade normalizada}`,
   em `driverCoverage.service.ts`. Inventar uma chave só do cliente faria a tela aceitar duas
   coberturas que o `PUT` devolve como 400, e o operador leria "erro ao salvar" sem nada na tela
   dizendo o que estava repetido.
2. **A zona inteira recolhe as cidades soltas daquela rota**, e cidade de rota já zonada não vira
   linha nova. Guardar as duas formas mandaria uma cobertura que diz a mesma coisa duas vezes.
3. **`toDriverCoverageEntries` omite a chave `city`**, não manda `undefined`: com
   `exactOptionalPropertyTypes` a chave presente com `undefined` vira `city` no JSON, e a API
   responde `FLEET_DRIVER_REGION_CITY_UNEXPECTED` para uma zona que não tem cidade nenhuma.
4. **Os mutadores viajam num `DriverCoverageController`** exposto por `useDriverForm`, para
   `DriverCoverageFields` ficar em dois props — `react.md` corta em cinco, e adicionar cidade,
   adicionar zona, remover e limpar soltos já seriam quatro.

O gate da raiz (`bun run lint`, `bunx tsc --noEmit`) estava vermelho em `cte-profiles` e
`nfe-workspace` por uma migração de `input type="date"` para `DatePicker` em curso na mesma árvore,
fora desta feature. A parte dela que toca `fleet` (`FleetField`, `DriverQuickCreateDialog` e as
chaves `dateField`) veio junto neste commit por compartilhar `DriverForm.component.tsx` e os dois
`*.locale.json`.

Nenhuma variável de ambiente nova — nem em staging, nem em produção.

## T012 — Classe de frete no formulário de veículo

```
$ bun test ./test/fleet/vehicle-freight-class.contract.ts   # 1 pass · 8 fail na abertura
$ bun test ./test/fleet/vehicle-freight-class.contract.ts   # 9 pass · 0 fail
$ bun run --cwd apps/frontend-transportada test              # 1449 pass · 0 fail · 7744 expect()
$ bunx tsc --noEmit                                          # limpo
$ bun run lint                                               # limpo
$ bun run format
```

O campo faltava mais do que o aceite dizia: `createVehicleSchema` é `strict()` e pede
`freightClass` no corpo desde a T008, então **cadastrar veículo pela tela vinha voltando 400** — o
frontend não mandava a chave. A T012 fecha esse buraco junto com o campo.

Quatro decisões:

1. **A sugestão não decide.** `suggestFreightClass` preenche a classe vazia e corrige a que ela
   mesma sugeriu (rodado `01` → `02` troca truck por toco), mas não toca no que foi escolhido à
   mão. VUC e 3/4 só entram assim: eles não existem no rodado do MDF-e.
2. **A tabela `FREIGHT_CLASS_BY_WHEEL_TYPE` cobre só o que tem tradução exata** —
   `01→truck`, `02→toco`, `04→van`, `05→utility`, a mesma da migration da T003. Cavalo mecânico
   (`03`) e "Outros" (`06`) ficam vazios: adivinhar poria o veículo na linha errada da tabela.
3. **A regra mora no `patch` do `useVehicleForm`**, não no componente do select — é um caminho só
   para toda troca de rodado, venha do formulário completo ou do diálogo rápido.
4. **Implemento não carrega classe**: `toVehicleBody` manda `''` quando o papel é `trailer`, do
   mesmo jeito que já fazia com o rodado. Quem puxa frete é o veículo de tração.

Nenhuma variável de ambiente nova — nem em staging, nem em produção.

## T013 — Locales

```
$ bun test ./test/shared/locale-accents.contract.ts   # 2 pass · 0 fail
$ bun run --cwd apps/frontend-transportada test        # 1449 pass · 0 fail
```

Os verbetes da feature entraram nos dois idiomas conforme cada painel foi ficando pronto
(`freightRegions*` e `regionColumns` na T010, `driverCoverage` na T011, `freightClass*` na T012).
A conferência de fechamento comparou chave a chave, achatando os dois arquivos:
`fleet.locale.json` e `fleet.en.locale.json` têm **o mesmo conjunto de chaves**, sem sobra dos dois
lados.

⚠️ **Achado fora do escopo da 045:** `nfeWorkspace.en.locale.json` está 130 chaves atrás do
`nfeWorkspace.locale.json` (a tabela de notas inteira, o construtor de filtro avançado e o
importador). Não quebra a tela — `i18n.service.ts` declara `fallbackLng: 'pt-BR'`, então a chave
ausente cai no português —, mas o inglês da tela de notas é português. Fica registrado aqui; a
tradução é trabalho de outra spec.

Nenhuma variável de ambiente nova — nem em staging, nem em produção.

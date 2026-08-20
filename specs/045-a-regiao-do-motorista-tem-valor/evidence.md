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

# Evidência — 090

## T1 — `toll_booths`, a terceira tabela sem `company_id` (2026-09-07)

Contrato **antes** da implementação. Vermelho conferido:

```
SyntaxError: Export named 'tollBooths' not found in module 'src/database/database.schema.ts'
 0 pass, 1 fail
```

Depois do schema (`src/database/toll-booth.schema.ts`) e do registro em `database.schema.ts`:

```
bun test test/fleet-schema.contract.test.ts
 71 pass, 0 fail, 267 expect() calls
```

`make migration-test` — migration aplicada e revertida em Postgres descartável:

```
 91 pass, 0 fail, 1101 expect() calls  [25.07s]
```

`bunx tsc --noEmit` na `api-transportada`: sem saída, sem erro.

### O que a task decidiu, e não estava escrito na spec

- **`osm_node_id` é único, mas não é a chave primária.** A PK é `uuid`, como em
  `fuel_price_references` — o `code-standart.md` §8 pede UUID para dado público, e o unique é o que
  sustenta a idempotência do seed da T3. `vehicle_volume_references` usa chave natural composta, e o
  precedente existe dos dois lados; segui o vizinho mais parecido, que é o outro catálogo carregado
  periodicamente de fonte externa.
- **Tarifa nula é desconhecida; zero seria isenta.** Os dois CHECKs aceitam `null` ou `>= 0`. Praça
  sem `charge` no mapa entra assim mesmo — 3 das 166 medidas — porque ela existe na estrada, e
  descartá-la faria a rota parecer sem pedágio ali.
- **`vehicle_volume_references` também não estava assertada** no `tenant-safety.contract.ts`: a spec
  075 a declarou tenant-less num comentário de schema e ninguém a cobrou em teste. Acrescentei a
  asserção dela junto com a de `toll_booths` — a frase "terceira tabela sem `company_id`" só é
  conferível se as três estiverem no mesmo lugar.

### Achado de ferramenta, registrado para a próxima pessoa

⚠️ **`bun run db:generate` não serve mais nesta base como fonte da migration.** Rodado com
`--name toll_booths`, ele emitiu um passivo inteiro: `nfe_package_boxes`, `geocoded_address_corrections`,
`client_delivery_addresses`, `address_comparisons`, quatro `ALTER TABLE ... ADD COLUMN` e três
`DROP CONSTRAINT ... ADD CONSTRAINT` de migrations **já aplicadas**. Não existe `drizzle/meta/` no
repositório, então o drizzle-kit não tem snapshot e refaz o diff a partir de um baseline vazio.
Aplicar o que ele gerou falharia no `CREATE TABLE` de uma tabela existente.

O caminho é o das vizinhas: **escrever `migration.sql` e `rollback.sql` à mão**, e acrescentar o
diretório por extenso à lista de `test/database-migration/static-migration.contract.ts` — sem isso a
suíte reprova com a lista esperada divergindo da lista em disco, que foi como esta task descobriu a
regra.

### O que ficou de fora

- Índice espacial por `latitude`/`longitude`. A T5 casa por **id de nó**, nunca por proximidade, e
  criar um índice geográfico agora convidaria exatamente a consulta por raio que a D1 proíbe. Ele
  entra se e quando alguém desenhar a praça no mapa.

## T2 — O extrator de praças (2026-09-07)

Contrato **antes** da implementação. Vermelho conferido (movi os três arquivos de domínio para fora
antes de escrever o teste, para o vermelho ser por ausência de módulo, não por erro de digitação):

```
bun test ./test/toll-booths.contract.test.ts

error: Cannot find module '../../src/toll-booths/domain/toll-booth-charge.policy.js' from
'.../test/toll-booths/toll-booth-charge-policy.contract.ts'

 0 pass, 1 fail, 1 error
```

Depois da implementação (`toll-booth-charge.policy.ts`, `osm-toll-booth.types.ts`,
`osm-toll-booth.mapper.ts`):

```
bun test ./test/toll-booths.contract.test.ts
 11 pass, 0 fail, 14 expect() calls
```

`scripts/toll-booth-extract.ts` contra o `.pbf` real (fora do worktree, só leitura):

```
bun scripts/toll-booth-extract.ts --pbf .../deploy/osrm/data/ribeirao.osm.pbf --out /tmp/toll-booths-extract.json

praças              166
com tarifa          163
com tarifa por eixo 162
gravado em /tmp/toll-booths-extract.json
```

As três contagens da spec batem exatamente: **166 / 163 / 162**.

`bunx tsc --noEmit`: sem saída. `eslint` e `prettier --check`: sem achado.

### O que a task decidiu, e não estava escrito na spec

- **`osmium export -f jsonseq` prefixa cada linha com o caractere RS (`\x1e`, RFC 7464).** A
  primeira tentativa de `JSON.parse` por linha falhou com `Unrecognized token`; o `\x1e` some do
  terminal e da maioria dos editores, então o achado só apareceu olhando os bytes com `xxd`. O
  extrator remove o separador antes de fazer o parse.
- **`osmium export` sozinho não preserva o id do nó** — sai como `"counter"` sequencial. `-u type_id`
  é o que devolve `"n33554488"`, e é dele que o `osmNodeId` sai. Sem essa flag a D1 (casar por
  identidade de nó) não teria o que casar.
- **O extract real não tem uma única tag `name`** (0 de 166) — o que existe é `note`, texto livre do
  mapeador, em 159 de 166 ("Pedágio Nova Odessa (sentido Norte)"). O mapeador usa `name` quando
  existir e cai para `note`; sem os dois, o campo fica `null` e a praça **não é descartada** — ela
  ainda tem coordenada e (às vezes) tarifa.
- **Parsing do `charge`:** medido que 162 das 163 tarifas trazem exatamente `hgv/axle`, e **uma**
  traz só `hgv` (sem `/axle`) — essa fica com `chargePerAxle: null` de propósito, porque tarifa fixa
  de caminhão não é a mesma coisa que tarifa por eixo. As 3 praças sem `charge` nenhum entram com as
  duas tarifas nulas.
- **Duas etapas de `osmium` com arquivo temporário**, em vez de uma única chamada com pipe: tentei
  encadear `tags-filter -o - | export - -f jsonseq`, e o `osmium export` recusa ler PBF de stdin sem
  `--input-format` — e mesmo com ela o pipe não fecha limpo no meio do teste. Arquivo temporário em
  `os.tmpdir()`, removido no `finally`, é mais simples e o dataset é pequeno (166 nós).

### O que ficou de fora

- Rodar o extrator dentro de um teste automatizado contra um fixture. A spec é explícita: o aceite é
  contra o `.pbf` real, "nunca contra fixture" — o `deploy/osrm/fixtures/ribeirao-grid.osm` (grade
  sintética de roteamento) não tem `barrier=toll_booth` nenhum, e forjar um fixture próprio testaria
  o parser contra um caso que a spec não mediu. A verificação das três contagens é o passo manual
  registrado acima, repetível a qualquer momento contra o `.pbf` real.

## T3 — Seed idempotente (2026-09-07)

Contrato **antes** da implementação. Vermelho conferido:

```
bun test ./test/toll-booths.contract.test.ts

error: Cannot find module '../../src/toll-booths/application/seed-toll-booths.use-case.js' from
'.../test/toll-booths/seed-toll-booths-use-case.contract.ts'

 0 pass, 1 fail, 1 error
```

Depois da implementação (`toll-booth.port.ts`, `seed-toll-booths.use-case.ts`,
`drizzle-toll-booth.repository.ts`, `toll-booth-seed.service.ts`):

```
bun test ./test/toll-booths.contract.test.ts
 17 pass, 0 fail, 23 expect() calls
```

Seed rodado **duas vezes seguidas** contra o Postgres local, com o extract da T2:

```
bun src/toll-booths/application/toll-booth-seed.service.ts \
  --input /tmp/toll-booths-extract.json --observed-on 2026-09-07
toll booths seeded: 166

# rodado de novo, mesmo comando
toll booths seeded: 166
```

```sql
select count(*) from toll_booths;                              -- 166
select count(distinct observed_on), min(observed_on), max(observed_on) from toll_booths;
-- 1 | 2026-09-07 | 2026-09-07
select count(*) filter (where charge_per_axle is not null) as with_axle,
       count(*) filter (where charge_car is not null) as with_car
from toll_booths;                                               -- 162 | 163
```

166 linhas depois de duas execuções, `observed_on` uniforme na data do extract, e as contagens de
tarifa batendo com a T2 — a idempotência é do `onConflictDoUpdate` por `osm_node_id`, a mesma chave
que o `unique` da T1 sustenta.

`bunx tsc --noEmit`: sem saída. `bun run lint`: sem achado. Suíte inteira da API
(`bun test`): **4506 pass, 23 skip, 0 fail** — nada quebrou fora do módulo novo.

### O que a task decidiu, e não estava escrito na spec

- **`observed_on` não vem do arquivo do extract.** O JSON que `toll-booth-extract.ts` grava é só a
  praça (T2 não sabe de data de seed) — a data é responsabilidade de quem roda o seed, porque é ela
  quem sabe quando o `.pbf` foi processado. O script de seed aceita `--observed-on`, e sem ele usa a
  data de hoje (`new Date().toISOString().slice(0, 10)`). Isso significa que rodar o seed dias depois
  de gerar o extract, sem passar `--observed-on`, gravaria a data errada — documentado no comentário
  do arquivo, não automatizado, porque a T2 não carimba a data de quando rodou.
- **Repositório e use-case seguem o molde de `save-municipality-centroids.use-case.ts`**, o precedente
  mais próximo (catálogo sem `company_id`, seed por arquivo, upsert por chave natural): validação de
  forma na fronteira do use-case (não de presença — tarifa ausente é legítima), `CHUNK_SIZE = 500`
  para não estourar o limite de parâmetros do Postgres num carregamento maior no futuro (o extract de
  hoje, 166 linhas, cabe num lote só), e `onConflictDoUpdate` no repositório Drizzle, igual ao de
  `drizzle-municipality-centroid.repository.ts`.
- **A validação rejeita tarifa negativa e coordenada fora do planeta, mas nunca ausência de tarifa** —
  ao contrário do centroide de município (que exige geometria), a praça de pedágio pode legitimamente
  não ter `charge` no OSM, e a T1 já decidiu que isso vira `null`, não descarte.

### O que ficou de fora

- Rodar o seed dentro do `make migration-test` ou de um script de CI. A task pede idempotência
  comprovada manualmente contra Postgres real, e é isso que está registrado acima; automatizar a
  chamada ao `osmium` (T2) dentro de um pipeline de seed fica para quando o runbook do OSRM (T10)
  decidir onde esse passo mora no processo de deploy.

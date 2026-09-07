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

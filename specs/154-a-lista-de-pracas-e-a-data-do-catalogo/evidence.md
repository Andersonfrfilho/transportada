# Evidência — 154

## Fase 0 — Confirmar as premissas

Medido em 2026-09-17 contra o ambiente de **staging** do projeto Railway `transportada`
(`railway run -e staging -s api` para o bucket, `railway ssh -s Postgres` para o banco — a rede do
Postgres é `railway.internal`, sem proxy público, então o acesso é de dentro do contêiner).
Nenhum segredo foi impresso: os scripts de sondagem leem as variáveis injetadas e imprimem só
contagens, chaves e host.

### T001 — P1 confirmada: o extrato existe no bucket

Bucket `transportada-staging-zjeaet` em `t3.storageapi.dev`.

| Chave                                                        | Estado  | Bytes   | Content-Type       |
| ------------------------------------------------------------ | ------- | ------- | ------------------ |
| `toll-booths/osm/sudeste/2026-09-14/toll-booths.json`        | existe  | 131.920 | `application/json` |
| `toll-booths/osm/sudeste/2026-09-14/manifest.json`           | existe  | 659     | `application/json` |
| `toll-booths/osm/sudeste-latest/2026-09-14/toll-booths.json` | ausente | —       | —                  |
| `toll-booths/osm/ribeirao/2026-09-07/toll-booths.json`       | ausente | —       | —                  |

O `<dataset>` na chave é **`sudeste`**, não `sudeste-latest` — o nome do recorte, sem o sufixo do
arquivo do Geofabrik. É esse o valor que `buildExtractObjectKey` tem de produzir.

**sha256 do extrato:** `e0f2ebee8c1b46645f94b06b67a7e4cabf386f13844449b1172fb405474647c4`
(conferido baixando o objeto e re-hasheando; bate com o `boothsSha256` do manifesto).

Forma do extrato: **array puro** de 592 objetos, sem envelope. Chaves de cada linha:
`osmNodeId` · `name` · `operator` · `latitude` · `longitude` · `chargeCar` · `chargePerAxle`.
Todos os valores são **texto** — inclusive as coordenadas e o dinheiro (`"4.20"`), coerente com
`numeric(19,4)` em texto (RNF5). Exemplo:

```json
{
  "chargeCar": "4.20",
  "chargePerAxle": "4.20",
  "latitude": "-23.5101982",
  "longitude": "-46.8172702",
  "name": "Barueri - 2",
  "operator": "Ecovias Raposo Castello",
  "osmNodeId": "25937851"
}
```

### T001 — P2 resolvida: o manifesto existe e tem forma conhecida

A spec previu ignorá-lo se a forma divergisse. Ela **não diverge** — o manifesto é quase exatamente
a linha que a D10 quer gravar:

```json
{
  "boothCount": 592,
  "boothsKey": "toll-booths/osm/sudeste/2026-09-14/toll-booths.json",
  "boothsSha256": "e0f2ebee8c1b46645f94b06b67a7e4cabf386f13844449b1172fb405474647c4",
  "datasetVersion": "2026-09-14",
  "extractedAt": "2026-09-15T11:07:27.481Z",
  "extractor": "apps/api-transportada/scripts/toll-booth-extract.ts",
  "seedCommand": "bun src/toll-booths/application/toll-booth-seed.service.ts --input <toll-booths.json> --observed-on 2026-09-14",
  "source": {
    "lastModified": "2026-09-14T22:44:30Z",
    "url": "https://download.geofabrik.de/south-america/brazil/sudeste-latest.osm.pbf"
  },
  "withCharge": 579,
  "withChargePerAxle": 571
}
```

Mapeamento para `toll_booth_extracts` (entrada da T101):

| Manifesto             | Coluna                          |
| --------------------- | ------------------------------- |
| `datasetVersion`      | `observed_on`                   |
| `boothsKey`           | `object_key`                    |
| `boothsSha256`        | `sha256`                        |
| `boothCount`          | `booth_count`                   |
| `withCharge`          | `booths_with_charge`            |
| `withChargePerAxle`   | `booths_with_axle_charge`       |
| `source.url`          | procedência (origem do recorte) |
| `source.lastModified` | procedência (data do `.pbf`)    |

⚠️ O manifesto **não tem campo `dataset`** — `sudeste` só existe dentro da chave. O `dataset` da
linha vem de quem sobe, não de parsear caminho.

### T001 — decisão da P1 tomada: resubir pela RF3b, sem migration de dado

A spec deixava a escolha entre migration de dado e resubida. **Resubida pela RF3b**, e a medição
mostra que ela funciona sem tocar no objeto: o `put` do provider é `create-only` e devolve
`disposition: 'created' | 'replayed'` — subir os **mesmos bytes** com o **mesmo sha256** responde
`replayed`, não erro. Logo o extrato de staging que já está no bucket é registrado apenas subindo o
mesmo JSON pela rota nova.

➡️ **Consequência para a T301:** o `409` do aceite 8 é da **linha** (`UNIQUE (dataset, observed_on)`),
não do objeto. O objeto replayed não é conflito; conflito é já haver extrato registrado para aquele
par. Um `put` que responda `replayed` com **sha diferente** do registrado é o caso que tem de falhar.

### T002 — catálogo de staging medido

```
booths | with_axle | with_car | min_obs    | max_obs
   592 |       571 |      579 | 2026-09-14 | 2026-09-14
```

Bate com o registro de 15/09 do `docs/runbooks/osrm-extract.md:162` (592 / 579 com tarifa / 571 com
tarifa por eixo, `observed_on` 2026-09-14). Todas as praças têm a **mesma** `observed_on` — o
catálogo foi carregado numa tacada só.

| Também medido                | Valor                                                       |
| ---------------------------- | ----------------------------------------------------------- |
| `company_toll_booth_charges` | 0 linhas — **nenhum ajuste manual existe em staging ainda** |
| `toll_booth_extracts`        | não existe (a T101 a cria)                                  |

⚠️ Zero ajustes confirma o problema 1 da spec pelo outro lado: a tela de correção está no ar desde a
095 e ninguém corrigiu nada — a lista só mostra praça já cruzada, e nenhuma viagem congelada
alimentou a lista.

### Estado de partida de staging, para a Fase 3

Catálogo **populado** (592) e **nenhum extrato registrado**. É exatamente o caso extremo que a spec
antecipou ("Nenhum extrato registrado" com catálogo populado): a tela tem de dizer que não há o que
recarregar **sem** sugerir que o catálogo está vazio. O aceite 8 é testável em staging subindo o
mesmo extrato duas vezes.

### Não bloqueia

Nenhuma condição de "parar e perguntar" foi atingida: o extrato de staging existe (T001), nenhuma
migration destrutiva está em jogo, nenhuma suíte foi tocada.

## Fase 1

### T101 — `toll_booth_extracts`

Task 🧠: o desenho foi validado com o `architect` em `opus` **antes** de escrever qualquer coisa.
O que a validação mudou em relação ao `plan.md` está registrado abaixo — quatro correções, e uma
delas é de segurança de dado.

Migration: `apps/api-transportada/drizzle/20260917143608_toll_booth_extracts/`
(`migration.sql` + `snapshot.json` gerados pelo `drizzle-kit generate`, `rollback.sql` escrito à mão).
Schema: `apps/api-transportada/src/database/toll-booth-extract.schema.ts`, exportado em
`database.schema.ts` (é de lá que a suíte de tenant-safety importa).

#### O que mudou em relação ao `plan.md`, e por quê

| `plan.md` dizia                                  | Ficou                                                          | Por quê                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PK `bigserial`                                   | PK natural `(dataset, observed_on)`                            | Não existe **uma** coluna `serial` em todo o schema da app; é por esse par que a recarga endereça a linha, e é o conflito dele que produz o 409 do duplicado. Um id opaco só acrescentaria um passo entre a rota e a linha — o mesmo raciocínio de `job_schedules.job`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `varchar` nos textos                             | `text` em `object_key`/`sha256`, `varchar(64)` só em `dataset` | A proibição de ENUM nativo é sobre conjunto fechado de valores, e aqui não há nenhum. `text` é a convenção medida do repo; `dataset` é `varchar` por ser limitado e entrar numa chave de objeto.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `SELECT … FOR UPDATE` na linha do extrato (RNF3) | **Não basta** — vira advisory lock na T302                     | O recurso disputado não é a linha, é `toll_booths`. Duas recargas de extratos **diferentes** travam linhas diferentes, não se excluem, e fazem upsert intercalado por `osm_node_id`: o catálogo fica metade de um extrato e metade do outro, e `readCatalogSummary` usa `max(observed_on)` — imprimiria a data nova sobre catálogo velho, que é o defeito que a feature existe para matar. **Contrato para a T302:** `pg_try_advisory_xact_lock` com id constante do catálogo (não derivado do extrato) envolvendo a transação inteira; `false` ⇒ erro de domínio ⇒ 409 "recarga em andamento". Coluna de estado está reprovada: processo que morre deixa a coluna travada para sempre. O `saveMany` do seed tem de rodar **dentro** dessa transação — hoje `SeedTollBoothsDependencies` recebe o repositório sem transação. |
| "de três para quatro tabelas sem `company_id`"   | São **cinco**                                                  | Já eram quatro antes desta migration. Ver T102.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

#### Procedência: duas colunas, nada de `jsonb`

Do manifesto medido na Fase 0 ficaram `source_url` e `extracted_at`. `source.lastModified` **saiu**:
a sua data já é `observed_on`, e a hora do arquivo do Geofabrik ninguém lê. `source_url` fica porque
é a única coluna que revela, depois, que alguém recortou outra região reusando o mesmo `dataset` —
a falha em que o id de nó deixa de casar com o do OSRM e a rota subestima o total **em silêncio**.
`extracted_at` fica porque a distância entre extrair e subir é real e não é derivável (extraído em
15/09, registrado só agora). `jsonb` reprovado: neste repo ele guarda payload opaco ao SQL, e aqui
são dois escalares que gente lê — num blob perderiam CHECK.

#### Ator sem FK, e a asserção que impede a leitura errada

`uploaded_by_user_id` / `reloaded_by_user_id` são `uuid` **sem `references`**. Três razões que se
somam: `removeMembership` (spec 149) faz DELETE físico, então `RESTRICT` travaria a remoção do
usuário e `SET NULL`/`CASCADE` apagaria o ator; ator que some com o usuário deixa de ser auditoria
(security.md §10), e esta linha é a única trilha desta ação em toda a API; e a propriedade que a
suíte de tenant-safety protege nas tabelas sem tenant é `foreignKeys(X).toEqual([])` sob o nome
_"unable to reach a company"_ — uma FK aqui abriria a primeira aresta de saída para o grafo da
identidade. Para que "sem FK" não seja lido como "esqueceram a FK", a T102 assevera três coisas no
mesmo teste: zero FK, coluna de ator obrigatória, e tipo `uuid` nas duas.

#### "Objeto sumiu do bucket": observação datada, não estado

`missing_object_observed_at timestamptz NULL`. Derivar exigiria um `head` por linha a cada listagem
(N+1 de rede numa tela, reprovado pelo §15). Um `unavailable boolean` seria pior: o `put` é
`create-only` e a ressubida dos mesmos bytes responde `replayed`, então o objeto pode voltar sem que
ninguém limpe o sinalizador e a lista mentiria para sempre. A coluna diz o que é verdade — _nesta
data, a recarga não achou o objeto_ —, **zera no primeiro download que funcionar**, e o botão nunca
se recusa a tentar.

#### `rollback.sql` recusa com qualquer linha dentro

Não só com recarga feita: subir o extrato já é ato auditado (quem pôs aquele objeto no bucket), e
nenhum histórico reconstrói isso. O rollback **não toca `toll_booths`** — a D7 proíbe apagar praça e
esta migration não criou nenhuma.

#### Teste antes

`test/database-migration/toll-booth-extract-constraints.assertion.ts` (novo), ligado em
`database-migration.integration.ts`; a pasta nova registrada na lista explícita de
`static-migration.contract.ts`. **Nenhum arquivo novo no `package.json`** — o entrypoint
`database-migration.contract.test.ts` já está na lista, e a asserção entra por ele.

Vermelho antes da implementação:

```
(fail) Drizzle migrations > preserves baseline and identity bytes while versioning additive fiscal migrations
 56 pass  1 fail
```

Verde depois:

```
$ make migration-test
 97 pass
 0 fail
 1349 expect() calls      # eram 1321 na linha de base: 28 asserções novas
Ran 97 tests across 8 files. [34.83s]
```

O que a asserção prova, contra o Postgres descartável: nenhuma FK sai da tabela e não há
`company_id`; o par `(dataset, observed_on)` repetido devolve `23505` em `toll_booth_extracts_pkey`
(o 409 do aceite 8 é desta chave, não do `put`); os seis CHECKs recusam `dataset` com `..`, chave de
objeto fora da forma, sha256 maiúsculo, extrato de zero praça, mais praças com tarifa por eixo do
que com tarifa, e `source_url` em `http://`; meia trilha de recarga (`reloaded_at` sozinho) é
recusada; e o `rollback.sql` recusa com a linha dentro.

Demais gates: `bun run typecheck` (6 apps) verde · `bun run lint` (6 apps, `--max-warnings=0`) verde ·
`bun run format` sem reescrever nada fora do que a task criou.

Suíte completa da API, com o `.env.test` explícito (sem a flag a integração pula em silêncio):

```
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
 6263 pass
 23 skip
 0 fail
 21931 expect() calls
Ran 6286 tests across 177 files. [10.80s]
```

`toll_booth_extracts` **não** entra nos grupos de `readBusinessTables` do
`test/database-migration/support.ts`: `toll_booths` também não está em nenhum deles, e a tabela nova
segue o catálogo, não o negócio. É decisão, não esquecimento.

### T102 — a quinta tabela sem tenant

A contagem estava errada em dois documentos, de duas formas diferentes. `tenant-safety.contract.ts`
dizia "são quatro tabelas sem `company_id`" — verdade antes da T101, e a lista lá dentro já era a
das quatro certas (`fuel_price_references`, `energy_tariff_references`, `vehicle_volume_references`,
`toll_booths`); faltava só somar a que a própria T101 criou. Já `toll-booth.schema.ts` dizia que
`toll_booths` era "a terceira tabela", ao lado de só duas outras (`fuel_price_references` e
`vehicle_volume_references`) — esse erro é mais velho, de antes do merge que trouxe
`energy_tariff_references`, e sobreviveu ao squash sem ninguém notar porque nenhum teste lê comentário.
Os dois foram corrigidos para "cinco", com a lista completa nos dois lugares:
`fuel_price_references`, `energy_tariff_references`, `vehicle_volume_references`, `toll_booths` e
`toll_booth_extracts`. `spec.md` (linha ~81 e o critério de aceite 7) e `plan.md` (linha 31) tinham o
mesmo "três para quatro" e viraram "quatro para cinco" — `toll-booth-extract.schema.ts`, escrito na
T101, já estava certo desde o início e não precisou de ajuste.

A quinta tem justificativa **diferente** das outras quatro: não é dado público de mercado (tarifa da
ANP, tarifa da ANEEL, cubagem de referência, tarifa de praça do OSM), é que o extrato descreve o
catálogo, e o catálogo é da instalação — um deploy por transportadora (ADR-0021). Recarregar muda a
tarifa que todas as empresas do deploy enxergam, e é por isso que a rota é `settings.manage`, não uma
permissão por empresa.

O teste novo, `keeps the toll booth extract tenant-less on purpose, with a mandatory actor unable to
reach a company`, assevera cinco fatos, não dois: sem `company_id`, zero FK (os dois negativos de
sempre), e mais três positivos — `uploaded_by_user_id` é coluna obrigatória (`requiredColumnNames`) e
as duas colunas de ator (`uploaded_by_user_id`, `reloaded_by_user_id`) são `uuid`
(`columnSqlTypes`). Os positivos existem para que "sem FK" nunca seja lido como "esqueceram a FK":
uma tabela sem tenant e sem ator garantido seria auditoria de mentira — uma coluna de "quem fez" que
ninguém assegura estar preenchida. A ausência de FK é deliberada pela mesma razão de
`nfe_package_box_measurements.measured_by_user_id`: `removeMembership` (spec 149) apaga o usuário de
verdade, `RESTRICT` travaria a remoção e `SET NULL`/`CASCADE` apagaria o ator — e ator que some com o
usuário deixa de ser auditoria (security.md §10). Esta linha é a única trilha desta ação em toda a
API.

Como a T101 já tinha criado a tabela com a forma certa, a suíte alvo passou de primeira — não houve
vermelho desta task para mostrar; o vermelho que valeu foi o da T101 (a asserção documenta um fato já
produzido por ela, não um comportamento novo):

```
$ cd apps/api-transportada && bun --env-file=../../.env.test test ./test/fleet-schema.contract.test.ts --timeout 60000
 82 pass
 0 fail
 302 expect() calls
Ran 82 tests across 1 file. [233.00ms]
```

Suíte completa da API, antes e depois — um teste a mais, cinco `expect()` a mais, zero falha:

```
antes: 6263 pass · 23 skip · 0 fail · 21931 expect() calls · Ran 6286 tests across 177 files
depois:
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
 6264 pass
 23 skip
 0 fail
 21936 expect() calls
Ran 6287 tests across 177 files. [18.62s]
```

Demais gates: `bun run typecheck` (6 apps) exit 0 · `bun run lint` (6 apps, `--max-warnings=0`) exit 0
· `bun run format:check` exit 0.

Nenhum arquivo entrou na lista explícita de `package.json`: `tenant-safety.contract.ts` já é
importado por `test/fleet-schema/tenant-safety.contract.js` dentro de
`test/fleet-schema.contract.test.ts`, e este último já está na lista de `"test"` do
`package.json` da API (`grep fleet-schema apps/api-transportada/package.json` devolve a linha do
script, com `./test/fleet-schema.contract.test.ts` nela) — o teste novo entra pelo mesmo arquivo, sem
registro adicional.

## Fase 2 — O catálogo em leitura

### T201 — a consulta do catálogo

Contrato novo em `src/toll-booths/application/toll-booth-catalog.port.ts`
(`TollBoothCatalogPort.listCatalog`) e implementação em
`src/toll-booths/infrastructure/drizzle-toll-booth-catalog.repository.ts`
(`createDrizzleTollBoothCatalogRepository`) — par próprio, sem tocar o
`TollBoothRepository`/`drizzle-toll-booth.repository.ts` existente nem
`list-toll-booth-charges.use-case.ts` (T203 mexe nele depois). Constantes de paginação em
`toll-booth-catalog.constant.ts`: página e `perPage` padrão (1/20) e o teto de 100 — teto, não
default, porque `perPage: 500` vira `100`, nunca erro.

Vermelho, antes de existir o repositório (o teste já importava o módulo que não existia):

```
$ cd apps/api-transportada && bun --env-file=../../.env.test test ./test/toll-booths.contract.test.ts --timeout 120000

bun test v1.3.14 (0d9b296a)

test/toll-booths.contract.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find module '../../src/toll-booths/infrastructure/drizzle-toll-booth-catalog.repository.js' from '/Users/anderson.filho/Documents/personal/transportada-wt/spec-154/apps/api-transportada/test/toll-booths/toll-booth-catalog-repository.integration.ts'
-------------------------------

0 pass
1 fail
1 error
Ran 1 test across 1 file. [246.00ms]
```

Verde, depois da implementação (mesmo arquivo, agora com as 10 suítes de pedágio + as 8 novas):

```
$ cd apps/api-transportada && bun --env-file=../../.env.test test ./test/toll-booths.contract.test.ts --timeout 120000

bun test v1.3.14 (0d9b296a)

 79 pass
 0 fail
 162 expect() calls
Ran 79 tests across 1 file. [9.27s]
```

`test/toll-booths/toll-booth-catalog-repository.integration.ts` roda contra Postgres de verdade
(`withDisposableDatabase`, copiado de `test/integration/toll-booth-sighting-repository.integration.ts`:
cria banco descartável, roda as migrations reais, `drop database ... with (force)` no `finally`) —
um fake de repositório não provaria a forma do `LEFT JOIN`, da busca `ilike` nem do isolamento de
tenant. Entra pelo `test/toll-booths.contract.test.ts` (que já está na lista `"test"` do
`package.json`) por um import a mais, sem editar o `package.json` — o mesmo padrão que
`database-migration.contract.test.ts` já usa para importar `.integration.ts` guardado por
`testWithPostgres = databaseUrl === undefined ? test.skip : test`.

O que cada uma das 8 suítes prova:

- **busca por nome** e **busca por operador**: o `ilike` do `WHERE` alcança as duas colunas do
  catálogo (`or(ilike(name), ilike(operator))`) — nunca o ajuste, que não guarda nome nem operador.
- **teto de 100**: `perPage: 500` na chamada devolve `page.perPage === 100`, nunca `500` — o teto é
  aplicado no repositório, não confiado ao chamador.
- **paginação por offset**: página 2 de 3 registros com `perPage: 2` devolve 1 linha e `total: 3` —
  `total` vem de uma segunda consulta paralela (`Promise.all`), não de `count(*) over()`, porque o
  par fixo de duas consultas não é o N+1 que o §15 proíbe (esse é por linha, não por página).
- **`seen`**: com `seenOsmNodeIds: [111]`, a praça 111 volta `seen: true` e a 222 `seen: false` —
  calculado em memória via `Set.has()`, nunca uma consulta jsonb aqui; `seenOsmNodeIds` já vem
  pronto do chamador (mesmo formato que `DrizzleTollBoothSightingRepository.readSeenOsmNodeIds`
  produz, que por sua vez extrai de `trips.plannedToll` fora do SQL).
- **ajuste separado do catálogo — a política compõe, nunca o repositório**: praça com
  `chargePerAxle: '10.0000'` no catálogo e ajuste da empresa em `'8.5000'` devolve as duas colunas
  cruas (`row.catalog.chargePerAxle === '10.0000'`, `row.adjustment.chargePerAxle === '8.5000'`); só
  então o teste chama `resolveEffectiveTollBoothCharge` (spec 086) diretamente, fora do
  repositório, para provar que o valor efetivo (`'8.5000'`, `source: 'manual'`) nasce ali — nunca de
  uma expressão SQL tipo `COALESCE`.
- **isolamento de tenant**: duas empresas, cada uma com ajuste na própria praça; a consulta da
  primeira empresa nunca enxerga o ajuste da segunda na praça 2 (`adjustment: null`), mesmo as duas
  praças existindo no mesmo catálogo compartilhado.
- **catálogo vazio**: sem nenhuma praça semeada, a página volta `{ page: 1, perPage: 20, rows: [],
total: 0 }` — nunca erro por tabela vazia.

**Decisão que a spec não previu, descoberta lendo o schema, não a spec**: o plano (item 4) e a leitura
inicial da D1 ("o ajuste de praça que o catálogo não conhece mais continua aparecendo") sugeriam um
`FULL OUTER JOIN` — cobrir tanto a praça sem ajuste quanto o ajuste "órfão" sem praça
(`catalogKnown: false`). Lendo `company-toll-booth-charge.schema.ts`, porém,
`company_toll_booth_charges.osm_node_id` tem `references(() => tollBooths.osmNodeId, { onDelete:
'restrict' })`, e a D7 do próprio spec 154 proíbe apagar praça no recarregamento
("apagar seria migration destrutiva de dado que ajuste manual referencia"). As duas juntas fazem do
ajuste órfão um estado **estruturalmente inalcançável** neste banco hoje — não existe, e não pode
passar a existir sem uma migration destrutiva que a própria spec já veta. Por isso o `JOIN` virou
**`LEFT JOIN`** de `toll_booths` (lado esquerdo) para o ajuste pré-filtrado por `companyId` — que é
exatamente o que `plan.md` item 4 já dizia, ao pé da letra — e `TollBoothCatalogPort` não tem
`catalogKnown` nem `catalog` anulável: o code-standard proíbe tratar estado que não pode acontecer, e
fingir um `catalogKnown: false` que o schema torna impossível seria exatamente isso. Se essa garantia
mudar (praça passar a ser removível), quem mexer na FK/D7 encontra este comentário no `.port.ts` e no
`.repository.ts` apontando de volta para a decisão.

A subconsulta que pré-filtra `company_toll_booth_charges` por `companyId` antes do `leftJoin`
(`.as('scoped_charges')`) é defensiva: com `toll_booths` como lado esquerdo de um `LEFT JOIN`, vazar
ajuste de outra empresa como praça "órfã" já não é possível por construção (isso só seria risco real
num `FULL JOIN` filtrado só no `ON`). Mantida mesmo assim, para nunca ler a tabela de ajuste sem o
filtro de tenant já embutido na forma da consulta — não porque o risco exista hoje, mas porque é o
único jeito de ler aquela tabela neste repositório.

**Ordenação (D1) deliberadamente fora do escopo**: a página vem ordenada só por
`asc(tollBooths.osmNodeId)`, determinística e estável — nunca a ordenação "não vista e desconhecida
primeiro" que a D1 pede. Essa regra já existe pronta e testada em
`orderTollBoothChargesByUnknownFirst` (`toll-booth-charge.policy.ts`); aplicá-la aqui duplicaria
regra de negócio em SQL ou exigiria compor o valor efetivo dentro do repositório — as duas coisas que
este contrato existe para não fazer. Fica para a camada que compõe a resposta HTTP (T202/T203)
chamar essa função sobre as linhas cruas que este repositório devolve.

Suíte completa da API, antes e depois — oito testes a mais (as 8 novas), catorze `expect()` a mais,
zero falha:

```
antes: 6264 pass · 23 skip · 0 fail · 21936 expect() calls · Ran 6287 tests across 177 files
depois:
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
 6272 pass
 23 skip
 0 fail
 21950 expect() calls
Ran 6295 tests across 177 files. [25.25s]
```

Demais gates: `bun run typecheck` (6 apps) exit 0 · `bun run lint` (6 apps, `--max-warnings=0`)
exit 0 · `bun run format` exit 0 (sem reescrita fora do próprio arquivo novo, que o `prettier
--write` só reformatou a quebra de linha do `or(ilike(...), ilike(...))`).

### T202

`src/toll-booths/presentation/toll-booth.routes.ts` nasce agora: `GET /v1/toll-booths`, `fleet.read`,
query validada por Zod (`toll-booth.schema.ts`) com `search`/`page`/`perPage`. `perPage` acima de 100
nunca é `400` — o Zod só valida forma (inteiro positivo); quem corta o teto é o use case, no mesmo
lugar que decide os outros padrões (`toll-booth-catalog.constant.ts`, mesmo teto que a T201 já
aplicava no repositório).

**A ordem da D1 mora no use case novo** (`list-toll-booth-catalog.use-case.ts`), não na rota nem no
repositório — exatamente o buraco que a evidência da T201 apontou ("Ordenação (D1) deliberadamente
fora do escopo... fica para a camada que compõe a resposta HTTP"). Algoritmo implementado ao pé da
letra do prompt:

1. `sightings.readSeenOsmNodeIds` (conjunto pequeno) → `catalog.listCatalog({ seenFilter: 'only' })`
   sem teto de página (o repositório, com `'only'`, nunca aplica `LIMIT`/`OFFSET` — devolve o grupo
   inteiro) + `charges.loadAdjustmentsByNodeIds` para recuperar o ajuste de praça vista que o
   catálogo não conhece mais (`catalogKnown: false`, D1) — que a T201 nunca devolveria sozinha,
   porque a consulta dela parte de `FROM toll_booths`. Resolvidas pela política
   (`resolveEffectiveTollBoothCharge`) e ordenadas: sem tarifa por eixo primeiro, com tarifa depois,
   desempate por `osmNodeId` (não por nome — regra própria desta feature, diferente da
   `orderTollBoothChargesByUnknownFirst` de 3 grupos que a lista antiga usa).
2. O resto do catálogo vem do repositório com `seenFilter: 'exclude'`, paginado por **offset
   explícito** (novo parâmetro `offset` no `ListTollBoothCatalogParams` — nunca `page`, porque o
   corte de página pode cair no meio da lista de vistas).
3. A página final fatia `[vistas ordenadas] ++ [resto]` pelo deslocamento absoluto
   `(page-1)*perPage`; quando a fatia cabe inteira nas vistas, o pedido ao repositório vai com
   `perPage: 0` (`LIMIT 0` do Postgres — zero linhas, `total` continua correto na mesma consulta).
   `total = vistas.length + resto.total`.

Testado em `test/toll-booths/list-toll-booth-catalog-use-case.contract.ts` com um catálogo falso que
implementa a mesma semântica de filtro/paginação do repositório real (não é integração — a T201 já
prova o SQL; aqui prova-se a composição): ordem atravessando duas páginas (praça vista `osmNodeId
50` sem tarifa aparece antes de `osmNodeId 1` na página 1, mesmo sendo maior; página 2 e 3 continuam
a sequência sem repetir nem pular), `perPage` 500 → 100, busca por nome/operador, isolamento de
tenant (empresa B nunca vê o ajuste de A no mesmo `osmNodeId`), resumo do RF2 completo e o caso
extremo do catálogo vazio (`status: 'empty'`).

**RF2 — a contagem "sem tarifa por eixo conhecida" (decisão, não conflito resolvido por invenção):**
o prompt pediu para não compor o valor efetivo no SQL nem ler a tabela inteira por requisição.
Investigado: a contagem podia significar (a) quantas praças do **catálogo puro** não têm
`charge_per_axle`, ou (b) quantas ficam sem tarifa **depois do ajuste da empresa** (efetivo). (b)
exigiria ou compor `COALESCE(ajuste, catálogo)` em SQL (a mesma composição que a T201 baniu do
repositório) ou ler catálogo+ajustes inteiros e rodar a política sobre cada linha (viola RNF2: "nunca
lê a tabela inteira sem paginar"). (a) é uma consulta nova, de uma linha, só na tabela do catálogo
(`count(*) where charge_per_axle is null`), sem `company_toll_booth_charges` no meio — não compõe
nada, e RNF2 já autoriza exatamente este tipo de consulta agregada avulsa ("o resumo do RF2 continua
saindo de `readCatalogSummary`... numa consulta só"). Implementado como (a):
`TollBoothCatalogPort.readAxleChargeGapCount()`, query própria no repositório. **Decisão registrada,
não conflito**: a leitura de RF2 é resumo do _catálogo_, coerente com `boothCount`/`observedOn`, que
também não passam pelo ajuste da empresa.

`test/toll-booths/toll-booth-routes.contract.ts` cobre a camada HTTP: `200` com o envelope `{ data,
pagination: { page, perPage, total }, summary }`; `companyId` nunca lido da query nem do corpo — só
`context.scope.companyId` (isolamento de tenant na fronteira HTTP); `403` sem `fleet.read`.

Wiring em `main.ts`: `tollBoothCatalogRepository = createDrizzleTollBoothCatalogRepository(database)`
e `createTollBoothRoutes({ listCatalog: createListTollBoothCatalogUseCase({ catalog:
tollBoothCatalogRepository, catalogSummary: tollBoothRepository, charges: tollBoothChargeRepository,
clock: { now: () => new Date() }, sightings: tollBoothSightingRepository }) })`, registrada ao lado
de `createTollBoothChargeRoutes`. `test/separator-role.contract.test.ts` não importa
`toll-booths/presentation/*` — confirmado que a lista exaustiva do separador continua intacta, sem
precisar de decisão nova.

Suítes exercitadas: `test/toll-booths.contract.test.ts` (88 pass, 0 fail, incluindo os 3 novos
arquivos deste T202 e a integração Postgres da T201) e a suíte completa da API:

```
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
 6281 pass
 23 skip
 0 fail
 21970 expect() calls
Ran 6304 tests across 177 files. [20.07s]
```

Gates: `bun run typecheck` (6 apps) exit 0 · `bun run lint` (6 apps, `--max-warnings=0`) exit 0 ·
`bun run format` exit 0 (reescreveu só a quebra de linha dos arquivos novos/editados desta task —
conferido por `git diff --stat`, sem mudança de comportamento).

Postgres de teste: `transportada-test-postgres-1` (Docker) já estava saudável — não foi preciso subir
Postgres nativo descartável.

**Divergência do plano registrada:** `plan.md` item 3 previa três rotas em
`toll-booths/presentation/` nesta task; T202 entrega só `GET /v1/toll-booths` (RF1/RF2), como o
escopo do prompt pediu — `GET`/`POST /toll-booths/extracts` e `POST /toll-booths/reload` continuam
para T301/T302 (Fase 3), sem código morto ou rota parcial no meio do caminho.

### T203

`list-toll-booth-charges.use-case.ts` não é apagado nem muda de assunto: continua sendo a lista das
praças que a operação já viu, atrás da rota antiga `GET /v1/company-settings/toll-booth-charges`
(`toll-booth-charge.routes.ts`), no mesmo formato de resposta de sempre
(`EffectiveTollBoothCharge[]`, ordenado por `orderTollBoothChargesByUnknownFirst`). O que muda é só a
fonte: o `catalog` do use case deixou de ser `TollBoothCatalogLookupPort.readByNodeIds`
(`TollBoothRepository`) e passou a ser `TollBoothCatalogPort.listCatalog({ seenFilter: 'only' })` — o
mesmo contrato que a T202 já usa para alimentar `GET /v1/toll-booths`. `charges.loadAdjustmentsByNodeIds`
continua sendo chamado em paralelo, mas só para achar o ajuste "órfão" (praça vista que o catálogo não
conhece mais, `catalogKnown: false`) — para a praça que o catálogo conhece, o ajuste já vem embutido na
linha do `LEFT JOIN` (`row.adjustment`), sem precisar de uma segunda consulta por ajuste conhecido.

`TollBoothCatalogLookupPort` (o tipo antigo, com `readByNodeIds`) não foi apagado: continua exportado
por este arquivo e usado por `adjust-toll-booth-charge.use-case.ts`, que resolve uma praça por vez a
partir do `osmNodeId` do `PUT` — caso que `listCatalog` não cobre e que não faz parte do escopo desta
task.

Wiring em `main.ts:1989`: o `catalog:` de `createListTollBoothChargesUseCase` trocou de
`tollBoothRepository` para `tollBoothCatalogRepository` (já criado em `main.ts:1483` para a T202,
antes do ponto de uso). `adjust`/`clear` (mesma rota) não mudaram — `adjust` continua em
`tollBoothRepository` de propósito, pela razão do parágrafo acima.

**Contrato novo — as duas listas concordam, praça a praça:**
`test/companies/list-toll-booth-charges-catalog-parity.contract.ts` (novo), com um catálogo falso
minimalista que reproduz só o recorte que este use case exercita (`seenFilter: 'only'` filtrando por
`seenOsmNodeIds`). Duas suítes:

- **ajuste parcial (só o eixo corrigido):** duas praças vistas, uma com ajuste que corrige só
  `chargePerAxle` e deixa `chargeCar` do catálogo. Para a mesma praça, a lista antiga
  (`createListTollBoothChargesUseCase`) e o `catalog.listCatalog({ seenFilter: 'only' })` bruto
  concordam: `chargePerAxleSource: 'manual'` com `effectiveChargePerAxle: '8.5000'` (do
  `row.adjustment.chargePerAxle`) e `chargeCarSource: 'catalog'` com `effectiveChargeCar: '4.2000'`
  (do `row.catalog.chargeCar`) — a origem é **por campo**, não por linha, e as duas listas decidem
  campo a campo do mesmo jeito. A segunda praça, sem ajuste algum, tem `chargePerAxleSource:
'catalog'` e `effectiveChargePerAxle: null` nas duas. Toda praça da lista antiga aparece com
  `seen: true` no catálogo novo.
- **praça sem ajuste:** confirma que, sem nenhum ajuste, as duas concordam que a origem é o catálogo
  puro, valor a valor.

Vermelho antes da implementação (o `catalog` do use case ainda exigia `readByNodeIds`, que o fake
novo — só com `listCatalog` — não tem):

```
$ cd apps/api-transportada && bun --env-file=../../.env.test test ./test/companies.contract.test.ts --timeout 60000
TypeError: input.catalog.readByNodeIds is not a function. (In 'input.catalog.readByNodeIds(osmNodeIds)', 'input.catalog.readByNodeIds' is undefined)
      at .../src/companies/application/list-toll-booth-charges.use-case.ts:38:23
 162 pass
 2 fail
 468 expect() calls
Ran 164 tests across 1 file. [95.00ms]
```

Verde depois — `test/companies/list-toll-booth-charges-use-case.contract.ts` (suíte já existente)
também precisou trocar o fake de `catalog: { readByNodeIds }` para um `TollBoothCatalogPort` mínimo
(`createFakeCatalog`, filtra por `seenOsmNodeIds` e já embute o ajuste na linha, como o `LEFT JOIN`
real faria) — as seis suítes continuam provando exatamente o mesmo comportamento de antes (vazio sem
viagem, praça vista sem ajuste, ajuste mesclado, ordem de desconhecida primeiro, nó ausente do
catálogo, praça ajustada órfã):

```
$ cd apps/api-transportada && bun --env-file=../../.env.test test ./test/companies.contract.test.ts --timeout 60000
 164 pass
 0 fail
 493 expect() calls
Ran 164 tests across 1 file. [113.00ms]
```

Suíte completa da API, antes e depois — dois testes a mais (a parity nova), zero falha:

```
antes: 6281 pass · 23 skip · 0 fail · 21970 expect() calls · Ran 6304 tests across 177 files
depois:
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
 6283 pass
 23 skip
 0 fail
 21995 expect() calls
Ran 6306 tests across 177 files. [22.52s]
```

Demais gates: `bun run typecheck` (6 apps) exit 0 · `bun run lint` (6 apps, `--max-warnings=0`) exit 0
· `bun run format:check` exit 0 (o `prettier --write` só reformatou a quebra de linha do contrato
novo, conferido não haver mudança de comportamento).

Nenhum arquivo novo entrou no `package.json`: `list-toll-booth-charges-catalog-parity.contract.ts`
entra por um import a mais em `test/companies.contract.test.ts`, que já está na lista `"test"` da
API — o mesmo padrão de toda suíte de contrato desta app.

**Nenhum contrato existente foi afrouxado ou apagado.** A rota
`GET/PUT/DELETE /v1/company-settings/toll-booth-charges[/:osmNodeId]` (`toll-booth-charge.routes.ts`)
não mudou — nem assinatura, nem serialização (`serializeTollBoothCharge`), nem permissão
(`settings.manage`) —, e `test/companies/toll-booth-charge.contract.ts` (a suíte HTTP dessa rota,
fora do escopo desta task) continua verde na suíte completa acima, sem edição.

### T202b — a contagem do RF2 é pendência da empresa

**Razão (decisão do usuário em 2026-09-17, não conflito resolvido por invenção):** a T202 implementou
o resumo do RF2 ("praças sem tarifa por eixo conhecida") como `TollBoothCatalogPort.readAxleChargeGapCount()`
— `count(*) where charge_per_axle is null` só no catálogo cru, ignorando o ajuste da empresa. O
usuário decidiu que a contagem certa é a **pendência da empresa do contexto**: a mesma resposta que
`resolveEffectiveTollBoothCharge` (spec 086) daria, campo a campo, para `chargePerAxle` de cada praça
— para que o número do resumo bata com quantas linhas da lista aparecem "sem tarifa conhecida" para
aquela empresa, não para o catálogo em abstrato.

**Restrição respeitada, não violada:** o plano 154 item 4 proíbe compor o valor efetivo em SQL
(`COALESCE` entre catálogo e ajuste), e a RNF2 proíbe ler `toll_booths` inteira sem paginar **na
listagem**. Nenhuma das duas é violada aqui — é leitura de **colunas mínimas** do catálogo inteiro
para um **agregado**, exatamente o que a RNF2 já autoriza para `readCatalogSummary` (`count` + `max`
numa consulta só) e o que a evidência da T202 já registrou como decisão válida para este mesmo
resumo. Não é a listagem paginada (RF1), que continua paginada sem tocar neste caminho.

**Implementação — duas leituras estreitas + resolução em memória na aplicação, nunca no SQL:**

1. `TollBoothCatalogPort.readAxleChargeGapCount()` foi **removido** (sem uso restante) e substituído
   por `TollBoothCatalogPort.readCatalogAxleCharges()`, que devolve só `{ osmNodeId, chargePerAxle }`
   do catálogo inteiro, sem `LIMIT`/`OFFSET` e sem tocar `company_toll_booth_charges`
   (`drizzle-toll-booth-catalog.repository.ts`) — ~600 linhas hoje (staging), duas colunas
   (`bigint`/`numeric` como texto), não a praça inteira.
2. `TollBoothChargePort.loadAdjustments({ companyId })` — **já existia**, sem mudança de contrato —
   devolve todos os ajustes da empresa do contexto.
3. `src/toll-booths/domain/toll-booth-axle-charge-gap.policy.ts` (novo, puro):
   `countBoothsWithoutKnownAxleCharge({ catalog, adjustments })` monta um `Map<osmNodeId,
chargePerAxle>` dos ajustes e replica, praça a praça, a mesma precedência que
   `resolveEffectiveTollBoothCharge` já define para este campo
   (`adjustment?.chargePerAxle ?? catalog.chargePerAxle`), contando quantas resolvem `null`. Não
   chama `resolveEffectiveTollBoothCharge` diretamente porque aquela função exige a praça inteira
   (nome, operador, `chargeCar`, `observedOn`) que a leitura mínima do item 1 não traz — mas o
   resultado para `chargePerAxle` é idêntico, porque a precedência daquele campo na política depende
   só de `adjustment?.chargePerAxle` e `catalog.chargePerAxle`.
4. `list-toll-booth-catalog.use-case.ts` chama as duas leituras em paralelo (`Promise.all`, ao lado de
   `readSeenOsmNodeIds`/`readCatalogSummary`) e passa o resultado para a política. Nome do campo na
   resposta **mantido**: `boothsWithoutAxleChargeCount` já expressava a ideia; só a fonte mudou.

**Caso-chave provado em três camadas** (política pura, use case, e nomeado no teste): praça sem
`charge_per_axle` no catálogo **e** com ajuste da empresa A não conta para A (`0`) e conta para uma
empresa B que nunca a ajustou (`1`); praça com tarifa por eixo no catálogo nunca conta, ajustada ou
não.

Vermelho, antes da política existir:

```
$ cd apps/api-transportada && bun --env-file=../../.env.test test ./test/toll-booths.contract.test.ts --timeout 120000
error: Cannot find module '../../src/toll-booths/domain/toll-booth-axle-charge-gap.policy.js' from
'.../test/toll-booths/toll-booth-axle-charge-gap-policy.contract.ts'
 0 pass
 1 fail
 1 error
Ran 1 test across 1 file. [288.00ms]
```

Verde depois — política pura (`test/toll-booths/toll-booth-axle-charge-gap-policy.contract.ts`, novo,
5 suítes incluindo os dois casos-chave do prompt), o use case (`list-toll-booth-catalog-use-case.contract.ts`,
suíte nova "the RF2 gap does not count a booth the company already adjusted, but still counts it for
another company", fakes ajustados para `readCatalogAxleCharges`/`loadAdjustments`), o repositório
(`toll-booth-catalog-repository.integration.ts`, suíte nova contra Postgres real provando as colunas
mínimas e a ausência de paginação), e os dois fakes de `readAxleChargeGapCount` que só existiam para
satisfazer o tipo do port (`test/companies/list-toll-booth-charges-catalog-parity.contract.ts`,
`test/companies/list-toll-booth-charges-use-case.contract.ts`) trocados por `readCatalogAxleCharges`:

```
$ cd apps/api-transportada && bun --env-file=../../.env.test test ./test/toll-booths.contract.test.ts ./test/companies.contract.test.ts --timeout 120000
 259 pass
 0 fail
 683 expect() calls
Ran 259 tests across 2 files. [9.63s]
```

Suíte completa da API, antes e depois — sete testes a mais (5 da política + 1 do use case + 1 de
integração), zero falha:

```
antes: 6283 pass · 23 skip · 0 fail · 21995 expect() calls · Ran 6306 tests across 177 files
depois:
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
 6290 pass
 23 skip
 0 fail
 22003 expect() calls
Ran 6313 tests across 177 files. [25.50s]
```

Demais gates: `bun run typecheck` (6 apps) exit 0 · `bun run lint` (6 apps, `--max-warnings=0`) exit 0
· `bun run format:check` exit 0 (o `prettier --write` reformatou só a quebra de linha do contrato
novo de política, `toll-booth-axle-charge-gap-policy.contract.ts`, sem mudança de comportamento).

Nenhum arquivo novo entrou no `package.json`: `toll-booth-axle-charge-gap-policy.contract.ts` entra
por um import a mais em `test/toll-booths.contract.test.ts`, que já está na lista `"test"` da API.

**Sem violação da RNF2 concluída — decisão registrada, não bloqueio.** A leitura do item 1
(`readCatalogAxleCharges`) é agregado de colunas mínimas sem paginar, do mesmo tipo que
`readCatalogSummary` já faz; a RNF2 proíbe a listagem (RF1) de ler a tabela inteira sem paginar, e
RF1 continua paginado — nada mudou ali. Se essa leitura crescer para exigir mais colunas no futuro, é
o sinal de reabrir esta decisão, não de generalizá-la sem revisão.

**Divergência registrada — regra de 200 linhas por arquivo:** `list-toll-booth-catalog.use-case.ts`
(214 → 226 linhas) e `drizzle-toll-booth-catalog.repository.ts` (216 → 219 linhas) já estavam acima
do teto de 200 do code-standart §"File Organization" **antes** desta task, herdado da T201/T202. A
lógica nova desta decisão foi isolada num arquivo próprio e pequeno
(`toll-booth-axle-charge-gap.policy.ts`, 40 linhas) para não empurrar o crescimento além do
estritamente necessário — a T202b só acrescenta ~12 linhas ao use case (a troca de uma chamada por
duas mais a chamada da política) e ~3 ao repositório (a nova query, no lugar da antiga). Dividir os
dois arquivos pré-existentes por responsabilidade é refatoração maior que o escopo desta task (só a
contagem do RF2) autoriza — fica registrado aqui para decisão numa task própria, não escondido.

### T204 — a aba de pedágio passa a ler o catálogo

`apps/frontend-transportada`: `TollBoothChargePanel` (Frota → Pedágio) deixou de consumir
`GET /company-settings/toll-booth-charges` (só as praças vistas) e passou a ler o catálogo inteiro
de `GET /v1/toll-booths` (T202/T202b), com busca e paginação do servidor. **Aceites 1 e 2 fecham
aqui.**

**Arquivos novos** (todos abaixo do teto de 200 linhas do code-standart §"File Organization"):

- `src/modules/fleet/shared/tollBoothCatalog.validation.ts` (176 linhas) — tipos e guarda de forma
  da resposta (`data`/`pagination`/`summary`), usando a guarda única `hasExactKeys` de
  `shared/objectKeys.service.ts` (spec 079) — não uma cópia local, que o
  `object-keys-single-source.contract.ts` teria recusado (vermelho visto e corrigido, ver abaixo).
- `src/modules/fleet/shared/tollBoothCatalogClient.service.ts` (93 linhas) — cliente próprio
  (`GET /toll-booths?search&page&perPage`), no molde de `fleetCatalogClient.service.ts` (um cliente
  por recurso, em vez de inchar `fleetClient.service.ts`, já com 403 linhas).
- `src/modules/fleet/hooks/useTollBoothCatalog.hook.ts` (68 linhas) — busca com debounce de 400ms
  (mesmo intervalo de `usePackageBoxQueue.hook.ts`), `keepPreviousData` para trocar de página sem
  piscar a lista inteira para o esqueleto, e reinício da página a cada busca nova.
- `src/modules/fleet/hooks/useDayFormatter.hook.ts` (12 linhas) e
  `src/modules/fleet/shared/tollBoothChargeFormat.service.ts` (10 linhas) — extraídos da linha para
  serem compartilhados entre a linha e o cabeçalho do catálogo sem duplicar a formatação de data e
  de tarifa.
- `src/modules/fleet/components/TollBoothChargeRow.component.tsx` (164 linhas) — a linha
  reaproveitada **sem mudança de comportamento**, só com a marca de `catalogKnown: false` (D1): um
  `Badge` com `tollBoothCharges.catalog.unknownCatalog`, ao lado do nome, sem esconder o formulário
  de ajuste (que continua incondicional).
- `src/modules/fleet/components/TollBoothCatalogSummary.component.tsx` (85 linhas) — o cabeçalho
  (`TollBoothCatalogHeader`: total, data, estado, pendência de tarifa por eixo — os quatro dados do
  RF2) e a paginação (`TollBoothCatalogPagination`: anterior/próxima com `Icon
chevron-left/chevron-right`, `Página X de Y`).

`TollBoothChargePanel.component.tsx` (218 → 100 linhas) virou o orquestrador fino: busca (`<input
type="search">`, no molde de `FreightRegionFilters.component.tsx`), cabeçalho, e os quatro ramos do
corpo — carregando (`Skeleton`), erro de leitura, catálogo `empty` (frase própria de "nunca
carregado", nunca "sem pedágio" — a mesma trava que `resolveTollCatalogStatus` já documenta para o
mapa da viagem), busca sem resultado (`catalog.searchEmpty` com a data do catálogo) e a lista com
paginação.

**Wiring em `FleetWorkspace.page.tsx`:** `useTollBoothCatalog` abre na mesma condição de antes
(`canManageSettings && settingsScope.tollBoothCharges` — mudar essa gate é fora do escopo desta
task, que é só a fonte dos dados). `useTollBoothCharges` (mutações de ajuste/limpeza, spec 095)
**perdeu a leitura**: o `query`/`read` que buscava `GET /company-settings/toll-booth-charges` para a
tela morreu por não ter mais chamador (nada além desta página usava
`useTollBoothCharges().query`) — o hook agora só grava, e o parâmetro `{ companyId, enabled }` saiu
da assinatura por não sobrar uso para ele. As duas mutações passam a invalidar a chave do catálogo
(`TOLL_BOOTH_CATALOG_QUERY_KEY`) além da própria, porque a praça ajustada mora nas duas listas —
sem isso, o ajuste ficaria com cara de não ter salvo até o `staleTime` de 30s vencer sozinho.

**Vermelho visto, corrigido antes do verde:** a primeira versão de `tollBoothCatalog.validation.ts`
declarava um `hasExactKeys` local (combinando `hasEveryKey`+`hasOnlyKeys` de
`fleetGuards.validation.ts`). `bun run test` (suíte completa) reprovou
`test/shared/object-keys-single-source.contract.ts` ("a guarda de chaves tem um lugar só", spec
079):

```
- []
+ ["fleet/shared/tollBoothCatalog.validation.ts"]
```

Corrigido importando `hasExactKeys` de `@/modules/shared/objectKeys.service` (a guarda única,
_type predicate_) em vez de reimplementá-la — nenhuma regra afrouxada, a duplicata some.

**Contrato reescrito, não afrouxado:** `test/fleet/toll-booth-charge-tab.contract.ts` (spec 095)
tinha três asserções literais amarradas à arquitetura antiga (`charges={tollBoothCharges.query.data}`,
`loading={tollBoothCharges.query.isLoading}`, e `chargePerAxleSource`/`FleetDateField`/`Skeleton`
lidos só de `PANEL_PATH`) — incompatíveis com a mudança que esta própria task pede. Reescrito
mantendo toda asserção que continua verdadeira (permissão `settings.manage`, calendário do design
system, sem controle cru, dicionário completo nos dois idiomas) e acrescentando a cobertura do
processo pedido:

- busca dispara a consulta com `search` e reinicia a página (`useTollBoothCatalog.hook.ts`);
- troca de página passa `page`/`perPage` ao cliente (`tollBoothCatalogClient.service.ts`);
- cabeçalho mostra os quatro dados do RF2 (`TollBoothCatalogSummary.component.tsx`);
- catálogo vazio mostra a frase própria de "nunca carregado";
- busca sem resultado nomeia a data do catálogo;
- praça `catalogKnown: false` aparece marcada (`Badge` com `unknownCatalog`) e continua editável
  (`onAdjust` incondicional na mesma linha);
- os nove novos rótulos (mais os três de `status`) aparecem nos dois dicionários de locale.

**Os "quatro dicionários" do plano item 12 não se aplicam integralmente a esta task**: o plano
descreve o rigor de `valuation-gap-labels.contract.ts` (que cobre **dois módulos**, `trip` e
`trip-financials`, porque o mesmo texto aparece nas duas telas) para a spec 154 **inteira**
(T204+T303+T401). T204 só toca `TollBoothChargePanel`, que mora sozinho no módulo `fleet` — os
textos novos entram nos dois dicionários desse módulo (`fleet.locale.json` +
`fleet.en.locale.json`). Os outros dois dicionários do rigor completo (`trip.locale.json` +
`trip.en.locale.json`, para a ação de ajuste em `RouteTollSummary`) pertencem à T401, que ainda não
rodou. Nenhum texto de T204 ficou de fora dos dois dicionários que lhe cabem — conferido pelo
próprio contrato reescrito acima.

**Textos atualizados que descreviam o comportamento antigo:** `tollBoothCharges.hint` e
`tollBoothCharges.empty` (nos dois idiomas) diziam "só aparecem as praças que alguma viagem já
cruzou" — falso a partir desta task. `hint` perdeu a frase; `empty` (que só sobra como retaguarda
para o caso quase inalcançável de página além do total sem busca) virou um texto genérico, porque o
caso que ele descrevia (viagem não vista) não existe mais nesta tela — quem descreve catálogo
vazio agora é `catalog.status.empty`, e quem descreve busca sem resultado é `catalog.searchEmpty`.

**Gates:**

```
$ bun run typecheck   # 6 apps — exit 0
$ bun run lint        # 6 apps, --max-warnings=0 — exit 0
$ bun run format:check  # exit 0 (2 arquivos reformatados por --write antes do check final)
$ cd apps/frontend-transportada && bun run test
 4169 pass
 0 fail
 36402 expect() calls
Ran 4169 tests across 29 files. [3.50s]
$ cd apps/frontend-transportada && bun run build
✓ built in 9.46s   # PWA gerado, mesmo aviso pré-existente de chunk >500kB (vectorBasemap/index)
```

`test/fleet.contract.test.ts` sozinho: 531 pass, 0 fail (inclui as 15 asserções do contrato
reescrito desta task).

**Aceites conferidos:**

1. Com `catalogKnown`/`seen` resolvidos pela política do servidor (T202) e a busca do painel indo
   direto para `GET /v1/toll-booths?search=...`, uma praça nunca vista pela operação aparece e é
   editável — a lista deixou de depender de `readSeenOsmNodeIds`. Prova é o contrato de use case da
   T202 (catálogo inteiro, ordem D1) somado ao contrato novo desta task (o painel lê `catalog`, não
   mais `tollBoothCharges.query`).
2. `TollBoothCatalogHeader` mostra `boothCount`, a data (`observedOn`) ou a frase de nunca
   carregado, o `status` e `boothsWithoutAxleChargeCount` — os quatro dados — e o corpo mostra a
   frase própria de `status === 'empty'` quando `toll_booths` está vazia, nunca "sem pedágio" nem
   lista muda.

**Divergência de escopo, não bloqueio:** o bloco de recarga do extrato (RF3/RF4, botão só com
`settings.manage`) é T303, explicitamente fora desta task — o painel de hoje não oferece recarregar,
só ler o catálogo e ajustar.

### T301 — `POST`/`GET /v1/toll-booths/extracts`

Arquivos novos: `src/toll-booths/domain/toll-booth-extract.policy.ts` (`buildExtractObjectKey`,
`summarizeTollBoothExtract`, `TollBoothExtractRow`/`TollBoothExtractRowInput`),
`toll-booth-extract.error.ts` (`TollBoothExtractDuplicateError` 409,
`TollBoothExtractObjectConflictError` 409, ambas `ApiError` — **este repositório não tem
`DomainError`/`shared/errors/codes.ts`**; a base real é `src/shared/api.error.ts`, conferido antes de
escrever qualquer coisa: nenhum módulo estende `DomainError`),
`application/toll-booth-extract.port.ts`, `create-toll-booth-extract.use-case.ts` (sem `try/catch` —
o mapeamento dos dois conflitos é da infraestrutura), `list-toll-booth-extracts.use-case.ts`,
`infrastructure/drizzle-toll-booth-extract.repository.ts`,
`infrastructure/toll-booth-extract-storage.gateway.ts`,
`presentation/toll-booth-extract.schema.ts`, `presentation/toll-booth-extract.routes.ts` (arquivo
próprio, separado de `toll-booth.routes.ts`, que continua com 76 linhas). Constante nova
`API_TOLL_BOOTH_EXTRACTS_PATH` em `shared/api.constant.ts`. Wiring em `src/main.ts`
(`tollBoothExtractRepository`, as duas rotas registradas ao lado de `createTollBoothRoutes`,
reaproveitando o `storageGateway`/`storageBucket` que `nfe-imports`/billing já montam — a spec (D3)
não pede bucket próprio, só "o bucket do ambiente").

#### Desenho: `dataset`/`observedOn` na query, o corpo é o array cru

O corpo é **exatamente** o JSON do extrator — o mesmo array que `toll-booths.json` guarda no bucket
(T001), sem envelope. `dataset` e `observedOn` não cabem nele (o extrator nunca os escreve, T001
P1), então viajam na query string (`?dataset=sudeste&observedOn=2026-09-14`), no molde de
`parseTollBoothCatalogQuery`. Isso é o que permite ao sha256 ser calculado sobre os **bytes crus**
lidos da requisição (nunca sobre um `JSON.stringify` de novo, que não reproduz os mesmos bytes por
ordem de chave/espaço) — condição para a resubida byte-a-byte do extrato hoje só manual em staging
(T001, decisão de resubir pela RF3b) ser reconhecida como `replayed` pelo `create-only` em vez de
gerar objeto divergente.

A forma de cada linha reaproveita `TollBoothExtractRowInput` (mesmos campos que
`osm-toll-booth.types.ts`/o extrator escrevem — `osmNodeId` incluso, tudo texto, RNF5); o Zod em
`toll-booth-extract.schema.ts` usa `satisfies z.ZodType<TollBoothExtractRowInput>` para nunca
divergir do tipo do domínio, e importa `MONEY_DECIMAL` de `shared/money.constant.ts` em vez de
redeclarar o regex de dinheiro (code-standart §16). Erros de todas as linhas juntos: `parseBody`/
`safeParse` do Zod já devolve `result.error.issues` inteiro, e o teste do 400 cobre duas violações
na mesma linha (`chargeCar` com duas casas, `osmNodeId` não numérico) numa resposta só.

#### `create-only` fim a fim: quem garante o quê

1. **Objeto antes da linha.** O use case chama `storage.putCreateOnly` primeiro; só grava a linha se
   o `put` não lançar. Isso evita o cenário em que a linha existe e o objeto não (ao contrário do
   caso extremo "objeto sumiu do bucket" da spec, que é depois de uma recarga, T302).
2. **Duplicidade da linha** é a `pkey` natural `(dataset, observed_on)` da T101 —
   `drizzle-toll-booth-extract.repository.ts` nunca faz `SELECT` antes do `INSERT` (janela de
   corrida); o `23505` do Postgres é mapeado por `violatedUniqueConstraint` (o mesmo helper de
   `postgres-error.support.ts` que `drizzle-fiscal-sequence-reservation.repository.ts` usa) para
   `TollBoothExtractDuplicateError`.
3. **Duplicidade do objeto** é o próprio `@adatechnology/object-storage-provider`: `mode:
'create-only'` devolve `disposition: 'replayed'` para os mesmos bytes na mesma chave, e lança
   `ObjectStorageError(objectConflict)` para bytes diferentes — confirmado lendo
   `node_modules/.../object-storage-provider/dist/index.js:198-230` antes de escrever o gateway.
   `toll-booth-extract-storage.gateway.ts` traduz esse `objectConflict` para
   `TollBoothExtractObjectConflictError`; qualquer outro erro do provider sobe cru. **Correção
   (T402, item 3):** esta frase estava errada — na época desta task o handler central
   (`http/response.service.ts`) não mapeava `ObjectStorageError` nenhum, e o `unavailable` cru
   virava **500 genérico**, não 503. A T302 mediu e registrou a divergência corretamente; a T402
   fechou-a mapeando `ObjectStorageError(unavailable)` para 503 `STORAGE_UNAVAILABLE` no handler
   central, valendo para esta rota e para qualquer outra que use storage.
4. **Nunca sobrescreve**: nenhum caminho do código chama `put` com outro `mode` — `create-only` é
   literal no `NfeStorageGateway.storeObject` que o módulo reaproveita, e a integração (abaixo)
   prova isso lendo o objeto de volta depois de cada tentativa.

#### Vermelho antes da implementação

```
$ bun test ./test/toll-booths.contract.test.ts
error: Cannot find module '../../src/toll-booths/presentation/toll-booth-extract.routes.js'
```

(o arquivo de teste foi escrito primeiro, contra os tipos/rotas que ainda não existiam.)

#### Verde depois

Contrato HTTP (`test/toll-booths/toll-booth-extract-routes.contract.ts`, 15 casos, dependências
dubladas — `201` com a linha; `409` no duplicado de linha; `409` no conflito de objeto; `400` com
duas violações Zod na mesma resposta; `400` de `dataset` inválido na query; `403` sem
`settings.manage` nas duas rotas; `companyId`/ator nunca lidos do corpo; listagem do mais novo para
o mais antigo):

```
$ bun test ./test/toll-booths.contract.test.ts
 95 pass
 9 skip
 0 fail
 190 expect() calls
Ran 104 tests across 1 file. [342.00ms]
```

Suíte completa de contrato da API:

```
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
 6299 pass
 23 skip
 0 fail
 22018 expect() calls
Ran 6322 tests across 177 files. [23.65s]
```

(Eram 6263 pass/23 skip na linha de base do T101 — as 36 novas são as 15 desta task mais as que já
existiam entre T101 e agora nas fases 1-2; nenhuma quebrou.)

#### Integração real: MinIO + Postgres, não dublados

`test/integration/toll-booth-extract-storage.integration.ts` (novo, acrescentado à lista explícita
do script `test:integration` do `package.json`, ao lado de
`toll-booth-sighting-repository.integration.ts`) sobe um Postgres descartável
(`runDatabaseMigrations` + `createDrizzleProvider`, molde de
`toll-booth-sighting-repository.integration.ts`) e fala com o MinIO de `make e2e-up` via
`createObjectStorageProvider` de verdade — dois casos:

1. Primeira chamada grava objeto + linha; a segunda, com os mesmos bytes/`dataset`/`observedOn`,
   recebe `TollBoothExtractDuplicateError` — e o `head()` do objeto depois da segunda tentativa
   prova `sha256`/`contentLength` **inalterados** frente à primeira (o `put` da segunda tentativa
   respondeu `replayed`, nunca reescreveu).
2. Um objeto de terceiro (bytes diferentes) plantado na chave antes da chamada: o use case responde
   `TollBoothExtractObjectConflictError`, o `head()` depois mostra o objeto do terceiro **intacto**,
   e nenhuma linha é gravada (`list()` vazio) — a linha nunca nasce sem o objeto ter sido aceito.

```
$ make e2e-up
 Container transportada-test-postgres-1  Healthy
 Container transportada-test-rabbitmq-1  Healthy
 Container transportada-test-minio-1     Healthy

$ cd apps/api-transportada && bun --env-file=../../.env.test test \
    ./test/integration/toll-booth-extract-storage.integration.ts --timeout 60000
 2 pass
 0 fail
 10 expect() calls
Ran 2 tests across 1 file. [2.65s]
```

⚠️ **Divergência encontrada, não desta task:** com o `.env.test` do repositório _sem alteração_, a
suíte acima (e a já existente `cte-archive-gateway.integration.ts`, confirmada com o mesmo sintoma
antes de eu tocar em qualquer arquivo) responde `ObjectStorageError: Object storage is unavailable`.
Causa: `STORAGE_SECRET_KEY=replace-me` no `.env.test` compartilhado (link simbólico para
`~/Documents/personal/transportada/.env.test`, fora deste worktree) não bate com a senha fixa que
`compose.yaml` grava no container (`MINIO_ROOT_PASSWORD: minio-local-password`, linha 39). MinIO
**subiu** — não é o caso de "não subir" da instrução — só a credencial do arquivo compartilhado está
desatualizada. Corrigi-la exige editar um arquivo fora deste worktree, e o classificador de
permissões da sessão recusou a escrita ("Modify Shared Resources"); a correção de uma linha
(`STORAGE_SECRET_KEY=minio-local-password`) fica para quem tiver permissão sobre
`~/Documents/personal/transportada/.env.test`. As duas rodadas acima (contra o MinIO/Postgres reais)
foram obtidas passando `STORAGE_SECRET_KEY=minio-local-password` como override de ambiente na
própria chamada do `bun test`, sem alterar nenhum arquivo — é a prova genuína de create-only, só não
reproduzível com o comando exato do runbook até aquele arquivo compartilhado ser corrigido.

#### Gates

```
$ bun run typecheck    # 6 apps — exit 0
$ bun run lint         # 6 apps, --max-warnings=0 — exit 0
$ bun run format:check # exit 0 (2 arquivos reformatados por --write antes do check final)
```

#### Divergências em relação ao plano/instrução

- **Nome do tipo da linha do extrato:** o `plan.md` sugeriu `TollBoothExtractRecord`, mas esse nome
  já existe em `osm-toll-booth.types.ts` com outro significado (uma praça do extract, não a linha da
  tabela). Usei `TollBoothExtractRow` para a linha e `TollBoothExtractRowInput` para uma praça do
  corpo, evitando colisão sem inventar um terceiro conceito.
- **`shared/errors/codes.ts`/`DomainError`:** a instrução original pedia essa hierarquia (padrão
  genérico do ecossistema), mas este repositório não a tem — confirmado por busca em todo `src/`
  antes de escrever. Segui o padrão real e medido do repositório (`ApiError` de
  `shared/api.error.ts`, um `*.error.ts` por módulo, código inline sem catálogo central), o mesmo
  que `fleet.error.ts`/`company-settings.error.ts` usam.
- **Credencial do `.env.test`** (acima): fora do escopo desta task e fora deste worktree; reportado,
  não corrigido.

### T302 — `POST /v1/toll-booths/reload`

Task 🧠: desenho decidido pelo `architect` (opus) antes da implementação e seguido como veio.

#### Desenho resumido

- **Trava global não bloqueante.** A primeira instrução da transação é
  `select pg_try_advisory_xact_lock(TOLL_BOOTH_CATALOG_RELOAD_LOCK_ID)` (`14_154`, literal em
  `toll-booth-catalog.constant.ts`, no molde de `14_026`/`14_014`; conferido que nenhum outro id literal
  ou chamada de trava do monorepo usa esse valor). `false` → `TollBoothCatalogReloadInProgressError`
  (409). Sem `FOR UPDATE`. Global porque o recurso disputado é `toll_booths`; não bloqueante porque
  esperar estouraria o teto de 10s da requisição.
- **Porta** `TollBoothCatalogReloadPort.runExclusive(work)`
  (`infrastructure/drizzle-toll-booth-catalog-reload.repository.ts`): `database.transaction` → trava
  → `createDrizzleTollBoothRepository(tx)` (o tipo `TollBoothDatabase` passou a aceitar a transação) →
  entrega a `work` `saveMany`, `readCatalogSummary`, `markReloaded` (`UPDATE … RETURNING`, grava
  `reloaded_*` e zera `missing_object_observed_at`) e `insertAudit`.
- **Use case** `reload-toll-booth-catalog.use-case.ts` (sem `try/catch` fora do `JSON.parse`), nesta
  ordem: linha por `(dataset, observedOn)` ou 404 sem tocar no storage → `head` (ausente: grava
  `missing_object_observed_at = now()` fora da transação e responde 409) → `contentLength` acima de
  `APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES` é 409 de integridade, sem baixar → download limitado ao mesmo
  teto → sha256 dos bytes crus diferente do da linha é 409, com `warn` só de dataset, data e os dois
  hashes → Zod do upload (`tollBoothExtractBodySchema`, agora exportado) + recusa de `osmNodeId`
  repetido → **só então** `runExclusive`: seed pelo `createSeedTollBoothsUseCase` com o `saveMany` da
  transação e `observedOn` **da linha** → resumo do catálogo → `markReloaded` → `audit_logs` → commit.
- **Erros** (`ApiError`, `toll-booth-extract.error.ts`): `TOLL_BOOTH_EXTRACT_NOT_FOUND` 404,
  `TOLL_BOOTH_EXTRACT_OBJECT_MISSING` 409, `TOLL_BOOTH_EXTRACT_INTEGRITY_MISMATCH` 409,
  `TOLL_BOOTH_CATALOG_RELOAD_IN_PROGRESS` 409.
- **D7:** `saveMany` continua só upsert. A conversão de texto para `BigInt` saiu de
  `toll-booth-seed.service.ts` para `toTollBoothSeedRecords` na policy, usada pela CLI e pela recarga.
- **Idempotência:** o upsert ganhou `setWhere` com `(charge_car, charge_per_axle, latitude, longitude,
name, observed_on, operator) is distinct from (excluded.…)`.
- **Resposta 200** `{ data: { dataset, observedOn, savedBoothCount, catalogBoothCount,
boothsMissingFromExtract, reloadedAt, reloadedByUserId } }`, `no-store`; entrada por
  `parseTollBoothExtractQuery` (chave extra → 400), corpo ignorado. Rota
  `createTollBoothCatalogReloadRoutes` em `toll-booth-extract.routes.ts`, `API_TOLL_BOOTH_RELOAD_PATH`,
  `settings.manage`. Ator, empresa e `correlationId` vêm do contexto.
- **Auditoria:** uma linha em `audit_logs` na mesma transação — `action 'toll_booth_catalog.reloaded'`,
  `entityType/targetType 'toll_booth_extract'`, `entityId/targetId` = UUID determinístico dos primeiros
  32 hex do sha256, `metadata {dataset, observedOn, savedBoothCount}` (sem nome nem operador),
  `permission 'settings.manage'`.

#### Premissas contrariadas pelo código

1. **"Não existe trilha de auditoria de uso geral"** (spec.md): falso — `audit_logs` existe
   (`fiscal-operation.schema.ts`) e já é usada por `drizzle-contractor-mail.repository.ts`. A spec foi
   corrigida. O comentário de `src/database/toll-booth-extract.schema.ts` (T101) repete o erro e ficou
   como está, para não mexer no arquivo de schema nesta task.
2. **Aceite 3 ("a segunda execução não muda linha nenhuma") era falso:** o upsert gravava
   `updated_at = now()` sempre. Provado em vermelho abaixo e corrigido com `setWhere`.
3. **O `get` do provider não distingue objeto ausente:** transforma `NoSuchKey` em `unavailable`
   (`object-storage-provider/dist/index.js`, `get`). Por isso o objeto ausente é decidido pelo `head`.
4. **"Storage caindo sobe `unavailable` cru → 503 pelo handler":** o handler central
   (`http/response.service.ts`) **não** mapeia `ObjectStorageError`; só banco vira 503. O erro cru
   responde **500 genérico** (logado, sem stack ao cliente). Mantido como o desenho manda (sobe cru) — é
   divergência a decidir fora desta task. A evidência da T301 afirma o mesmo 503 e está errada no mesmo
   ponto.

#### Vermelho antes da implementação

Contrato de unidade escrito primeiro:

```
$ bun test ./test/toll-booths.contract.test.ts
error: Cannot find module '../../src/toll-booths/application/reload-toll-booth-catalog.use-case.js'
 0 pass
 1 fail
 1 error
```

Aceite 3 contra Postgres real: com a implementação pronta, **sem** o `setWhere`, a integração falha
exatamente em `updated_at`:

```
-     "updatedAt": 2026-09-17T17:25:38.326Z,
+     "updatedAt": 2026-09-17T17:25:38.339Z,
(fail) toll booth catalog reload integration (spec 154, T302) > reloads idempotently, keeps booths outside the extract and audits once
 3 pass
 1 fail
```

#### Verde depois

Contrato de unidade (`test/toll-booths/toll-booth-reload.contract.ts`, 11 casos pela rota real com o
caso de uso real e portas dubladas que registram a ordem: 403 sem tocar nada; 400 de query inválida e
de chave extra; 404 sem tocar o storage; objeto ausente → 409 + `markObjectMissing` e nada de
`runExclusive`; objeto acima do teto → 409 sem `read`; sha divergente → 409 sem seed nem `reloaded_*`;
nó repetido → 409; trava ocupada → 409; ordem `find → head → read → runExclusive → saveMany →
readCatalogSummary → markReloaded → insertAudit`; `observedOn` do seed = da linha, ator/empresa/
correlação do contexto; forma da resposta com `no-store`):

```
$ bun test ./test/toll-booths.contract.test.ts
 106 pass
 9 skip
 0 fail
```

Integração (`test/integration/toll-booth-reload.integration.ts`, acrescentada ao `test:integration`;
`createDatabaseProvider`, Postgres descartável + MinIO de `make e2e-up`, casos de uso reais de subida e
recarga, nada de `Promise.all`): 1) sobe e recarrega; a 2ª recarga deixa `toll_booths` **idêntica,
`updated_at` incluso**; a praça plantada fora do extrato continua com `observed_on` 2026-01-01 (D7);
`boothsMissingFromExtract` 1; `audit_logs` com uma linha e os campos acima. 2) linha sem objeto → 409,
`missing_object_observed_at` preenchido, `toll_booths` intacta; depois o objeto é posto e a recarga zera
a coluna. 3) bytes diferentes na chave → 409 de integridade, `toll_booths` vazia. 4) conexão separada
faz `begin; select pg_advisory_xact_lock(14154)`; recarga de extrato **diferente** → 409 e `toll_booths`
inalterada; após `rollback`, a mesma chamada passa.

`STORAGE_SECRET_KEY` passado como override de ambiente com a credencial do `compose.yaml` (mesma
divergência do `.env.test` compartilhado registrada na T301; o arquivo não foi editado nem exibido):

```
$ cd apps/api-transportada && STORAGE_SECRET_KEY=<compose.yaml> bun --env-file=../../.env.test test \
    ./test/integration/toll-booth-reload.integration.ts ./test/integration/toll-booth-extract-storage.integration.ts --timeout 120000
 6 pass
 0 fail
 28 expect() calls
Ran 6 tests across 2 files.
```

#### Gates

```
$ bun run typecheck     # exit 0
$ bun run lint          # exit 0
$ bun run format:check  # exit 0
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
 6310 pass
 23 skip
 0 fail
 22052 expect() calls
Ran 6333 tests across 177 files.
```

(Eram 6299 pass na T301: +11 desta task; as demais vieram com a base.)

Arquivos acima de 200 linhas divididos: fixture HTTP em `toll-booth-reload-http.fixture.ts` +
`toll-booth-reload-ports.fixture.ts`; ajudantes da integração em `toll-booth-reload-integration.fixture.ts`.

### T303 — bloco de recarga do catálogo (RF3/RF4/RF6, `apps/frontend-transportada`)

`apps/frontend-transportada`: dentro da aba de pedágio (Frota), abaixo de `TollBoothChargePanel`
(T204), um segundo bloco lê `GET /v1/toll-booths/extracts` e dispara `POST /v1/toll-booths/reload`
— só quando `settings.manage` está entre as permissões (RF6, D6, aceite 4).

**Arquivos novos** (todos abaixo do teto de 200 linhas):

- `src/modules/fleet/shared/tollBoothExtract.validation.ts` (97 linhas) — guarda de forma de
  `TollBoothExtractRow` (o que `GET /extracts` devolve) e `TollBoothReloadResult` (o que `POST
/reload` devolve), usando `hasExactKeys` de `objectKeys.service.ts` — a mesma guarda única da
  T204, nunca uma cópia local.
- `src/modules/fleet/shared/tollBoothExtractClient.service.ts` (96 linhas) — cliente próprio, no
  molde de `tollBoothCatalogClient.service.ts`: `listTollBoothExtracts` (`GET`) e
  `reloadTollBoothCatalog` (`POST …?dataset=&observedOn=`). Os helpers de requisição
  (`requestError`/`readErrorCode`/`requestJson`/`authorizedRequest`) repetem os de
  `tollBoothCatalogClient.service.ts` e `fleetCatalogClient.service.ts` — divergência conhecida do
  módulo (cada cliente já duplica o mesmo bloco de ~20 linhas hoje); corrigir essa duplicação é
  fora do escopo desta task, que segue o padrão real em vez de introduzir um terceiro molde.
- `src/modules/fleet/hooks/useTollBoothCatalogReload.hook.ts` (49 linhas) — `extractsQuery`
  (`enabled` só com `settings.manage`) e `reloadMutation`, que invalida
  `TOLL_BOOTH_CATALOG_QUERY_KEY` **e** a chave nova `TOLL_BOOTH_EXTRACTS_QUERY_KEY` ao terminar —
  o catálogo e a lista de extratos moram na mesma praça recarregada.
- `src/modules/fleet/components/TollBoothCatalogReloadDialog.component.tsx` (95 linhas) — a
  confirmação (D6: a recarga afeta todas as empresas da instalação), molde de
  `CompanyUserRemoveDialog.component.tsx` (`useModalDialog`, portal, foco preso, `Escape` fecha).
- `src/modules/fleet/components/TollBoothCatalogReloadPanel.component.tsx` (146 linhas) — o
  seletor de extrato (`@/components/ui/select`, nunca `<select>` nativo), o botão que abre o
  diálogo, o resultado da execução e os dois casos extremos de "nenhum extrato".
- CSS: `.overlay`/`.dialog`/`.dialogHeader`/`.dialogFooter` acrescentados a `fleet.module.css`
  (molde de `userAdministration.module.css`) — o módulo `fleet` não tinha diálogo antes desta task.

**Constantes novas** em `fleet.constant.ts`: `TOLL_BOOTH_EXTRACTS_PATH`, `TOLL_BOOTH_RELOAD_PATH`.

**Wiring em `FleetWorkspace.page.tsx`:** `useTollBoothCatalogReload({ enabled: canManageSettings &&
settingsScope.tollBoothCharges })` — a mesma condição do catálogo (T204) e da aba. O bloco só entra
no JSX dentro de `{canManageSettings && (<TollBoothCatalogReloadPanel …/>)}`: sem a permissão, nem
o componente monta nem o hook chega a ter `enabled: true` — a lista de extratos nunca é pedida.
`catalogStatus` vem de `tollBoothCatalog.query.data?.summary.status` (o mesmo resumo do RF2/T204),
para decidir entre as duas frases de "nenhum extrato".

#### Confirmação e efeito sobre a instalação inteira (D6)

O botão da lista nunca chama `onReload` direto — `setConfirming(selectedExtract ?? null)` abre
`TollBoothCatalogReloadDialog`, que mostra `tollBoothCharges.reload.confirmWarning` ("a recarga
afeta o catálogo de praças de todas as empresas desta instalação") antes de qualquer botão de
confirmar. Só `onConfirm` (dentro do diálogo) chama `props.onReload({ dataset, observedOn })`. Ao
suceder, um `useEffect` que observa `props.result` fecha o diálogo sozinho; ao falhar, o diálogo
continua aberto com o código do erro, para tentar de novo ou cancelar.

#### Seletor de extrato (RF3) e resultado (aceite 3)

O `Select` é montado a partir de `extracts` (já ordenado do mais novo para o mais antigo pela API,
T301) com `tollBoothCharges.reload.optionLabel` ("{{name}} — {{date}} ({{count}} praças)"); o valor
de cada opção é `${dataset}::${observedOn}` (nem o dataset nem a data ISO usam `::`, então a volta
por `split` nunca ambiguidade). Um `useEffect` seleciona o mais recente assim que a lista chega, se
nada foi escolhido ainda. A recarga chama `reloadTollBoothCatalog({ dataset, observedOn })` — o
cliente monta a query com os dois na URL (`toll-booth-extract.schema.ts` já exige exatamente essas
duas chaves, T301). O resultado (`props.result`) mostra as três linhas do RF4:
`resultSaved` (`savedBoothCount`), `resultObservedOn` (o `observedOn` **da resposta**, formatado por
`useDayFormatter`, ao lado do resumo — não o do cabeçalho do RF2, que só muda depois do
`invalidateQueries` seguinte) e `resultMissing` (`boothsMissingFromExtract`).

#### Os quatro códigos de erro (aceite 8, lado da tela)

`tollBoothCharges.reload.errors.*` — uma frase por código, no molde de
`users.errors.${errorCode}` (`CompanyUserRemoveDialog` e as outras seis telas de `identity` que já
usam `defaultValue`, spec anterior a esta): `TOLL_BOOTH_EXTRACT_NOT_FOUND` (escolha outro extrato),
`TOLL_BOOTH_EXTRACT_OBJECT_MISSING` (suba de novo pelo runbook), `TOLL_BOOTH_EXTRACT_INTEGRITY_MISMATCH`
(idem, objeto não bate), `TOLL_BOOTH_CATALOG_RELOAD_IN_PROGRESS` (espere a outra recarga terminar).
A rejeição do extrato **duplicado** (`TOLL_BOOTH_EXTRACT_DUPLICATE`, 409 de `POST /extracts`) não
tem tela nesta task — a subida do extrato pela UI é explicitamente fora de escopo do enunciado
("Upload do extrato pela tela NÃO é desta task"); o aceite 8 (subir duas vezes responde 409, objeto
não sobrescrito) é provado na API (T301, integração real contra MinIO).

#### Caso extremo: nenhum extrato registrado (RF3, RF6)

`extracts.length === 0` ramifica em duas frases, decidida por `catalogStatus`:

- `catalogStatus === 'empty'` → `tollBoothCharges.reload.noExtracts` ("nenhum extrato registrado
  ainda — não há o que recarregar"), sem menção a runbook — quem já lê "o catálogo nunca foi
  carregado" no cabeçalho do RF2 (T204) não precisa de uma segunda frase repetindo o mesmo fato.
- `catalogStatus !== 'empty'` (staging hoje: 592 praças carregadas pelo caminho manual, T001 P1,
  zero linhas em `toll_booth_extracts` até a T301 resubir) → `tollBoothCharges.reload.noExtractsWithCatalog`,
  que cita `docs/runbooks/osrm-extract.md` — o caso extremo exato que a spec descreve ("instalação
  que já tem `toll_booths` carregada pelo caminho manual… a tela tem de dizer isso sem sugerir que
  o catálogo está vazio").

#### Aceite 5 (auditoria) — provado fora desta tela

A trilha de auditoria (ator, dataset, data do extrato) é gravada pela API na mesma transação da
recarga (`audit_logs`, ação `toll_booth_catalog.reloaded`) — provada na integração da T302
(`toll-booth-reload.integration.ts`, item 1: "audit_logs com uma linha e os campos acima"). Esta
tela não lê nem exibe a trilha; ela só dispara a ação que a gera.

#### Vermelho antes da implementação

```
$ cd apps/frontend-transportada && bun run test 2>&1 | grep -A2 "Cannot find module"
error: Cannot find module '../../src/modules/fleet/components/TollBoothCatalogReloadPanel.component.js'
```

(o describe `fleet toll booth catalog reload contract (spec 154 T303)` foi escrito primeiro, contra
componentes/hooks/cliente que ainda não existiam — mesmo padrão de teste de contrato por leitura de
texto-fonte que a T204 já usa nesta app, sem `zod` e sem framework de render: a suíte lê os
arquivos e confere substring/estrutura, nunca monta DOM.)

#### Verde depois

```
$ cd apps/frontend-transportada && bun run test
 4178 pass
 0 fail
 36636 expect() calls
Ran 4178 tests across 29 files. [3.65s]
```

(Eram 4169 pass na T204: +9 desta task — 8 testes novos do describe de recarga mais a alteração do
teste "o hook do catálogo abre..." não contou porque reaproveita asserção existente; nenhum teste
antigo quebrou ou foi afrouxado.)

#### Gates

```
$ bun run typecheck     # 6 apps — exit 0
$ bun run lint          # 6 apps, --max-warnings=0 — exit 0
$ bun run format:check  # exit 0 (3 arquivos reformatados por --write antes do check final:
                         # TollBoothCatalogReloadPanel.component.tsx, FleetWorkspace.page.tsx,
                         # toll-booth-charge-tab.contract.ts)
$ cd apps/frontend-transportada && bun run build
✓ built in 8.76s   # PWA gerado, mesmo aviso pré-existente de chunk >500kB (vectorBasemap/index)
```

**Aceites conferidos:**

3. `POST /v1/toll-booths/reload` sobre um extrato do bucket deixa `toll_booths` com as praças dele,
   sem apagar as que não vieram, e a segunda execução não muda linha nenhuma — provado na API
   (T302, integração e contrato). **Lado da tela:** o seletor manda exatamente o `dataset`/
   `observedOn` do extrato escolhido (`tollBoothCatalogReload.reloadMutation.mutate({dataset,
observedOn})`) e o resultado mostra `savedBoothCount`/`observedOn`/`boothsMissingFromExtract` —
   contrato novo desta task.
4. A recarga sem `settings.manage` responde 403 (provado na API, T302) — **a tela nem mostra o
   botão nem consulta a lista de extratos**: `TollBoothCatalogReloadPanel` só entra no JSX com
   `canManageSettings`, e `useTollBoothCatalogReload` só habilita a query com a mesma condição —
   contrato novo desta task ("o bloco de recarga só renderiza e só consulta extratos com
   settings.manage").
5. A recarga aparece na trilha de auditoria com ator, dataset e data do extrato — provado na API
   (T302, `audit_logs` na mesma transação). Fora do alcance desta tela.
6. Subir o mesmo extrato duas vezes responde 409 na segunda, sem sobrescrever o objeto — provado na
   API (T301, integração real com MinIO: `head()` confirma bytes inalterados). **Lado da tela:**
   fora de escopo (upload não é desta task); o que a tela cobre é o efeito indireto — o extrato
   duplicado nunca aparece duas vezes no seletor, porque `(dataset, observedOn)` é a mesma linha.

**Divergência de escopo, não bloqueio:** a subida do extrato (RF3b, `POST /extracts`) não tem tela
— o enunciado da task exclui isso explicitamente. `RouteTollSummary` (T401, aceite 6) e o runbook
(T501) continuam fora desta task.

### T401 — `RouteTollSummary`: ação de ajuste na praça sem tarifa conhecida (RF7, `apps/frontend-transportada`)

`apps/frontend-transportada`: `RouteTollSummary.component.tsx` — o extrato de pedágio da rota
(montagem e detalhe da viagem, um componente só, spec 090) — já marcava a praça sem tarifa
(`statementWithoutCharge`) e a que caiu para a manual (`statementFellBack`). A praça sem tarifa
conhecida ganha um botão que leva ao ajuste dela em Frota → Pedágio, só quando quem olha tem
`settings.manage`.

**Navegação escolhida:** a aba de pedágio (T204/T303) já lê `search` de estado local
(`useTollBoothCatalog.hook.ts`), e o shell já resolve a aba inicial e parâmetros de deep link pela
query string (`fleetRoute.service.ts`, usada por `driverId`/`vehicleId` — spec anterior). RF7 segue
o mesmo molde em vez de inventar um terceiro, com um parâmetro dedicado
(`FLEET_TOLL_BOOTH_PARAMETER = 'tollBoothSearch'`) porque o valor é **texto livre pré-preenchido**,
não um id como os outros dois:

- `fleetRoute.service.ts` (53 linhas): `buildFleetTollBoothRoute(search)`,
  `parseFleetTollBoothSearchParameter(search)` (o termo, `null` quando vazio — mesma semântica de
  `parseFleetDriverParameter`) e `hasFleetTollBoothParameter(search)`, uma função **nova** e
  deliberadamente distinta do parse: a praça pode não ter nome nem operador (`booth.name` e
  `booth.operator` os dois `null`), e mesmo assim a ação precisa abrir a aba certa — só sem termo
  para pré-preencher. Usar só `parseFleetTollBoothSearchParameter(...) !== null` erraria esse caso
  (string vazia também vira `null` no parse), por isso a presença do parâmetro na URL é uma
  pergunta separada da leitura do valor.
- `FleetWorkspace.page.tsx`: `resolveInitialTab` ganha o terceiro `if` (`tolls` quando
  `hasFleetTollBoothParameter`), e `useTollBoothCatalog` recebe `initialSearch` a partir de
  `parseFleetTollBoothSearchParameter(window.location.search) ?? ''` — mesmo padrão de leitura de
  `window.location.search` que `resolveInitialTab` já fazia para driver/vehicle.
- `useTollBoothCatalog.hook.ts`: `useState('')` vira `useState(input.initialSearch ?? '')` — a
  única mudança nesse hook; debounce, paginação e o resto do contrato de T204 continuam intactos
  (nada no `test/fleet/toll-booth-charge-tab.contract.ts` da T204 lê `initialSearch`, que é opcional
  e retrocompatível).
- `tripNavigation.service.ts` (68 linhas), no molde de `navigateToPackageBoxQueue` (spec 144) e
  `navigateToFleetDriver`/`navigateToFleetVehicle` (`identity/shared/fleetNavigation.service.ts`,
  que a spec 154 não toca): `resolveTollBoothAdjustmentSearch(booth)` (o termo — `name` quando
  existe, `operator` no resto, `''` quando nenhum dos dois) e
  `navigateToFleetTollBoothAdjustment({ navigator, search })` (`pushPath` +
  `rememberWorkspace('fleet')` + `dispatchPopState()`, a navegação manual do shell — spec 154 não
  usa `<a href>`: cliques na feature inteira já passam por esse molde).
- `RouteTollSummary.component.tsx` (163 linhas): prop nova `canAdjustTollBooth: boolean` — quem
  hospeda decide a permissão, o componente só obedece (mesmo desenho de `canCorrect` em
  `TripRouteMap.component.tsx`). Por praça com `effectiveChargePerAxle === null` **e**
  `canAdjustTollBooth`, um `<Button size="sm" variant="ghost">` com `<Icon name="edit" />` (o
  `test/trip/action-icons.contract.ts` da própria app exige ícone em todo botão da viagem — pego no
  vermelho, ver abaixo) chama `handleAdjustBooth(booth)`, que compõe as duas funções acima.

**Threading da permissão até o componente:** `RouteTollSummary` é renderizado em três lugares, e os
três precisam de `canAdjustTollBooth`:

1. `TripRouteMap.component.tsx` (detalhe da viagem) → prop nova `canAdjustTollBooth`, repassada de
   `TripDetail.component.tsx` (prop nova de mesmo nome) → `TripDetail.page.tsx`, que já tem
   `permissions` do `useAuthMeQuery()` e agora computa
   `canAdjustTollBooth = permissions.includes(SETTINGS_MANAGE_PERMISSION)` — a mesma constante que
   `TripWorkspace.page.tsx` já importa de `@/modules/company-settings/shared/companySettings.constant`
   para o mesmo fim (cadastro de tipo de ocorrência). `TripDetail` não carregava `settings.manage`
   antes: a viagem só conhecia `trip.manage` (`canManage`, de `workspace.controller.canManageTrips`)
   — as duas permissões são independentes, e usar `canManage` aqui teria misturado a permissão
   errada.
2. `TripAssemblyMap.component.tsx` (montagem, usada na proposta e na criação rápida) → prop nova
   `canAdjustTollBooth`, repassada por `TripProposalDetail.component.tsx` e
   `TripQuickCreateDialog.component.tsx` — as duas já recebem `permissions: readonly string[]` e já
   computam `canManage={permissions.includes(TRIP_MANAGE_PERMISSION)}` para `TripReviewQueue`; o
   ajuste de pedágio é `settings.manage`, uma permissão de empresa que existe independente de a
   viagem já estar salva — o catálogo de praças não é por viagem.

**Vermelho visto, corrigido antes do verde:**

```
$ cd apps/frontend-transportada && bun test ./test/trip.contract.test.ts
(fail) pedágio na montagem (spec 090 T7) > está montado logo abaixo do tempo do roteiro
  Expected: > 25006   Received: -1
(fail) ícone em toda ação da viagem > nenhum botão da viagem fica sem ícone
  + ["src/modules/trip/components/RouteTollSummary.component.tsx: assemblyMap.toll.adjustBooth"]
 902 pass / 2 fail
```

O primeiro é o contrato de spec 090 (`assembly-toll.contract.ts`) que lia o JSX exato
`<RouteTollSummary toll={toll} />` por texto-fonte — corrigido para a linha nova
(`canAdjustTollBooth={canAdjustTollBooth} toll={toll} />`), a mesma verificação ("o bloco de pedágio
vem logo abaixo do tempo do roteiro"), não uma que afrouxa nada. O segundo é o contrato "nenhum
botão da viagem fica sem ícone" (`action-icons.contract.ts`, varredura por glob — pega botão novo
sozinho): o botão de ajuste ganhou `<Icon name="edit" />` para seguir a mesma convenção do resto da
tela, em vez de a suíte relaxar a regra para o botão novo.

**Contrato novo — por que renderizado, não texto-fonte:** os outros contratos de
`RouteTollSummary` (`assembly-toll.contract.ts`, `assembly-toll-booths.contract.ts`) leem o
`.tsx` por `readFileSync` e conferem substring — o padrão da app inteira, que não usa jsdom nem
`@testing-library` em teste nenhum. O enunciado desta task pediu explicitamente o oposto para os
três casos de permissão/tarifa ("prefira asserção sobre o que é renderizado, não sobre texto-fonte
do arquivo"). `test/trip/route-toll-adjustment.contract.tsx` (141 linhas, novo) atende isso com
`renderToStaticMarkup` (`react-dom/server`, já dependência da app — nenhum pacote novo) mais o
`i18n.service.ts` de produção importado por efeito colateral, para obter HTML real com o mesmo
`t()` e os mesmos dicionários que a tela usa em produção:

- praça sem `effectiveChargePerAxle` e `canAdjustTollBooth: true` → o HTML renderizado contém
  `>{{rótulo traduzido}}<`;
- praça com `effectiveChargePerAxle` conhecida → o rótulo não aparece no HTML, mesmo com a
  permissão;
- praça sem `effectiveChargePerAxle` e `canAdjustTollBooth: false` → o rótulo não aparece, mesmo
  sem tarifa.

**Limite reconhecido, não contornado:** `renderToStaticMarkup` descarta manipuladores de evento
(é SSR) e este app não roda jsdom em teste nenhum — não há como clicar o botão e observar
`window.history.pushState` no mesmo teste sem introduzir uma dependência nova, fora do pedido
("dividir arquivo acima de 200 linhas", não "adicionar jsdom"). A quarta asserção do contrato prova
"leva ao ajuste da praça certa" pela composição das mesmas funções puras que o `onClick` chama
(`resolveTollBoothAdjustmentSearch` → `buildFleetTollBoothRoute`), incluindo o caso de praça sem
nome e sem operador (cai em `''`, a aba ainda abre porque o parâmetro está presente, só sem termo) —
e confere que `FleetWorkspace.page.tsx` lê de volta o mesmo valor com
`parseFleetTollBoothSearchParameter`.

**Verde depois:**

```
$ cd apps/frontend-transportada && bun test ./test/trip.contract.test.ts -t "aceite 6"
 4 pass
 0 fail
 9 expect() calls
Ran 4 tests across 1 file. [99.00ms]

$ cd apps/frontend-transportada && bun test ./test/trip.contract.test.ts
 904 pass
 0 fail
 17706 expect() calls
Ran 904 tests across 1 file. [627.00ms]
```

**Locales (plano item 12, os dois dicionários que faltavam da feature):** uma chave nova,
`assemblyMap.toll.adjustBooth`, em `trip.locale.json` ("Ajustar tarifa desta praça") e
`trip.en.locale.json` ("Adjust this booth's tariff") — os dois dicionários do módulo trip que a
evidência da T204 já apontava como pendentes desta task. Não há contrato de paridade de chaves
entre os dois arquivos do módulo trip (ao contrário de `document-intake`, que tem o seu); a chave
nova entrou nos dois de qualquer forma, e o teste de render confere a tradução pt-BR via
`tripLocale.assemblyMap.toll.adjustBooth` real.

**Gates:**

```
$ bun run typecheck   # 6 apps — exit 0
$ bun run lint        # 6 apps, --max-warnings=0 — exit 0
$ bun run format:check  # exit 0 (3 arquivos reformatados por --write antes do check final:
                         # TripDetail.component.tsx, test/trip/assembly-toll.contract.ts,
                         # test/trip/route-toll-adjustment.contract.tsx)
$ cd apps/frontend-transportada && bun run test
 4182 pass
 0 fail
 36645 expect() calls
Ran 4182 tests across 29 files. [3.65s]
$ cd apps/frontend-transportada && bun run build
✓ built in 8.41s   # PWA gerado, mesmo aviso pré-existente de chunk >500kB (vectorBasemap/index)
```

(Eram 4178 pass na T303: +4 desta task, o `describe` novo de `route-toll-adjustment.contract.tsx`;
nenhum teste antigo quebrou ou foi afrouxado — os dois vermelhos acima foram corrigidos ajustando a
asserção ao novo texto-fonte real, não relaxando o que eles conferem.)

**Aceite conferido:**

6. Praça marcada "sem tarifa conhecida" no extrato da rota leva ao ajuste dela: o botão (visível só
   com `settings.manage`) abre `/fleet?tollBoothSearch=<nome ou operador da praça>`, que
   `resolveInitialTab` resolve para a aba `tolls` e `useTollBoothCatalog` usa como
   `initialSearch` — a mesma praça chega pré-filtrada no catálogo que T204 já lista, pronta para o
   ajuste que `useTollBoothCharges` (spec 095) já grava. "Depois do ajuste o total da rota deixa de
   contá-la como sem tarifa" é o comportamento existente de `resolveTollRouteCost` (spec 090 T5, não
   tocado por esta task) recalculando `effectiveChargePerAxle` a partir do catálogo/ajustes
   atualizados na próxima leitura da rota — esta task não altera esse cálculo, só abre o caminho até
   o ajuste.

**Divergência de escopo, não bloqueio:** nenhuma. T501 (runbook) e T502 (revisão final) continuam
fora desta task.

### T402 — pendentes de T301/T302/T303 fechados

Seis pendências registradas pelos executores de T301/T302/T303, cada uma fechada com o vermelho
antes da correção. Nenhuma exigiu decisão de produto — todas eram técnicas.

#### 1. Extrato com `osmNodeId` repetido era aceito no upload

`toll-booth-extract.schema.ts`: `hasRepeatedOsmNodeId` (já existia, só era chamada na recarga) virou
`.refine()` de `tollBoothExtractBodySchema`, então o upload recusa junto dos outros erros de
validação Zod. `reload-toll-booth-catalog.use-case.ts` (`parseBooths`) parou de chamar o helper à
parte — `!result.success` já cobre o caso, porque o schema agora recusa sozinho.

Vermelho (`test/toll-booths/toll-booth-extract-routes.contract.ts`, teste novo):

```
$ bun test ./test/toll-booths/toll-booth-extract-routes.contract.ts
(fail) answers 400 when the same osmNodeId repeats in the extract
Expected: 400
Received: 201
```

Verde depois da correção — ver gates ao fim da seção.

#### 2. Coordenada fora da faixa passava pela validação e derrubava a recarga com 500

`COORDINATE_PATTERN` aceitava `-999.9999999` a `999.9999999`; só o `assertValid`/`assertCoordinate`
do seed (`seed-toll-booths.use-case.ts`) recusava, com `Error` comum dentro da transação de recarga
— sem `try/catch` no caminho, isso subia cru até o handler central e virava 500 genérico.
`toll-booth-extract.schema.ts` ganhou `coordinateSchema(bound)`: mesma faixa que `assertCoordinate`
já usa (`±90` latitude, `±180` longitude, inclusive nas duas pontas — `Math.abs(parsed) > bound`),
via `.refine()` sobre o `COORDINATE_PATTERN` existente. `assertValid` do seed **não foi tocado** —
continua a última rede, agora redundante para este caso específico mas ainda a única defesa para
quem grava `toll_booths` por outro caminho (a CLI de seed, spec 090).

No upload (`toll-booth-extract-routes.contract.ts`), a linha fora da faixa agora é 400, junto dos
outros erros Zod. Na recarga (`toll-booth-reload.contract.ts`), o mesmo objeto no bucket — que só a
recarga lê de volta e reprocessa pelo mesmo schema — vira 409 `TOLL_BOOTH_EXTRACT_INTEGRITY_MISMATCH`
(o mesmo código do sha256 divergente e do nó repetido), nunca mais 500.

Vermelho, upload:

```
$ bun test ./test/toll-booths/toll-booth-extract-routes.contract.ts
(fail) answers 400 when latitude or longitude is out of range
Expected: 400
Received: 201
```

Vermelho, recarga (capturado revertendo temporariamente só `toll-booth-extract.schema.ts` para a
versão anterior, rodando o teste novo, e restaurando — o arquivo de produção nunca ficou na versão
antiga fora dessa checagem pontual):

```
$ bun test ./test/toll-booths/toll-booth-reload.contract.ts -t "coordinate out of range"
(fail) answers 409, never 500, when a stored booth has a coordinate out of range
Expected: 409
Received: 500
```

#### 3. Storage indisponível na recarga respondia 500 genérico

A evidência da T301 (linha "qualquer outro erro do provider sobe cru (503 do handler central...)")
estava errada — corrigida no lugar (ver nota inserida ali). Na época da T301/T302, o handler central
(`http/response.service.ts`) não mapeava `ObjectStorageError` nenhum; qualquer erro do provider,
`unavailable` incluso, caía no branco genérico e virava 500. A T302 já tinha medido e registrado essa
divergência corretamente — só a frase da T301 estava errada.

**Decisão:** mapear `ObjectStorageError(unavailable)` para 503 em `http/response.service.ts`, no
mesmo molde do `DatabaseUnavailableError` (log + `captureError` + código estável), em vez de a
recarga converter o erro sozinha. Central porque `unavailable` é uma falha de infraestrutura, não de
domínio de nenhuma rota — a recarga não é a única rota que fala com o bucket (`nfe-imports`, billing,
`cte-archive` também usam `NfeStorageGateway`/`object-storage-provider`), e mapear ali cobre todas
elas de uma vez, sem repetir a conversão em cada gateway. Não afrouxa nada: o mapeamento só troca
500 por 503 quando o **código** é exatamente `unavailable` — qualquer outro `ObjectStorageError`
(`objectConflict`, etc.) continua subindo pelo caminho de sempre (a maioria já é traduzida para erro
de domínio na camada de gateway antes de chegar aqui). Novo código `STORAGE_UNAVAILABLE` em
`HTTP_ERROR` (`shared/api.constant.ts`), ao lado de `databaseUnavailable`.

Vermelho (revertendo temporariamente só `response.service.ts`, mesmo processo do item 2):

```
$ bun test ./test/toll-booths/toll-booth-reload.contract.ts -t "storage is unavailable"
(fail) answers 503, never 500, when object storage is unavailable
Expected: 503
Received: 500
```

`test/fixtures/toll-booth-reload-ports.fixture.ts` ganhou o parâmetro `storageUnavailable` (o `head`
dublado lança `ObjectStorageError('OBJECT_STORAGE_UNAVAILABLE', …)`) para o contrato poder simular o
caso sem MinIO de verdade.

#### 4. Comentário desatualizado sobre auditoria em `toll-booth-extract.schema.ts`

A frase errada ("a API não tem tabela de auditoria de uso geral") está em
`src/database/toll-booth-extract.schema.ts` — o schema Drizzle da tabela (há um segundo arquivo com
o mesmo nome em `presentation/`, o Zod de validação da rota; a correção é no schema do banco).
Corrigido: o comentário agora nomeia `audit_logs` (`fiscal-operation.schema.ts`) e o consumidor
existente (`drizzle-contractor-mail.repository.ts`), igual à premissa já corrigida em `spec.md` pela
T302.

#### 5. Arquivos acima do teto de 200 linhas

- `list-toll-booth-catalog.use-case.ts` (226 → 146 linhas): a ordenação pura das vistas
  (`toEntryView`, `orderSeenRowsByChargeKnown`, `seenPriorityOf`, o tipo `TollBoothCatalogEntryView`)
  saiu para `domain/toll-booth-catalog-entry.policy.ts` (40 linhas, sem porta nenhuma — pura, então
  domínio, não aplicação). A resolução das linhas vistas (`resolveSeenRows`, que chama portas) saiu
  para `application/list-toll-booth-catalog-seen-rows.service.ts` (69 linhas). O use case ficou só
  com a orquestração (paginação, concatenação `[vistas] ++ [resto]`, resumo).
- `drizzle-toll-booth-catalog.repository.ts` (219 → 162 linhas): o mapeamento da linha crua do join
  (`combineConditions`, `CatalogJoinRow`, `toRow`, `toAdjustment`) saiu para
  `infrastructure/toll-booth-catalog-row.mapper.ts` (68 linhas), no molde de `osm-toll-booth.mapper.ts`
  (já existente no módulo).

**Nenhum contrato mudou.** `TollBoothCatalogEntryView` continua exportado do use case (re-export de
`toll-booth-catalog-entry.policy.js`) porque `presentation/toll-booth.routes.ts` importa esse nome de
lá — conferido antes de mover. As duas divisões são extrações puras (mesmas funções, mesmas
assinaturas, só de arquivo); os 110 testes de `test/toll-booths.contract.test.ts` (nenhum alterado
para isto) continuam verdes sem tocar em asserção alguma, prova de que o comportamento não mudou.

Conferidos os demais arquivos tocados pela spec 154 (T201–T303): nenhum outro passa de 200 linhas —
`toll-booth.routes.ts` (76), `toll-booth-extract.routes.ts` (144), `reload-toll-booth-catalog.use-case.ts`
(160, T402 item 1 tirou uma linha), `toll-booth-extract.schema.ts` (128, T402 itens 1/2 acrescentaram
`coordinateSchema`), e todos os componentes/hooks do frontend listados na T303.

#### 6. Teste fraco na T303: asserção sobre texto-fonte em vez de renderizado

O teste `'o bloco de recarga só renderiza e só consulta extratos com settings.manage'`
(`test/fleet/toll-booth-charge-tab.contract.ts`) conferia `page.toContain('canManageSettings && (')`
e `page.toContain('<TollBoothCatalogReloadPanel')` — prova só que a string existe no arquivo-fonte,
nunca o que a tela produz (uma condicional escrita diferente, mas com o mesmo efeito, quebraria o
teste sem quebrar o comportamento; e uma condicional quebrada com o texto preservado passaria).

**Correção:** extraído `TollBoothCatalogReloadGate.component.tsx` de `FleetWorkspace.page.tsx` — o
mesmo `{canManageSettings && <TollBoothCatalogReloadPanel .../>}` que estava inline na página, agora
um componente próprio (`if (!canManageSettings) return null`). A página passou a usar
`<TollBoothCatalogReloadGate canManageSettings={canManageSettings} .../>` no lugar da condicional
inline — mesmo efeito visual, comportamento idêntico (confirmado pelos 542 testes de
`fleet.contract.test.ts`, nenhum alterado além dos dois desta seção, continuando verdes).

Novo contrato `test/fleet/toll-booth-catalog-reload-gate.contract.tsx`, no molde exato de
`test/trip/route-toll-adjustment.contract.tsx` (T401): `renderToStaticMarkup` sobre o componente
real, i18n real (`@/modules/shared/i18n/i18n.service`, dicionário `fleet.locale.json` de produção,
nunca uma cópia de texto). Sem `settings.manage`, o HTML renderizado é `''` (nada, nem sequer um nó
vazio); com a permissão, o HTML contém o título traduzido do painel
(`tollBoothCharges.reload.title`).

Vermelho, confirmando que o teste novo pega o defeito de verdade (não só documenta o comportamento
já correto) — alterando `TollBoothCatalogReloadGate` para devolver `<div>debug</div>` em vez de
`null` sem permissão, rodando o teste, e revertendo:

```
$ bun test ./test/fleet/toll-booth-catalog-reload-gate.contract.tsx
(fail) sem settings.manage, nada é renderizado
Expected: ""
Received: "<div>debug</div>"
```

O teste antigo em `toll-booth-charge-tab.contract.ts` foi reescrito para o que texto-fonte ainda
prova de verdade — a página delega ao gate (`<TollBoothCatalogReloadGate`,
`canManageSettings={canManageSettings}`) e a consulta de extratos só liga com a mesma permissão
(`enabled: canManageSettings && settingsScope.tollBoothCharges,`) — sem afrouxar nem apagar nenhuma
das outras asserções da `describe`.

#### Gates (T402)

```
$ bun run typecheck     # 6 apps — exit 0
$ bun run lint          # 6 apps, --max-warnings=0 — exit 0
$ bun run format:check  # exit 0 (5 arquivos reformatados por --write antes do check final:
                         # list-toll-booth-catalog-seen-rows.service.ts, list-toll-booth-catalog.use-case.ts,
                         # drizzle-toll-booth-catalog.repository.ts, toll-booth-extract.schema.ts,
                         # test/fixtures/toll-booth-reload-ports.fixture.ts)
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
 6314 pass
 23 skip
 0 fail
 22059 expect() calls
Ran 6337 tests across 177 files. [31.49s]
```

(Eram 6310 pass na T302: +4 desta task — os dois vermelhos do upload [item 1, item 2] e os dois da
recarga [item 2, item 3]; nenhum teste antigo quebrou ou foi afrouxado.)

Integração de storage (MinIO/Postgres reais, `STORAGE_SECRET_KEY` como override de ambiente —
mesma divergência do `.env.test` compartilhado registrada na T301/T302, arquivo não editado nem
exibido):

```
$ cd apps/api-transportada && STORAGE_SECRET_KEY=<compose.yaml> bun --env-file=../../.env.test test \
    ./test/integration/toll-booth-extract-storage.integration.ts ./test/integration/toll-booth-reload.integration.ts --timeout 120000
 6 pass
 0 fail
 28 expect() calls
Ran 6 tests across 2 files. [7.60s]
```

Suíte de integração completa (`test:integration`, mesma credencial de override; rodada em segundo
plano por exceder o teto interativo de 120s):

```
$ STORAGE_SECRET_KEY=minio-local-password bun --env-file=../../.env.test test:integration
 375 pass
 4 skip
 3 fail
 2540 expect() calls
Ran 382 tests across 74 files. [311.61s]
```

Os três "fail" são timeout de 5s sob carga (o script `test:integration` do `package.json` não passa
`--timeout`, diferente do gate documentado em `CLAUDE.md`), nada ligado a esta task —
`cte-item-list-repository.integration.ts`, `freight-region-repository.integration.ts` (nenhum dos
dois tocado aqui) e `toll-booth-reload.integration.ts` num caso **diferente** do que esta task mexeu
("bytes divergem da linha", não coordenada fora da faixa). Confirmado isolando os quatro arquivos com
`--timeout 120000` explícito:

```
$ STORAGE_SECRET_KEY=minio-local-password bun --env-file=../../.env.test test \
    ./test/integration/toll-booth-reload.integration.ts ./test/integration/toll-booth-extract-storage.integration.ts \
    ./test/integration/cte-item-list-repository.integration.ts ./test/integration/freight-region-repository.integration.ts \
    --timeout 120000
 21 pass
 0 fail
 141 expect() calls
Ran 21 tests across 4 files. [27.27s]
```

Mesmo defeito de forma que o `CLAUDE.md` já registra para outro alvo — "pular não é passar" vale
também para "falhar por teto de tempo baixo demais não é falhar de verdade"; corrigir o script em si
é fora do escopo desta task. Confirmado rodando a suíte completa de novo com `--timeout 120000`
(`bun run test:integration -- --timeout 120000`, mesma credencial de override):

```
$ STORAGE_SECRET_KEY=minio-local-password bun --env-file=../../.env.test run test:integration -- --timeout 120000
 378 pass
 4 skip
 0 fail
 2540 expect() calls
Ran 382 tests across 74 files. [239.44s]
```

```
$ cd apps/frontend-transportada && bun run test
 4184 pass
 0 fail
 36678 expect() calls
Ran 4184 tests across 29 files. [5.38s]
$ cd apps/frontend-transportada && bun run build
✓ built in 10.01s   # PWA gerado, mesmo aviso pré-existente de chunk >500kB (vectorBasemap/index)
```

(Eram 4182 pass na T401: +2 desta task, o `describe` novo de
`toll-booth-catalog-reload-gate.contract.tsx`; nenhum teste antigo quebrou.)

**Arquivos por caminho explícito (commit isolado, `fix(toll): ...`):**

- `apps/api-transportada/src/toll-booths/presentation/toll-booth-extract.schema.ts` (itens 1, 2)
- `apps/api-transportada/src/toll-booths/application/reload-toll-booth-catalog.use-case.ts` (item 1)
- `apps/api-transportada/src/http/response.service.ts` (item 3)
- `apps/api-transportada/src/shared/api.constant.ts` (item 3)
- `apps/api-transportada/src/database/toll-booth-extract.schema.ts` (item 4)
- `apps/api-transportada/src/toll-booths/application/list-toll-booth-catalog.use-case.ts` (item 5)
- `apps/api-transportada/src/toll-booths/application/list-toll-booth-catalog-seen-rows.service.ts` (novo, item 5)
- `apps/api-transportada/src/toll-booths/domain/toll-booth-catalog-entry.policy.ts` (novo, item 5)
- `apps/api-transportada/src/toll-booths/infrastructure/drizzle-toll-booth-catalog.repository.ts` (item 5)
- `apps/api-transportada/src/toll-booths/infrastructure/toll-booth-catalog-row.mapper.ts` (novo, item 5)
- `apps/frontend-transportada/src/modules/fleet/components/TollBoothCatalogReloadGate.component.tsx` (novo, item 6)
- `apps/frontend-transportada/src/modules/fleet/pages/FleetWorkspace.page.tsx` (item 6)
- `apps/api-transportada/test/toll-booths/toll-booth-extract-routes.contract.ts` (itens 1, 2)
- `apps/api-transportada/test/toll-booths/toll-booth-reload.contract.ts` (itens 2, 3)
- `apps/api-transportada/test/fixtures/toll-booth-reload-ports.fixture.ts` (item 3)
- `apps/frontend-transportada/test/fleet/toll-booth-charge-tab.contract.ts` (item 6)
- `apps/frontend-transportada/test/fleet/toll-booth-catalog-reload-gate.contract.tsx` (novo, item 6)
- `apps/frontend-transportada/test/fleet.contract.test.ts` (item 6, registro do novo arquivo)
- `specs/154-a-lista-de-pracas-e-a-data-do-catalogo/evidence.md` (correção da frase errada da T301, esta seção)

**Divergência de escopo, não bloqueio:** nenhuma das seis pendências exigiu decisão de produto —
todas eram técnicas, decididas e justificadas nesta seção. T502 (revisão final) continua fora desta
task.

### T503 — defeitos da revisão final fechados

Onze defeitos confirmados por T502 (fora de escopo: rate limit das rotas novas, `--timeout` no
script `test:integration`, imports sem `.js` nos entrypoints de teste do frontend, arquivos grandes
pré-existentes). Cada item abaixo tem o vermelho antes da correção, quando fazia sentido escrever um.

#### 1. Código de erro literal `{{code}}` quando o backend responde um código sem frase própria

`TollBoothCatalogReloadPanel.component.tsx` e `TollBoothCatalogReloadDialog.component.tsx`
chamavam `t(errors.${errorCode}, { defaultValue: t(errors.default) })` sem `{ code: errorCode }` —
nem no `t` externo, nem no `t` interno do `defaultValue`. Um código desconhecido (`STORAGE_UNAVAILABLE`,
o 503 de storage indisponível da T402 item 3, sem frase própria em `fleet.locale.json`) aparecia
como "Código: {{code}}." literal.

**Correção:** a frase virou um componente compartilhado, `TollBoothCatalogReloadError.component.tsx`
(elimina a duplicação entre painel e diálogo), com `{ code: errorCode }` nos dois `t()`. Contrato
novo `test/fleet/toll-booth-catalog-reload-error.contract.tsx` (`renderToStaticMarkup`, i18n real):

```
$ bun test ./test/fleet/toll-booth-catalog-reload-error.contract.tsx
(fail) painel: o operador vê o código real, nunca o literal {{code}}
Expected to contain: "STORAGE_UNAVAILABLE"
Received: "...<p role=\"alert\">Não foi possível recarregar o catálogo. Código: {{code}}.</p>..."
```

`TollBoothCatalogReloadDialog` monta com `createPortal(..., document.body)`, e o renderizador de
servidor não suporta portal nenhum (`Portals are not currently supported by the server renderer`,
confirmado tentando) — por isso o contrato renderiza o `TollBoothCatalogReloadError` que os dois
efetivamente montam, cobrindo os dois usos com uma render só, sem jsdom. Verde depois:

```
$ bun test ./test/fleet/toll-booth-catalog-reload-error.contract.tsx
 2 pass
 0 fail
 4 expect() calls
```

O contrato antigo em `toll-booth-charge-tab.contract.ts` ("cada um dos quatro códigos de erro...")
lia texto-fonte da interpolação — reescrito para conferir que os dois componentes delegam ao
compartilhado (`<TollBoothCatalogReloadError errorCode={`), já que a prova de verdade da
interpolação mora no contrato novo.

#### 2. A contagem do RF2 recalculava em toda requisição, mesmo sem depender de `page`/`search`

RNF2 dizia que a rota "nunca lê a tabela inteira sem paginar", mas `readCatalogAxleCharges()`
(colunas mínimas) lia `toll_booths` inteira a cada chamada de `GET /v1/toll-booths` — 592 linhas
hoje em staging, ~10-15 mil se o recorte virar Brasil — mesmo quando só a página ou a busca
mudavam, dos quais a contagem não depende.

**Decisão registrada no RNF2 (`spec.md`):** cache por empresa em memória do processo
(`TollBoothAxleChargeGapCachePort`/`createInMemoryTollBoothAxleChargeGapCache`), nunca distribuído —
cada réplica recalcula a própria cópia. Invalidação exatamente onde o resultado pode mudar: ajuste
ou remoção de ajuste da própria empresa (`adjust`/`clear-toll-booth-charge.use-case.ts`, por
`companyId`) e recarga do catálogo (`reload-toll-booth-catalog.use-case.ts`, `invalidateAll` —
afeta toda empresa porque reescreve `toll_booths` para a instalação inteira). Wiring: uma única
instância por processo em `main.ts`, compartilhada pelas quatro rotas.

Vermelho (revertendo temporariamente só o `if (cached !== undefined) return cached` do use case):

```
$ bun test ./test/toll-booths/toll-booth-axle-charge-gap-cache.contract.ts
(fail) trocar de página ou de busca não recalcula a contagem para a mesma empresa
Expected: 1
Received: 3
```

Verde depois, e as quatro pontas de invalidação provadas (empresas diferentes não compartilham
cópia; ajustar/remover ajuste invalida só a empresa; a recarga invalida todas):

```
$ bun test ./test/toll-booths/toll-booth-axle-charge-gap-cache.contract.ts
 5 pass
 0 fail
 11 expect() calls
```

#### 3. `apps/api-transportada/CLAUDE.md` descrevia um mecanismo que não existe

Dizia "só o recarregamento marca `catalogKnown: false` para a que sumiu de um extrato novo" —
falso: a recarga (D7) nunca apaga nem marca nada, `toll-booth-reload.integration.ts:84-86` prova
que uma praça fora do extrato novo mantém `catalogKnown: true` e a data antiga.
`catalogKnown: false` vem de `list-toll-booth-catalog-seen-rows.service.ts:51-69` — ajuste da
empresa sem linha correspondente em `toll_booths` (praça "órfã"). Corrigido no `CLAUDE.md`.

#### 4. `docs/runbooks/osrm-extract.md`: dois erros e uma frase truncada

(a) "o objeto fica registrado no banco na mesma transação" — falso;
`create-toll-booth-extract.use-case.ts:41-57` grava no bucket e só **depois** a linha, sequencial
(bucket não entra em transação de banco), de propósito para nunca apontar para um objeto
inexistente — descrito agora como `docs/ai-context/api-transportada.md` já fazia.
(b) "extrato desatualizado deixa de aparecer na recarga" — falso; nada remove linha de
`toll_booth_extracts` e `list()` (`drizzle-toll-booth-extract.repository.ts:56-62`) não filtra por
idade — todo extrato registrado aparece sempre no seletor. (c) parágrafo truncado em "(catálogo
velho → e aí está)" — reescrito por inteiro.

#### 5. `docs/ai-context/api-transportada.md`: teto de corpo errado e raciocínio invertido

"500 KiB" → `APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES` é `1_048_576` = 1 MiB
(`shared/api.constant.ts:178`). "`missing_object_observed_at` é booleano dinâmico" invertia o
próprio comentário do schema (`database/toll-booth-extract.schema.ts:65-67`: "sinalizador booleano
mentiria para sempre" — é **timestamp de propósito**, nunca booleano). Os dois corrigidos.

#### 6. Histórico da spec 154 no frontend nunca foi escrito

`apps/frontend-transportada/CLAUDE.md:151` aponta `docs/ai-context/frontend-transportada.md` para
"spec 154 T204–T303, T401", mas o arquivo não tinha nada da 154. Escrita a seção "Fleet — pedágio:
catálogo inteiro e recarga (spec 154, T204/T303/T401)" com o resumo de arquitetura de cada task.

#### 7. `source_url`/`extracted_at` nunca escritas por caminho de produção, doc/comentário afirmavam o contrário

Nenhuma rota grava as duas colunas: `POST /v1/toll-booths/extracts` não as aceita,
`TollBoothExtractRow` (aplicação) não as declara, `serializeExtract` não as devolve. **Decisão:**
manter as colunas (migration destrutiva proibida) como reserva de esquema, e corrigir a
documentação/comentário para não afirmar um mecanismo ativo que não existe — em vez de estender o
caminho de produção para aceitá-las, o que exigiria mudar Zod da rota, o tipo de domínio, o
repositório e a serialização por um dado que nenhum requisito desta spec pede hoje.
`database/toll-booth-extract.schema.ts` (comentário) e `docs/ai-context/api-transportada.md`
corrigidos: as colunas existem, mas são sempre `null` até um caminho de produção passar a gravá-las.

#### 8. Contagem do RF2 duplica a precedência da política sem contrato de paridade

`countBoothsWithoutKnownAxleCharge` reimplementa `adjustment?.chargePerAxle ?? catalog.chargePerAxle`,
que `resolveEffectiveTollBoothCharge` também define — sem nada barrando as duas divergirem em
silêncio. Contrato novo `test/toll-booths/toll-booth-axle-charge-gap-parity.contract.ts`, no molde
de `list-toll-booth-charges-catalog-parity.contract.ts` (T203): quatro praças (sem ajuste/sem
tarifa, sem ajuste/com tarifa, ajuste corrige, ajuste isenta com `0.00`), provando que a contagem
concorda com `resolveEffectiveTollBoothCharge` praça a praça.

```
$ bun test ./test/toll-booths/toll-booth-axle-charge-gap-parity.contract.ts
 1 pass
 0 fail
 5 expect() calls
```

#### 9. `TollBoothCatalogReloadPanel`: `useEffect` para estado derivado, com bug real na reabertura

Dois `useEffect` (seleção default do extrato; fechar o diálogo no sucesso) contra
`standards/react.md`. O segundo tinha consequência real: reabrir o diálogo depois de uma recarga
que falhou mostrava o erro antigo (a mutação só troca `error` na tentativa seguinte) antes mesmo de
confirmar de novo.

**Correção:** os dois `useEffect` saíram. A seleção default virou valor derivado
(`effectiveSelectedValue`, calculado a cada render). Abrir/fechar o diálogo e mostrar o erro viraram
a função pura `resolveReloadDialogState` (exportada, testável isolada) — a chave é
`hasSubmittedConfirmation`, que volta a `false` toda vez que o diálogo reabre, então o erro só
reaparece depois que ESTA sessão de confirmação chamou `onReload` de verdade.

Vermelho (a lógica antiga, `confirming === null ? undefined : errorCode`, contra o contrato novo):

```
$ bun test ./test/fleet/toll-booth-catalog-reload-dialog-state.contract.ts
(fail) reabrir o diálogo depois de uma recarga que falhou não mostra o erro antigo
Expected: undefined
Received: "TOLL_BOOTH_EXTRACT_NOT_FOUND"
(fail) depois de confirmar e ter sucesso, o diálogo fecha sozinho
Expected: null
Received: {...praça...}
```

Verde depois:

```
$ bun test ./test/fleet/toll-booth-catalog-reload-dialog-state.contract.ts
 4 pass
 0 fail
 7 expect() calls
```

A asserção antiga de texto-fonte (`onClick={() => setConfirming(...)}`) virou `onClick={openConfirmation}`.

#### 10. `toll-booth-catalog-row.mapper.ts`: `as Date` lavando nulidade

`toAdjustment` checava `adjustmentActorUserId`/`adjustmentObservedOn` como marcador de "sem
ajuste", mas cravava `row.adjustmentUpdatedAt as Date` sem checar o terceiro campo do mesmo jeito.
Uma linha de join inconsistente (actor e data presentes, `updatedAt` nulo) produzia um
`TollBoothChargeAdjustmentRow.updatedAt` que é `null` em runtime apesar do tipo dizer `Date`.

**Correção:** guarda explícita nos três campos — nenhum sozinho é o marcador, os três são gravados
juntos. Vermelho (revertendo temporariamente para `as Date`):

```
$ bun test ./test/toll-booths/toll-booth-catalog-row-mapper.contract.ts
(fail) linha inconsistente (actor e data presentes, updatedAt nulo) não vira um ajuste com Date falso
Expected: null
Received: { ...updatedAt: null }
```

Verde depois:

```
$ bun test ./test/toll-booths/toll-booth-catalog-row-mapper.contract.ts
 3 pass
 0 fail
 3 expect() calls
```

#### 11. Aceites 2 e 3 do frontend provados só por texto-fonte

`test/fleet/toll-booth-charge-tab.contract.ts` conferia `expect(panel).toContain("catalog.summary.status
=== 'empty'")` — prova só que a string existe no arquivo, nunca o que a tela produz. Convertido
para o renderizado em `test/fleet/toll-booth-charge-panel-render.contract.tsx`
(`renderToStaticMarkup`, i18n real, no molde de `toll-booth-catalog-reload-gate.contract.tsx`):
catálogo vazio (`status: 'empty'`) renderiza a frase de "nunca carregado" e não a de "nada a
corrigir"; catálogo com praças não renderiza a frase de "nunca carregado"; busca sem resultado
nomeia a data do catálogo (`14/09/2026` no HTML, prova que usou `summary.observedOn`); lista vazia
sem busca mostra "nada a corrigir". O que não dava para renderizar sem duplicar cobertura (as
chaves de tradução existirem nos dois dicionários, pt-BR e en) ficou como teste próprio, separado do
de render, no mesmo arquivo de origem.

```
$ bun test ./test/fleet/toll-booth-charge-panel-render.contract.tsx
 4 pass
 0 fail
 6 expect() calls
```

#### Gates (T503)

```
$ bun run typecheck    # 6 apps — exit 0
$ bun run lint         # 6 apps, --max-warnings=0 — exit 0
$ bun run format:check # exit 0 (arquivos reformatados por --write antes do check final)
$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
 6380 pass
 23 skip
 0 fail
 22176 expect() calls
Ran 6403 tests across 177 files. [20.85s]
```

(Eram 6314 pass/23 skip na T402: +66 desta task, 0 quebrado.)

```
$ cd apps/frontend-transportada && bun run test
 4237 pass
 0 fail
 36831 expect() calls
Ran 4237 tests across 29 files. [4.04s]
$ cd apps/frontend-transportada && bun run build
✓ built in 8.42s   # PWA gerado, mesmo aviso pré-existente de chunk >500kB
```

(Eram 4184 pass na T402: +53 desta task, 0 quebrado.)

Integração de storage/recarga (MinIO/Postgres reais):

```
$ STORAGE_SECRET_KEY=minio-local-password bun --env-file=../../.env.test test \
    ./test/integration/toll-booth-extract-storage.integration.ts ./test/integration/toll-booth-reload.integration.ts --timeout 120000
 6 pass
 0 fail
 28 expect() calls
```

**Arquivos por caminho explícito (commit isolado, `fix(toll): ...`):**

- `apps/frontend-transportada/src/modules/fleet/components/TollBoothCatalogReloadPanel.component.tsx` (itens 1, 9)
- `apps/frontend-transportada/src/modules/fleet/components/TollBoothCatalogReloadDialog.component.tsx` (item 1)
- `apps/frontend-transportada/src/modules/fleet/components/TollBoothCatalogReloadError.component.tsx` (novo, item 1)
- `apps/frontend-transportada/test/fleet/toll-booth-catalog-reload-error.contract.tsx` (novo, item 1)
- `apps/frontend-transportada/test/fleet/toll-booth-catalog-reload-dialog-state.contract.ts` (novo, item 9)
- `apps/frontend-transportada/test/fleet/toll-booth-charge-panel-render.contract.tsx` (novo, item 11)
- `apps/frontend-transportada/test/fleet/toll-booth-charge-tab.contract.ts` (itens 1, 11)
- `apps/frontend-transportada/test/fleet.contract.test.ts` (registro dos arquivos novos)
- `apps/api-transportada/src/toll-booths/application/toll-booth-axle-charge-gap-cache.port.ts` (novo, item 2)
- `apps/api-transportada/src/toll-booths/infrastructure/in-memory-toll-booth-axle-charge-gap-cache.ts` (novo, item 2)
- `apps/api-transportada/src/toll-booths/application/list-toll-booth-catalog.use-case.ts` (item 2)
- `apps/api-transportada/src/companies/application/adjust-toll-booth-charge.use-case.ts` (item 2)
- `apps/api-transportada/src/companies/application/clear-toll-booth-charge.use-case.ts` (item 2)
- `apps/api-transportada/src/toll-booths/application/reload-toll-booth-catalog.use-case.ts` (item 2)
- `apps/api-transportada/src/main.ts` (item 2, wiring)
- `apps/api-transportada/src/toll-booths/infrastructure/toll-booth-catalog-row.mapper.ts` (item 10)
- `apps/api-transportada/src/database/toll-booth-extract.schema.ts` (item 7)
- `apps/api-transportada/test/toll-booths/toll-booth-axle-charge-gap-cache.contract.ts` (novo, item 2)
- `apps/api-transportada/test/toll-booths/toll-booth-axle-charge-gap-parity.contract.ts` (novo, item 8)
- `apps/api-transportada/test/toll-booths/toll-booth-catalog-row-mapper.contract.ts` (novo, item 10)
- `apps/api-transportada/test/toll-booths.contract.test.ts` (registro dos arquivos novos)
- `apps/api-transportada/test/fixtures/toll-booth-reload-ports.fixture.ts` (item 2, expõe o cache)
- `apps/api-transportada/test/fixtures/toll-booth-reload-integration.fixture.ts` (item 2, wiring)
- `apps/api-transportada/test/toll-booths/list-toll-booth-catalog-use-case.contract.ts` (item 2, wiring)
- `apps/api-transportada/CLAUDE.md` (item 3)
- `docs/runbooks/osrm-extract.md` (item 4)
- `docs/ai-context/api-transportada.md` (itens 5, 7)
- `docs/ai-context/frontend-transportada.md` (novo conteúdo, item 6)
- `specs/154-a-lista-de-pracas-e-a-data-do-catalogo/spec.md` (RNF2, item 2)
- `specs/154-a-lista-de-pracas-e-a-data-do-catalogo/evidence.md` (esta seção)

**Fora de escopo, não bloqueio:** rate limit das rotas novas (D-8 da revisão, tratado separado pelo
usuário); `--timeout` no script `test:integration`; imports sem `.js` nos entrypoints de teste do
frontend; arquivos grandes pré-existentes (`main.ts` etc.) — nenhum tocado por esta task além do
wiring pontual do item 2.

### T504 — o cache da contagem do RF2 ganha teto de validade

A T503 (defeito 2) resolveu o recálculo por tecla com `TollBoothAxleChargeGapCachePort` em memória do
processo, e o comentário afirmava que a janela de divergência entre réplicas era, no pior caso, "a
mesma latência de uma leitura de banco". Não era: `invalidate` só alcança o processo que atendeu a
mutação, então com duas réplicas a cópia da outra serviria o número velho **indefinidamente** — até
o próximo deploy. Hoje todos os serviços rodam com `replicas: { sfo: 1 }` (`.railway/railway.ts`),
então nada divergia na prática; o defeito era a afirmação, que autoriza subir uma segunda réplica
sem rever a contagem.

`TOLL_BOOTH_AXLE_CHARGE_GAP_CACHE_TTL_MS = 60_000` passa a limitar a divergência a um minuto, e o
cache recebe `clock` por injeção (nada de `Date.now()` solto, e o teste controla o tempo).

Vermelho, com a versão sem teto e a assinatura nova:

```
$ cd apps/api-transportada && bun --env-file=../../.env.test test ./test/toll-booths.contract.test.ts --timeout 120000

(fail) cache da contagem "sem tarifa por eixo conhecida" (spec 154 T503, defeito 2) > a cópia expira: invalidação em outra réplica não deixa o número velho para sempre [0.18ms]
 128 pass
 1 fail
```

Verde, com o teto:

```
 129 pass
 0 fail
 268 expect() calls
```

Suíte completa da API: **6381 pass · 23 skip · 0 fail** (22179 expect(), 177 arquivos).
`bun run typecheck`, `bun run lint` e `bun run format:check`: exit 0 nas seis apps.

### T505 — teto de requisições nas duas rotas de escrita do extrato (revisão final D-8)

As rotas `POST /v1/toll-booths/extracts` e `POST /v1/toll-booths/reload` subiram sem `rateLimit`,
enquanto o precedente do repositório para upload é `UPLOAD_RATE_LIMIT`
(`src/fleet/presentation/aggregate-application-attachment.routes.ts:29`). A amplificação da recarga
é o que pesa: o download e o sha256 acontecem **antes** da trava (deliberado, para encurtar o lock),
então N chamadas concorrentes pagam N downloads para receber N × 409.

`src/toll-booths/presentation/toll-booth-extract.rate-limit.ts`: seis requisições por 30 minutos em
cada rota, **balde em memória, por usuário**. Escolha registrada no próprio arquivo — o custo é do
processo que atende (banda e CPU do sha256), não de terceiro cobrado por chamada, e o balde
compartilhado no Postgres existe para envio de e-mail; todo serviço roda com uma réplica
(`.railway/railway.ts`). Janela larga porque subir extrato e recarregar são atos de administração,
e quem erra `dataset` ou data refaz duas ou três vezes seguidas.

A `GET /v1/toll-booths/extracts` segue sem teto próprio, de propósito: leitura barata, sem efeito
externo — e o contrato afirma isso, para que a ausência seja decisão e não esquecimento.

A fixture HTTP do extrato saiu de dentro do contrato da T301 para
`test/fixtures/toll-booth-extract-http.fixture.ts`, reaproveitada pelos dois contratos. Nenhuma
asserção da T301 mudou (os 130 casos anteriores seguem verdes).

Vermelho, antes do `rateLimit` nas rotas:

```
$ cd apps/api-transportada && bun --env-file=../../.env.test test ./test/toll-booths.contract.test.ts --timeout 120000

(fail) teto das rotas de escrita do extrato (spec 154, revisão final D-8) > a recarga responde 429 com retry-after depois do teto, no mesmo usuário [1.08ms]
(fail) teto das rotas de escrita do extrato (spec 154, revisão final D-8) > a recarga recusada pelo teto não baixa o objeto nem toca a trava [0.63ms]
(fail) teto das rotas de escrita do extrato (spec 154, revisão final D-8) > a subida do extrato responde 429 depois do teto, sem chamar o use case [1.95ms]
 130 pass
 3 fail
```

Verde, depois:

```
 133 pass
 0 fail
```

Suíte completa da API: **6385 pass · 23 skip · 0 fail** (22206 expect(), 177 arquivos).
`bun run typecheck`, `bun run lint` e `bun run format:check`: exit 0 nas seis apps.

### T506 — revisão de design e usabilidade

Revisão do `web.md` §15 sobre as três telas da spec, **olhando a tela de verdade**: build com
`VITE_SMOKE_AUTH_BYPASS=true`, `vite preview` na porta 53117 e um script Playwright descartável
(fora do repositório) que reaproveita os dublês de `test/fleet-smoke.helper.ts` e
`test/trip-smoke.helper.ts` e simula `GET /v1/toll-booths`, `GET /v1/toll-booths/extracts` e
`POST /v1/toll-booths/reload` na forma exata dos `*.validation.ts`. Desktop 1440×900 e celular
390×844. O resumo da rota é a **tela real** (montagem de "Nova viagem", `TOLL_SINGLE_ROUTE_GEOMETRY`),
não recorte. Além dos prints, o script mediu: rolagem horizontal, alvos < 44px, foco e ordem de Tab
no diálogo, `Esc`, e a cor computada do erro.

#### O que foi visto, por tela

**1. Aba de pedágio (Frota)**

| #   | Severidade | Achado                                                                                                                                                                                                                                     | Destino                                                                                                        |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 1   | média      | Os campos "Nova tarifa manual"/"com tag" ficavam com o rótulo **em linha** com o campo (o `<label>` envolvia o `<input>` sem grade): cada campo com uma largura, desalinhados do "Data da tarifa" logo abaixo e do combustível, a aba irmã | consertado — `.tollBoothField` (rótulo em cima, campo embaixo)                                                 |
| 2   | média      | Catálogo vazio dizia "O catálogo de praças ainda não foi carregado" **duas vezes** (cabeçalho e corpo), mais "0 praças no catálogo" e "0 praças sem tarifa" e uma busca que não tem o que buscar                                           | consertado — cabeçalho e busca somem com `status: empty`; o corpo diz uma vez                                  |
| 3   | média      | Alvos de toque de 38px no celular: busca e os dois botões de paginação (`--control-height-compact`)                                                                                                                                        | consertado — `.tollBoothPanel` sobe o compacto ao `--touch-target`, como `.tripShell` já faz                   |
| 4   | baixa      | Paginação no celular: "Próxima página" caía sozinha numa segunda linha, longe de "Página anterior"                                                                                                                                         | consertado — rótulo em cima, os dois botões dividindo a linha; no desktop continua anterior · rótulo · próxima |
| 5   | baixa      | "1 praças no catálogo" / "1 praças sem tarifa…" (sem plural)                                                                                                                                                                               | consertado — chaves `_one` nos dois dicionários                                                                |
| 6   | baixa      | "Nenhuma praça com esse nome…" quando a busca também casa operadora                                                                                                                                                                        | consertado — "com esse nome ou operadora"                                                                      |
| 7   | baixa      | `<dl>` com `<p>` dentro (marcação inválida para leitor de tela) no cabeçalho                                                                                                                                                               | consertado — `<div>`                                                                                           |
| 8   | baixa      | Tarifa com quatro casas ("R$ 14,7000") enquanto o resumo da rota mostra duas ("R$ 16,40")                                                                                                                                                  | **pendente** — ver abaixo                                                                                      |
| 9   | baixa      | Botão "Abrir calendário" do `FleetDateField` com 18px                                                                                                                                                                                      | **pendente** — ver abaixo                                                                                      |

Conferido e sem defeito: a marca "Fora do catálogo atual" (`catalogKnown: false`) legível, cobre sobre
o fundo claro, e o formulário continua disponível na mesma praça; estado `stale` com a data
(02/03/2025) e "Catálogo desatualizado."; busca sem resultado nomeia a data do catálogo; sem rolagem
horizontal em nenhum print.

**2. Bloco de recarga**

| #   | Severidade | Achado                                                                                                                                                                                                   | Destino                                                                                                                                      |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | **alta**   | A falha ao ler a lista de extratos caía no ramo de lista vazia e afirmava "Nenhum extrato registrado ainda" — frase falsa sobre a instalação                                                             | consertado — prop `loadFailed` (`extractsQuery.isError`) com frase própria (`reload.loadError`); carregando vira `Skeleton`, não mais `null` |
| 11  | média      | O erro da recarga (`TollBoothCatalogReloadError`) saía na cor do texto comum (`rgb(29,43,51)`), igual ao aviso logo acima — o comentário do próprio CSS diz que falha assim "some no meio do formulário" | consertado — `.feedbackError`; medido depois: `rgb(194,56,47)`                                                                               |
| 12  | média      | Botão "Recarregar catálogo" **esticado na largura do painel** inteira, sem ícone — as ações irmãs da aba ficam à esquerda com ícone (§9)                                                                 | consertado — `justify-self: start` + `Icon download` (o mesmo no botão de confirmar do diálogo, para a ação ter um ícone só)                 |
| 13  | média      | Texto de ajuda com jargão de spec: "(D3/D6)"                                                                                                                                                             | consertado nos dois dicionários                                                                                                              |
| 14  | baixa      | Título em `<h3>` com a margem padrão do navegador (vão grande antes da ajuda) e hierarquia diferente da seção irmã (`<h2>`)                                                                              | consertado — `<h2>`, herda `.panel h2`                                                                                                       |
| 15  | baixa      | Fechar do diálogo com 38px no celular                                                                                                                                                                    | consertado — o overlay (portal) recebe `.tollBoothPanel`; medido 44px                                                                        |
| 16  | baixa      | Resultado em `<dl>` com `<p>`; "1 praças …" no singular                                                                                                                                                  | consertado                                                                                                                                   |
| 17  | baixa      | Diálogo não é tela cheia no celular (`web.md` §10)                                                                                                                                                       | **pendente** — ver abaixo                                                                                                                    |

Conferido e sem defeito: o diálogo recebe o foco ao abrir, o Tab circula só dentro dele
(Fechar → Cancelar → Recarregar → Fechar), `Esc` fecha e o foco volta ao botão "Recarregar
catálogo"; código desconhecido aparece como `Código: STORAGE_UNAVAILABLE.`, nunca `{{code}}`; as
duas frases de "nenhum extrato" (catálogo vazio e catálogo populado com o runbook) aparecem no caso
certo.

**3. Atalho no resumo de pedágio da rota**

| #   | Severidade | Achado                                                                                                              | Destino                                                                                |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 18  | média      | "Ajustar tarifa desta praça" com 38px: a montagem abre em portal, fora de `.tripShell`, e não herda o alvo de toque | consertado — `.tollStatementAction` com `min-height: var(--touch-target)`; medido 44px |
| 19  | baixa      | "1 praças sem tarifa conhecida" (spec 090)                                                                          | **pendente** — ver abaixo                                                              |

Fluxo medido: da rota ao ajuste são **2 toques** (o botão na praça → a aba de Pedágio já abre filtrada
em `?tollBoothSearch=Praça Gama`, com a praça como único resultado e o formulário pronto). Achar uma
praça na própria aba: 1 toque na aba + digitar. Recarregar: 2 toques (botão → Recarregar), com o
extrato mais novo já escolhido.

#### Pendências, com o motivo

- **Tarifa com quatro casas na aba (#8).** Trocar por `formatAmount` (duas casas) arredonda o valor
  com tag — 14,70 × 0,95 = 13,965 — e a aba é justamente onde o operador confere o número exato contra
  o que vai digitar. O combustível, aba irmã, mostra as mesmas quatro casas. É decisão de produto
  (mostrar só as casas que o número tem), não defeito desta spec.
- **"Abrir calendário" de 18px (#9)** é do `FleetDateField`, compartilhado por toda a Frota; mexer
  nele é fora do escopo da spec 154.
- **Diálogo não é tela cheia no celular (#17).** Segue o molde de `CompanyUserRemoveDialog` e dos
  outros diálogos de confirmação da app; mudar só este criaria dois comportamentos (`web.md` §14:
  a divergência é o defeito). Vale para todos, numa tarefa própria.
- **"1 praças sem tarifa conhecida" na rota (#19)** é texto da spec 090 e é o literal que o smoke
  `responsive.smoke.spec.ts` assere; corrigir exige tocar o smoke junto, fora desta revisão.
- **`noExtractsWithCatalog` cita o caminho do runbook** — mantido de propósito: a spec (RF3/caso
  extremo) pede apontar o runbook, e o contrato `toll-booth-charge-tab.contract.ts` cobra o caminho.

#### Testes (vermelho antes, verde depois)

Quatro testes novos de render (`renderToStaticMarkup`, i18n real), escritos antes do conserto:

- `test/fleet/toll-booth-charge-panel-render.contract.tsx`: catálogo vazio diz "nunca carregado" uma
  vez só, sem busca e sem "0 praças"; uma praça é contada no singular.
- `test/fleet/toll-booth-catalog-reload-gate.contract.tsx`: falha ao ler os extratos mostra
  `reload.loadError` e nunca `noExtracts`; carregando não mostra nenhum dos dois. O render antigo
  do mesmo arquivo ganhou `loadFailed={false}` (prop nova obrigatória), sem mudar o que assere.

```
$ bun test ./test/fleet.contract.test.ts        # antes do conserto
 551 pass
 4 fail
$ bun test ./test/fleet.contract.test.ts ./test/trip.contract.test.ts   # depois
 1584 pass
 0 fail
```

#### Gates

```
$ bun run format:check   # exit 0 (1 arquivo reformatado por --write antes)
$ bun run typecheck      # exit 0
$ bun run lint           # exit 0
$ cd apps/frontend-transportada && bun run test
 4393 pass / 0 fail (contratos) · 10 pass / 0 fail (test:hooks)
$ bun run build          # ✓ built in 8.60s
```

#### Prints (fora do repositório)

Pasta: `/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada--claude-worktrees-quirky-ptolemy-d856cd/bc214853-8c6a-4572-a20d-0041087981f5/scratchpad/review/shots/` — cada cenário em `before-*` e `after-*`, desktop e mobile:
`01-full-list`, `02-unknown-catalog-row`, `03-reload-closed`, `04-dialog-open`,
`05-reload-result`, `06-search-empty`, `07-reload-error-dialog`, `08-reload-error-panel`,
`09-catalog-empty`, `10-stale-no-extract`, `11-deep-link-filtered`, `12-route-toll-summary`,
`13-route-to-fleet`; medições em `before-report.json` / `after-report.json`.

### T507 — pendências da revisão de design

As quatro pendências da T506, uma por commit, cada uma com o teste escrito antes do conserto e o
vermelho colado aqui. Prints fora do repositório, em
`/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada--claude-worktrees-quirky-ptolemy-d856cd/bc214853-8c6a-4572-a20d-0041087981f5/scratchpad/review/shots/t507/`.

#### Item 1 — tarifa com as casas que o número tem (#8 da T506)

Decisão do usuário: não arredondar. A aba mostra **no mínimo duas e no máximo quatro** casas,
cortando zero à direita além da segunda. Não precisou de função nova: `formatRateAmount`
(`modules/shared/decimalAmount.service.ts`, `Intl` com `minimumFractionDigits: 2,
maximumFractionDigits: 4`, lendo a string decimal sem passar por binário) já é o formatador de
"fator com as casas que ele tem" da diária. `formatChargeOrUnknown` (`fleet/shared/
tollBoothChargeFormat.service.ts`) troca `formatFuelPricePerUnit` (quatro casas fixas, via
`Number`) por ele — é a função usada nos três valores de tarifa da linha (em uso manual, em uso com
tag, tarifa do mapa). O campo de digitação do ajuste não mudou.

Teste novo `test/fleet/toll-booth-charge-format.contract.tsx` (registrado em
`test/fleet.contract.test.ts`): `14.7000 → R$ 14,70`, `13.9650 → R$ 13,965`, `4.2 → R$ 4,20`,
`0.1234 → R$ 0,1234`, `null` → rótulo de desconhecida, e a linha renderizada
(`renderToStaticMarkup`, i18n real) com `R$ 14,70`/`R$ 13,965` e sem `14,7000`/`13,9650`.

```
$ bun test ./test/fleet/toll-booth-charge-format.contract.tsx     # antes do conserto
(fail) … > 14.7000 vira R$ 14,70
(fail) … > 13.9650 vira R$ 13,965
(fail) … > 4.2 vira R$ 4,20            Expected: "R$ 4,20"  Received: "R$ 4,2000"
(fail) … > a linha da praça renderiza "R$ 14,70" e "R$ 13,965", nunca "14,7000"
 2 pass
 4 fail
$ bun test ./test/fleet/toll-booth-charge-format.contract.tsx     # depois
 6 pass
 0 fail
```

Gates: `typecheck && lint && format:check && test && build` com exit 0 — contratos **4411 pass /
0 fail**, `test:hooks` **14 pass / 0 fail**, build ✓.

**Observação (fora de escopo, não mexido):** a aba de **combustível** continua com
`formatFuelPricePerUnit` e quatro casas fixas ("R$ 5,8900"). Mesma decisão caberia lá, mas o
usuário a deixou de fora desta tarefa.

#### Item 2 — alvo de toque do "Abrir calendário" no campo de data da Frota (#9 da T506)

O botão do `DatePicker` dentro do `FleetDateField` tinha a caixa do ícone: **18×18px**. O
`FleetDateField` passa a marcar o próprio rótulo com `.dateField`, e `.dateField button`
(`fleet.module.css`) sobe a caixa a `min-width/min-height: var(--touch-target)` (44px) com o ícone
no centro — o ícone continua 18px. A margem negativa devolve exatamente o que a caixa cresceu
(`margin-block: calc((var(--icon-size-md) - var(--touch-target)) / 2)`; na horizontal a borda
direita da caixa para na borda interna do gatilho), então o gatilho não cresce. Vale em todas as
larguras: é neutro para o layout e tablet também é toque. O primitivo `@/components/ui/date-picker`
não mudou — a regra fica escopada ao campo da Frota, como pedido.

**Telas que usam o campo** (grep de `FleetDateField`): **3 telas, 7 campos** — aba **Pedágio**
("Data da tarifa", 1 por praça), **ficha do motorista** na aba Motoristas ("Primeira habilitação",
"Validade da CNH" e o terceiro campo de data da ficha) e o **cadastro rápido de motorista** que abre
do proprietário agregado em "Novo veículo" (os mesmos 3 campos).

Medido no `vite preview` (Playwright, 1440×900 e 390×844), botão · ícone · gatilho, e
`elementFromPoint` a 20px do centro do ícone nas quatro direções:

| Tela / largura          | antes: botão | depois: botão | ícone | gatilho (altura, y) antes → depois | toque a 20px |
| ----------------------- | ------------ | ------------- | ----- | ---------------------------------- | ------------ |
| Pedágio 1440            | 18×18        | 44×44         | 18    | 48, 853 → 48, 853                  | ✗✗✗✗ → ✓✓✓✓  |
| Pedágio 390             | 18×18        | 44×44         | 18    | 48, 398 → 48, 398                  | ✗✗✗✗ → ✓✓✓✓  |
| Ficha do motorista 1440 | 18×18        | 44×44         | 18    | 48, 426 → 48, 426                  | ✗✗✗✗ → ✓✓✓✓  |
| Ficha do motorista 390  | 18×18        | 44×44         | 18    | 48, 398 → 48, 398                  | ✗✗✗✗ → ✓✓✓✓  |
| Cadastro rápido 1440    | 18×18        | 44×44         | 18    | 48, 426 → 48, 426                  | ✗✗✗✗ → ✓✓✓✓  |
| Cadastro rápido 390     | 18×18        | 44×44         | 18    | 48, 398 → 48, 398                  | ✗✗✗✗ → ✓✓✓✓  |

Os vizinhos não andaram: os campos da mesma coluna ficaram nas mesmas coordenadas (ex.: "Validade da
CNH" em y 615/638/622 e "Diária" em 669/758/742 antes e depois, desktop/celular/cadastro rápido); o
ícone deslocou 1px para a esquerda.

Teste novo `test/fleet/date-field-touch-target.contract.ts`, no molde de
`test/trip/mobile-first.contract.ts` (regra lida do CSS com o `@media` que a envolve): o rótulo do
`FleetDateField` carrega `.dateField`; `.dateField button` tem `min-width`/`min-height` em
`var(--touch-target)` na base; as margens neutralizam o crescimento; nenhum breakpoint desfaz o alvo.

```
$ bun test ./test/fleet/date-field-touch-target.contract.ts     # antes do conserto
(fail) … > o FleetDateField marca o próprio rótulo com a classe que carrega o alvo
(fail) … > o botão sobe ao alvo de toque na base (celular), sem tamanho literal
         Expected to contain: "min-width: var(--touch-target)"  Received: []
(fail) … > a margem negativa devolve o que a caixa cresceu — o campo não muda de altura
 1 pass
 3 fail
$ bun test ./test/fleet/date-field-touch-target.contract.ts     # depois
 4 pass
 0 fail
```

Gates: exit 0 — contratos **4415 pass / 0 fail**, `test:hooks` **14 pass / 0 fail**, build ✓.

Prints (antes/depois, recorte do campo com os vizinhos): `/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada--claude-worktrees-quirky-ptolemy-d856cd/bc214853-8c6a-4572-a20d-0041087981f5/scratchpad/review/shots/t507/{before,after}-{desktop,mobile}-date-01-toll.png`,
`…-date-02-driver-form.png`, `…-date-03-driver-quick-create.png`.

**Observação:** o mesmo botão de 18px existe em todo `DatePicker` fora da Frota (o primitivo não foi
tocado). Levar a regra para `date-range-picker.module.css` resolve a app inteira de uma vez; fica
como pendência explícita, fora do escopo pedido.

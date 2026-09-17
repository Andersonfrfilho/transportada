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

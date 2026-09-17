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

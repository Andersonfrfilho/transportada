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

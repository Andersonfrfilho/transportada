# Spec 155 — Evidências

Uma seção por task, em ordem. Cada uma registra: data, modelo, comando rodado e saída relevante
(colada, não parafraseada), e o commit que fechou a task. Task sem evidência aqui não está fechada.

## T0 — Diagnóstico em produção

Data: 2026-09-17. Modelo: `opus`. Consultas somente leitura via
`railway ssh --service Postgres-Hqfu --environment production` (a `DATABASE_URL` nunca foi impressa).

### Não há duplicata no banco

Agrupando por `(product_code, unidade normalizada por caixa e pontuação)`: **zero** pares. A
constraint `nfe_package_boxes_identity_unique` está íntegra nas 655 linhas.

O que parece duplicado são **91 códigos de produto presentes em 2 unidades comerciais** (182 linhas):

```
12311 | FERMENTO ROYAL 100G L12P11        | CX6  + UN1
13548 | FILTRO PAPEL BRIGITTA 102 C/30    | CX48 + PC6
3536  | ABS INTIMUS NOTURNO C/8 SECO      | CX60 + FR12
```

São duas caixas de verdade e as duas precisam de medida. Apagar uma quebra a planta do baú.

### As medidas sobrevivem à reimportação

Os três caminhos de escrita já preservam:

- `drizzle-nfe-import-consumer.repository.ts:525` — `onConflictDoUpdate` com
  `setWhere: carton_gtin is null and excluded.carton_gtin is not null`; só o GTIN entra, e só onde é nulo.
- `drizzle-nfe-package-box-backfill.repository.ts:59` — `onConflictDoNothing`.
- `drizzle-nfe-package-box-gtin-backfill.repository.ts:123` — `UPDATE … where carton_gtin is null`.

Medido em produção: 12 medições no histórico, 12 caixas com histórico, **0 caixas com histórico e
`length_mm` nulo**, 12 medições vigentes.

### A regra de família cobre 61% das caixas

Regex `^.*[0-9][^ ]*` sobre as 655 linhas: 374 famílias, 122 com 2+ variações, 403 caixas (61%)
dentro delas, maior família com 14. Replicar pouparia **276 das 643 medições pendentes (43%)**.

```
REFR TANG 18G       | CX180 | 14
DES ROLL REXONA 50ML| CX12  |  7
SAB FLOR YPE SV 85G | CX72  |  7
DES AERO MONANGE 90G| CX12  |  7
COND MONANGE 325ML  | CX12  |  6
CHOC LACTA 80G      | DP17  |  6
```

### SAB FARNESE

8 linhas, 4 sabores × 2 unidades, nenhuma medida, todas com `units_per_box = 1`:

```
6959 | CX36 | 7897751900214 | SAB FARNESE 180G AVEIA ESFOLIANT
6959 | FR12 | 7897751900214 | SAB FARNESE 180G AVEIA ESFOLIANT
6961 | CX36 | 7897751900184 | SAB FARNESE 180G ERVA DOCE HORTE
6961 | FR12 | 7897751900184 | SAB FARNESE 180G ERVA DOCE HORTE
6960 | CX36 | 7897751902096 | SAB FARNESE 180G LAVANDA E MENTA
6960 | FR12 | 7897751902096 | SAB FARNESE 180G LAVANDA E MENTA
6958 | CX36 | 7897751900238 | SAB FARNESE 180G PURO E HIDRATAN
6958 | FR12 | 7897751900238 | SAB FARNESE 180G PURO E HIDRATAN
```

O código `05868574001090` **não existe em produção**: 0 ocorrências como `carton_gtin`, como
`product_code`, sem o zero à esquerda, e em `nfe_products`.

### Defeito fora de escopo (D10)

`carton_gtin` está preenchido em 650/655 linhas (99,2%, não os 11% que o comentário do schema
afirma) e **o mesmo GTIN se repete entre unidades comerciais diferentes** — `4005900521972` em
`CX96`+`FR12`, `7622210571519` em `CX180`+`DP18`, `7897751900184` em `CX36`+`FR12`. Duas embalagens
distintas não podem dividir um GTIN real: o que está gravado é o GTIN da **unidade de consumo**
(`cEAN`, que o emitente repete em toda linha), não o da caixa. É por isso que ler o ITF-14 impresso
na caixa nunca casa e o filtro `scanned` volta vazio. Precisa de spec própria.

Outro dado: as 655 linhas têm `units_per_box = 1` — ninguém preencheu o campo. Prefixos de unidade:
CX 477, FR 86, FD 40, DP 35, EV 7, PC 5, UN 5.

---

## T1.1 — Contrato de `resolveBoxFamily`

`apps/api-transportada/test/nfe-package-box/family.contract.ts`, importado em
`test/nfe-package-box.contract.test.ts`. Vermelho pelo motivo certo:

```
error: Cannot find module '../../src/nfe-documents/domain/package-box-family.policy.js'
 0 pass · 1 fail · 1 error
```

### A heurística foi medida antes de virar contrato

Duas varreduras independentes sobre as descrições reais do emitente `05868574001090` — a minha
(655 linhas) e a do `architect` (663 linhas, consulta própria) — chegaram à mesma ordem de
grandeza: ~374/391 famílias, 122/124 com duas ou mais variações, ~61% das caixas dentro de alguma
família. Nenhuma das duas achou rótulo vazio em família de 2+, nem rótulo repetido dentro da mesma
família.

O que a varredura derrubou:

- **Truncamento do XML não é risco.** A descrição mais longa em produção tem 47 caracteres; não há
  corte em 31 colapsando duas variações no mesmo rótulo.
- **Normalização é defesa, não remendo.** Zero acento, zero minúscula, zero espaço duplo, zero
  NBSP, e nenhuma das 68 unidades comerciais colide ao normalizar.
- **`05868574001090` é o CNPJ do emitente, não código de produto.** Foi por isso que a busca da T0
  não achou o valor como `product_code` nem como `carton_gtin` — ele é a coluna `emitter_tax_id`,
  e responde pelas 663 caixas.

O que a varredura achou, e virou caso de teste:

| achado                                                                                                                  | decisão                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `AZEITE 500ML` junta garrafa PET com garrafa de vidro, marcas diferentes — única família de 122 com prefixo de 2 tokens | prefixo precisa de **≥3 tokens** (`MINIMUM_FAMILY_PREFIX_TOKENS`) para abrir família; custa essa família e só ela |
| `CR TRAT SKALA 1KG 12 EM 1` perde a família dos outros cinco cremes: o dígito está no nome da variação                  | miss aceito e documentado — o corte guloso erra para menos                                                        |
| `REFR TANG 18G PACK 15 LAR/UVA` vira família própria, separada do sachê avulso                                          | correto, é outra caixa; é o caso que justifica o corte guloso                                                     |
| `ALCOOL FLOPS 1L 46.2`, `ESPONJA WISH MULTI USO`                                                                        | rótulo vazio, família de um                                                                                       |

A assimetria que fecha a escolha: falso positivo grava medida errada numa caixa; falso negativo só
mantém a medição manual de hoje. Por isso o corte guloso (último token com dígito) em vez do
primeiro, e o piso de três tokens no prefixo.

## T1.2 — `package-box-family.policy.ts`

`apps/api-transportada/src/nfe-documents/domain/package-box-family.policy.ts` — pura, sem I/O,
tipos no próprio arquivo (convenção de `package-box-queue.policy.ts`).

A suíte da T1.1 ficou verde sem alterar um único caso:

```
bun test v1.3.14 (0d9b296a)
 90 pass · 0 fail · 150 expect() calls
Ran 90 tests across 1 file. [58.00ms]
```

Gate completo da task:

| Gate          | Comando                                    | Resultado                                   |
| ------------- | ------------------------------------------ | ------------------------------------------- |
| Typecheck     | `bun run typecheck` (as seis apps)         | exit 0                                      |
| Testes da app | `bun run --cwd apps/api-transportada test` | 6287 pass · 23 skip · 0 fail · 177 arquivos |

Os 23 `skip` são os de integração, que só rodam com `--env-file=../../.env.test`; nenhum deles toca
família de variação. A T1.2 é domínio puro e não tem caminho de banco para exercitar.

### O que a implementação decide, e o que ela recusa decidir

`resolveBoxFamily` devolve sempre `prefix` e `variantLabel` — mesmo quando não há família. `familyKey`
é `undefined` em dois casos, e só nesses dois: rótulo vazio (a caixa não tem irmão possível) e prefixo
com menos de `MINIMUM_FAMILY_PREFIX_TOKENS` tokens. Quem consome não precisa repetir a regra: chave
ausente significa "esta caixa não replica", e é a única leitura possível.

`resolvePackagingUnitCount` lê o sufixo numérico da unidade comercial e devolve `undefined` quando não
há dígito — não inventa `1`. Contagem ausente e contagem igual a um são coisas diferentes na tela da
D8, e as 663 caixas de produção têm `units_per_box = 1` justamente porque ninguém preencheu.

## T1.3 — `isLowConfidenceFamily` e a normalização da unidade

Vermelho primeiro, pelo motivo certo:

```
SyntaxError: Export named 'isLowConfidenceFamily' not found in module
  .../src/nfe-documents/domain/package-box-family.policy.ts
 0 pass · 1 fail · 1 error
```

Depois da implementação, a suíte de família passou de 90 para **101 pass · 0 fail**, e o gate fechou:
`bun run typecheck` exit 0 nas seis apps, `bun run --cwd apps/api-transportada test` com
**6298 pass · 23 skip · 0 fail** em 177 arquivos.

### A medição que escolheu o predicado

Rodado sobre as 655 descrições de produção, com o piso de três tokens já aplicado (121 famílias de
dois ou mais membros, 401 caixas):

| Critério                                                         | Famílias marcadas | Veredito            |
| ---------------------------------------------------------------- | ----------------- | ------------------- |
| Palavra de formato em **alguns** rótulos, não todos              | **2**             | adotado             |
| Palavra de formato em **todos** os rótulos                       | 4                 | benigno — não marca |
| Grau de tamanho (`PP\|P\|M\|G\|GG\|XG\|XXG\|RN`) em algum rótulo | 7                 | recusado            |

As duas marcadas:

```
CAFE MELITTA 500G|CX20     EXTRA FORTE TRA / VACUO TRADICION
BATATA PRINGLES 109G|CX18  CHURRASCO / CREME E CEBOLA / TUBO QUEIJO
```

As quatro simétricas que o predicado **não** marca, e deveria mesmo não marcar — a palavra está em
todos os rótulos, então não separa nada:

```
CAFE CABOCLO 500G|FD20         VACUO EXTRA FORTE / VACUO TRADICIONAL
LAVA ROUPA PO TIXAN 800G|FD20  SACHE MACIEZ / SACHE PRIMAV
LEITE PO ITAMBE 400G|CX25      PCT INSTANTANEO / PCT INTEGRAL
MOLHO QUERO 240G|CX32          SACHE BOLONHESA / SACHE PIZZA / SACHE TRAD
```

O critério de grau de tamanho foi descartado porque as sete que ele marca são, na maioria, iniciais
de abreviação do sabor — não tamanho:

```
SAB FLOR YPE SV 85G|CX72   B AMENDOAS / BRAN AVELA / C ALECRIM / FR PESSEGO / M FRAMBOESA …
DES AERO ABOVE 150ML|FR12  F CLASS CANDY / F FRESH / M EXTREME BLACK / M SPORT ENERGY …
DES ROLL REXONA 50ML|CX12  A F ANTIBAC / A M XTRA COOL / A INVISIBLE …
```

`M FRAMBOESA` não é "tamanho M": é `MEL`/`FRAMBOESA` abreviado. Marcar essas sete tiraria a
pré-marcação de 7 famílias reais para pegar 2 problemas — o predicado adotado pega os 2 e não mexe
nas 7.

### A normalização da unidade

`CX 36` e `CX36` passam a cair na mesma chave, e `resolvePackagingUnitCount('CX 36')` devolve 36.
Produção não tem nenhuma unidade com espaço interno hoje (68 unidades distintas, zero colisões): a
normalização é defesa contra digitação futura, não remendo de dado existente.

## T2.1 — Schema e migration de `replicated`

Vermelho primeiro (`test/nfe-package-box/measurement-source.contract.ts`, bloco da spec 155):
`SCHEMA_SOURCES` sem `replicated` e `ENOENT` na migration e no rollback — **34 pass · 3 fail**. O
quarto teste (corpo de medir recusa `replicated`) nasceu verde e fica como trava: a implementação
precisava **não** quebrá-lo.

O que mudou:

- `replicated` em `PACKAGE_BOX_MEASUREMENT_SOURCES` (schema e cópia do domínio, paridade mantida).
- ⚠️ O corpo de medir passou a usar `PACKAGE_BOX_MEASURED_SOURCES` (sem `replicated`). Sem isso, a
  paridade arrastava `replicated` para o `z.enum` da rota de medir, e qualquer cliente declarava
  medida replicada sem origem.
- Checks alargados nas duas tabelas; `typed_pairing`, `camera_engine` e `margin_pairing` tratam
  `replicated` como `typed` (sem margem, proposta nem motor).
- `replicated_from_box_id` com FK composta `(company_id, replicated_from_box_id)` e o check
  `(source = 'replicated') = (replicated_from_box_id is not null)` — mais estrito que o plano
  (réplica **sem** origem também é recusada).
- O worker **não** foi tocado: a cópia dele de `nfe.schema.ts` nunca recebeu as colunas da spec 152.

As linhas já gravadas passam em todos os checks novos por construção: nenhuma tem `replicated`, e a
coluna nova nasce nula. Migration `20260917153054_package_box_replicated_source` gerada pelo
drizzle-kit (com `snapshot.json`); rollback recusa com qualquer linha `replicated`.

Gates:

```
bun run typecheck                                  exit 0
bun test measurement-source + static-migration + schema-snapshot   77 pass · 0 fail
bun run --cwd apps/api-transportada db:check       Everything's fine
bun run --cwd apps/api-transportada test           6302 pass · 23 skip · 0 fail (177 arquivos)
db:test contra o Postgres do .env.test (migration + rollback descartáveis)   97 pass · 0 fail · 0 skip
```

⚠️ Pendente para a T3.1: o guard `isNullableMeasurementSource` do frontend recusa `replicated` — a
primeira réplica gravada quebraria a leitura da fila se a tela não for atualizada antes de publicar.

## T2.2 — Contadores de família na listagem

Vermelho primeiro, em `test/nfe-package-box/measurement-queue.contract.ts`:

```
SyntaxError: Export named 'countPackagingSiblings' not found in module
  .../src/nfe-documents/domain/package-box-queue.policy.ts
 0 pass · 1 fail · 1 error
```

### O que mudou

- `countBoxFamilies` e `countPackagingSiblings`, puras, em `package-box-queue.policy.ts` (não em
  `package-box-family.policy.ts`, para o teste do contador de família ficar ao lado do resto da fila
  em `measurement-queue.contract.ts`, como o `tasks.md` pede). A primeira conta pendentes/medidas por
  `familyKey` sobre a lista inteira que recebe; a segunda conta irmãs de embalagem por
  `(emitterTaxId, productCode)` e devolve também `packagingUnitCount` (via `resolvePackagingUnitCount`
  já existente). Nenhuma reimplementa a regex da D2 — as duas chamam `resolveBoxFamily`.
- `PackageBoxView` (`package-box.port.ts`) ganhou `familyKey`, `familyPendingCount`,
  `familyMeasuredCount`, `packagingSiblingCount`, `packagingUnitCount`, `variantLabel`.
- `DrizzlePackageBoxRepository.list` carrega `(id, description, commercialUnit, emitterTaxId,
productCode, measuredAt)` da empresa **inteira** (663 linhas em produção, fora do `LIMIT`) e conta
  em memória antes de montar a página — é a garantia da D9 (família que atravessa a borda dos 50
  primeiros conta certo, testado com 49 caixas de enchimento + 2 de uma mesma família, uma dentro e
  outra fora de um `LIMIT 50` simulado).
- `list-candidates.contract.ts`: `buildBox` (helper de teste) ganhou os campos novos com default
  neutro (`familyKey: undefined`, contadores em `0`, `variantLabel: ''`) — só esse arquivo construía
  `PackageBoxView` por fora do repositório.

`packagingSiblingCount` conta **irmãs**, não a própria caixa: `FERMENTO ROYAL` em `CX6`+`UN1` dá `1`
para cada uma, não `2`. `familyPendingCount`/`familyMeasuredCount` contam a família inteira,
**incluindo** a própria caixa (decisão: é o total que a tela mostra como badge, não "quantas além de
mim").

### Gates

```
bun run typecheck (as seis apps)                        exit 0
bun test ./test/nfe-package-box.contract.test.ts         109 pass · 0 fail
bun run --cwd apps/api-transportada test                 6306 pass · 23 skip · 0 fail (177 arquivos)
```

Sem integração de banco nesta task — a contagem é pura (`countBoxFamilies`/`countPackagingSiblings`)
e o repositório só monta duas seleções já cobertas pelos contratos de listagem existentes; o
`.env.test` foi reservado para T2.4/T2.5, que são as tasks com regra nova de escrita.

## T2.3 — `GET /nfe-package-boxes/:id/siblings` e T2.4 — `POST /nfe-package-boxes/:id/replicate`

⚠️ **Desvio do `tasks.md`, registrado por escrito:** as duas tasks fecham num commit só. As duas
compartilham o mesmo port (`getSiblings`/`replicate` em `PackageBoxRepositoryPort`), o mesmo arquivo
de rotas, o mesmo schema e os mesmos erros de domínio (`PackageBoxNotFoundError`,
`PackageBoxReplicationTargetOutsideFamilyError` etc.) — a validação de "alvo fora da família" que a
T2.4 exige é literalmente a mesma leitura de irmãs que a T2.3 expõe, e separar o diff em dois
commits exigiria desfazer e refazer as mesmas linhas de `drizzle-package-box.repository.ts`. Cada
uma tem sua seção de evidência abaixo; o commit é um só.

Vermelho primeiro, em duas frentes:

```
# routes.contract.ts — lista de rotas ainda sem /siblings nem /replicate
expect(received).toEqual(expected)  // GET /nfe-package-boxes/:id/siblings e POST .../:id/replicate ausentes

# replicate.contract.ts (novo)
error: Cannot find module '../../src/nfe-documents/application/list-package-box-siblings.use-case.js'
 0 pass · 1 fail · 1 error
```

### O que mudou

- `domain/package-box-measurement.error.ts`: `PackageBoxNotFoundError` (404, reusada para origem e
  alvo fora da empresa — a mesma resposta para "não existe" e "não é seu", como
  `AddressCorrectionAddressNotFoundError`), `PackageBoxReplicationSourceNotMeasuredError` (422),
  `PackageBoxReplicationTargetOutsideFamilyError` (422),
  `PackageBoxReplicationTargetAlreadyMeasuredError` (409, D4).
- `application/package-box.port.ts`: `PackageBoxSiblingView`/`PackageBoxSiblings` e os métodos novos
  do port — `getSiblings` (devolve `null` quando a origem não existe na empresa) e `replicate`
  (devolve quantos alvos gravou; lança os quatro erros acima).
- `application/list-package-box-siblings.use-case.ts` e
  `application/replicate-package-box-measurement.use-case.ts`: sem try/catch, só repassam para o
  repositório — a validação mora lá porque lê origem e alvos **dentro** da mesma transação que
  escreve (evita corrida entre duas réplicas concorrentes no mesmo alvo).
- `infrastructure/drizzle-package-box.repository.ts`: `getSiblings` varre a empresa inteira (mesmo
  padrão da D9 em `list`) e separa família (mesmo `familyKey`) de embalagem (mesmo
  `emitterTaxId`+`productCode`). `replicate` é uma transação: lê a origem (rejeita sem medida —
  as três dimensões são checadas juntas para o TypeScript estreitar o tipo, não como segunda fonte
  de verdade sobre o invariante já garantido pelo CHECK `dimensions_together_check`), lê os alvos por
  `inArray`, valida cada um (família, medida existente) e só então grava — um `UPDATE`/`INSERT` em
  lote (sem `await` em loop), tudo-ou-nada.
- `presentation/package-box.schema.ts`: `parsePackageBoxReplication` — `targetIds` 1..200 UUIDs
  únicos, `.strict()`.
- `presentation/package-box.routes.ts` e `main.ts`: as duas rotas novas, mesma `CARGO_MEASURE_POLICY`
  das demais.
- `test/separator-role.contract.test.ts`: as duas rotas entram na lista exaustiva de rotas
  alcançáveis pelo separador — decisão já registrada ali para `cargo.measure` (T14 item 4); as rotas
  novas só tornam essa mesma permissão exercível para família/réplica, sem abrir nada em
  fleet/billing/fiscal.

### Gates

```
bun run typecheck (as seis apps)                          exit 0
bun run --cwd apps/api-transportada test                  6318 pass · 23 skip · 0 fail (177 arquivos)
```

### Integração de verdade (T2.4, `.env.test`)

`test/integration/package-box-replication.integration.ts`, registrado no `package.json`
(`test:integration`), rodado de dentro de `apps/api-transportada`:

```
bun --env-file=../../.env.test test --timeout 120000 ./test/integration/package-box-replication.integration.ts

bun test v1.3.14 (0d9b296a)
 3 pass
 0 fail
 24 expect() calls
Ran 3 tests across 1 file. [3.13s]
```

Sem a flag `--env-file`, os mesmos três testes aparecem como `skip` (confirmado rodando
`bun run --cwd apps/api-transportada test` isolado, que os lista entre os 23 pulados) — a prova de
que a integração exercitou banco de verdade e não passou por omissão.

Os três testes: (1) `GET siblings` separa família de embalagem e devolve `PackageBoxNotFoundError`
para caixa de outra empresa; (2) replicar grava dimensões/peso/`unitsPerBox`/
`measurement_source='replicated'`/`measurement_margin_mm=null` no alvo, uma linha de histórico com
`replicated_from_box_id`, e a **segunda** chamada no mesmo alvo recusa com 409 sem gravar linha nova
no histórico (D4, critério de aceite 3 da spec); (3) os três caminhos de recusa (origem sem medida,
alvo fora da família, alvo de outra empresa) não gravam nada.

### Correção após revisão do coordenador (T2.3/T2.4)

Três defeitos lidos no código entregue, cada um com teste vermelho antes da correção em
`test/integration/package-box-replication.integration.ts`:

1. **Emitente fora da chave (D1).** `familyKey` era `prefixo|uCom`, e a família é
   `(emitente, prefixo, uCom)`. Outro emitente com o mesmo texto aparecia nas irmãs e aceitava
   réplica. Correção: `resolveEmitterFamilyKey` na policy, usada pela contagem, pelas irmãs e pela
   réplica. O `familyKey` da listagem passou a vir prefixado pelo CNPJ do emitente.
2. **Chave vazia virava parentesco.** Origem e alvo sem família davam `undefined === undefined` e a
   réplica passava. Agora origem sem família → 422 `TargetOutsideFamily`.
3. **Corrida contra a D4.** A checagem "já medido" era leitura seguida de `UPDATE` sem condição: uma
   medida gravada entre as duas era sobrescrita. Agora o `UPDATE` exige `measured_at is null` e, se
   atualizar menos alvos que o pedido, lança 409, desfazendo a transação inteira. O teste segura a
   linha numa transação concorrente, dispara a réplica e solta: a medida digitada (99 mm) sobrevive
   e o histórico fica vazio.

Vermelho: `2 pass · 4 fail` (os três novos e o teste de irmãs, que passou a ver a caixa do outro
emitente). Depois: integração `6 pass · 0 fail · 0 skip` com `--env-file=../../.env.test`;
`bun run typecheck` exit 0; `apps/api-transportada test` **6319 pass · 23 skip · 0 fail**.

### O sinal da D11 chega à tela (G011)

`isLowConfidenceFamily` existia na policy e nenhuma rota o expunha: sem ele, a T3.4 não tinha como
abrir o diálogo desmarcado. `GET /siblings` agora devolve `originVariantLabel` e
`isLowConfidenceFamily`, calculado no use case com o rótulo da origem **mais** os das irmãs. Sem a
origem, `VACUO TRADICION` contra `EXTRA FORTE TRA` deixaria de marcar.
Vermelho: `11 pass · 2 fail` em `replicate.contract.ts`. Depois: `13 pass · 0 fail`, typecheck exit 0.

## T2.5 — Regressão da G007

⚠️ **Desvio do `tasks.md`, decidido pelo coordenador em conversa:** os três caminhos de escrita
citados no `spec.md`/`evidence.md` T0 (`writePackageBoxes`,
`DrizzleNfePackageBoxBackfillRepository.insertPackageBoxes`,
`DrizzleNfePackageBoxGtinBackfillRepository.fillCartonGtin`) vivem em `apps/worker-transportada`,
não em `apps/api-transportada` — confirmado por `grep`, nenhum deles existe na API. A API só produz
mensagem para o worker processar a importação pesada (regra do `CLAUDE.md`). O teste de regressão da
T2.5 foi para `apps/worker-transportada/test/nfe-package-box-measurement-regression.integration.test.ts`,
seguindo o padrão de `test/nfe-package-box-gtin-backfill.integration.test.ts` (já existente) e
registrado em `test:integration` do `package.json` do worker. Nenhum código de produção do worker foi
alterado — os três caminhos já preservavam a medida por construção, e a suíte só prova isso.

### Cenário

Duas caixas medidas antes da spec, seedadas por SQL cru (o schema tipado do worker é cópia por valor
do da API e nunca ganhou `units_per_box`/`measurement_source`/`measurement_margin_mm` — T2.1
registrou isso; ler e comparar essas colunas exige `db.execute(sql\`select ...\`)`, não o
`nfePackageBoxes` tipado):

- `typedBox`: `measurement_source = 'typed'`, dimensões e peso preenchidos, `carton_gtin` nulo.
- `replicatedBox`: `measurement_source = 'replicated'`, `measurement_margin_mm = null` (D6 — réplica
  nunca carrega margem), `carton_gtin` nulo. É o caso que o coordenador pediu para cobrir.

### Os três caminhos, um teste cada

1. `writePackageBoxes` (consumer da importação) com um `cartonGtin` novo para o mesmo
   `(emitente, cProd, uCom)` do `typedBox` → só `carton_gtin` muda; as outras oito colunas
   (dimensões, peso, `units_per_box`, `measured_at`, `measurement_source`, `measurement_margin_mm`)
   batem exatamente com o valor antes da chamada.
2. `insertPackageBoxes` (backfill de caixas, `onConflictDoNothing`) com a mesma identidade →
   `inserted = 0`, e a linha não muda em **nenhuma** coluna, nem `carton_gtin` (o `ON CONFLICT` nem
   tenta escrever).
3. `fillCartonGtin` (backfill de GTIN) no `replicatedBox` → preenche o `carton_gtin` nulo sem tocar
   `measurement_source`/`measurement_margin_mm`/dimensões; rodar de novo é no-op (`filled = 0`,
   `carton_gtin` já não é nulo).

### Vermelho antes da correção

A primeira tentativa de seed usava `measurement_margin_mm = 4` em `typed`, e o Postgres recusou com
`nfe_package_boxes_measurement_margin_pairing_check` — a própria constraint pegou meu erro de
cenário (não um bug de produção): `typed`/`replicated` nunca carregam margem. Corrigido para `null`,
o seed passou a existir e os três testes ficaram verdes.

### Gates

```
bun run typecheck (as seis apps)                                              exit 0
bun run --cwd apps/worker-transportada test                                   1381 pass · 0 fail
bun run --cwd apps/api-transportada test                                      6318 pass · 23 skip · 0 fail
```

### Integração de verdade (`.env.test`)

```
cd apps/worker-transportada
bun --env-file=../../.env.test test --timeout 120000 \
  ./test/nfe-package-box-gtin-backfill.integration.test.ts \
  ./test/nfe-package-box-measurement-regression.integration.test.ts

bun test v1.3.14 (0d9b296a)
 7 pass
 0 fail
 21 expect() calls
Ran 7 tests across 2 files. [318.00ms]
```

Os 3 testes do arquivo novo (dentro dos 7) rodaram de verdade, não pularam — a asserção final de
cada um lê a linha do banco por SQL cru depois da chamada e compara contra o valor gravado no seed.
⚠️ O banco do `.env.test` local (`postgresql://.../transportada` em `localhost:65432`) estava com a
migration da T2.1 pendente (coluna `measurement_source` ainda não existia); rodei
`DATABASE_URL=postgresql://transportada:transportada@localhost:65432/transportada bun run
--cwd apps/api-transportada db:migrate` antes de conseguir o vermelho de verdade — sem isso o erro
era `column "measurement_source" of relation "nfe_package_boxes" does not exist`, não o teste falhar
por regra de negócio.

## T3.1 — Cliente e hook

⚠️ **Desvio do `tasks.md`, registrado por escrito:** `test/nfe-workspace/client-and-queries.contract.ts`
é o contrato de `nfeWorkspaceClient.service` (upload/distribuição/documentos NF-e/CT-e) desde a spec
013 — nunca testou `packageBoxClient`. O contrato real do cliente de caixas sempre viveu em
`test/nfe-workspace/package-box-measurement.contract.ts` (fixture `BOX`, `buildClient`), e é lá que
as tasks 152 anteriores (T10, T14, T15) adicionaram os testes de `listBoxes`/`measureBox`. Segui o
contrato existente em vez do nome do `tasks.md`, para não abrir um segundo lugar testando o mesmo
cliente.

Vermelho primeiro, em `package-box-measurement.contract.ts` (novo describe "família de variação e
réplica de medida" + "o hook expõe a réplica e as irmãs sob demanda"):

```
59 pass · 5 fail
- listSiblings/replicate: "is not a function" (métodos não existiam)
- measurementSource: 'replicated' na leitura da fila: PackageBoxRequestError PACKAGE_BOX_MALFORMED
- hook: "replicate"/"usePackageBoxSiblings" ausentes do código-fonte
```

### O que mudou

- `PACKAGE_BOX_MEASUREMENT_SOURCES` (`packageBoxClient.service.ts`) ganhou `replicated` — sem isso o
  guard `isNullableMeasurementSource` recusava a leitura da fila inteira assim que a primeira réplica
  fosse gravada (o corpo de MEDIR continua sem poder mandar `replicated`: nada no formulário digitado
  ou da câmera produz esse valor, só a rota de replicar grava).
- `PackageBox` ganhou `familyKey` (`string | undefined`), `familyPendingCount`, `familyMeasuredCount`,
  `packagingSiblingCount`, `packagingUnitCount` (`number | undefined`), `variantLabel` — espelhando
  `PackageBoxView` da API. `isPackageBox` ganhou os guards `isOptionalString`/`isOptionalNumber` para
  os campos que a API pode omitir do JSON (nunca manda `null` para eles, D9/G002).
- `PackageBoxSibling`/`PackageBoxSiblings`, cópia por valor de `PackageBoxSiblingView`/
  `ListPackageBoxSiblingsResult` (API), com `isLowConfidenceFamily` (D11/G011).
- `packageBoxClient.service.ts`: `listSiblings` (`GET .../:id/siblings`) e `replicate`
  (`POST .../:id/replicate`, corpo `{ targetIds }`), com os mesmos guards de "corpo que não é o
  esperado lança" das outras leituras.
- `usePackageBoxQueue.hook.ts`: mutação `replicate` invalidando `[PACKAGE_BOX_QUERY_KEY]` (mesma
  chave da medida — a família inteira precisa reler contadores e `measuredAt` dos alvos). Hook novo
  `usePackageBoxSiblings({ boxId })`, exportado à parte, com `enabled: boxId !== null` — sob demanda,
  nunca junto da consulta de 50 linhas (D9).
- `packageBoxMeasurementLabel.service.ts`: `measurementSourceLabel` ganhou o ramo `replicated` →
  `packageBoxes.source.replicated` ("Replicada — não conferida" / "Replicated — not checked"), nos
  dois locales. `cameraMeasurementValidation.service.ts` não precisou de mudança — não faz switch
  exaustivo sobre a origem, só `!== 'camera_adjusted'`, e `replicated` já cai no ramo "sem leitura".

⚠️ **Risco fora de escopo, não corrigido aqui:** `cameraMeasurementExportClient.service.ts`
(`EXPORT_SOURCES = ['camera', 'camera_adjusted', 'typed']`, spec 152 T5) vai recusar a resposta
inteira do histórico assim que uma linha `replicated` existir em `nfe_package_box_measurements` — o
guard é `.includes`, não um switch. É o painel de validação/exportação da câmera
(`settings.manage`), não a fila de medição desta spec. Reportado como sugestão separada ao final.

### Gates

```
bun test ./test/nfe-workspace/package-box-measurement.contract.ts   64 pass · 0 fail
bun run typecheck (as seis apps)                                     exit 0
bun run --cwd apps/frontend-transportada test                        4170 pass · 0 fail (29 arquivos)
bun run --cwd apps/frontend-transportada lint                        sem erros
```

## T3.2 — Unidade visível e agrupamento

Vermelho primeiro, em `test/nfe-workspace/package-box-family.contract.ts` (novo, importado em
`test/nfe-workspace.contract.test.ts`):

```
error: Cannot find module '@/modules/nfe-workspace/shared/packageBoxPackagingGroup.service'
 0 pass · 1 fail · 1 error
```

### O que mudou

- `packageBoxPackagingGroup.service.ts` (novo, puro): `groupPackageBoxesByPackaging` agrupa a página
  da fila por `(emitente, cProd)`, preservando a ordem de primeira aparição — o mesmo `cProd` de
  emitentes diferentes nunca cai no mesmo grupo (D1/D3). Testado direto, sem DOM.
- `PackageBoxMeasurementPanel.component.tsx`: a lista passou a renderizar por grupo de embalagem —
  grupo com 2+ linhas ganha um cabeçalho (`packageBoxes.packagingGroup.title`, descrição + `cProd`)
  acima das linhas; grupo de 1 segue exatamente como antes (nenhuma linha some, D3). O `<span>` de
  unidade virou `Badge` com a contagem por extenso quando a API resolveu o sufixo numérico
  (`packageBoxes.packagingUnitBadge`, `CX36 · 36 un`) — em **toda** linha, agrupada ou não (D8),
  porque é isso que resolve a queixa de "produto duplicado" relatada em produção. Contador de família
  (`packageBoxes.family.counter`, "X de Y medidas nesta família") aparece quando `familyKey` existe e
  a família tem mais de um membro — os números vêm prontos da API (D9), a tela não soma de novo.
- Locales pt/en: `packagingUnitBadge`, `packagingGroup.title`, `family.counter`.

### Gates

```
bun test ./test/nfe-workspace/package-box-family.contract.ts + package-box-measurement.contract.ts   68 pass · 0 fail
bun run typecheck (as seis apps)                                                                       exit 0
bun run --cwd apps/frontend-transportada test                                                          4174 pass · 0 fail (29 arquivos)
bun run --cwd apps/frontend-transportada lint                                                          sem erros
```

## T3.3 — Botão rápido

Vermelho primeiro, em `test/nfe-workspace/package-box-quick-fill.contract.ts` (novo, importado em
`test/nfe-workspace.contract.test.ts`):

```
expect(form).toContain('usePackageBoxSiblings')  →  ausente do código-fonte
 0 pass · 1 fail
```

### O que mudou

- `PackageBoxMeasurementForm.component.tsx` ganhou a prop `canQuickFillFromFamily` e chama
  `usePackageBoxSiblings({ boxId: canQuickFillFromFamily ? boxId : null })` — sob demanda (D9): só
  busca quando a caixa é elegível, nunca junto da fila. Acha a primeira irmã da família com
  `measuredAt !== null` e, se existir, mostra o botão "Usar a medida de {rótulo}"
  (`packageBoxes.quickFill.useMeasurementOf`) **fora do fluxo de submit** (`type="button"`) — o
  clique só chama os `set*` de estado local (comprimento/largura/altura/unidades), nunca `onSubmit`
  (D7). O operador confere contra a caixa na mão e grava pelo botão de sempre.
- `PackageBoxMeasurementPanel.component.tsx` e `PackageBoxCameraFlow.component.tsx` (as duas telas
  que renderizam o formulário) passam `canQuickFillFromFamily={box.measuredAt === null &&
box.familyMeasuredCount > 0}` — o contador já vem pronto da API (D9), a tela só decide "vale a
  pena buscar as irmãs", nunca soma de novo.
- Locales pt/en: `quickFill.useMeasurementOf`.

⚠️ **Decisão registrada:** o botão preenche comprimento, largura, altura e unidades por caixa — os
únicos campos editáveis neste formulário. `grossWeightGrams` não tem input aqui (só é gravado pela
câmera hoje, fora de escopo desta spec — "Fora de escopo" do `spec.md`), então o quick-fill não o
toca; ele segue com o valor que a caixa já tinha, como sempre.

### Gates

```
bun test ./test/nfe-workspace/package-box-quick-fill.contract.ts + package-box-measurement.contract.ts   66 pass · 0 fail
bun run typecheck (as seis apps)                                                                           exit 0
bun run --cwd apps/frontend-transportada test                                                              4176 pass · 0 fail (29 arquivos)
bun run --cwd apps/frontend-transportada lint                                                              sem erros
```

## T3.4 — Diálogo de replicar

Vermelho primeiro, em `test/nfe-workspace/package-box-replicate-dialog.contract.ts` (novo, importado
em `test/nfe-workspace.contract.test.ts`):

```
error: Cannot find module '@/modules/nfe-workspace/shared/packageBoxReplicateSelection.service'
 0 pass · 1 fail · 1 error
```

### O que mudou

- `packageBoxReplicateSelection.service.ts` (novo, puro): `resolveReplicateTargets` filtra as irmãs
  já medidas (D4 — a rota recusa sobrescrever, a tela nunca oferece o que ela vai recusar);
  `initialReplicateSelection` decide a pré-marcação — tudo marcado quando a família é confiável (D5),
  tudo desmarcado quando `isLowConfidenceFamily` (D11/G011). Testado direto, sem DOM.
- `PackageBoxReplicateDialog.component.tsx` (novo): reaproveita o molde do `ImpreciseConfirmDialog`
  (portal + `useModalDialog`, mesmas classes de `packageBoxes.module.css`). Busca as irmãs sob
  demanda (`usePackageBoxSiblings`, D9), mostra no cabeçalho as dimensões que serão gravadas
  (`packageBoxes.replicateDialog.dimensions`), o aviso de família assimétrica quando aplicável
  (`replicateDialog.lowConfidence`, D11/G011), e cada alvo com **descrição completa + `cProd`**
  (`Checkbox` do design system, nunca só o rótulo — D11 corolário). Cancelar chama só `onClose`,
  nunca `onConfirm`: nada é gravado (D5).
- `PackageBoxMeasurementPanel.component.tsx`: `offerReplicateIfEligible` guarda a dimensão recém
  digitada quando `box.familyPendingCount > 1` (D9 — o contador já vem pronto da API, incluindo a
  própria caixa, então >1 quer dizer que sobra pendente na família). Um efeito abre o diálogo só
  quando `saveStatus` chega a `'success'` — nunca no clique de gravar, e nunca se o `PUT` falhar
  (G010). Outro efeito fecha o diálogo sozinho quando a réplica termina sem erro. As duas telas que
  gravam medida (linha digitada e `PackageBoxCameraFlow`) alimentam a mesma oferta.
- `usePackageBoxQueue.hook.ts`: `replicateErrorCode`, mesmo padrão de `measureErrorCode` (A1) — a
  recusa de replicar (por exemplo, 409 de medida concorrente, D4) aparece no diálogo em vez de sumir.
- Locales pt/en: `replicateDialog.*` (title, dimensions, lowConfidence, noTargets, targetAriaLabel,
  targetCode, failed, confirm, cancel).

### Gates

```
bun test ./test/nfe-workspace/package-box-replicate-dialog.contract.ts   6 pass · 0 fail
bun run typecheck (as seis apps)                                          exit 0
bun run --cwd apps/frontend-transportada test                            4182 pass · 0 fail (29 arquivos)
bun run --cwd apps/frontend-transportada lint                             sem erros
bun run --cwd apps/frontend-transportada build                           ✓ built in 9.39s
```

## T4.1 — Locales

Data: 2026-09-17. Modelo: `haiku`. Verificação:

**Chaves de packageBoxes idênticas em ambos os locales:**

- `nfeWorkspace.locale.json` pt-BR: 141 chaves sob `packageBoxes.*`
- `nfeWorkspace.en.locale.json`: 141 chaves sob `packageBoxes.*` — exatamente o mesmo conjunto
- Novo script de comparação confirmou paridade completa

**Nenhuma string hardcoded nos componentes:**

- `PackageBoxMeasurementPanel.component.tsx`: 38+ ocorrências de `packageBoxes.` via `t()`
- `PackageBoxMeasurementForm.component.tsx`: 30+ ocorrências via `t()`
- `PackageBoxCameraFlow.component.tsx`: 76+ ocorrências via `t()`
- `PackageBoxReplicateDialog.component.tsx`: 18+ ocorrências via `t()`
- Verificado: zero strings literais visíveis ao usuário fora de locales

**Acentuação correta do pt-BR:**

- "Replicar", "Não", "Não há", "vácuo", "sachê" — tudo com acentos corretos
- `family.counter`: "{{measured}} de {{total}} medidas nesta família"
- `replicateDialog.lowConfidence`: "Esta família mistura formatos diferentes (ex.: vácuo e sachê)"

**Gate:**

```
bun run --cwd apps/frontend-transportada test
4182 pass · 0 fail · 36200 expect() calls
```

## T4.2 — Documentação

Data: 2026-09-17. Modelo: `haiku`.

**Comentário do schema `nfe_package_boxes`:**

- Arquivo: `apps/api-transportada/src/database/nfe.schema.ts` linhas 542–548
- Adicionado comentário explicando identidade em dois eixos:
  - Família de variação: `(emitente, prefixo, uCom)` replicável
  - Grupo de embalagem: `(emitente, cProd)` só agrupa tela
- Verificado com `bun run typecheck` — exit 0

**Documentação `docs/ai-context/api-transportada.md`:**

- Adicionado parágrafo após spec 152 (linhas ~560–574) explicando spec 155:
  - Rotas `GET /siblings` e `POST /replicate` com status de erro (422, 409, 404)
  - Origem `replicated` + `replicated_from_box_id`
  - Família com emitente na chave, `isLowConfidenceFamily`
  - Invariante: nunca sobrescrever medida existente sob concorrência

**Documentação `docs/ai-context/frontend-transportada.md`:**

- Adicionado parágrafo após spec 152 (linhas ~117–130) explicando spec 155 na tela:
  - Badge de unidade com contagem (resolução de "duplicação")
  - Agrupamento por embalagem com descrição + cProd
  - Botão rápido preenche, não grava
  - Diálogo pré-marcado (confiável) ou desmarcado (assimétrico)
  - Descrição completa + cProd em cada alvo (evita confusão em rótulos curtos)
  - Mensagens de erro específicas por falha (422, 409)
  - Referências aos contratos de teste

**D10 em `specs/PERGUNTAS-ABERTAS.md`:**

- Adicionada nova seção "155 — a variação do mesmo produto mede uma vez e replica"
- Item 27 registra que `carton_gtin` guarda `cEAN` (unidade de consumo), não o GTIN da caixa (DUN-14)
- Especifica que precisa de spec própria com coluna `box_gtin` e validação de três colunas no bipe
- Data: 2026-09-17

**Gates:**

```
bun run typecheck                           exit 0
bun run --cwd apps/api-transportada test   6319 pass · 23 skip · 0 fail
bun run --cwd apps/frontend-transportada test  4182 pass · 0 fail
```

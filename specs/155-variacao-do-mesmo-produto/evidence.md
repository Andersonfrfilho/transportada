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

## T2.1 — Schema e migration de `replicated`

_(pendente)_

## T2.2 — Contadores de família na listagem

_(pendente)_

## T2.3 — `GET /nfe-package-boxes/:id/siblings`

_(pendente)_

## T2.4 — `POST /nfe-package-boxes/:id/replicate`

_(pendente)_

## T2.5 — Regressão da G007

_(pendente)_

## T3.1 — Cliente e hook

_(pendente)_

## T3.2 — Unidade visível e agrupamento

_(pendente)_

## T3.3 — Botão rápido

_(pendente)_

## T3.4 — Diálogo de replicar

_(pendente)_

## T4.1 — Locales

_(pendente)_

## T4.2 — Documentação

_(pendente)_

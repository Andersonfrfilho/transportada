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

_(pendente)_

## T1.2 — `package-box-family.policy.ts`

_(pendente)_

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

# Plano — 163

```
apps/api-transportada/
  drizzle/<ts>_package_box_unit_and_estimate/{migration,rollback}.sql       RF01
  src/database/nfe.schema.ts                                                colunas novas
  src/nfe-documents/domain/package-box-estimate.policy.ts                   RF02 (pura)
  src/nfe-documents/domain/package-box-unit-sanity.policy.ts                RF03 (pura)
  src/nfe-documents/domain/package-box-cubage-dimensions.policy.ts          RF07 (pura)
  src/nfe-documents/application/record-package-box-unit.use-case.ts         P1 + RF04
  src/nfe-documents/infrastructure/drizzle-package-box-unit.repository.ts
  src/nfe-documents/presentation/…routes.ts                                 PUT unidade + RF08
  test/package-box-estimate/*.contract.ts, test/integration/package-box-unit-estimate.integration.ts
apps/frontend-transportada/src/modules/…/package-box queue                  RF09
scripts/box-catalog-harvest/{cosmos-capture.user.js, assisted-capture-server.ts}   RF06
```

## Algoritmo da estimativa (RF02)

Para cada fatoração inteira `a×b×c = n` e cada permutação das arestas da unidade, caixa =
`(a·u1+8, b·u2+8, c·u3+8)` mm (4 mm por face). Escolhe menor área `2(xy+xz+yz)`; empate → menor
maior aresta. Peso = `round(n × peso_unidade × 1,05)`. Volume = produto / 1000.
`n` primo grande (ex.: 7, 11) cai em `1×1×n` — aceitável, rótulo de estimativa cobre.

## Pontos de consumo da cubagem (RF07)

Levantar com `grep` os leitores de `length_mm` de `nfe_package_boxes` (ocupação do baú, layout de
carga, exportações) e trocar por `resolveBoxDimensionsForCubage`. Exportação de medidas continua só
com medida real.

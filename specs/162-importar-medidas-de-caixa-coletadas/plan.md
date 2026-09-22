# Plano — 162

## Peças

```
apps/api-transportada/
  drizzle/<timestamp>_package_box_catalog_source/{migration,rollback}.sql   RF01 (+ ator, se FK)
  src/nfe-documents/domain/package-box-catalog.constant.ts                  CATALOG_IMPORT_ACTOR_ID
  src/nfe-documents/domain/package-box-catalog-capture.schema.ts            zod da linha do JSONL
  src/nfe-documents/domain/package-box-catalog-capture.mapper.ts            linha → PackageBoxCatalogCandidate
  src/nfe-documents/application/import-package-box-catalog.use-case.ts      sanidade → consenso → proposta/promoção
  src/nfe-documents/application/package-box-catalog-import.port.ts
  src/nfe-documents/infrastructure/drizzle-package-box-catalog-import.repository.ts
  src/cli/import-package-box-catalog.ts                                     stdin → use case → relatório
  test/package-box-catalog/capture-mapper.contract.ts
  test/integration/package-box-catalog-import.integration.ts
scripts/box-catalog-harvest/import-to-production.sh
```

Reusa sem alterar: `evaluatePackageBoxCatalogSanity`, `evaluatePackageBoxCatalogConsensus`.

## Formato de entrada (linha do JSONL)

`{ cartonGtin, unitGtin, status, source, pageUrl, capturedAt, extracted: { edges: { comprimento|altura|largura|lado1..3: { value, unit } }, grossWeight?: { value, unit }, unitsPerCarton? } }`.
Só `status ∈ {found, found_manual}` é importado; o resto entra no relatório como `ignored_status`.

## Transação e SQL

- Proposta: `INSERT INTO nfe_package_box_measurements (...) SELECT ... FROM nfe_package_boxes b
WHERE b.carton_gtin = $1 AND b.length_mm IS NULL AND NOT EXISTS (<mesma proposta>)`.
- Promoção: `UPDATE nfe_package_boxes SET length_mm=..., measurement_source='catalog', measured_at=now()
WHERE id = $1 AND length_mm IS NULL`.
- Simulação: mesma execução dentro de `begin ... rollback`.

## T003 — decisão sobre o ator (RF02)

`measured_by_user_id` (`nfe_package_box_measurements`) **não tem FK** para nenhuma tabela de
usuário — assimetria deliberada, documentada no comentário da tabela em `src/database/nfe.schema.ts`
(ADR-0039, revisão do architect da spec 152 T2): `removeMembership` faz DELETE físico da linha de
membership, e uma FK ali quebraria a remoção do conferente (RESTRICT) ou apagaria o ator do
registro de auditoria (SET NULL/CASCADE). O isolamento por empresa continua garantido pela FK
composta `(company_id, package_box_id)`.

Decisão: `CATALOG_IMPORT_ACTOR_ID` é só uma constante UUID fixa (mesmo padrão de
`SYSTEM_DISTRIBUTION_ACTOR_USER_ID` em `identity/domain/system-distribution-actor.constant.ts`),
gravada direto em `measured_by_user_id`. **Nenhuma migration cria registro de ator** — não há FK
para satisfazer, e criar uma linha de usuário fake só para um campo sem referência seria estado
supérfluo. A migration T004 fica só com as duas CHECKs alargadas.

## Execução em produção

`railway ssh` no serviço `api` (mesmo caminho do `export-pending-queue.sh`). A CLI precisa estar na
imagem — confere o Dockerfile da API copiando `src/`. Migration sobe pelo `preDeployCommand` normal
do deploy da API, não pelo script.

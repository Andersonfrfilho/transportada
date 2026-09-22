/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 162, RF03 — schema Zod de uma linha do JSONL produzido pela captura assistida (spec 161).
 * Formato real (medido em `box-catalog-harvest.jsonl`, 613 linhas): `{ unitGtin, cartonGtin,
 * status, source, pageUrl, capturedAt, extracted: { edges, grossWeight?, unitsPerCarton? } }`.
 *
 * ⚠️ `cartonGtin` de topo é a chave que casa com `nfe_package_boxes.carton_gtin` (RF06) — apesar do
 * nome, é o GTIN da fila de produção (`export-pending-queue.sh`), não necessariamente o GTIN-14 da
 * caixa. `extracted.cartonGtin`, quando existe, é o que o Cosmos leu na própria tabela e **não** é
 * chave de casamento — só entra aqui via `passthrough`, sem uso.
 *
 * ⚠️ `edges` chega com duas formas possíveis: `comprimento`/`altura`/`largura` (Cosmos, tabela
 * fechada) ou `lado1`/`lado2`/`lado3` (captura manual num site genérico, regex sem rótulo
 * semântico) — `package-box-catalog-capture.mapper.ts` decide qual tripla usar.
 */
import { z } from 'zod'

const edgeValueSchema = z.object({
  unit: z.string(),
  value: z.string(),
})

const extractedSchema = z
  .object({
    edges: z.record(z.string(), edgeValueSchema).default({}),
    grossWeight: edgeValueSchema.optional(),
    unitsPerCarton: z.number().int().positive().optional(),
    /**
     * Spec 163 (RF05): a medida da **unidade** — a linha "Unidade" da tabela do Cosmos ou a seleção
     * do Alt+U (`found_unit_manual`). Mesmas duas formas de `edges`. Opcional: a 162 segue igual.
     */
    unitEdges: z.record(z.string(), edgeValueSchema).optional(),
    unitGrossWeight: edgeValueSchema.optional(),
  })
  .loose()

export const packageBoxCatalogCaptureLineSchema = z
  .object({
    capturedAt: z.string().optional(),
    cartonGtin: z.string().min(1).optional(),
    extracted: extractedSchema,
    pageUrl: z.string().optional(),
    source: z.string().optional(),
    status: z.string(),
    unitGtin: z.string().min(1),
  })
  .loose()

export type PackageBoxCatalogCaptureLine = z.infer<typeof packageBoxCatalogCaptureLineSchema>
export type PackageBoxCatalogCaptureEdgeValue = z.infer<typeof edgeValueSchema>

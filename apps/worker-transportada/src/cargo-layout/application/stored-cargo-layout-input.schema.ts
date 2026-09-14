/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { LOADING_ACCESS_KINDS, type resolveCargoLayout } from '@adatechnology/cargo-placement'
import { z } from 'zod'

type ResolveCargoLayoutInput = Parameters<typeof resolveCargoLayout>[0]

/**
 * ⚠️ Cópia por valor de `StoredCargoLayoutInput` da API (`cargo-layout-hash.types.ts`), escrita a
 * partir da assinatura do pacote: a entrada de `resolveCargoLayout` com as omissões resolvidas, mais
 * `policyVersion`. É o que a coluna `trip_cargo_layouts.input` guarda (spec 145 D5, T6b).
 */
export type StoredCargoLayoutInput = Readonly<{
  bedDimensions: NonNullable<ResolveCargoLayoutInput['bedDimensions']> | null
  capacityM3: ResolveCargoLayoutInput['capacityM3']
  deliveryReachM?: NonNullable<ResolveCargoLayoutInput['deliveryReachM']> | null
  enclosedBody: boolean
  fallbackBoxVolumeM3: NonNullable<ResolveCargoLayoutInput['fallbackBoxVolumeM3']> | null
  loadingAccess: NonNullable<ResolveCargoLayoutInput['loadingAccess']>
  measuredShapes: NonNullable<ResolveCargoLayoutInput['measuredShapes']>
  payloadRatio: NonNullable<ResolveCargoLayoutInput['payloadRatio']> | null
  policyVersion: string
  securesCargo: boolean
  stops: ResolveCargoLayoutInput['stops']
}>

const cargoPlanBoxSchema = z
  .strictObject({
    count: z.number().int().nonnegative(),
    documentId: z.string().nullable().exactOptional(),
    documentNumber: z.string().nullable().exactOptional(),
    estimatedVolumeM3: z.number().nullable().exactOptional(),
    estimateSource: z.enum(['note', 'median', 'none']).nullable().exactOptional(),
    heightMm: z.number().nullable(),
    isFragile: z.boolean().nullable().exactOptional(),
    isStackable: z.boolean().nullable().exactOptional(),
    keepUpright: z.boolean().nullable().exactOptional(),
    label: z.string().exactOptional(),
    lengthMm: z.number().nullable(),
    maxStackCount: z.number().nullable().exactOptional(),
    productCode: z.string().nullable().exactOptional(),
    widthMm: z.number().nullable(),
  })
  .readonly()

const cargoLayoutStopSchema = z
  .strictObject({
    boxes: z.array(cargoPlanBoxSchema).readonly().exactOptional(),
    clientName: z.string().exactOptional(),
    documentsWithoutVolume: z.number().int().nonnegative(),
    label: z.string(),
    noteNumbers: z.array(z.string()).readonly().exactOptional(),
    sequence: z.number().int(),
    volumeM3: z.string().nullable(),
  })
  .readonly()

const cargoBedDimensionsSchema = z
  .strictObject({
    heightM: z.string(),
    lengthM: z.string(),
    source: z.enum(['measured', 'reference']),
    widthM: z.string(),
  })
  .readonly()

const measuredBoxShapeSchema = z
  .strictObject({ heightMm: z.number(), lengthMm: z.number(), widthMm: z.number() })
  .readonly()

/**
 * O jsonb lido é fronteira não confiável: quem o escreveu foi outra app, talvez noutra versão.
 * `strictObject` recusa campo que o worker não conhece em vez de calcular sobre um retrato parcial.
 */
export const storedCargoLayoutInputSchema = z
  .strictObject({
    bedDimensions: cargoBedDimensionsSchema.nullable(),
    capacityM3: z.string().nullable(),
    /** Spec 145 D24: linha gravada antes do campo não o tem — segue ausente, e o pacote usa o padrão. */
    deliveryReachM: z.number().nonnegative().nullable().exactOptional(),
    /** Spec 145 D23: linha gravada antes do campo não o tem — é baú aberto, não entrada quebrada. */
    enclosedBody: z.boolean().default(false),
    fallbackBoxVolumeM3: z.number().nullable(),
    loadingAccess: z.enum(LOADING_ACCESS_KINDS),
    measuredShapes: z.array(measuredBoxShapeSchema).readonly(),
    payloadRatio: z.string().nullable(),
    policyVersion: z.string().min(1),
    securesCargo: z.boolean(),
    stops: z.array(cargoLayoutStopSchema).readonly(),
  })
  .readonly() satisfies z.ZodType<StoredCargoLayoutInput>

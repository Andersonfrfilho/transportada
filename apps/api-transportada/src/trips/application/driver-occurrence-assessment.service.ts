/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Tudo o que o registro da ocorrência de nota do motorista confere **antes** de gravar (spec 079, 179,
 * 241, 246, 247): o tipo e a nota são alcançáveis, a exigência efetiva da nota (tipo + exceção do contratante
 * + exceção do destinatário, lidos da nota no servidor), os produtos, e cada objeto referenciado — anexos
 * e assinatura — existe, é desta empresa e desta viagem e é do motorista.
 *
 * ⚠️ **Tipo de galpão, tipo aposentado, tipo de outra empresa, tipo de parada e nota fora da viagem
 * respondem igual: inalcançável.** Distinguir diria a quem tenta qual barreira encontrou. "De rua e de
 * nota" é o momento fixo `document` do conjunto do tipo (RF0b), nunca o `stage`.
 */
import { OCCURRENCE_MOMENT } from '../../shared/trip-occurrence.constant.js'
import {
  TripDocumentNotReachableError,
  TripOccurrenceSignatureIsAttachmentError,
} from '../domain/trip.error.js'
import {
  resolveDriverOccurrenceLines,
  type DriverOccurrenceLine,
} from '../domain/driver-occurrence-items.policy.js'
import {
  assertOccurrenceItemsRequirement,
  assertOccurrenceTypeAcceptsProducts,
} from '../domain/occurrence-items-mode.policy.js'
import { occurrenceTypeAcceptsMoment } from '../domain/occurrence-moment.policy.js'
import { assertDriverOccurrenceRequirements } from '../domain/occurrence-requirement-guard.policy.js'
import { resolveDocumentProductPricing } from '../domain/occurrence-product-pricing.policy.js'
import type { OccurrenceRequirements } from '../domain/occurrence-requirements.policy.js'
import {
  resolveOccurrenceProductScope,
  type OccurrenceProductScope,
} from '../domain/occurrence-scope.policy.js'
import { toFieldTripTarget } from './field-trip-target.types.js'
import type { RegisterDriverOccurrenceInput } from './register-driver-occurrence.types.js'
import type { OccurrenceTypeRecord } from './register-trip-occurrence.use-case.js'
import { resolveDocumentOccurrenceRequirements } from './resolve-document-occurrence-requirements.service.js'
import { resolveOccurrenceUploadAttachment } from './resolve-occurrence-upload-attachment.use-case.js'

export type DriverOccurrenceAssessment = {
  /** Os anexos já conferidos, na ordem em que o motorista os mandou; vazio é "sem anexo". */
  readonly attachmentObjectIds: readonly string[]
  /** Spec 247 (T4.4): as linhas a gravar, com preço e unidade da nota; vazia é nenhuma linha. */
  readonly lines: readonly DriverOccurrenceLine[]
  readonly occurrenceType: OccurrenceTypeRecord
  readonly scope: OccurrenceProductScope
  readonly signatureObjectId: null | string
  readonly tripId: string
}

/** O que o motorista mandou: a lista nova, ou o campo único do app anterior. */
function requestedAttachmentIds(input: RegisterDriverOccurrenceInput): readonly string[] {
  if (input.attachmentObjectIds !== undefined) return input.attachmentObjectIds
  return input.attachmentObjectId === undefined || input.attachmentObjectId === null
    ? []
    : [input.attachmentObjectId]
}

function requestedSignatureIds(input: RegisterDriverOccurrenceInput): readonly string[] {
  return input.signatureObjectId === undefined || input.signatureObjectId === null
    ? []
    : [input.signatureObjectId]
}

async function findDriverOccurrenceType(
  input: RegisterDriverOccurrenceInput,
): Promise<OccurrenceTypeRecord> {
  const occurrenceType = await input.repository.findOccurrenceType({
    companyId: input.companyId,
    occurrenceTypeId: input.occurrenceTypeId,
  })
  if (
    occurrenceType === null ||
    !occurrenceType.active ||
    !occurrenceTypeAcceptsMoment({ moment: OCCURRENCE_MOMENT.document, type: occurrenceType })
  ) {
    throw new TripDocumentNotReachableError()
  }
  return occurrenceType
}

type ResolveUploadsParams = {
  readonly input: RegisterDriverOccurrenceInput
  readonly objectIds: readonly string[]
  readonly tripId: string
}

/**
 * Spec 179 T203 (RF2b) e 246 (RF9, T2.7): qualquer referência recebida é conferida — existe, é desta
 * empresa e veio desta viagem — e, vindo do motorista, **é dele**: a referência de outro motorista da
 * mesma viagem não serve. Vale mesmo em tipo que não exige. `Promise.all`: são conferências
 * independentes de um mesmo pedido, e qualquer uma recusada recusa o pedido.
 */
async function resolveUploads(params: ResolveUploadsParams): Promise<readonly string[]> {
  const { input, objectIds, tripId } = params
  const uploads = await Promise.all(
    objectIds.map((objectId) =>
      resolveOccurrenceUploadAttachment({
        companyId: input.companyId,
        ...(input.driverId === undefined ? {} : { driverId: input.driverId }),
        objectId,
        repository: input.repository,
        tripId,
      }),
    ),
  )
  return uploads.map((upload) => upload.id)
}

type AssertProductsParams = {
  readonly input: RegisterDriverOccurrenceInput
  readonly occurrenceType: OccurrenceTypeRecord
  readonly requirements: OccurrenceRequirements
  readonly tripId: string
}

type ProductAssessment = {
  readonly lines: readonly DriverOccurrenceLine[]
  readonly scope: OccurrenceProductScope
}

/**
 * Spec 241 (RF6), 246 (RF1b, RF1c2): o modo de produtos é o efetivo; a nota inteira aponta todos os
 * itens. Spec 247 (T4.4): com `items`, cada um é conferido contra a nota — uma consulta só — e vira a
 * linha a gravar; sem `items`, o contrato anterior (`productCode`) segue byte a byte.
 */
async function resolveProducts(params: AssertProductsParams): Promise<ProductAssessment> {
  const { input, requirements, tripId } = params
  const items = input.items ?? []
  assertOccurrenceTypeAcceptsProducts({
    itemsMode: requirements.itemsMode,
    productCode: input.productCode,
    productCodes: items.map((item) => item.productCode),
  })
  const products = await input.repository.listDocumentProducts({
    companyId: input.companyId,
    documentId: input.documentId,
    tripId,
  })
  if (items.length > 0) {
    const pricing = resolveDocumentProductPricing(products)
    const lines = resolveDriverOccurrenceLines({
      allowsMultipleItems: params.occurrenceType.allowsMultipleItems,
      items,
      pricing,
    })
    assertOccurrenceItemsRequirement({
      itemsMinimumCount: requirements.itemsMinimumCount,
      itemsMode: requirements.itemsMode,
      selectedCount: lines.length,
      totalCount: pricing.size,
    })
    return { lines, scope: { productCode: lines[0]?.productCode ?? '', scope: 'product' } }
  }

  const scope = resolveOccurrenceProductScope({ productCode: input.productCode, products })
  if (scope === null) throw new TripDocumentNotReachableError()

  assertOccurrenceItemsRequirement({
    itemsMinimumCount: requirements.itemsMinimumCount,
    itemsMode: requirements.itemsMode,
    selectedCount: scope.scope === 'document' ? products.length : 1,
    totalCount: products.length,
  })
  return { lines: [], scope }
}

export async function assessDriverOccurrence(
  input: RegisterDriverOccurrenceInput,
): Promise<DriverOccurrenceAssessment> {
  const occurrenceType = await findDriverOccurrenceType(input)
  const reachable = await input.repository.findReachableDocument({
    companyId: input.companyId,
    documentId: input.documentId,
    target: toFieldTripTarget(input),
  })
  if (reachable === null) throw new TripDocumentNotReachableError()
  const { tripId } = reachable

  const requirements = await resolveDocumentOccurrenceRequirements({
    companyId: input.companyId,
    document: reachable,
    occurrenceType,
    repository: input.repository,
  })
  const { lines, scope } = await resolveProducts({ input, occurrenceType, requirements, tripId })

  const requestedIds = requestedAttachmentIds(input)
  const requestedSignature = requestedSignatureIds(input)
  if (requestedSignature.some((objectId) => requestedIds.includes(objectId))) {
    throw new TripOccurrenceSignatureIsAttachmentError()
  }
  assertDriverOccurrenceRequirements({
    attachmentCount: requestedIds.length,
    declaredAmount: input.declaredAmount ?? null,
    hasSignature: requestedSignature.length > 0,
    lines,
    note: input.note,
    referenceNumber: input.referenceNumber ?? null,
    requirements,
  })

  const [attachmentObjectIds, signatureObjectIds] = await Promise.all([
    resolveUploads({ input, objectIds: requestedIds, tripId }),
    resolveUploads({ input, objectIds: requestedSignature, tripId }),
  ])

  return {
    attachmentObjectIds,
    lines,
    occurrenceType,
    scope,
    signatureObjectId: signatureObjectIds[0] ?? null,
    tripId,
  }
}

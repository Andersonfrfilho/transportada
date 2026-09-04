/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { defineRoute } from '../../http/router.service.js'
import { invalidRequest } from '../../http/request-parsing.service.js'
import { API_NFE_DOCUMENTS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { CHAVE_PATTERN } from '../../shared/tax-id.service.js'
import { parseUuidPathIdentifier } from '../../nfe-imports/presentation/nfe-imports.schema.js'
import type { TripLocationByAccessKey } from '../../trips/application/find-trip-location-by-access-key.use-case.js'
import { parseDocumentList } from './nfe-documents.schema.js'

const INVOICES_READ_POLICY = { permission: 'invoices.read', scope: 'company' } as const
/**
 * ADR-0043 §3, spec 056 RF-6/P3: o separador bipa a etiqueta e o painel responde onde a nota está.
 * Rota do módulo `nfe-documents` porque a entrada é a chave de acesso, não o id da viagem — quem
 * bipa não sabe em que viagem a nota está, é isso que ele está perguntando.
 */
const TRIP_LOCATION_BY_ACCESS_KEY_PATH = `${API_NFE_DOCUMENTS_PATH}/by-access-key/:accessKey/trip-location`
const XML_EXTENSION = '.xml'

type NfeDocumentSummary = {
  readonly accessKey: string
  readonly cteBlockReason: string | null
  readonly nfseBlockReason: string | null
  readonly emitterAddress: string | null
  readonly emitterCity: string | null
  readonly emitterCityCode: string | null
  readonly emitterName: string
  readonly emitterState: string | null
  readonly emitterTaxId: string | null
  readonly id: string
  readonly issuedAt: string
  readonly nfseInvoiceId: string | null
  readonly nfseInvoiceNumber: string | null
  readonly number: string
  readonly recipientAddress: string | null
  readonly recipientPostalCode: string | null
  readonly recipientAddressNumber: string | null
  readonly recipientLatitude: string | null
  readonly recipientLongitude: string | null
  readonly recipientLocationPrecision: string | null
  readonly recipientCity: string | null
  readonly recipientCityCode: string | null
  readonly recipientName: string
  readonly recipientState: string | null
  readonly recipientTaxId: string | null
  readonly series: string
  readonly status: 'authorized' | 'cancelled' | 'denied' | 'unsigned'
  readonly totalAmount: string
  /** Spec 065 D4b — os dois campos existem no tipo da aplicação e precisam existir aqui também. */
  readonly tripId: string | null
  readonly tripStatus: string | null
  readonly variant: 'complete' | 'summary' | 'event'
}

type NfeDocumentDetail = NfeDocumentSummary

type ListDocumentsInput = {
  readonly accessKey: string | null
  readonly cursor: string | null
  readonly limit: number
}

type DocumentIdentifierInput = {
  readonly documentId: string
}

type NfeDocumentEligibility = {
  readonly authorizedDocument: boolean
  readonly companyRelated: boolean
  readonly decision: 'PENDING_FREIGHT_AND_CTE_RULES'
  readonly hasOriginalXml: boolean
}

type Dependencies = {
  readonly downloadDocumentXml: {
    execute(input: { readonly context: CompanyContext; readonly documentId: string }): Promise<{
      readonly accessKey: string
      readonly content: Uint8Array | ReadableStream<Uint8Array>
      readonly contentType: string
      readonly fileName: string
    }>
  }
  readonly getDocument: {
    execute(input: {
      readonly context: CompanyContext
      readonly documentId: string
    }): Promise<NfeDocumentDetail>
  }
  readonly getEligibility?: {
    execute(input: {
      readonly context: CompanyContext
      readonly documentId: string
    }): Promise<NfeDocumentEligibility>
  }
  readonly listDocuments: {
    execute(input: {
      readonly accessKey: string | null
      readonly context: CompanyContext
      readonly cursor: string | null
      readonly limit: number
    }): Promise<{
      readonly items: readonly NfeDocumentSummary[]
      readonly nextCursor: string | null
    }>
  }
  readonly locateTripByAccessKey: {
    execute(input: {
      readonly accessKey: string
      readonly context: CompanyContext
    }): Promise<TripLocationByAccessKey | null>
  }
}

export function createNfeDocumentRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<ListDocumentsInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listDocuments.execute({ context: context.scope, ...input })
        return jsonResponse({
          body: {
            data: page.items.map(serializeDocument),
            page: { nextCursor: page.nextCursor },
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseDocumentList(new URL(request.url)),
      pathname: API_NFE_DOCUMENTS_PATH,
      policy: INVOICES_READ_POLICY,
    }),
    defineRoute<DocumentIdentifierInput>({
      async handle({ context, input }): Promise<Response> {
        return jsonResponse({
          body: {
            data: serializeDocument(
              await dependencies.getDocument.execute({ context: context.scope, ...input }),
            ),
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters }): DocumentIdentifierInput => ({
        documentId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: `${API_NFE_DOCUMENTS_PATH}/:id`,
      policy: INVOICES_READ_POLICY,
    }),
    defineRoute<DocumentIdentifierInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.downloadDocumentXml.execute({
          context: context.scope,
          ...input,
        })
        return new Response(result.content, {
          headers: {
            'cache-control': 'no-store',
            'content-disposition': `attachment; filename="${sanitizeFileName(result.fileName, result.accessKey)}"`,
            'content-type': result.contentType,
            'x-content-type-options': 'nosniff',
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters }): DocumentIdentifierInput => ({
        documentId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: `${API_NFE_DOCUMENTS_PATH}/:id/xml`,
      policy: INVOICES_READ_POLICY,
    }),
    defineRoute<DocumentIdentifierInput>({
      async handle({ context, input }): Promise<Response> {
        const eligibility = await (dependencies.getEligibility?.execute({
          context: context.scope,
          ...input,
        }) ?? defaultEligibility())
        return jsonResponse({ body: { data: eligibility }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }): DocumentIdentifierInput => ({
        documentId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: `${API_NFE_DOCUMENTS_PATH}/:id/eligibility`,
      policy: INVOICES_READ_POLICY,
    }),
    defineRoute<{ readonly accessKey: string }>({
      async handle({ context, input }): Promise<Response> {
        const location = await dependencies.locateTripByAccessKey.execute({
          context: context.scope,
          ...input,
        })
        // `null` é resposta válida: a nota existe e ainda não foi vinculada a nenhuma viagem —
        // é exatamente o estado antes de alguém bipar a etiqueta, não um 404.
        return jsonResponse({
          body: { data: location === null ? null : serializeTripLocation(location) },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        accessKey: parseAccessKeyPathParameter(pathParameters.accessKey ?? ''),
      }),
      pathname: TRIP_LOCATION_BY_ACCESS_KEY_PATH,
      policy: INVOICES_READ_POLICY,
    }),
  ]
}

function parseAccessKeyPathParameter(value: string): string {
  if (!CHAVE_PATTERN.test(value)) throw invalidRequest()
  return value
}

function serializeTripLocation(location: TripLocationByAccessKey): object {
  return {
    documentId: location.documentId,
    separationStatus: location.separationStatus,
    stop: location.stop === null ? null : { ...location.stop },
    tripId: location.tripId,
    tripStatus: location.tripStatus,
  }
}

function serializeDocument(document: NfeDocumentSummary): object {
  return {
    accessKey: document.accessKey,
    cteBlockReason: document.cteBlockReason,
    nfseBlockReason: document.nfseBlockReason,
    emitterAddress: document.emitterAddress,
    emitterCity: document.emitterCity,
    emitterCityCode: document.emitterCityCode,
    emitterName: document.emitterName,
    emitterState: document.emitterState,
    emitterTaxId: document.emitterTaxId,
    id: document.id,
    issuedAt: document.issuedAt,
    nfseInvoiceId: document.nfseInvoiceId,
    nfseInvoiceNumber: document.nfseInvoiceNumber,
    number: document.number,
    recipientAddress: document.recipientAddress,
    recipientPostalCode: document.recipientPostalCode,
    recipientAddressNumber: document.recipientAddressNumber,
    recipientLatitude: document.recipientLatitude,
    recipientLongitude: document.recipientLongitude,
    recipientLocationPrecision: document.recipientLocationPrecision,
    recipientCity: document.recipientCity,
    recipientCityCode: document.recipientCityCode,
    recipientName: document.recipientName,
    recipientState: document.recipientState,
    recipientTaxId: document.recipientTaxId,
    series: document.series,
    status: document.status,
    totalAmount: document.totalAmount,
    tripId: document.tripId,
    tripStatus: document.tripStatus,
    variant: document.variant,
  }
}

/** A chave de emitente com CNPJ alfanumérico tem letra: guarda só de dígito recusaria o nome real. */
function sanitizeFileName(fileName: string, accessKey: string): string {
  const normalized = fileName.trim()
  const withoutExtension = normalized.slice(0, -XML_EXTENSION.length)
  return normalized.endsWith(XML_EXTENSION) && CHAVE_PATTERN.test(withoutExtension)
    ? normalized
    : `${accessKey}${XML_EXTENSION}`
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function defaultEligibility(): NfeDocumentEligibility {
  return {
    authorizedDocument: false,
    companyRelated: false,
    decision: 'PENDING_FREIGHT_AND_CTE_RULES',
    hasOriginalXml: false,
  }
}

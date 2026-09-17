/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DocumentOutputClassification } from '../../cte-profiles/domain/document-output.policy.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { defineRoute } from '../../http/router.service.js'
import { invalidRequest } from '../../http/request-parsing.service.js'
import { API_NFE_DOCUMENTS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { CHAVE_PATTERN } from '../../shared/tax-id.service.js'
import { parseUuidPathIdentifier } from '../../nfe-imports/presentation/nfe-imports.schema.js'
import type { TripLocationByAccessKey } from '../../trips/application/find-trip-location-by-access-key.use-case.js'
import type {
  NfeDocumentEventActor,
  NfeDocumentEventEntry,
} from '../application/nfe-document-event.port.js'
import { parseDocumentEventList } from './nfe-document-events.schema.js'
import { parseDocumentList } from './nfe-documents.schema.js'
import { redactNfeDocumentMoney } from '../../shared/monetary-redaction.service.js'

/**
 * Spec 149 D19 diz "permissão `nfe.read`, a mesma do detalhe" — o catálogo de permissões
 * (`identity/domain/authorization.policy.ts`) não tem `nfe.read`; a permissão real do detalhe
 * (`GET /nfe-documents/:id`, `INVOICES_READ_POLICY` abaixo) é `invoices.read`. É ela que o
 * histórico usa, por ser literalmente "a mesma do detalhe".
 */
const INVOICES_READ_POLICY = { permission: 'invoices.read', scope: 'company' } as const
/** Spec 153 D10: `freightAmount`/`totalAmount` são dinheiro — a mesma permissão que corta o resto. */
const TRIP_FINANCIALS_POLICY = { permission: 'trip.financials', scope: 'company' } as const
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
  readonly documentOutput: DocumentOutputClassification
  readonly nfseBlockReason: string | null
  readonly emitterAddress: string | null
  readonly emitterCity: string | null
  readonly emitterCityCode: string | null
  readonly emitterName: string
  readonly emitterState: string | null
  readonly emitterTaxId: string | null
  readonly id: string
  readonly issuedAt: string
  readonly updatedAt: string
  readonly nfseInvoiceId: string | null
  readonly nfseInvoiceNumber: string | null
  readonly number: string
  readonly recipientAddress: string | null
  readonly recipientPostalCode: string | null
  readonly freightAmount: string | null
  readonly freightRuleName: string | null
  readonly cargoGrossWeight: string | null
  readonly cargoWeightSource: 'estimated' | 'xml' | null
  readonly recipientPhone: string | null
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

type DocumentEventsInput = {
  readonly cursor: string | null
  readonly documentId: string
  readonly limit: number
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
  readonly listDocumentEvents: {
    execute(input: {
      readonly context: CompanyContext
      readonly cursor: string | null
      readonly documentId: string
      readonly limit: number
    }): Promise<{
      readonly items: readonly NfeDocumentEventEntry[]
      readonly nextCursor: string | null
    }>
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
        const canReadFinancials = context.scope.permissions.has(TRIP_FINANCIALS_POLICY.permission)
        return jsonResponse({
          body: {
            data: page.items.map((document) => serializeDocument({ canReadFinancials, document })),
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
        const document = await dependencies.getDocument.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({
          body: {
            data: serializeDocument({
              canReadFinancials: context.scope.permissions.has(TRIP_FINANCIALS_POLICY.permission),
              document,
            }),
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
    defineRoute<DocumentEventsInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listDocumentEvents.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({
          body: {
            data: page.items.map(serializeDocumentEvent),
            page: { nextCursor: page.nextCursor },
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters, request }): DocumentEventsInput => ({
        documentId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        ...parseDocumentEventList(new URL(request.url)),
      }),
      pathname: `${API_NFE_DOCUMENTS_PATH}/:id/events`,
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

function serializeDocument(input: {
  readonly canReadFinancials: boolean
  readonly document: NfeDocumentSummary
}): object {
  const document = input.document
  const serialized = {
    accessKey: document.accessKey,
    cteBlockReason: document.cteBlockReason,
    documentOutput: { ...document.documentOutput },
    nfseBlockReason: document.nfseBlockReason,
    emitterAddress: document.emitterAddress,
    emitterCity: document.emitterCity,
    emitterCityCode: document.emitterCityCode,
    emitterName: document.emitterName,
    emitterState: document.emitterState,
    emitterTaxId: document.emitterTaxId,
    id: document.id,
    issuedAt: document.issuedAt,
    updatedAt: document.updatedAt,
    nfseInvoiceId: document.nfseInvoiceId,
    nfseInvoiceNumber: document.nfseInvoiceNumber,
    number: document.number,
    recipientAddress: document.recipientAddress,
    recipientPostalCode: document.recipientPostalCode,
    freightAmount: document.freightAmount,
    freightRuleName: document.freightRuleName,
    cargoGrossWeight: document.cargoGrossWeight,
    cargoWeightSource: document.cargoWeightSource,
    recipientPhone: document.recipientPhone,
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
  return redactNfeDocumentMoney({
    canReadFinancials: input.canReadFinancials,
    document: serialized,
  })
}

/** Nunca `xml_object_id`, chave de storage ou XML (D19) — só o que a linha do tempo mostra. */
function serializeDocumentEvent(entry: NfeDocumentEventEntry): object {
  return {
    actor: serializeEventActor(entry.actor),
    correctionText: entry.correctionText,
    eventType: entry.eventType,
    id: entry.id,
    kind: entry.kind,
    occurredAt: entry.occurredAt,
    origin: entry.origin,
    protocol: entry.protocol,
    registeredAt: entry.registeredAt,
    requestedBy: serializeEventActor(entry.requestedBy),
    sequence: entry.sequence,
    statusAfter: entry.statusAfter,
    statusBefore: entry.statusBefore,
    statusCode: entry.statusCode,
  }
}

function serializeEventActor(actor: NfeDocumentEventActor | null): object | null {
  if (actor === null) return null
  if ('removed' in actor) return { removed: true }
  return { id: actor.id, name: actor.name }
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

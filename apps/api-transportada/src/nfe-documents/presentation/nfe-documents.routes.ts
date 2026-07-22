/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { defineRoute } from '../../http/router.service.js'
import { API_NFE_DOCUMENTS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import {
  parseDocumentList,
  parseUuidPathIdentifier,
} from '../../nfe-imports/presentation/nfe-imports.schema.js'

const INVOICES_READ_POLICY = { permission: 'invoices.read', scope: 'company' } as const

type NfeDocumentSummary = {
  readonly accessKey: string
  readonly emitterName: string
  readonly id: string
  readonly issuedAt: string
  readonly recipientName: string
  readonly status: 'authorized' | 'cancelled' | 'denied'
  readonly totalAmount: string
  readonly variant: 'complete' | 'summary' | 'event'
}

type NfeDocumentDetail = NfeDocumentSummary

type ListDocumentsInput = {
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
      readonly context: CompanyContext
      readonly cursor: string | null
      readonly limit: number
    }): Promise<{
      readonly items: readonly NfeDocumentSummary[]
      readonly nextCursor: string | null
    }>
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
  ]
}

function serializeDocument(document: NfeDocumentSummary): object {
  return {
    accessKey: document.accessKey,
    emitterName: document.emitterName,
    id: document.id,
    issuedAt: document.issuedAt,
    recipientName: document.recipientName,
    status: document.status,
    totalAmount: document.totalAmount,
    variant: document.variant,
  }
}

function sanitizeFileName(fileName: string, accessKey: string): string {
  const normalized = fileName.trim()
  return /^[0-9]{44}\.xml$/.test(normalized) ? normalized : `${accessKey}.xml`
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

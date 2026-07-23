/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { defineRoute } from '../../http/router.service.js'
import {
  API_NFE_IMPORTS_DISTRIBUTION_PATH,
  API_NFE_IMPORTS_PATH,
  API_NFE_IMPORTS_XML_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  NfeImportDetail,
  NfeImportItem,
  NfeImportListPage,
  NfeImportSummary,
} from '../application/nfe-import.types.js'
import {
  parseDistributionRequest,
  parseIdempotencyKey,
  parseImportList,
  parseReprocessRequest,
  parseUploadImportRequest,
  parseUuidPathIdentifier,
  type UploadImportFile,
} from './nfe-imports.schema.js'

const INVOICES_IMPORT_POLICY = { permission: 'invoices.import', scope: 'company' } as const
const INVOICES_READ_POLICY = { permission: 'invoices.read', scope: 'company' } as const

type UploadImportInput = {
  readonly correlationId: string
  readonly files: readonly UploadImportFile[]
  readonly idempotencyKey: string
}

type DistributionInput = {
  readonly correlationId: string
  readonly idempotencyKey: string
}

type ListImportsInput = {
  readonly cursor: string | null
  readonly limit: number
}

type ImportIdentifierInput = {
  readonly importId: string
}

type ReprocessImportInput = {
  readonly correlationId: string
  readonly importId: string
}

type Dependencies = {
  readonly getImport: {
    execute(input: {
      readonly context: CompanyContext
      readonly importId: string
    }): Promise<NfeImportDetail>
  }
  readonly listImports: {
    execute(input: {
      readonly context: CompanyContext
      readonly cursor: string | null
      readonly limit: number
    }): Promise<NfeImportListPage>
  }
  readonly reprocessImport: {
    execute(input: {
      readonly context: CompanyContext
      readonly correlationId: string
      readonly importId: string
    }): Promise<NfeImportSummary>
  }
  readonly requestDistribution: {
    execute(input: {
      readonly context: CompanyContext
      readonly correlationId: string
      readonly idempotencyKey: string
    }): Promise<NfeImportSummary>
  }
  readonly requestUpload: {
    execute(input: {
      readonly context: CompanyContext
      readonly correlationId: string
      readonly files: readonly UploadImportFile[]
      readonly idempotencyKey: string
    }): Promise<NfeImportSummary>
  }
}

export function createNfeImportRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<UploadImportInput>({
      async handle({ context, input }): Promise<Response> {
        return acceptedSummaryResponse(
          await dependencies.requestUpload.execute({ context: context.scope, ...input }),
        )
      },
      method: 'POST',
      async parse({ correlationId, request }): Promise<UploadImportInput> {
        return {
          correlationId,
          files: (await parseUploadImportRequest(request)).files,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
        }
      },
      pathname: API_NFE_IMPORTS_XML_PATH,
      policy: INVOICES_IMPORT_POLICY,
    }),
    defineRoute<DistributionInput>({
      async handle({ context, input }): Promise<Response> {
        return acceptedSummaryResponse(
          await dependencies.requestDistribution.execute({ context: context.scope, ...input }),
        )
      },
      method: 'POST',
      parse({ correlationId, request }): DistributionInput {
        parseDistributionRequest(request)
        return {
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
        }
      },
      pathname: API_NFE_IMPORTS_DISTRIBUTION_PATH,
      policy: INVOICES_IMPORT_POLICY,
    }),
    defineRoute<ListImportsInput>({
      async handle({ context, input }): Promise<Response> {
        return listResponse(
          await dependencies.listImports.execute({ context: context.scope, ...input }),
        )
      },
      method: 'GET',
      parse: ({ request }) => parseImportList(new URL(request.url)),
      pathname: API_NFE_IMPORTS_PATH,
      policy: INVOICES_READ_POLICY,
    }),
    defineRoute<ImportIdentifierInput>({
      async handle({ context, input }): Promise<Response> {
        return detailResponse(
          await dependencies.getImport.execute({ context: context.scope, ...input }),
        )
      },
      method: 'GET',
      parse: ({ pathParameters }): ImportIdentifierInput => ({
        importId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: `${API_NFE_IMPORTS_PATH}/:id`,
      policy: INVOICES_READ_POLICY,
    }),
    defineRoute<ImportIdentifierInput>({
      async handle({ context, input }): Promise<Response> {
        const detail = await dependencies.getImport.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: detail.items.map(serializeItem) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }): ImportIdentifierInput => ({
        importId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: `${API_NFE_IMPORTS_PATH}/:id/items`,
      policy: INVOICES_READ_POLICY,
    }),
    defineRoute<ReprocessImportInput>({
      async handle({ context, input }): Promise<Response> {
        return acceptedSummaryResponse(
          await dependencies.reprocessImport.execute({ context: context.scope, ...input }),
        )
      },
      method: 'POST',
      parse({ correlationId, pathParameters, request }): ReprocessImportInput {
        parseReprocessRequest(request)
        return {
          correlationId,
          importId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: `${API_NFE_IMPORTS_PATH}/:id/reprocess`,
      policy: INVOICES_IMPORT_POLICY,
    }),
  ]
}

function acceptedSummaryResponse(summary: NfeImportSummary): Response {
  return jsonResponse({ body: { data: serializeSummary(summary) }, status: 202 })
}

function listResponse(page: NfeImportListPage): Response {
  return jsonResponse({
    body: {
      data: page.items.map(serializeSummary),
      page: { nextCursor: page.nextCursor },
    },
    status: 200,
  })
}

function detailResponse(detail: NfeImportDetail): Response {
  return jsonResponse({
    body: {
      data: {
        ...serializeSummary(detail),
        items: detail.items.map(serializeItem),
      },
    },
    status: 200,
  })
}

function serializeItem(item: NfeImportItem): object {
  return {
    accessKey: item.accessKey ?? null,
    attempt: item.attempt.toString(),
    environment: item.environment ?? null,
    error: item.error,
    id: item.id,
    ordinal: item.ordinal.toString(),
    previousAttempt: item.previousAttempt === null ? null : item.previousAttempt.toString(),
    previousItemId: item.previousItemId,
    sourceEntry: item.sourceEntry,
    sourceName: item.sourceName,
    sourceNsu: item.sourceNsu ?? null,
    status: item.status,
    variant: item.variant ?? null,
  }
}

function serializeSummary(summary: NfeImportSummary): object {
  return {
    correlationId: summary.correlationId,
    counters: {
      duplicated: summary.duplicatedCount.toString(),
      failed: summary.failedCount.toString(),
      imported: summary.importedCount.toString(),
      invalid: summary.invalidCount.toString(),
      processed: summary.processedCount.toString(),
      received: summary.receivedCount.toString(),
      rejected: summary.rejectedCount.toString(),
    },
    createdAt: summary.createdAt,
    id: summary.id,
    idempotencyKey: summary.idempotencyKey,
    source: summary.source,
    status: summary.status,
    terminalError: summary.terminalError,
    updatedAt: summary.updatedAt,
    version: summary.version.toString(),
  }
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

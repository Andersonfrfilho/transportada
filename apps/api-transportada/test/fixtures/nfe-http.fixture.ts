/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { ApiError } from '../../src/shared/api.error'
import { HTTP_ERROR } from '../../src/shared/api.constant'
import type { ScheduledDistributionStatus } from '../../src/companies/application/get-scheduled-distribution-status.use-case'
import { COMPANY_CONTEXT, READ_ONLY_CONTEXT } from './nfe-import-application.fixture'
import {
  DISTRIBUTION_RESPONSE,
  DISTRIBUTION_STATUS,
  SCHEDULED_DISTRIBUTION_STATUS,
  DOCUMENT_DETAIL,
  DOCUMENT_ELIGIBILITY,
  DOCUMENT_SUMMARY,
  DOCUMENT_XML,
  IMPORT_DETAIL,
  REPROCESS_RESPONSE,
  UPLOAD_RESPONSE,
} from './nfe-http-payload.fixture'
import { FRONTEND_ORIGIN } from './nfe-http-request.fixture'
import type {
  DownloadDocumentXmlCall,
  DownloadDocumentXmlResult,
  GetDistributionStatusCall,
  GetDocumentCall,
  GetImportCall,
  ListDocumentsCall,
  ListImportsCall,
  NfeDocumentEligibility,
  NfeDocumentDetail,
  NfeDocumentSummary,
  NfeHttpRouteDependencies,
  ReprocessImportCall,
  RequestDistributionCall,
  RequestUploadCall,
} from './nfe-http.types'
import type {
  JobRunSnapshot,
  NfeDistributionStatus,
  NfeImportDetail,
  NfeImportSummary,
} from '../../src/nfe-imports/application/nfe-import.types'

type RegisteredRoute = ReturnType<typeof defineRoute>

type CreateFixtureParams = {
  readonly authenticationError?: Error
  readonly documentDetail?: NfeDocumentDetail
  readonly documentList?: {
    readonly items: readonly NfeDocumentSummary[]
    readonly nextCursor: string | null
  }
  readonly eligibilityResult?: NfeDocumentEligibility
  readonly distributionStatus?: NfeDistributionStatus
  readonly lastJobRun?: JobRunSnapshot | null
  readonly downloadError?: Error
  readonly downloadResult?: DownloadDocumentXmlResult
  readonly getDistributionStatusError?: Error
  readonly getDocumentError?: Error
  readonly getImportError?: Error
  readonly importDetail?: NfeImportDetail
  readonly importList?: {
    readonly items: readonly NfeImportSummary[]
    readonly nextCursor: string | null
  }
  readonly listDocumentsError?: Error
  readonly listImportsError?: Error
  readonly permissions?: CompanyContext['permissions']
  readonly reprocessError?: Error
  readonly requestDistributionError?: Error
  readonly requestUploadError?: Error
  readonly scheduledDistributionStatus?: ScheduledDistributionStatus
}

export async function createNfeHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly documentDownloadCalls: DownloadDocumentXmlCall[]
  readonly documentGetCalls: GetDocumentCall[]
  readonly documentEligibilityCalls: GetDocumentCall[]
  readonly documentListCalls: ListDocumentsCall[]
  readonly events: string[]
  readonly distributionStatusCalls: GetDistributionStatusCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly importGetCalls: GetImportCall[]
  readonly importListCalls: ListImportsCall[]
  readonly logs: Array<Record<string, unknown>>
  readonly reprocessCalls: ReprocessImportCall[]
  readonly requestDistributionCalls: RequestDistributionCall[]
  readonly requestUploadCalls: RequestUploadCall[]
}> {
  const documentDownloadCalls: DownloadDocumentXmlCall[] = []
  const documentGetCalls: GetDocumentCall[] = []
  const documentEligibilityCalls: GetDocumentCall[] = []
  const documentListCalls: ListDocumentsCall[] = []
  const distributionStatusCalls: GetDistributionStatusCall[] = []
  const events: string[] = []
  const importGetCalls: GetImportCall[] = []
  const importListCalls: ListImportsCall[] = []
  const logs: Array<Record<string, unknown>> = []
  const reprocessCalls: ReprocessImportCall[] = []
  const requestDistributionCalls: RequestDistributionCall[] = []
  const requestUploadCalls: RequestUploadCall[] = []
  const routes = await loadRoutes({
    downloadDocumentXml: {
      async execute(input) {
        documentDownloadCalls.push(structuredClone(input))
        if (params.downloadError) throw params.downloadError
        return (
          params.downloadResult ?? {
            accessKey: DOCUMENT_SUMMARY.accessKey,
            content: DOCUMENT_XML,
            contentType: 'application/xml',
            fileName: `${DOCUMENT_SUMMARY.accessKey}.xml`,
          }
        )
      },
    },
    getDocument: {
      async execute(input) {
        documentGetCalls.push(structuredClone(input))
        if (params.getDocumentError) throw params.getDocumentError
        return params.documentDetail ?? DOCUMENT_DETAIL
      },
    },
    getEligibility: {
      async execute(input) {
        documentEligibilityCalls.push(structuredClone(input))
        return params.eligibilityResult ?? DOCUMENT_ELIGIBILITY
      },
    },
    getDistributionStatus: {
      async execute(input) {
        distributionStatusCalls.push(structuredClone(input))
        if (params.getDistributionStatusError) throw params.getDistributionStatusError
        return params.distributionStatus ?? DISTRIBUTION_STATUS
      },
    },
    getLastJobRun: {
      async execute() {
        return params.lastJobRun ?? null
      },
    },
    getImport: {
      async execute(input) {
        importGetCalls.push(structuredClone(input))
        if (params.getImportError) throw params.getImportError
        return params.importDetail ?? IMPORT_DETAIL
      },
    },
    getScheduledDistribution: {
      async execute() {
        return params.scheduledDistributionStatus ?? SCHEDULED_DISTRIBUTION_STATUS
      },
    },
    listDocuments: {
      async execute(input) {
        documentListCalls.push(structuredClone(input))
        if (params.listDocumentsError) throw params.listDocumentsError
        return (
          params.documentList ?? {
            items: [DOCUMENT_SUMMARY],
            nextCursor: '2026-07-22T14:01:00.000Z::00000000-0000-4000-8000-000000000230',
          }
        )
      },
    },
    // spec 056 T012: fora do escopo dos testes deste fixture (que é de nfe-imports/documentos);
    // stub `null` — "nota sem viagem" é resposta válida, não erro.
    locateTripByAccessKey: {
      async execute() {
        return null
      },
    },
    listImports: {
      async execute(input) {
        importListCalls.push(structuredClone(input))
        if (params.listImportsError) throw params.listImportsError
        return (
          params.importList ?? {
            items: [UPLOAD_RESPONSE],
            nextCursor: '2026-07-22T13:40:00.000Z::00000000-0000-4000-8000-000000000207',
          }
        )
      },
    },
    reprocessImport: {
      async execute(input) {
        reprocessCalls.push(structuredClone(input))
        if (params.reprocessError) throw params.reprocessError
        return REPROCESS_RESPONSE
      },
    },
    requestDistribution: {
      async execute(input) {
        requestDistributionCalls.push(structuredClone(input))
        if (params.requestDistributionError) throw params.requestDistributionError
        return DISTRIBUTION_RESPONSE
      },
    },
    requestUpload: {
      async execute(input) {
        requestUploadCalls.push({
          ...input,
          files: input.files.map((file) => ({
            ...file,
            bytes: Uint8Array.from(file.bytes),
          })),
        })
        if (params.requestUploadError) throw params.requestUploadError
        return UPLOAD_RESPONSE
      },
    },
  })
  const router = createTestRouter({
    authenticationError: params.authenticationError,
    context:
      params.permissions === READ_ONLY_CONTEXT.permissions
        ? authenticatedContext(READ_ONLY_CONTEXT)
        : authenticatedContext({
            ...COMPANY_CONTEXT,
            permissions: params.permissions ?? COMPANY_CONTEXT.permissions,
          }),
    events,
    routes,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'nfe-http-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: {
      error(message, metadata) {
        logs.push({ level: 'error', message, ...metadata })
      },
      info(message, metadata) {
        logs.push({ level: 'info', message, ...metadata })
      },
      warn(message, metadata) {
        logs.push({ level: 'warn', message, ...metadata })
      },
    },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    documentDownloadCalls,
    documentEligibilityCalls,
    documentGetCalls,
    documentListCalls,
    distributionStatusCalls,
    events,
    handle: (request) => handleRequest(request, { timeout() {} }),
    importGetCalls,
    importListCalls,
    logs,
    reprocessCalls,
    requestDistributionCalls,
    requestUploadCalls,
  }
}

function createTestRouter(input: {
  readonly authenticationError: Error | undefined
  readonly context: AuthenticatedContext<CompanyContext>
  readonly events: string[]
  readonly routes: readonly RegisteredRoute[]
}) {
  const authorization = new AuthorizationService()
  return createRouter({
    authentication: {
      async authenticate() {
        input.events.push('authenticate')
        if (input.authenticationError) throw input.authenticationError
        return input.context.identity
      },
    },
    authorization: {
      authorize(value, policy) {
        input.events.push('authorize')
        authorization.authorize(value, policy)
      },
    },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: {
        async close() {},
        async healthCheck() {
          return { healthy: true }
        },
      },
      identityReadiness: {
        async checkReadiness() {
          return true
        },
      },
      migrationStatus: appliedMigrations(),
    }),
    routes: input.routes,
    tenantContext: {
      async resolveCompany() {
        input.events.push('tenant')
        return input.context
      },
    },
  })
}

async function loadRoutes(
  dependencies: NfeHttpRouteDependencies,
): Promise<readonly RegisteredRoute[]> {
  const importsModule = (await import(
    '../../src/nfe-imports/presentation/nfe-imports.routes.js'
  )) as {
    readonly createNfeImportRoutes: (input: NfeHttpRouteDependencies) => readonly RegisteredRoute[]
  }
  const documentsModule = (await import(
    '../../src/nfe-documents/presentation/nfe-documents.routes.js'
  )) as {
    readonly createNfeDocumentRoutes: (
      input: NfeHttpRouteDependencies,
    ) => readonly RegisteredRoute[]
  }
  return [
    ...importsModule.createNfeImportRoutes(dependencies),
    ...documentsModule.createNfeDocumentRoutes(dependencies),
  ]
}

function authenticatedContext(scope: CompanyContext): AuthenticatedContext<CompanyContext> {
  return { identity: authenticatedIdentity(scope), scope }
}

function authenticatedIdentity(scope: CompanyContext): AuthenticatedIdentity {
  return {
    companyIdClaim: scope.companyId,
    externalIdentityId: crypto.randomUUID(),
    issuer: 'http://localhost:58080/realms/transportada-local',
    platformAdmin: false,
    subject: 'nfe-http-contract-user',
    userId: scope.userId,
  }
}

export function unauthenticatedError(): ApiError {
  return new ApiError(HTTP_ERROR.unauthenticated)
}

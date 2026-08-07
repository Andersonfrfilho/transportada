/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type {
  CompanyLogo,
  CompanyLogoMetadata,
  CompanyLogoRepositoryPort,
  SaveCompanyLogoInput,
} from '../../src/companies/application/company-logo.port'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { API_COMPANY_SETTINGS_LOGO_PATH } from '../../src/shared/api.constant'
import { COMPANY_CONTEXT, COMPANY_ID, CORRELATION_ID } from './company-settings-application.fixture'
import { FRONTEND_ORIGIN } from './company-settings-http-request.fixture'

export { FRONTEND_ORIGIN }
export const COMPANY_LOGO_PATH = API_COMPANY_SETTINGS_LOGO_PATH
export const UPDATED_AT = new Date('2026-08-01T04:30:00.000Z')

/** PNG de 1x1 pixel: menor arquivo que ainda carrega a assinatura real do formato. */
export const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** JPEG mínimo: só a assinatura importa para a política; o pdfkit nunca chega a decodificar em teste. */
export const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

export const GIF_BYTES = Buffer.from('GIF89a', 'latin1')

export function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export class CompanyLogoRepositoryFixture implements CompanyLogoRepositoryPort {
  public readonly findCalls: Array<{ readonly companyId: string }> = []
  public readonly removeCalls: Array<{ readonly companyId: string }> = []
  public readonly saveCalls: SaveCompanyLogoInput[] = []

  public stored: CompanyLogo | null = null

  public async find(input: { readonly companyId: string }): Promise<CompanyLogo | null> {
    this.findCalls.push({ ...input })
    return this.stored
  }

  public async remove(input: { readonly companyId: string }): Promise<boolean> {
    this.removeCalls.push({ ...input })
    if (this.stored === null) return false
    this.stored = null
    return true
  }

  public async save(input: SaveCompanyLogoInput): Promise<CompanyLogoMetadata> {
    this.saveCalls.push({ ...input })
    const metadata = {
      byteSize: input.byteSize,
      mimeType: input.mimeType,
      sha256: input.sha256,
      updatedAt: UPDATED_AT,
    }
    this.stored = { ...metadata, bytes: Buffer.from(input.contentBase64, 'base64') }
    return metadata
  }
}

export function logoRequest(input: {
  readonly body?: FormData | string | null
  readonly headers?: Readonly<Record<string, string>>
  readonly method: string
}): Request {
  return new Request(`http://localhost:53001${COMPANY_LOGO_PATH}`, {
    body: input.body ?? null,
    headers: { authorization: 'Bearer company-logo-contract', ...input.headers },
    method: input.method,
  })
}

export function uploadRequest(input: {
  readonly bytes: Buffer
  readonly fieldName?: string
  readonly fileName?: string
  readonly type?: string
}): Request {
  const form = new FormData()
  form.set(
    input.fieldName ?? 'file',
    new File([input.bytes], input.fileName ?? 'logo.png', { type: input.type ?? 'image/png' }),
  )
  return logoRequest({ body: form, method: 'PUT' })
}

type CreateFixtureParams = {
  readonly permissions?: CompanyContext['permissions']
  readonly stored?: CompanyLogo | null
}

export async function createCompanyLogoHttpFixture({
  permissions = COMPANY_CONTEXT.permissions,
  stored = null,
}: CreateFixtureParams = {}) {
  const events: string[] = []
  const logs: Array<Record<string, unknown>> = []
  const repository = new CompanyLogoRepositoryFixture()
  repository.stored = stored

  const { createCompanyLogoUseCase } = await import(
    '../../src/companies/application/company-logo.use-case.js'
  )
  const { createCompanyLogoRoutes } = await import(
    '../../src/companies/presentation/company-logo.routes.js'
  )
  const routes = createCompanyLogoRoutes({
    companyLogo: createCompanyLogoUseCase({ repository }),
  }) as readonly ReturnType<typeof defineRoute>[]

  const context = authenticatedContext(permissions)
  const authorization = new AuthorizationService()
  const router = createRouter({
    authentication: {
      async authenticate() {
        events.push('authenticate')
        return context.identity
      },
    },
    authorization: {
      authorize(value, policy) {
        events.push('authorize')
        authorization.authorize(value, policy)
      },
    },
    healthService: healthService(),
    routes,
    tenantContext: {
      async resolveCompany() {
        events.push('tenant')
        return context
      },
    },
  })
  const handle = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigin: FRONTEND_ORIGIN,
    logger: {
      error() {},
      info(_message, metadata) {
        logs.push(metadata ?? {})
      },
      warn() {},
    },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    events,
    handle: (request: Request) => handle(request, { timeout() {} }),
    logs,
    repository,
  }
}

function authenticatedContext(
  permissions: CompanyContext['permissions'],
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      subject: 'company-logo-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}

function healthService(): HealthService {
  return new HealthService({
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
  })
}

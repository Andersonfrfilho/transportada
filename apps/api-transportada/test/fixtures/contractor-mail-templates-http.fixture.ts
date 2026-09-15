/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T402: rotas de modelos sobre o caso de uso de verdade e um repositório em memória que
 * respeita o tenant, o único por nome e o padrão único — o banco de verdade é provado na integração.
 */
import { buildAddressCorrectionMail } from '../../src/address-correction/domain/address-correction-mail.template.js'
import { ADDRESS_CORRECTION_MAIL_SAMPLE } from '../../src/address-correction/domain/address-correction-mail-sample.constant.js'
import type {
  ContractorMailTemplate,
  ContractorMailTemplateRepositoryPort,
} from '../../src/contractor-mail/application/contractor-mail-template.port.js'
import { createContractorMailTemplatesUseCase } from '../../src/contractor-mail/application/contractor-mail-templates.use-case.js'
import { ContractorMailTemplateNameTakenError } from '../../src/contractor-mail/domain/contractor-mail-template.error.js'
import { createContractorMailTemplateRoutes } from '../../src/contractor-mail/presentation/contractor-mail-templates.routes.js'
import { createRequestHandler } from '../../src/http/request-handler.service'
import type { CompanyContext } from '../../src/identity/domain/tenant-context'
import {
  COMPANY_CONTEXT,
  FRONTEND_ORIGIN,
  authenticatedContext,
  createTestRouter,
} from './contractor-mail-http.fixture'

export const OTHER_COMPANY_ID = '00000000-0000-4000-8000-0000000000f9'

const CREATED_AT = new Date('2026-09-15T12:00:00.000Z')

type InMemoryTemplateRepository = ContractorMailTemplateRepositoryPort & {
  readonly rows: ContractorMailTemplate[]
}

export function createInMemoryTemplateRepository(
  seed: readonly ContractorMailTemplate[] = [],
): InMemoryTemplateRepository {
  const rows = [...seed]

  function isNameTaken(
    template: Pick<ContractorMailTemplate, 'companyId' | 'id' | 'mailType'>,
    name: string,
  ) {
    return rows.some(
      (row) =>
        row.companyId === template.companyId &&
        row.mailType === template.mailType &&
        row.status === 'active' &&
        row.id !== template.id &&
        row.name.toLowerCase() === name.toLowerCase(),
    )
  }

  function findWritable(params: {
    readonly companyId: string
    readonly expectedVersion: bigint
    readonly templateId: string
  }): ContractorMailTemplate | undefined {
    return rows.find(
      (row) =>
        row.companyId === params.companyId &&
        row.id === params.templateId &&
        row.version === params.expectedVersion &&
        row.status === 'active',
    )
  }

  function replace(next: ContractorMailTemplate): ContractorMailTemplate {
    rows[rows.findIndex((row) => row.id === next.id)] = next
    return next
  }

  return {
    async create(params) {
      const id = crypto.randomUUID()
      if (isNameTaken({ ...params, id }, params.name))
        throw new ContractorMailTemplateNameTakenError()
      const hasDefault = rows.some(
        (row) =>
          row.companyId === params.companyId &&
          row.mailType === params.mailType &&
          row.isDefault &&
          row.status === 'active',
      )
      const row: ContractorMailTemplate = {
        ...params,
        createdAt: CREATED_AT,
        id,
        isDefault: !hasDefault,
        status: 'active',
        updatedAt: CREATED_AT,
        version: 1n,
      }
      rows.push(row)
      return row
    },
    async find({ companyId, templateId }) {
      return rows.find((row) => row.companyId === companyId && row.id === templateId)
    },
    async list({ companyId, mailType }) {
      return rows.filter(
        (row) =>
          row.companyId === companyId && (mailType === undefined || row.mailType === mailType),
      )
    },
    rows,
    async setDefault(params) {
      const current = findWritable(params)
      if (current === undefined) return undefined
      if (current.isDefault) return current
      for (const row of rows) {
        if (
          row.companyId === current.companyId &&
          row.mailType === current.mailType &&
          row.isDefault
        ) {
          replace({ ...row, isDefault: false, version: row.version + 1n })
        }
      }
      return replace({
        ...current,
        actorUserId: params.actorUserId,
        isDefault: true,
        version: current.version + 1n,
      })
    },
    async update(params) {
      const current = findWritable(params)
      if (current === undefined) return undefined
      const { changes } = params
      if (changes.name !== undefined && isNameTaken(current, changes.name)) {
        throw new ContractorMailTemplateNameTakenError()
      }
      return replace({
        ...current,
        ...changes,
        ...(changes.status === 'archived' ? { isDefault: false } : {}),
        actorUserId: params.actorUserId,
        version: current.version + 1n,
      })
    },
  }
}

export async function createContractorMailTemplatesHttpFixture(
  params: {
    readonly permissions?: CompanyContext['permissions']
    readonly seed?: readonly ContractorMailTemplate[]
  } = {},
): Promise<{
  readonly handle: (request: Request) => Promise<Response>
  readonly logCalls: { readonly message: string; readonly metadata: unknown }[]
  readonly repository: InMemoryTemplateRepository
}> {
  const repository = createInMemoryTemplateRepository(params.seed)
  const templates = createContractorMailTemplatesUseCase({
    previewRenderers: {
      address_correction: (template) =>
        buildAddressCorrectionMail({ ...ADDRESS_CORRECTION_MAIL_SAMPLE, template }),
    },
    repository,
  })
  const router = createTestRouter({
    context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
    routes: createContractorMailTemplateRoutes({ templates }),
  })
  const logCalls: { readonly message: string; readonly metadata: unknown }[] = []
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'contractor-mail-templates-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: {
      error: (message, metadata) => logCalls.push({ message, metadata }),
      info: (message, metadata) => logCalls.push({ message, metadata }),
      warn: (message, metadata) => logCalls.push({ message, metadata }),
    },
    requestTimeoutSeconds: 10,
    router,
  })

  return { handle: (request) => handleRequest(request, { timeout() {} }), logCalls, repository }
}

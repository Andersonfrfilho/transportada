/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { CompanyGroupRepositoryPort } from '../../landing/application/company-group.port.js'
import { CPF_PATTERN } from '../../shared/tax-id.service.js'
import {
  AggregateApplicationAlreadyReviewedError,
  AggregateApplicationNotFoundError,
  AggregateApplicationOutsideGroupError,
  AggregateApplicationRejectionReasonRequiredError,
  AggregateApplicationRequiresManualDriverCreationError,
} from '../domain/aggregate-application.error.js'
import { resolveDuplicateCheckOutcome } from '../domain/aggregate-application-duplicate.policy.js'
import type {
  AggregateApplication,
  AggregateApplicationRepositoryPort,
} from './aggregate-applications.port.js'

export type SubmitAggregateApplicationInput = Readonly<{
  /** Rascunhos enviados antes do formulário. Ausente é o caso normal: anexar é opcional. */
  attachmentDraftIds?: readonly string[]
  companyId: string
  declaredData: Record<string, unknown>
  email: string
  name: string
  phone: string
  taxId: string
}>

type Dependencies = {
  readonly companyGroupRepository: CompanyGroupRepositoryPort
  readonly landingCompanyId: string | undefined
  readonly repository: AggregateApplicationRepositoryPort
}

export type AggregateApplicationsUseCase = Readonly<{
  approve: (input: {
    readonly context: CompanyContext
    readonly id: string
  }) => Promise<AggregateApplication>
  list: (input: { readonly context: CompanyContext }) => Promise<readonly AggregateApplication[]>
  reject: (input: {
    readonly context: CompanyContext
    readonly id: string
    readonly rejectionReason: string
  }) => Promise<AggregateApplication>
  /** `202` invariável: reenvio, duplicado ou candidatura nova respondem sempre igual. */
  submit: (input: SubmitAggregateApplicationInput) => Promise<void>
}>

export function createAggregateApplicationsUseCase(
  dependencies: Dependencies,
): AggregateApplicationsUseCase {
  async function findOwned(input: {
    readonly companyId: string
    readonly id: string
  }): Promise<AggregateApplication> {
    const application = await dependencies.repository.findById({ id: input.id })
    if (application === null || application.companyId !== input.companyId) {
      throw new AggregateApplicationNotFoundError()
    }
    return application
  }

  /**
   * Anexo é opcional: sem rascunho declarado não há o que amarrar, e chamar o repositório com lista
   * vazia seria um UPDATE que nunca casa linha nenhuma.
   */
  async function linkAttachments(params: {
    readonly applicationId: string
    readonly input: SubmitAggregateApplicationInput
  }): Promise<void> {
    const draftIds = params.input.attachmentDraftIds ?? []
    if (draftIds.length === 0) return

    await dependencies.repository.linkAttachmentDrafts({
      applicationId: params.applicationId,
      companyId: params.input.companyId,
      draftIds,
    })
  }

  return {
    async submit(input) {
      if (dependencies.landingCompanyId === undefined) {
        throw new AggregateApplicationOutsideGroupError()
      }

      const units = await dependencies.companyGroupRepository.listGroupUnits({
        companyId: dependencies.landingCompanyId,
      })
      const companyIds = units.map((unit) => unit.companyId)
      if (!companyIds.includes(input.companyId)) {
        throw new AggregateApplicationOutsideGroupError()
      }

      const [pending, duplicateDriverId] = await Promise.all([
        dependencies.repository.findPendingByCompanyAndTaxId({
          companyId: input.companyId,
          taxId: input.taxId,
        }),
        dependencies.repository.findDriverIdByTaxIdInCompanies({ companyIds, taxId: input.taxId }),
      ])

      const submission = {
        declaredData: input.declaredData,
        email: input.email,
        name: input.name,
        phone: input.phone,
      }
      const outcome = resolveDuplicateCheckOutcome({
        duplicateDriverId,
        existingPendingApplicationId: pending === null ? null : pending.id,
        submission,
      })

      if (outcome.kind === 'resubmit') {
        await dependencies.repository.updateResubmission({
          declaredData: outcome.submission.declaredData,
          duplicateDriverId: outcome.duplicateDriverId,
          email: outcome.submission.email,
          id: outcome.applicationId,
          name: outcome.submission.name,
          phone: outcome.submission.phone,
        })
        await linkAttachments({ applicationId: outcome.applicationId, input })
        return
      }

      const application = await dependencies.repository.insert({
        companyId: input.companyId,
        declaredData: input.declaredData,
        duplicateDriverId: outcome.duplicateDriverId,
        email: input.email,
        name: input.name,
        phone: input.phone,
        taxId: input.taxId,
      })
      await linkAttachments({ applicationId: application.id, input })
    },

    async list({ context }) {
      return dependencies.repository.listByCompany({ companyId: context.companyId })
    },

    async approve({ context, id }) {
      const application = await findOwned({ companyId: context.companyId, id })
      if (application.status !== 'pending') {
        throw new AggregateApplicationAlreadyReviewedError()
      }

      if (application.duplicateDriverId !== null) {
        return dependencies.repository.approve({ driverId: application.duplicateDriverId, id })
      }
      if (!CPF_PATTERN.test(application.taxId)) {
        throw new AggregateApplicationRequiresManualDriverCreationError()
      }
      return dependencies.repository.createDriverAndApprove({
        companyId: application.companyId,
        declaredData: application.declaredData,
        email: application.email,
        id,
        name: application.name,
        phone: application.phone,
        taxId: application.taxId,
      })
    },

    async reject({ context, id, rejectionReason }) {
      const application = await findOwned({ companyId: context.companyId, id })
      if (application.status !== 'pending') {
        throw new AggregateApplicationAlreadyReviewedError()
      }
      if (rejectionReason.trim().length === 0) {
        throw new AggregateApplicationRejectionReasonRequiredError()
      }

      return dependencies.repository.reject({ id, rejectionReason })
    },
  }
}

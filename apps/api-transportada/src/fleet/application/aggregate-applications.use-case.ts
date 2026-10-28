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
import type { FleetDriverAccountPort } from './fleet.port.js'

/** Três tentativas: o Keycloak e a fila de convite falham por instante, e o operador não vê o motivo. */
const ACCESS_ATTEMPTS = 3
const ACCESS_BACKOFF_MS = 500

/**
 * `granted`: o convite foi criado agora. `already-linked`: a ficha já tem usuário. `no-contact`: sem
 * e-mail nem telefone não há por onde mandar o código. `failed`: as tentativas acabaram — o
 * operador repete pela rota `retry-access`.
 */
export type AggregateApplicationAccessStatus =
  | 'already-linked'
  | 'failed'
  | 'granted'
  | 'no-contact'
  | 'not-available'

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
  /** Ausente (rota pública de candidatura, que nunca aprova): a aprovação não convida. */
  readonly account?: FleetDriverAccountPort & { readonly sleep?: (ms: number) => Promise<void> }
  readonly logger?: Readonly<{ warn: (message: string, meta?: Record<string, unknown>) => void }>
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
  /** Refaz o convite de uma candidatura aprovada cuja ficha ainda não tem usuário. */
  retryAccess: (input: {
    readonly context: CompanyContext
    readonly id: string
  }) => Promise<AggregateApplicationAccessStatus>
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

  const sleep =
    dependencies.account?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  /**
   * ⚠️ **Aprovar a ficha não dava login.** O app do motorista autentica só pelo Keycloak, e o
   * usuário de lá só nasce pelo convite: a candidatura aprovada virava motorista ativo, com
   * entregas, e sem como entrar. O convite liga a ficha pelo CPF (`linkFleetDriver`).
   * A falha não desfaz a aprovação — a ficha já existe e as entregas dependem dela —, por isso
   * devolve o estado e deixa a rota `retry-access` repetir.
   */
  async function ensureDriverAccess(input: {
    readonly companyId: string
    readonly correlationId: string
    readonly driverId: string
  }): Promise<AggregateApplicationAccessStatus> {
    const account = dependencies.account
    if (account === undefined) return 'not-available'

    const target = await dependencies.repository.findDriverAccessTarget({
      companyId: input.companyId,
      driverId: input.driverId,
    })
    if (target === null) return 'failed'
    if (target.membershipId !== null) return 'already-linked'

    const channel = target.email === '' ? (target.phone === '' ? undefined : 'whatsapp') : 'email'
    if (channel === undefined) return 'no-contact'

    for (let attempt = 1; attempt <= ACCESS_ATTEMPTS; attempt += 1) {
      try {
        await account.execute({
          channel,
          contact: channel === 'email' ? target.email : target.phone,
          context: { companyId: input.companyId },
          correlationId: input.correlationId,
          email: target.email,
          name: target.name,
          phone: target.phone,
          roles: ['aggregate'],
          taxId: target.taxId,
        })
        return 'granted'
      } catch (error) {
        dependencies.logger?.warn('aggregate_application_access_failed', {
          attempt,
          driverId: input.driverId,
          reason: error instanceof Error ? error.message : 'unknown',
        })
        if (attempt < ACCESS_ATTEMPTS) await sleep(ACCESS_BACKOFF_MS * attempt)
      }
    }
    return 'failed'
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
        const approved = await dependencies.repository.approve({
          driverId: application.duplicateDriverId,
          id,
        })
        await ensureDriverAccess({
          companyId: application.companyId,
          correlationId: crypto.randomUUID(),
          driverId: application.duplicateDriverId,
        })
        return approved
      }
      if (!CPF_PATTERN.test(application.taxId)) {
        throw new AggregateApplicationRequiresManualDriverCreationError()
      }
      const approved = await dependencies.repository.createDriverAndApprove({
        companyId: application.companyId,
        declaredData: application.declaredData,
        email: application.email,
        id,
        name: application.name,
        phone: application.phone,
        taxId: application.taxId,
      })
      if (approved.driverId !== null) {
        await ensureDriverAccess({
          companyId: application.companyId,
          correlationId: crypto.randomUUID(),
          driverId: approved.driverId,
        })
      }
      return approved
    },

    async retryAccess({ context, id }) {
      const application = await findOwned({ companyId: context.companyId, id })
      if (application.status !== 'approved' || application.driverId === null) return 'failed'
      return ensureDriverAccess({
        companyId: application.companyId,
        correlationId: crypto.randomUUID(),
        driverId: application.driverId,
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

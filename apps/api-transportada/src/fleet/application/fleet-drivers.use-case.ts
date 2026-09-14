/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DriverHomeGeocoderPort } from './driver-home-geocoder.port.js'
import type { FleetDriverStatus } from '../../database/fleet.schema.js'
import type { ContactChannel } from '../../database/identity-user-profile.schema.js'
import {
  FleetDriverContactRequiredError,
  FleetDriverEmailTakenError,
  FleetDriverLicenseNumberTakenError,
  FleetDriverMembershipNotFoundError,
  FleetDriverNotFoundError,
  FleetDriverTaxIdTakenError,
  FleetDriverVersionConflictError,
} from '../domain/fleet.error.js'
import type { FleetDriverProfile } from '../domain/fleet-driver-profile.constant.js'
import type {
  FleetCompanyContext,
  FleetDriver,
  FleetDriverAccountPort,
  FleetDriverContactDirectoryPort,
  FleetDriverFilters,
  FleetDriverInput,
  FleetDriverPage,
  FleetDriverRepositoryPort,
} from './fleet.port.js'

export type CreateFleetDriverInput = {
  readonly context: FleetCompanyContext
  readonly correlationId: string
  readonly driver: Omit<FleetDriverInput, 'membershipId'>
  readonly profile: FleetDriverProfile
}

export type CheckFleetDriverAvailabilityInput = {
  readonly context: FleetCompanyContext
  /** A ficha aberta não colide consigo mesma; na criação ainda não há id. */
  readonly driverId: string | null
  readonly email: string
  readonly licenseNumber: string
  readonly taxId: string
}

export type FleetDriverAvailability = {
  readonly emailTaken: boolean
  readonly licenseNumberTaken: boolean
  readonly taxIdTaken: boolean
}

export type ListFleetDriversInput = {
  readonly context: FleetCompanyContext
  readonly cursor: string | null
  readonly filters?: FleetDriverFilters
  readonly limit: number
}

export type UpdateFleetDriverInput = {
  readonly context: FleetCompanyContext
  readonly correlationId: string
  readonly driver: FleetDriverInput
  readonly driverId: string
  readonly expectedVersion: string
  readonly status: FleetDriverStatus
}

export type FleetDriversUseCase = {
  checkAvailability(input: CheckFleetDriverAvailabilityInput): Promise<FleetDriverAvailability>
  create(input: CreateFleetDriverInput): Promise<FleetDriver>
  list(input: ListFleetDriversInput): Promise<FleetDriverPage>
  update(input: UpdateFleetDriverInput): Promise<FleetDriver>
}

/** O e-mail vence quando existe: caixa de entrada guarda o código, conversa de WhatsApp rola. */
function resolveInvitationContact(driver: { readonly email: string; readonly phone: string }): {
  readonly channel: ContactChannel
  readonly contact: string
} {
  if (driver.email !== '') return { channel: 'email', contact: driver.email }
  if (driver.phone !== '') return { channel: 'whatsapp', contact: driver.phone }
  throw new FleetDriverContactRequiredError()
}

export function createFleetDriversUseCase(dependencies: {
  readonly account: FleetDriverAccountPort
  readonly contacts: FleetDriverContactDirectoryPort
  /**
   * Preenche a coordenada da casa depois de gravar a ficha. Ausente é "esta instalação não
   * configurou provedor" — e aí o cadastro segue igual, sem coordenada.
   */
  readonly homeGeocoder?: DriverHomeGeocoderPort
  /** Só para registrar a falha da busca da casa — o resto do caso de uso não loga (o Router loga). */
  readonly logger?: Readonly<{ warn: (message: string, meta?: Record<string, unknown>) => void }>
  readonly repository: FleetDriverRepositoryPort
}): FleetDriversUseCase {
  const { account, contacts, repository } = dependencies

  /**
   * ⚠️ **A busca não pode derrubar o cadastro.** Ela roda depois de a ficha estar gravada, e um
   * timeout do provedor devolveria erro ao operador por uma ação que deu certo — o mesmo `catch` de
   * fallback gracioso do congelamento de pedágio (`code-standart.md` §7).
   *
   * O preço é a ficha ficar sem coordenada até o próximo salvamento, e ausência de coordenada já é
   * caso tratado: o retorno cai no endereço da empresa.
   */
  async function fillHomeCoordinate(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<void> {
    if (dependencies.homeGeocoder === undefined) return
    try {
      await dependencies.homeGeocoder.fill(input)
    } catch (error) {
      /**
       * ⚠️ **Engolir sem registrar foi um erro de projeto, e ele custou uma sessão de diagnóstico.**
       * O `catch` protege o cadastro — isso está certo —, mas sem log a falha não existe para
       * ninguém: a ficha fica sem coordenada, o operador não vê nada, e quem for investigar não tem
       * por onde começar. `warn` é o nível de "inesperado mas recuperável" do `nodejs.md`.
       */
      dependencies.logger?.warn('driver_home_geocoding_failed', {
        driverId: input.driverId,
        reason: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  /** Campo em branco é ausência, não colisão: nem todo motorista tem CNH ou e-mail cadastrado. */
  async function resolveAvailability(
    input: CheckFleetDriverAvailabilityInput,
  ): Promise<FleetDriverAvailability> {
    const wantsDocument = input.taxId !== '' || input.licenseNumber !== ''
    const [documents, emailTaken] = await Promise.all([
      wantsDocument
        ? repository.findDocumentConflicts({
            companyId: input.context.companyId,
            driverId: input.driverId,
            licenseNumber: input.licenseNumber,
            taxId: input.taxId,
          })
        : { licenseNumber: false, taxId: false },
      input.email === '' ? false : contacts.isEmailTaken({ email: input.email }),
    ])
    return {
      emailTaken,
      licenseNumberTaken: documents.licenseNumber,
      taxIdTaken: documents.taxId,
    }
  }

  async function assertMembership(input: {
    readonly companyId: string
    readonly membershipId: string | null
  }): Promise<void> {
    if (input.membershipId === null) return
    const belongs = await repository.hasMembership({
      companyId: input.companyId,
      membershipId: input.membershipId,
    })
    if (!belongs) throw new FleetDriverMembershipNotFoundError()
  }

  return {
    async checkAvailability(input) {
      return resolveAvailability(input)
    },

    async create(input) {
      const companyId = input.context.companyId
      // A colisão é conferida antes do convite: o usuário aberto aqui a constraint jogaria fora
      const availability = await resolveAvailability({
        context: input.context,
        driverId: null,
        email: input.driver.email,
        licenseNumber: input.driver.licenseNumber,
        taxId: input.driver.taxId,
      })
      if (availability.taxIdTaken) throw new FleetDriverTaxIdTakenError()
      if (availability.licenseNumberTaken) throw new FleetDriverLicenseNumberTakenError()
      if (availability.emailTaken) throw new FleetDriverEmailTakenError()
      // Convite antes da ficha: falha aqui não deixa motorista escrito, e repetir não duplica linha
      const { membershipId } = await account.execute({
        ...resolveInvitationContact(input.driver),
        context: { companyId },
        correlationId: input.correlationId,
        name: input.driver.name,
        roles: [input.profile],
      })
      const created = await repository.create({
        companyId,
        driver: { ...input.driver, membershipId },
      })
      await fillHomeCoordinate({ companyId, driverId: created.id })
      return created
    },

    async list(input) {
      return repository.list({
        companyId: input.context.companyId,
        cursor: input.cursor,
        limit: input.limit,
        ...(input.filters === undefined ? {} : { filters: input.filters }),
      })
    },

    async update(input) {
      const companyId = input.context.companyId
      await assertMembership({ companyId, membershipId: input.driver.membershipId })
      const updated = await repository.update({
        companyId,
        driver: input.driver,
        driverId: input.driverId,
        expectedVersion: input.expectedVersion,
        status: input.status,
      })
      if (updated !== null) {
        await fillHomeCoordinate({ companyId, driverId: input.driverId })
        return updated
      }

      const current = await repository.findById({ companyId, driverId: input.driverId })
      if (current === null) throw new FleetDriverNotFoundError()
      throw new FleetDriverVersionConflictError()
    },
  }
}

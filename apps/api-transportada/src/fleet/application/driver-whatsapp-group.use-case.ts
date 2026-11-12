/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T1: ler, trocar e remover o grupo de WhatsApp da ficha do motorista, e listar os grupos do
 * Evolution marcando quais já têm dono.
 */
import type { EvolutionGroup } from '../../whatsapp/application/whatsapp-evolution.port.js'
import type {
  DriverWhatsappGroup,
  DriverWhatsappGroupActor,
  DriverWhatsappGroupRepositoryPort,
} from './driver-whatsapp-group.port.js'

export type WhatsappGroupOption = {
  readonly assignedDriverId: string | null
  readonly assignedDriverName: string | null
  readonly groupJid: string
  readonly name: string
}

export type DriverWhatsappGroupUseCase = {
  get(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<DriverWhatsappGroup | null>
  listGroups(input: { readonly companyId: string }): Promise<readonly WhatsappGroupOption[]>
  remove(input: DriverWhatsappGroupActor): Promise<boolean>
  set(
    input: DriverWhatsappGroupActor & { readonly groupJid: string; readonly groupName: string },
  ): Promise<DriverWhatsappGroup>
}

export function createDriverWhatsappGroupUseCase(dependencies: {
  /** Os grupos do número conectado (a porta do Evolution da empresa). */
  readonly listEvolutionGroups: (input: {
    readonly companyId: string
  }) => Promise<readonly EvolutionGroup[]>
  readonly repository: DriverWhatsappGroupRepositoryPort
}): DriverWhatsappGroupUseCase {
  const { repository } = dependencies
  return {
    get: (input) => repository.find(input),
    async listGroups({ companyId }) {
      const [groups, assignments] = await Promise.all([
        dependencies.listEvolutionGroups({ companyId }),
        repository.listAssignments({ companyId }),
      ])
      const owners = new Map(assignments.map((item) => [item.groupJid, item]))
      return groups.map((group) => {
        const owner = owners.get(group.groupJid)
        return {
          assignedDriverId: owner?.driverId ?? null,
          assignedDriverName: owner?.driverName ?? null,
          groupJid: group.groupJid,
          name: group.name,
        }
      })
    },
    remove: (input) => repository.remove(input),
    set: (input) => repository.set(input),
  }
}

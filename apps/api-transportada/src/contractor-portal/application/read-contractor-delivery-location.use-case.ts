/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { TripLocationPing } from '../../trips/application/trip-location.port.js'
import { ContractorDeliveryNotFoundError } from '../domain/contractor-portal.error.js'
import type { ContractorPortalRepositoryPort } from './contractor-portal.types.js'

export type ReadContractorDeliveryLocationInput = {
  readonly accessKey: string
  readonly context: CompanyContext
}

/**
 * ADR-0050 §5, terceira guarda: **o cliente vê a carga, não quem dirige.** O que sai daqui é
 * coordenada e hora, e mais nada — nem nome, nem placa, nem id de motorista. Sem isso o portal seria
 * um rastreador de pessoa disfarçado de rastreador de carga.
 *
 * Sem rastro, `null`: viagem que ainda não saiu, motorista que não consentiu e viagem já fechada
 * (o rastro é apagado no fechamento) respondem igual — nenhuma delas conta ao cliente por que o
 * mapa está vazio.
 */
export function createReadContractorDeliveryLocationUseCase(dependencies: {
  readonly locations: {
    readLastPing(input: {
      readonly companyId: string
      readonly tripId: string
    }): Promise<TripLocationPing | null>
  }
  readonly repository: ContractorPortalRepositoryPort
}): (input: ReadContractorDeliveryLocationInput) => Promise<TripLocationPing | null> {
  return async ({ accessKey, context }) => {
    const scope = await dependencies.repository.resolveScope({ context })
    const target = await dependencies.repository.findScheduleTarget({ accessKey, context, scope })
    /** Chave que não é dele responde como chave que não existe, igual ao agendamento. */
    if (target === null) throw new ContractorDeliveryNotFoundError()

    return dependencies.locations.readLastPing({
      companyId: context.companyId,
      tripId: target.tripId,
    })
  }
}

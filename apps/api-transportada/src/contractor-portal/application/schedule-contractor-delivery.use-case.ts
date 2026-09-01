/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  TripStopSchedule,
  TripStopScheduleWrite,
} from '../../delivery-clients/application/trip-stop-schedule.use-case.js'
import { ContractorDeliveryNotFoundError } from '../domain/contractor-portal.error.js'
import type { ContractorPortalRepositoryPort } from './contractor-portal.types.js'

export type ScheduleContractorDeliveryInput = {
  readonly accessKey: string
  readonly context: CompanyContext
  readonly values: TripStopScheduleWrite
}

export type ScheduleContractorDeliveryUseCase = (
  input: ScheduleContractorDeliveryInput,
) => Promise<TripStopSchedule>

/**
 * ADR-0050 §6: **nenhuma regra mora no portal.** O agendamento do contratante escreve pela mesma
 * máquina da 060 — mesma validação de "confirmado sem hora", mesmo bloqueio de despacho, mesmo
 * `diverged_at` quando a viagem é replanejada. Se a regra fosse reescrita aqui, no dia em que o
 * WhatsApp também agendar existiriam três versões dela, e divergência de agendamento manda caminhão
 * para o lugar errado.
 *
 * O que muda em relação ao operador é só **quem chama** e **por qual chave**: o portal nomeia a nota
 * pela chave de acesso, e o servidor descobre a parada.
 */
export function createScheduleContractorDeliveryUseCase(dependencies: {
  readonly repository: ContractorPortalRepositoryPort
  readonly schedules: {
    save(input: {
      readonly context: CompanyContext
      readonly stopId: string
      readonly tripId: string
      readonly values: TripStopScheduleWrite
    }): Promise<TripStopSchedule>
  }
}): ScheduleContractorDeliveryUseCase {
  return async ({ accessKey, context, values }) => {
    const scope = await dependencies.repository.resolveScope({ context })
    const target = await dependencies.repository.findScheduleTarget({ accessKey, context, scope })
    /**
     * Sem parada não há o que agendar: a nota entrou na viagem, mas o endereço dela ainda não virou
     * parada. É ausência, não erro de quem pediu — e responde como as outras ausências do portal.
     */
    if (target === null || target.stopId === null) throw new ContractorDeliveryNotFoundError()

    return dependencies.schedules.save({
      context,
      stopId: target.stopId,
      tripId: target.tripId,
      values,
    })
  }
}

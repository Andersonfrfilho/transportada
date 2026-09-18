/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { DiagnosableError } from '../../shared/diagnosable.error.js'

/**
 * Spec 157 T11: o evento de entrega que `findDeliveryEventId` acabou de resolver sumiu antes de
 * `findDeliveryContext` lê-lo (a nota foi desvinculada, ou a viagem apagada, entre as duas
 * leituras). Não é erro do motorista — é corrida, e o `new Error` cru perdia o motivo no log.
 */
export class DeliveryProofEventVanishedError extends DiagnosableError {
  public override readonly name = 'DeliveryProofEventVanishedError'

  public constructor() {
    super('Delivery event resolved for the proof was not found when reading its context')
  }
}

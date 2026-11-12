/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (E7, RF13): o selo "possível cobrança na entrega" no cartão da parada do motorista. O escritório vê o selo
 * sempre; o motorista só quando o tipo `unexpected_charge` liga `show_client_charge_seal_to_driver`. Somente leitura:
 * quem limpa a marca é o escritório.
 */
import type { ApiLogger } from '../../shared/api.types.js'

export type DriverStopChargeSealPort = {
  /**
   * As paradas (entre as pedidas) com o cliente marcado, com a data da marca. Vazio quando nenhum tipo de cobrança no
   * recebimento da empresa liga o selo ao motorista — o interruptor é lido aqui, nunca no app.
   */
  listSealedStops(input: {
    readonly companyId: string
    readonly stopIds: readonly string[]
  }): Promise<ReadonlyMap<string, string>>
}

export type DriverChargeSealDependency = {
  readonly logger?: ApiLogger
  readonly reader: DriverStopChargeSealPort
}

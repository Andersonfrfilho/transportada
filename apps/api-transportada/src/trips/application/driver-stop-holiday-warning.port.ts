/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.3 (ADR-0100 D12): o que o caso de uso da leitura do motorista pede para avisar o feriado da
 * cidade de cada parada — o contexto das paradas (ETA, chave do endereço e endereço da nota, numa consulta
 * só) e o calendário do aviso. Nada daqui pertence à nota do motorista: o aviso só informa.
 */
import type { HolidayWarningPort } from '../../business-calendar/application/holiday-warning.port.js'
import type { ApiLogger } from '../../shared/api.types.js'

/** O endereço de destino físico da nota da parada: de onde sai o nome da cidade, quando ela confere. */
export type DriverStopHolidayAddress = {
  readonly city: string
  readonly cityCode: string | null
}

export type DriverStopHolidayContext = {
  readonly address?: DriverStopHolidayAddress | undefined
  /** O 1º segmento é a cidade da parada: o destino físico, que o desvio manual move junto. */
  readonly addressKey: string
  readonly estimatedArrivalAt: Date
  readonly stopId: string
}

export type DriverStopHolidayContextPort = {
  /** Só paradas com ETA; as outras não voltam. Sempre uma consulta, para todas as paradas pedidas. */
  list(input: {
    readonly companyId: string
    readonly stopIds: readonly string[]
  }): Promise<readonly DriverStopHolidayContext[]>
}

export type DriverHolidayWarningsDependency = {
  readonly calendar: HolidayWarningPort
  readonly contexts: DriverStopHolidayContextPort
  /** Sem logger a falha do aviso é silenciosa para quem opera; com ele deixa rastro só de ids e contagem. */
  readonly logger?: ApiLogger
}

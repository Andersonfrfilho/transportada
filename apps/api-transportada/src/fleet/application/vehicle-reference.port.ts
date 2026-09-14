/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { VehicleType } from '../../shared/vehicle-type.constant.js'

/**
 * Uma linha do catálogo de mercado: a medida típica do baú daquele tipo, e a carga que o mercado
 * publica para ele.
 *
 * ⚠️ **É piso, nunca verdade.** A dispersão dentro de um tipo chega a 2× — a van vai de 7,0 a 15,5
 * m³ na mesma sigla —, e por isso a ficha vence sempre. O que esta leitura serve é a **sugestão** do
 * cadastro, onde um humano confere antes de salvar; ela nunca desenha a planta do baú por baixo.
 *
 * `vehicleType` vazio é o implemento — o tipo pertence a quem traciona.
 */
export type VehicleReference = {
  /** `tpCar` do MDF-e — `02` fechada/baú, `05` sider. */
  readonly bodyType: string
  readonly cargoHeightM: string
  readonly cargoLengthM: string
  readonly cargoWidthM: string
  /** Nulo é ausência de fonte publicada, nunca "carrega zero". */
  readonly maxPayloadKg: string | null
  readonly vehicleType: VehicleType | ''
}

export type VehicleReferencePort = {
  list(): Promise<readonly VehicleReference[]>
}

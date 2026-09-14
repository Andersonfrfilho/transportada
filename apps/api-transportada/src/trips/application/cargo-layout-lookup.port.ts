/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  StoredCargoLayoutRecord,
  StoredCargoLayoutRecordWithInput,
} from '../domain/cargo-layout-state.types.js'
import type {
  FindCargoLayoutByIdParams,
  FindCargoLayoutByInputHashParams,
} from './read-cargo-layout.types.js'

/**
 * Spec 145 D3/D10 (T11): a planta guardada, pela chave da fila `(company_id, input_hash)` — o que a
 * prévia procura — ou pelo `id` que ela devolveu — o que a tela pergunta de novo. Só leitura.
 */
export type CargoLayoutLookupPort = {
  findById(params: FindCargoLayoutByIdParams): Promise<StoredCargoLayoutRecordWithInput | undefined>
  findByInputHash(
    params: FindCargoLayoutByInputHashParams,
  ): Promise<StoredCargoLayoutRecord | undefined>
}

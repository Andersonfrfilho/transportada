/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF1/RF3: o detalhe de uma ocorrência. É a mesma linha da listagem (as duas fontes, nota e
 * parada, com a tratativa da spec 164 em `case`), mais o bloco do motorista da viagem. **Leitura
 * pura**: nada aqui decide nem muda a tratativa (spec 183 D4).
 */
import { TripOccurrenceNotFoundError } from '../domain/trip.error.js'
import type { TripOccurrenceFeedItem } from './trip-occurrence-feed.use-case.js'

/**
 * O motorista da viagem, como o escritório precisa dele para falar com ele. `null` quando a viagem
 * não tem motorista pareado. Os campos vazios da ficha saem como `''` (a ficha grava assim), nunca
 * inventados. `picturePath` é o endereço público da foto (`/public/company-users/:token/picture`) —
 * a rota autenticada da foto pede `users.manage`, que o escritório não tem. `whatsappPhone` só vem
 * com o telefone **verificado** (ADR-0063).
 *
 * ⚠️ Nada da CNH: validade, número e data de nascimento são dados que a ADR-0039 manda criptografar,
 * e o que mantém essa mudança barata é não haver leitor (`test/trip/privacy.contract.ts`, spec 079
 * T015).
 */
export type TripOccurrenceDetailDriver = {
  readonly driverId: string
  readonly email: string
  readonly name: string
  readonly phone: string
  readonly picturePath: null | string
  readonly whatsappPhone: null | string
}

export type TripOccurrenceDetail = TripOccurrenceFeedItem & {
  readonly driver: TripOccurrenceDetailDriver | null
}

export type TripOccurrenceDetailReaderPort = {
  findDetail(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<TripOccurrenceDetail | null>
}

export type ReadTripOccurrenceDetailInput = {
  readonly context: { readonly companyId: string }
  readonly occurrenceId: string
}

export type ReadTripOccurrenceDetailUseCase = {
  execute(input: ReadTripOccurrenceDetailInput): Promise<TripOccurrenceDetail>
}

/** Inexistente e de outra empresa respondem igual: a diferença confirmaria a existência. */
export function createReadTripOccurrenceDetailUseCase(dependencies: {
  readonly reader: TripOccurrenceDetailReaderPort
}): ReadTripOccurrenceDetailUseCase {
  return {
    async execute(input: ReadTripOccurrenceDetailInput): Promise<TripOccurrenceDetail> {
      const detail = await dependencies.reader.findDetail({
        companyId: input.context.companyId,
        occurrenceId: input.occurrenceId,
      })
      if (detail === null) throw new TripOccurrenceNotFoundError()
      return detail
    },
  }
}

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF1/RF3: o detalhe de uma ocorrência. É a mesma linha da listagem (as duas fontes, nota e
 * parada, com a tratativa da spec 164 em `case`), mais o bloco do motorista da viagem. **Leitura
 * pura**: nada aqui decide nem muda a tratativa (spec 183 D4).
 */
import type { TripOccurrenceDetailRequirements } from '../domain/occurrence-detail-requirements.policy.js'
import { TripOccurrenceNotFoundError } from '../domain/trip.error.js'
import type { OccurrenceCorrectionEntry } from './occurrence-correction.port.js'
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

/** Spec 183 T207: o item atingido (specs 166/172). Quantidade é string decimal, nunca `number`. */
export type TripOccurrenceDetailItem = {
  readonly code: string
  readonly description: string
  readonly quantity: string | null
  readonly unit: string | null
}

/**
 * Spec 247 (T7.2 R2): o que o registro gravou em cada linha — quantidade, o valor unitário **copiado** da
 * nota no registro (4 casas, como a nota o traz) e o valor pago digitado (2 casas; `"0.00"` é a loja não
 * ter pago, `null` é não digitado). Fica em lista ao lado de `items`, nunca dentro dele: o painel
 * publicado confere cada `items[]` com as quatro chaves de sempre.
 */
export type TripOccurrenceDetailItemValues = {
  readonly declaredAmount: null | string
  readonly productCode: string
  readonly quantity: null | string
  readonly unitValue: null | string
}

export type TripOccurrenceDetail = TripOccurrenceFeedItem & {
  /** Spec 240 RF9: mais antiga primeiro; `[]` quando nunca foi corrigida. */
  readonly corrections: readonly OccurrenceCorrectionEntry[]
  /** Spec 247 (T7.2 R2): o valor pago da ocorrência, duas casas; `null` quando não foi digitado. */
  readonly declaredAmount: null | string
  readonly driver: TripOccurrenceDetailDriver | null
  /** Vazia na ocorrência da nota inteira e na de parada, que não aponta item. */
  readonly items: readonly TripOccurrenceDetailItem[]
  /** Spec 247 (T7.2 R2): vazia na nota inteira, na parada e na ocorrência anterior à 247. */
  readonly itemValues: readonly TripOccurrenceDetailItemValues[]
  /** Spec 247 (T7.2 R2): o número do documento do cliente; `null` quando não foi registrado. */
  readonly referenceNumber: null | string
  /**
   * Spec 247 (T7.2b N2): o requisito EFETIVO do tipo para esta ocorrência (exceções do contratante e do
   * destinatário da nota já aplicadas); `null` na ocorrência de parada e no tipo que não existe mais.
   */
  readonly requirements: null | TripOccurrenceDetailRequirements
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

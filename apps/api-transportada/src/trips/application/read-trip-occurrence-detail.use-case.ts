/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF1/RF3: o detalhe de uma ocorrência. É a mesma linha da listagem (as duas fontes, nota e
 * parada, com a tratativa da spec 164 em `case`), mais o bloco do motorista da viagem. **Leitura
 * pura**: nada aqui decide nem muda a tratativa (spec 183 D4).
 */
import type { StopOccurrencePaidBy } from '../../database/trip.schema.js'
import type { PixKeyType } from '../../shared/pix-key-type.constant.js'
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

/**
 * A cobrança no recebimento da ocorrência de parada (spec 317): quem pagou, o valor, o PIX do motorista e as
 * fotos das vagas (placa, extrato), com link assinado de 5 min. ⚠️ O PIX é dado financeiro: só sai com
 * `trip.financials` (`driverPix` é `null` sem ela, e o painel mostra "sem permissão"), como nos Ressarcimentos.
 */
export type TripOccurrenceDetailReceivingCharge = {
  readonly declaredAmount: null | string
  /** E13: o comprovante da transferência ao motorista (só com `trip.financials`); `null` enquanto não houve envio. */
  readonly driverPayoutReceipt: null | {
    readonly expiresAt: string
    readonly fileName: string
    readonly sentAt: string
    readonly url: string
  }
  readonly driverPix: null | { readonly key: string; readonly type: PixKeyType }
  readonly paidBy: null | StopOccurrencePaidBy
  readonly photos: readonly {
    readonly expiresAt: string
    readonly label: string
    readonly slotKey: string
    readonly url: string
  }[]
}

/** O que o leitor devolve da cobrança: onde cada foto está. Quem assina é o caso de uso. */
export type TripOccurrenceDetailReceivingChargeSource = Omit<
  TripOccurrenceDetailReceivingCharge,
  'driverPayoutReceipt' | 'photos'
> & {
  readonly driverPayoutReceipt: null | {
    readonly bucket: string
    readonly fileName: string
    readonly objectKey: string
    readonly sentAt: string
  }
  readonly photos: readonly {
    readonly bucket: string
    readonly label: string
    readonly objectKey: string
    readonly slotKey: string
  }[]
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
  /** Cobrança no recebimento (ocorrência de parada com quem pagou ou foto de vaga); ausente nas demais. */
  readonly receivingCharge?: null | TripOccurrenceDetailReceivingCharge
  /**
   * Spec 247 (T7.2b N2): o requisito EFETIVO do tipo para esta ocorrência (exceções do contratante e do
   * destinatário da nota já aplicadas); `null` na ocorrência de parada e no tipo que não existe mais.
   */
  readonly requirements: null | TripOccurrenceDetailRequirements
}

export type TripOccurrenceDetailRead = Omit<TripOccurrenceDetail, 'receivingCharge'> & {
  readonly receivingCharge?: null | TripOccurrenceDetailReceivingChargeSource
}

export type TripOccurrenceDetailReaderPort = {
  findDetail(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<null | TripOccurrenceDetailRead>
}

/** Assina o link de 5 min de uma foto da vaga; o mesmo gateway da prova de entrega. */
export type TripOccurrenceDetailPhotoDownloadPort = {
  createDownloadUrl(location: {
    readonly bucket: string
    readonly fileName: string
    readonly objectKey: string
  }): Promise<{ readonly expiresAt: string; readonly url: string }>
}

export type ReadTripOccurrenceDetailInput = {
  readonly context: { readonly companyId: string }
  /** `trip.financials`: sem ele o PIX do motorista sai `null`. */
  readonly includeFinancials?: boolean
  readonly occurrenceId: string
}

export type ReadTripOccurrenceDetailUseCase = {
  execute(input: ReadTripOccurrenceDetailInput): Promise<TripOccurrenceDetail>
}

/** Inexistente e de outra empresa respondem igual: a diferença confirmaria a existência. */
export function createReadTripOccurrenceDetailUseCase(dependencies: {
  readonly downloads?: TripOccurrenceDetailPhotoDownloadPort
  readonly reader: TripOccurrenceDetailReaderPort
}): ReadTripOccurrenceDetailUseCase {
  return {
    async execute(input: ReadTripOccurrenceDetailInput): Promise<TripOccurrenceDetail> {
      const detail = await dependencies.reader.findDetail({
        companyId: input.context.companyId,
        occurrenceId: input.occurrenceId,
      })
      if (detail === null) throw new TripOccurrenceNotFoundError()
      const { receivingCharge: source, ...rest } = detail
      if (source === undefined || source === null) return { ...rest, receivingCharge: null }
      const downloads = dependencies.downloads
      const photos =
        downloads === undefined
          ? []
          : await Promise.all(
              source.photos.map(async (photo) => {
                const link = await downloads.createDownloadUrl({
                  bucket: photo.bucket,
                  fileName: photo.slotKey,
                  objectKey: photo.objectKey,
                })
                return {
                  expiresAt: link.expiresAt,
                  label: photo.label,
                  slotKey: photo.slotKey,
                  url: link.url,
                }
              }),
            )
      const receiptSource = input.includeFinancials === true ? source.driverPayoutReceipt : null
      const driverPayoutReceipt =
        receiptSource === null || downloads === undefined
          ? null
          : await downloads
              .createDownloadUrl({
                bucket: receiptSource.bucket,
                fileName: receiptSource.fileName,
                objectKey: receiptSource.objectKey,
              })
              .then((link) => ({
                expiresAt: link.expiresAt,
                fileName: receiptSource.fileName,
                sentAt: receiptSource.sentAt,
                url: link.url,
              }))
      return {
        ...rest,
        receivingCharge: {
          ...source,
          driverPayoutReceipt,
          driverPix: input.includeFinancials === true ? source.driverPix : null,
          photos,
        },
      }
    },
  }
}

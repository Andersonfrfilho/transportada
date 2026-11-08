/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: os últimos envios de XML por e-mail e WhatsApp da empresa, com o desfecho de cada um — é onde a operação vê
 * o que foi recusado e por quê, o que está na fila e o que falhou, sem abrir log.
 */
import { maskPhone } from '../../logging/phone-mask.policy.js'

export type NfeXmlReceiptView = {
  readonly channel: 'email' | 'whatsapp'
  readonly createdAt: string
  readonly filesCount: number
  readonly id: string
  readonly importId: string | null
  readonly lastErrorCode: string | null
  readonly rejectReason: string | null
  readonly sender: string
  readonly status: 'failed' | 'imported' | 'pending' | 'processing' | 'rejected'
}

export type NfeXmlReceiptReadPort = {
  listRecent(input: {
    readonly companyId: string
    readonly limit: number
  }): Promise<readonly (Omit<NfeXmlReceiptView, 'sender'> & { readonly sender: string })[]>
}

export function createListNfeXmlReceiptsUseCase(dependencies: {
  readonly reader: NfeXmlReceiptReadPort
}) {
  return {
    async execute(input: {
      readonly companyId: string
      readonly limit: number
    }): Promise<readonly NfeXmlReceiptView[]> {
      const rows = await dependencies.reader.listRecent(input)
      // O número de WhatsApp não é mostrado inteiro: os quatro últimos dígitos bastam para reconhecer quem mandou.
      return rows.map((row) => ({
        ...row,
        sender: row.channel === 'whatsapp' ? maskPhone(row.sender) : row.sender,
      }))
    },
  }
}

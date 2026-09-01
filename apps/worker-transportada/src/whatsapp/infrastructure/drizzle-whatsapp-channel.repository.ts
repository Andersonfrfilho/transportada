/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import { whatsappChannels } from '../../database/whatsapp-channel.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type WhatsAppChannelCredential = {
  readonly channelId: string
  readonly envelope: unknown
  readonly phoneNumberId: string
}

/**
 * ⚠️ **Aqui a empresa é conhecida, e é o que torna este caminho diferente do driver de notificação.**
 * O convite e a recuperação de senha carregam `companyId` no envelope da mensagem, então a linha do
 * canal é escolhida sem ambiguidade nenhuma — o `channel_ambiguous` da T004 não existe neste trilho.
 */
export class DrizzleWhatsAppChannelRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async findActiveCredential(params: {
    readonly companyId: string
  }): Promise<WhatsAppChannelCredential | undefined> {
    const [row] = await this.#database
      .select({
        envelope: whatsappChannels.secretEnvelope,
        id: whatsappChannels.id,
        phoneNumberId: whatsappChannels.phoneNumberId,
      })
      .from(whatsappChannels)
      .where(
        and(
          eq(whatsappChannels.companyId, params.companyId),
          eq(whatsappChannels.status, 'active'),
          /** Canal sem token selado existe na tela e não tem com que assinar a chamada à Meta. */
          sql`${whatsappChannels.secretEnvelope} ? 'ciphertext'`,
        ),
      )
      .limit(1)

    if (row === undefined) return undefined

    return { channelId: row.id, envelope: row.envelope, phoneNumberId: row.phoneNumberId }
  }
}

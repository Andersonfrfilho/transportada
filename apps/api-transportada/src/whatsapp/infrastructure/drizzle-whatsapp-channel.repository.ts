/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { and, eq, sql } from 'drizzle-orm'

import { whatsappChannels } from '../../database/whatsapp-channel.schema.js'
import type {
  WhatsAppChannelRecord,
  WhatsAppChannelRepositoryPort,
  WhatsAppChannelSummary,
} from '../application/whatsapp-channel.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * ⚠️ **A projeção não tem o envelope.** Ela é o que sobe para o caso de uso e para a rota, e deixar o
 * segredo aqui faria ele viajar em toda leitura — bastaria alguém serializar o objeto inteiro numa
 * resposta ou num log. Quem precisa do envelope chama `findSecret`, que existe só para o driver.
 */
/**
 * ⚠️ `is not null` **não serve**: a coluna é `not null` e a inserção sem token grava `{}`, então o
 * predicado responderia "tem token" para todo canal. O que decide é a **chave do envelope existir**
 * — `?` do jsonb —, e isso é feito no banco justamente para o segredo não subir na projeção.
 */
const HAS_SEALED_TOKEN = sql<boolean>`${whatsappChannels.secretEnvelope} ? 'ciphertext'`

const SUMMARY_COLUMNS = {
  createdAt: whatsappChannels.createdAt,
  displayPhoneNumber: whatsappChannels.displayPhoneNumber,
  id: whatsappChannels.id,
  phoneNumberId: whatsappChannels.phoneNumberId,
  status: whatsappChannels.status,
  updatedAt: whatsappChannels.updatedAt,
  version: whatsappChannels.version,
  wabaId: whatsappChannels.wabaId,
} as const

export class DrizzleWhatsAppChannelRepository implements WhatsAppChannelRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async find(input: { readonly companyId: string }): Promise<WhatsAppChannelSummary | null> {
    const [row] = await this.database
      .select({ ...SUMMARY_COLUMNS, hasEnvelope: HAS_SEALED_TOKEN })
      .from(whatsappChannels)
      .where(eq(whatsappChannels.companyId, input.companyId))
      .limit(1)

    return row === undefined ? null : toSummary(row)
  }

  public async findSecret(input: {
    readonly companyId: string
  }): Promise<{ readonly channelId: string; readonly envelope: SecretEnvelopeV1 } | null> {
    const [row] = await this.database
      .select({ envelope: whatsappChannels.secretEnvelope, id: whatsappChannels.id })
      .from(whatsappChannels)
      .where(
        and(
          eq(whatsappChannels.companyId, input.companyId),
          /** Canal desligado não envia: desligar é o botão que o operador tem para parar o fluxo. */
          eq(whatsappChannels.status, 'active'),
        ),
      )
      .limit(1)

    if (row === undefined) return null

    return { channelId: row.id, envelope: row.envelope as SecretEnvelopeV1 }
  }

  public async remove(input: { readonly companyId: string }): Promise<boolean> {
    const removed = await this.database
      .delete(whatsappChannels)
      .where(eq(whatsappChannels.companyId, input.companyId))
      .returning({ id: whatsappChannels.id })

    return removed.length > 0
  }

  /**
   * Um canal por empresa, e o `onConflictDoUpdate` é o que torna salvar idempotente. `secretEnvelope`
   * ausente **mantém o que está gravado**: é assim que a tela grava número e status sem obrigar o
   * operador a redigitar o token — que ele não tem mais, porque ninguém o lê de volta.
   */
  public async save(input: WhatsAppChannelRecord): Promise<WhatsAppChannelSummary> {
    const [row] = await this.database
      .insert(whatsappChannels)
      .values({
        companyId: input.companyId,
        displayPhoneNumber: input.displayPhoneNumber,
        phoneNumberId: input.phoneNumberId,
        secretEnvelope: input.secretEnvelope ?? {},
        status: input.status,
        wabaId: input.wabaId,
      })
      .onConflictDoUpdate({
        set: {
          displayPhoneNumber: input.displayPhoneNumber,
          phoneNumberId: input.phoneNumberId,
          status: input.status,
          updatedAt: sql`now()`,
          version: sql`${whatsappChannels.version} + 1`,
          wabaId: input.wabaId,
          ...(input.secretEnvelope === undefined ? {} : { secretEnvelope: input.secretEnvelope }),
        },
        target: whatsappChannels.companyId,
      })
      .returning({ ...SUMMARY_COLUMNS, hasEnvelope: HAS_SEALED_TOKEN })

    if (row === undefined) throw new Error('whatsapp channel upsert returned no row')

    return toSummary(row)
  }
}

function toSummary(
  row: Readonly<{
    createdAt: Date
    displayPhoneNumber: string
    hasEnvelope: boolean
    id: string
    phoneNumberId: string
    status: WhatsAppChannelSummary['status']
    updatedAt: Date
    version: bigint
    wabaId: string
  }>,
): WhatsAppChannelSummary {
  return {
    createdAt: row.createdAt.toISOString(),
    displayPhoneNumber: row.displayPhoneNumber,
    id: row.id,
    phoneNumberId: row.phoneNumberId,
    status: row.status,
    tokenConfigured: row.hasEnvelope,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version.toString(),
    wabaId: row.wabaId,
  }
}

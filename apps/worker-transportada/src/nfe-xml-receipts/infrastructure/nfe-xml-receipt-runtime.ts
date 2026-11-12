/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: junta as peças do recebimento de XML (banco, storage, Evolution, Resend, notificações) e expõe o ciclo que o
 * worker repete a cada minuto: drena o lote do WhatsApp e manda os resumos pendentes. Um lock consultivo de transação
 * garante um ciclo por vez mesmo com mais de uma réplica do worker — quem perde o lock simplesmente pula a batida.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type { ContractorMailCredentialSecretService } from '../../contractor-mail/application/contractor-mail-credential-secret.service.js'
import { createDrizzleCompanyLogoReader } from '../../contractor-mail/infrastructure/drizzle-company-logo.reader.js'
import type { ResendMailGateway } from '../../contractor-mail/infrastructure/resend-mail.gateway.js'
import { buildContractorReplyLayoutMail } from '../../occurrence-conversation/infrastructure/contractor-reply-client-email-layout.support.js'
import { safeLogError, safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { NotificationTriggerInput } from '../../notification/domain/notification-trigger.policy.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import type { EvolutionMediaFetcher } from '../../whatsapp/infrastructure/evolution-client-document-sender.gateway.js'
import { processWhatsAppReceipts } from '../application/process-whatsapp-receipts.use-case.js'
import { sendReceiptReplies } from '../application/send-receipt-replies.use-case.js'
import type { ReceiptLogger } from '../application/nfe-xml-receipt.types.js'
import { createDrizzleNfeXmlReceiptRepository } from './drizzle-nfe-xml-receipt.repository.js'
import {
  createDrizzleReceivedXmlImportGateway,
  type ReceivedXmlStorage,
} from './drizzle-received-xml-import.gateway.js'
import { createReceiptOperatorAlertAdapter } from './receipt-operator-alert.adapter.js'
import {
  createReceiptReplyAdapter,
  type ReceiptEmailRenderer,
  type ReceiptReplySettings,
} from './receipt-reply.adapter.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const LOCK_KEY = 'nfe-xml-receipts'

export type NfeXmlReceiptRuntimeDependencies = {
  readonly database: Database
  readonly evolution: {
    readonly fetchMedia: EvolutionMediaFetcher
    readonly sendText: (input: {
      readonly body: string
      readonly companyId: string
      readonly number: string
    }) => Promise<unknown>
  }
  readonly findReplySettings: (input: {
    readonly companyId: string
  }) => Promise<ReceiptReplySettings | undefined>
  readonly logger: WorkerLogger
  readonly mailGateway: Pick<ResendMailGateway, 'sendEmail'>
  readonly now?: () => Date
  readonly resendDisabled?: boolean
  readonly secretService: Pick<ContractorMailCredentialSecretService, 'decrypt'>
  readonly sendNotification: (input: NotificationTriggerInput) => Promise<unknown>
  /** O logo branco do cabeçalho escuro do modelo padrão; sem ele sai o logo original. */
  readonly whiteLogo?: (logo: Uint8Array) => Promise<Uint8Array>
  readonly storage: ReceivedXmlStorage
}

export function createReceiptLogger(logger: WorkerLogger): ReceiptLogger {
  return {
    error: (message, metadata) => safeLogError({ logger, message, metadata }),
    info: (message, metadata) => safeLogInfo({ logger, message, metadata }),
    warn: (message, metadata) => safeLogWarn({ logger, message, metadata }),
  }
}

export function createNfeXmlReceiptRuntime(dependencies: NfeXmlReceiptRuntimeDependencies) {
  const { database } = dependencies
  const now = dependencies.now ?? (() => new Date())
  const logger = createReceiptLogger(dependencies.logger)
  const repository = createDrizzleNfeXmlReceiptRepository({ database })
  const importGateway = createDrizzleReceivedXmlImportGateway({
    database,
    storage: dependencies.storage,
  })
  const logoReader = createDrizzleCompanyLogoReader(database)
  const renderEmail: ReceiptEmailRenderer = async ({ body, companyId, subject }) => {
    const mail = await buildContractorReplyLayoutMail(database, { body, companyId, subject })
    const logo = mail.hasInlineLogo ? await logoReader.find({ companyId }) : undefined
    const white =
      logo === undefined || dependencies.whiteLogo === undefined
        ? undefined
        : await dependencies
            .whiteLogo(Buffer.from(logo.contentBase64, 'base64'))
            .catch(() => undefined)
    return {
      html: mail.html,
      logo:
        logo === undefined
          ? []
          : [
              {
                content:
                  white === undefined ? logo.contentBase64 : Buffer.from(white).toString('base64'),
                contentId: 'company-logo',
                contentType: white === undefined ? logo.mimeType : 'image/png',
                fileName:
                  white !== undefined || logo.mimeType === 'image/png' ? 'logo.png' : 'logo.jpg',
              },
            ],
      subject: mail.subject,
      text: mail.text,
    }
  }
  const reply = createReceiptReplyAdapter({
    renderEmail,
    findSettings: dependencies.findReplySettings,
    mailGateway: dependencies.mailGateway,
    ...(dependencies.resendDisabled === true ? { resendDisabled: true } : {}),
    secretService: dependencies.secretService,
    sendWhatsAppText: dependencies.evolution.sendText,
  })
  const alerts = createReceiptOperatorAlertAdapter({
    database,
    send: dependencies.sendNotification,
  })

  async function cycle(): Promise<void> {
    const whatsapp = await processWhatsAppReceipts({
      alerts,
      downloadMedia: ({ companyId, maxBytes, media }) =>
        dependencies.evolution.fetchMedia({ companyId, maxBytes, rawMessage: media.rawMessage }),
      importGateway,
      logger,
      now,
      reply,
      repository,
    })
    const replies = await sendReceiptReplies({ logger, now, reply, repository })
    const touched =
      Object.values(whatsapp).reduce((total, count) => total + count, 0) +
      replies.sent +
      replies.failed
    if (touched > 0) logger.info('nfe_xml_receipt_cycle_finished', { ...whatsapp, replies })
  }

  return {
    importGateway,
    repository,
    /** Uma batida: pula sozinha quando outra réplica já está rodando o ciclo. */
    async runCycle(): Promise<void> {
      await database.transaction(async (transaction) => {
        const rows = (await transaction.execute(
          sql`select pg_try_advisory_xact_lock(hashtextextended(${LOCK_KEY}, 0)) as locked`,
        )) as unknown as readonly { locked: boolean }[]
        if (rows[0]?.locked !== true) return
        await cycle()
      })
    },
  }
}

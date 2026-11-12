/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: o `.xml`/`.zip` que chegou ao bot — no privado, ou em **qualquer** grupo em que o bot esteja, desde que ele seja
 * marcado. O webhook só decide e grava o recibo; quem baixa o arquivo e importa é o worker, em lotes, então nada aqui é
 * recusado por volume. Só a segurança recusa: remetente sem cadastro verificado ou sem permissão de importar, e arquivo
 * acima do teto — cada recusa vira um recibo `rejected` com o motivo, e o remetente é avisado pelo worker.
 *
 * ⚠️ Nada de número, nome de arquivo ou id de grupo em log: só empresa, motivo e contagens.
 */
import { parseJid, mentionsBot } from '../../whatsapp/domain/evolution-group-message.policy.js'
import type { EvolutionMessageEvent } from '../../whatsapp/application/evolution-group-inbound.service.js'
import type {
  EvolutionGroupIdentity,
  LazyEvolutionConnection,
} from '../../whatsapp/application/evolution-group-identity.service.js'
import type { ApiLogger } from '../../shared/api.types.js'
import {
  NFE_XML_RECEIPT_LOG,
  NFE_XML_RECEIPT_MAX_FILE_BYTES,
  NFE_XML_RECEIPT_REJECTION,
} from '../domain/nfe-xml-receipt.constant.js'
import type { WhatsAppXmlDocument } from './read-whatsapp-xml-documents.js'

export type WhatsAppXmlReceiptRepositoryPort = {
  /** Quem tem esse número verificado, vínculo ativo na empresa e papel que importa nota. */
  findImportSender(input: {
    readonly companyId: string
    readonly now: Date
    readonly phone: string
  }): Promise<{ readonly userId: string } | undefined>
  /** `created: false` quando a mesma mensagem já foi gravada (entrega repetida do webhook). */
  recordReceipt(input: {
    readonly companyId: string
    readonly media: WhatsAppXmlDocumentMedia | null
    readonly providerMessageId: string
    readonly rejectReason: string | null
    readonly replyTo: string | null
    readonly requestedByUserId: string | null
    readonly sender: string
    readonly status: 'pending' | 'rejected'
  }): Promise<{ readonly created: boolean }>
}

export type WhatsAppXmlDocumentMedia = {
  readonly fileName: string
  readonly mimeType: string
  readonly rawMessage: { readonly key: unknown; readonly message: unknown }
  readonly sizeBytes: number
}

export type WhatsAppXmlInboundOutcome =
  | 'duplicate'
  | 'from_me'
  | 'identity_unavailable'
  | 'not_addressed'
  | 'recorded'
  | 'rejected'
  | 'unknown_sender'

export type WhatsAppXmlInbound = {
  receive(input: {
    readonly companyId: string
    readonly connection: LazyEvolutionConnection
    readonly document: WhatsAppXmlDocument
    readonly event: EvolutionMessageEvent
    /** Os dígitos do `@lid` de quem escreveu, lidos do corpo cru. */
    readonly senderLid: null | string
  }): Promise<WhatsAppXmlInboundOutcome>
}

export function createWhatsAppXmlInbound(dependencies: {
  readonly identity: EvolutionGroupIdentity
  readonly logger: ApiLogger
  readonly now?: () => Date
  readonly repository: WhatsAppXmlReceiptRepositoryPort
}): WhatsAppXmlInbound {
  const now = dependencies.now ?? (() => new Date())
  const { identity, logger, repository } = dependencies

  return {
    async receive({ companyId, connection, document, event, senderLid }) {
      if (event.fromMe) return 'from_me'

      let sender = ''
      let replyTo: null | string = null
      if (event.chat === 'user') {
        sender = event.from
      } else if (event.chat === 'group' && event.groupJid !== null) {
        const groupJid = event.groupJid
        replyTo = groupJid
        const mentioned = [...new Set([...event.mentionedJids, ...document.mentionedJids])]
        if (mentioned.length === 0) return 'not_addressed'
        try {
          const botNumber = await identity.botNumber({ companyId, connection })
          if (botNumber === null) return 'identity_unavailable'
          const lids = [
            ...mentioned.flatMap((jid) => {
              const parsed = parseJid(jid)
              return parsed?.server === 'lid' ? [parsed.digits] : []
            }),
          ]
          const needsSender = event.participant === '' && senderLid !== null
          const directory =
            lids.length === 0 && !needsSender
              ? new Map<string, string>()
              : await identity.lidDirectory({
                  companyId,
                  connection,
                  groupJid,
                  lids: [...lids, ...(needsSender ? [senderLid] : [])],
                })
          const botLids = new Set(
            [...directory].filter(([, number]) => number === botNumber).map(([lid]) => lid),
          )
          if (!mentionsBot(mentioned, botNumber, botLids)) return 'not_addressed'
          sender = needsSender ? (directory.get(senderLid) ?? '') : event.participant
        } catch {
          return 'identity_unavailable'
        }
      } else {
        return 'not_addressed'
      }
      if (sender === '') return 'unknown_sender'

      const at = now()
      const authorized = await repository.findImportSender({ companyId, now: at, phone: sender })
      const rejectReason =
        authorized === undefined
          ? NFE_XML_RECEIPT_REJECTION.senderNotAllowed
          : document.sizeBytes > NFE_XML_RECEIPT_MAX_FILE_BYTES
            ? NFE_XML_RECEIPT_REJECTION.tooLarge
            : null
      const recorded = await repository.recordReceipt({
        companyId,
        media:
          rejectReason === null
            ? {
                fileName: document.fileName,
                mimeType: document.mimeType,
                rawMessage: document.rawMessage,
                sizeBytes: document.sizeBytes,
              }
            : null,
        providerMessageId: event.externalMessageId,
        rejectReason,
        replyTo,
        requestedByUserId: authorized?.userId ?? null,
        sender,
        status: rejectReason === null ? 'pending' : 'rejected',
      })
      logger.info(NFE_XML_RECEIPT_LOG.received, {
        chat: event.chat,
        companyId,
        created: recorded.created,
        ...(rejectReason === null ? {} : { reason: rejectReason }),
      })
      if (!recorded.created) return 'duplicate'
      return rejectReason === null ? 'recorded' : 'rejected'
    },
  }
}

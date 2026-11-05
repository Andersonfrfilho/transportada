/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15: **a foto e a localização que o motorista manda no grupo.** A porta do grupo (T3) só
 * aceitava texto; agora a mídia do motorista dono do grupo chega aqui (nunca a de outro membro,
 * desenho 3.4 regra 9):
 *
 * - **localização**: fica guardada um tempo curto para o próximo saí/cheguei/entreguei (a oferta que a
 *   T12 deixou pendente) e completa as entregas em preparo que ainda não tinham a localização;
 * - **foto**: só é baixada do Evolution se houver entrega em preparo; vira canhoto ou foto da
 *   mercadoria, conforme a pergunta aberta e a configuração da nota.
 *
 * Quando a preparação passa a esperar uma resposta em texto (quem recebeu, nome, confirmação), abre um
 * pedido no grupo para o motorista responder sem marcar o bot.
 *
 * ⚠️ Nada de coordenada, número ou id de mensagem em log: só empresa e motivo.
 */
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import {
  locationSchema,
  toReportedLocation,
} from '../../trips/presentation/reported-location.schema.js'
import type {
  WhatsAppDeliveryPreparationReply,
  WhatsAppDeliveryPreparations,
} from '../../whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import { DELIVERY_PROOF_SPEECH } from '../../whatsapp-commands/domain/whatsapp-delivery-proof-speech.constant.js'
import type { AdmittedGroupMedia } from './evolution-group-inbound.service.js'
import type { GroupReplySenderPort } from './whatsapp-group-request.port.js'

/** A foto vinda do WhatsApp pode ir até o teto do `original` do comprovante (12 MiB). */
const GROUP_PHOTO_MAX_BYTES = 12 * 1024 * 1024

export const GROUP_PROOF_TEXT = {
  locationKept:
    'Localização recebida. Ela vale para o próximo "saí", "cheguei" ou "entreguei" deste grupo.',
  photoTooLarge: 'Essa foto é grande demais. Mande uma foto menor, por favor.',
} as const

export type GroupProofIntakePorts = {
  /** Baixa a foto pelo id da mensagem (Evolution `getBase64FromMediaMessage`). */
  readonly downloadMedia: (input: {
    readonly connection: AdmittedGroupMedia['connection']
    readonly providerMessageId: string
  }) => Promise<{ readonly data: string; readonly mimeType: string }>
  readonly findActorUserId: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<null | string>
  readonly logger?: { warn(message: string, fields?: Record<string, unknown>): void }
  /** Abre o pedido no grupo (passo da resposta da entrega) se não houver outro aberto. */
  readonly openAnswerRequest: (input: {
    readonly companyId: string
    readonly driverId: string
    readonly groupJid: string
    readonly ownerNumber: string
  }) => Promise<void>
  readonly preparations: WhatsAppDeliveryPreparations
  /** Um pedido do grupo esperando a localização (ocorrência) avança com ela; `true` se avançou. */
  readonly advanceRequest?: (input: {
    readonly companyId: string
    readonly groupJid: string
    readonly location?: { readonly latitude: number; readonly longitude: number }
    readonly sender: string
  }) => Promise<boolean>
  readonly rememberLocation: (input: {
    readonly companyId: string
    readonly driverId: string
    readonly location: ReportedLocation
  }) => void
  readonly replies: GroupReplySenderPort
  readonly withoutAccessText: (companyId: string) => Promise<string>
  readonly clock?: () => Date
}

export function createGroupProofIntake(ports: GroupProofIntakePorts) {
  const clock = ports.clock ?? (() => new Date())

  const say = (media: AdmittedGroupMedia, texts: readonly string[]) => {
    if (texts.length > 0) {
      ports.replies.send({ companyId: media.companyId, groupJid: media.groupJid, texts })
    }
  }

  async function settle(media: AdmittedGroupMedia, reply: WhatsAppDeliveryPreparationReply) {
    if (reply.awaitingText) {
      await ports.openAnswerRequest({
        companyId: media.companyId,
        driverId: media.driverId,
        groupJid: media.groupJid,
        ownerNumber: media.sender,
      })
    }
    say(media, reply.texts)
  }

  return {
    async handle(media: AdmittedGroupMedia): Promise<void> {
      const { companyId, driverId } = media
      const actorUserId = await ports.findActorUserId({ companyId, driverId })

      if (media.media.kind === 'location') {
        const location = toLocation(media.media, media.timestamp, clock())
        if (location === null) return
        ports.rememberLocation({ companyId, driverId, location })
        const advanced = await ports.advanceRequest?.({
          companyId,
          groupJid: media.groupJid,
          location: { latitude: media.media.latitude, longitude: media.media.longitude },
          sender: media.sender,
        })
        if (advanced === true) return
        if (actorUserId === null) return say(media, [GROUP_PROOF_TEXT.locationKept])
        const reply = await ports.preparations.receiveLocation({
          actor: { actorUserId, companyId, driverId },
          location,
        })
        if (reply === null) return say(media, [GROUP_PROOF_TEXT.locationKept])
        return settle(media, reply)
      }

      // Foto sem entrega em preparo é conversa do grupo: o bot não baixa nem responde.
      const open = await ports.preparations.hasOpen({ companyId, driverId })
      if (!open) return
      if (actorUserId === null) return say(media, [await ports.withoutAccessText(companyId)])

      let downloaded: { readonly data: string; readonly mimeType: string }
      try {
        downloaded = await ports.downloadMedia({
          connection: media.connection,
          providerMessageId: media.providerMessageId,
        })
      } catch (error) {
        ports.logger?.warn('whatsapp_group_proof.download_failed', {
          companyId,
          errorName: error instanceof Error ? error.name : typeof error,
        })
        return say(media, [DELIVERY_PROOF_SPEECH.downloadFailed])
      }
      const bytes = Uint8Array.from(Buffer.from(downloaded.data, 'base64'))
      if (bytes.byteLength === 0) return say(media, [DELIVERY_PROOF_SPEECH.downloadFailed])
      if (bytes.byteLength > GROUP_PHOTO_MAX_BYTES)
        return say(media, [GROUP_PROOF_TEXT.photoTooLarge])

      const reply = await ports.preparations.receivePhoto({
        actor: { actorUserId, companyId, driverId },
        bytes,
        caption: media.media.caption,
        mimeType: downloaded.mimeType.split(';')[0]?.trim() || media.media.mimeType,
        providerMessageId: media.providerMessageId,
      })
      if (reply !== null) await settle(media, reply)
    },
  }
}

/** O ponto do WhatsApp vira o mesmo `ReportedLocation` das rotas HTTP (faixa do globo validada). */
function toLocation(
  media: { readonly latitude: number; readonly longitude: number },
  timestamp: null | number,
  now: Date,
): null | ReportedLocation {
  const capturedAt =
    timestamp === null || !Number.isFinite(timestamp) ? now : new Date(timestamp * 1000)
  const parsed = locationSchema.safeParse({
    capturedAt: (Number.isNaN(capturedAt.getTime()) ? now : capturedAt).toISOString(),
    latitude: media.latitude,
    longitude: media.longitude,
  })
  return parsed.success ? (toReportedLocation(parsed.data) ?? null) : null
}

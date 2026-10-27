/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantMessageMenuOptions } from '@adatechnology/conversations-ui/participant'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { shareDriverFiles } from '@/modules/driver-trip/shared/driverFileShare.service'

import type { DriverConversationsApi } from '../shared/driverConversationsApi.service'

export type DriverMessageShareNotice = 'downloaded' | 'failed'

/**
 * O menu da mensagem do pacote com o "Compartilhar <arquivo>" de cada anexo: a folha de compartilhar do aparelho
 * (WhatsApp, e-mail...) com o arquivo anexado, ou o download quando o aparelho não aceita arquivo. O link assinado é
 * pedido na hora do toque e nunca guardado. Cancelar a folha não avisa.
 */
export function useDriverMessageMenu(
  api: Pick<DriverConversationsApi, 'resolveAttachmentUrl'>,
): Readonly<{
  notice: DriverMessageShareNotice | undefined
  options: ParticipantMessageMenuOptions
}> {
  const { t } = useTranslation('conversation')
  const [notice, setNotice] = useState<DriverMessageShareNotice | undefined>(undefined)
  const [pendingId, setPendingId] = useState<string | undefined>(undefined)

  async function share(attachment: Parameters<typeof api.resolveAttachmentUrl>[0]): Promise<void> {
    setNotice(undefined)
    setPendingId(attachment.id)
    try {
      const outcome = await shareDriverFiles({
        files: [
          {
            contentType: attachment.mimeType ?? null,
            fileName: attachment.filename,
            objectId: attachment.id,
          },
        ],
        readUrl: () => api.resolveAttachmentUrl(attachment),
        title: attachment.filename,
      })
      if (outcome === 'downloaded') setNotice('downloaded')
    } catch {
      setNotice('failed')
    } finally {
      setPendingId(undefined)
    }
  }

  return {
    notice,
    options: {
      items: (message) =>
        message.attachments.map((attachment) => ({
          disabled: pendingId !== undefined,
          id: `share:${attachment.id}`,
          label: t('share.item', { name: attachment.filename }),
          onSelect: () => void share(attachment),
        })),
    },
  }
}

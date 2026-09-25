/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T702b (RF10): os anexos dentro do balão. Imagem aparece em miniatura e abre inteira; áudio
 * toca ali (o player completo é da T705); o resto é um link de download com nome e tamanho. A URL é
 * temporária (cinco minutos) — a leitura da conversa assina de novo a cada busca.
 */
import { formatFileSize } from '@adatechnology/conversations-ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import { conversationAttachmentKind } from '../shared/conversationAttachment.service'
import type { OccurrenceConversationAttachment } from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceConversation.module.css'

export function ConversationAttachments({
  attachments,
  renderActions,
}: Readonly<{
  attachments: readonly OccurrenceConversationAttachment[]
  /** Spec 183 T702d: as ações sobre o anexo (anexar à ocorrência, encaminhar), quando há. */
  renderActions?: (attachment: OccurrenceConversationAttachment) => ReactNode
}>) {
  const { t } = useTranslation('occurrenceConversation')
  if (attachments.length === 0) return null

  return (
    <ul aria-label={t('attachment.inMessage')} className={styles.messageAttachments}>
      {attachments.map((attachment) => {
        const kind = conversationAttachmentKind(attachment.contentType)
        return (
          <li key={attachment.id}>
            {kind === 'image' ? (
              <a
                className={styles.messageImage}
                href={attachment.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <img alt={attachment.fileName} loading="lazy" src={attachment.url} />
              </a>
            ) : kind === 'audio' ? (
              <audio
                aria-label={attachment.fileName}
                className={styles.messageAudio}
                controls
                preload="none"
                src={attachment.url}
              />
            ) : (
              <a
                className={styles.messageFile}
                download={attachment.fileName}
                href={attachment.url}
                rel="noopener noreferrer"
              >
                <Icon name="document" size="sm" />
                <span className={styles.attachmentName}>{attachment.fileName}</span>
                <span className={styles.attachmentSize}>
                  {formatFileSize(attachment.sizeBytes)}
                </span>
                <Icon name="download" size="sm" />
              </a>
            )}
            {renderActions === undefined ? null : (
              <div className={styles.attachmentActions}>{renderActions(attachment)}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

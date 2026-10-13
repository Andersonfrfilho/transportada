/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatFileSize } from '@adatechnology/conversations-ui'
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type {
  OccurrenceConversationAttachment,
  OccurrenceConversationMessage,
} from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceThread.module.css'

export type RenderAttachmentActions = (
  attachment: OccurrenceConversationAttachment,
  message: OccurrenceConversationMessage,
) => ReactNode

type OccurrenceThreadAttachmentsProps = Readonly<{
  messages: readonly OccurrenceConversationMessage[]
  renderAttachmentActions: RenderAttachmentActions
}>

/**
 * O `ConversationThread` do SDK não tem porta para ação por anexo: os arquivos que chegaram e têm o que fazer
 * (levar ao motorista, à contratante, à ocorrência, ao cliente por e-mail) ficam aqui, ao lado do fio. A ação é a
 * mesma de antes, montada por quem sabe fazê-la; o anexo sem ação (`null`) não entra.
 */
export function OccurrenceThreadAttachments({
  messages,
  renderAttachmentActions,
}: OccurrenceThreadAttachmentsProps) {
  const { t } = useTranslation('occurrenceConversation')
  const titleId = useId()
  const items = messages
    .flatMap((message) =>
      message.attachments.flatMap((attachment) => {
        const actions = renderAttachmentActions(attachment, message)
        return actions === null || actions === undefined ? [] : [{ actions, attachment }]
      }),
    )
    .reverse()
  if (items.length === 0) return null

  return (
    <section aria-labelledby={titleId} className={`${styles.notice} ${styles.noticeInfo}`}>
      <h4 className={styles.noticeTitle} id={titleId}>
        <Icon name="document" size="sm" />
        {t('thread.attachments.title')}
      </h4>
      <p className={styles.hint}>{t('thread.attachments.hint')}</p>
      <ul className={styles.attachmentList}>
        {items.map(({ actions, attachment }) => (
          <li className={styles.notice} key={attachment.id}>
            <a
              className={styles.attachmentFile}
              download={attachment.fileName}
              href={attachment.url}
              rel="noopener noreferrer"
            >
              <Icon name="download" size="sm" />
              <span className={styles.attachmentName}>{attachment.fileName}</span>
              <span className={styles.hint}>{formatFileSize(attachment.sizeBytes)}</span>
            </a>
            <div className={styles.noticeActions}>{actions}</div>
          </li>
        ))}
      </ul>
    </section>
  )
}

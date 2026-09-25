/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T702b (RF10): escolher os anexos de uma mensagem. O campo é o `FileField` do design
 * system (várias de uma vez, e o mesmo arquivo de novo depois de tirar); o que a API recusaria (tipo,
 * teto do canal, mais de cinco) é recusado aqui, com o motivo, antes de subir.
 */
import { formatFileSize } from '@adatechnology/conversations-ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { Icon } from '@/components/ui/icon'

import {
  CONVERSATION_ATTACHMENT_ACCEPT,
  CONVERSATION_ATTACHMENTS_PER_MESSAGE,
  pickConversationAttachments,
  type ConversationAttachmentChannel,
  type ConversationAttachmentRejection,
} from '../shared/conversationAttachment.service'
import styles from '../styles/occurrenceConversation.module.css'

export function ConversationAttachmentPicker({
  channel,
  disabled,
  files,
  onChange,
}: Readonly<{
  channel: ConversationAttachmentChannel
  disabled: boolean
  files: readonly File[]
  onChange: (files: readonly File[]) => void
}>) {
  const { t } = useTranslation('occurrenceConversation')
  const [rejected, setRejected] = useState<readonly ConversationAttachmentRejection[]>([])

  function add(incoming: readonly File[]): void {
    const picked = pickConversationAttachments({ channel, current: files, incoming })
    setRejected(picked.rejected)
    onChange(picked.files)
  }

  function describe(rejection: ConversationAttachmentRejection): string {
    if (rejection.reason === 'size') {
      return t('attachment.rejected.size', {
        max: formatFileSize(rejection.maxBytes),
        name: rejection.fileName,
      })
    }
    return t(`attachment.rejected.${rejection.reason}`, {
      count: CONVERSATION_ATTACHMENTS_PER_MESSAGE,
      name: rejection.fileName,
    })
  }

  return (
    <div className={styles.attachmentPicker}>
      <FileField
        accept={CONVERSATION_ATTACHMENT_ACCEPT}
        actionLabel={t('attachment.choose')}
        disabled={disabled || files.length >= CONVERSATION_ATTACHMENTS_PER_MESSAGE}
        label={t('attachment.label')}
        multiple
        onSelect={() => undefined}
        onSelectMany={add}
        optional
        optionalMark={t('attachment.optional')}
        placeholder={t('attachment.placeholder', { count: CONVERSATION_ATTACHMENTS_PER_MESSAGE })}
        resetAfterSelect
      />
      {files.length === 0 ? null : (
        <ul aria-label={t('attachment.chosen')} className={styles.attachmentList}>
          {files.map((file, index) => (
            <li className={styles.attachmentItem} key={`${file.name}-${String(index)}`}>
              <Icon name={file.type.startsWith('image/') ? 'image' : 'document'} size="sm" />
              <span className={styles.attachmentName}>{file.name}</span>
              <span className={styles.attachmentSize}>{formatFileSize(file.size)}</span>
              <Button
                aria-label={t('attachment.remove', { name: file.name })}
                disabled={disabled}
                onClick={() => {
                  setRejected([])
                  onChange(files.filter((_, position) => position !== index))
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="close" size="sm" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {rejected.map((rejection) => (
        <p className={styles.error} key={`${rejection.fileName}-${rejection.reason}`} role="alert">
          {describe(rejection)}
        </p>
      ))}
    </div>
  )
}

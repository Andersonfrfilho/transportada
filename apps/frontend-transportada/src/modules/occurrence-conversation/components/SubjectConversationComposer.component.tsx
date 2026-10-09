/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { useSendSubjectMessageMutation } from '../queries/subjectConversation.query'
import {
  recoverFromSendFailure,
  type SendFailureRecovery,
} from '../shared/conversationAttachment.service'
import {
  OCCURRENCE_CONVERSATION_BODY_MAX_LENGTH,
  validateDriverMessageDraft,
} from '../shared/occurrenceConversation.service'
import {
  createSubjectMessageIdempotencyKey,
  resolveSubjectConversationErrorKey,
} from '../shared/subjectConversation.service'
import type { SubjectConversationRef } from '../shared/subjectConversation.types'
import styles from '../styles/occurrenceConversation.module.css'
import { ConversationAttachmentPicker } from './ConversationAttachmentPicker.component'

function newKey(): string {
  return createSubjectMessageIdempotencyKey(() => crypto.randomUUID())
}

/**
 * Spec 260 T3.2: escrever ao motorista na conversa de nota ou de viagem — texto, foto, documento ou
 * áudio, pelo canal app. Uma chave por mensagem escrita: reenviar depois de uma queda de rede não
 * duplica; upload vencido sobe de novo e chave já usada ganha outra (mesma recuperação da 183 T903).
 */
export function SubjectConversationComposer({
  subject,
}: Readonly<{ subject: SubjectConversationRef }>) {
  const { t } = useTranslation('subjectConversation')
  const send = useSendSubjectMessageMutation(subject)
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<readonly File[]>([])
  const [idempotencyKey, setIdempotencyKey] = useState(newKey)
  const [error, setError] = useState<'required' | 'tooLong' | null>(null)
  const [failureReason, setFailureReason] = useState<SendFailureRecovery['reason']>('generic')
  const uploaded = useRef(new Map<File, string>())

  function handleSubmit(): void {
    const validated = validateDriverMessageDraft(draft, files.length)
    if ('error' in validated) {
      setError(validated.error)
      return
    }
    setError(null)
    send.mutate(
      { body: validated.body, files, idempotencyKey, uploaded: uploaded.current },
      {
        onError: (failure) => {
          const recovery = recoverFromSendFailure(failure)
          if (recovery.clearUploads) uploaded.current = new Map()
          if (recovery.renewKey) setIdempotencyKey(newKey())
          setFailureReason(recovery.reason)
        },
        onSuccess: () => {
          setDraft('')
          setFiles([])
          uploaded.current = new Map()
          setIdempotencyKey(newKey())
        },
      },
    )
  }

  return (
    <form
      className={`${styles.panel} ${styles.composer}`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        handleSubmit()
      }}
    >
      <label className={styles.field}>
        <span>{t('composer.message')}</span>
        <textarea
          disabled={send.isPending}
          maxLength={OCCURRENCE_CONVERSATION_BODY_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          value={draft}
        />
        {error === null ? null : (
          <span className={styles.error}>{t(`composer.error.${error}`)}</span>
        )}
      </label>
      <ConversationAttachmentPicker
        allowRecording
        channel="app"
        disabled={send.isPending}
        files={files}
        onChange={setFiles}
      />
      {send.isError ? (
        <p className={styles.error} role="alert">
          {failureReason === 'uploadExpired' || failureReason === 'alreadySent'
            ? t(`sendRecovery.${failureReason}`)
            : t(`error.${resolveSubjectConversationErrorKey(send.error)}`)}
        </p>
      ) : null}
      <div className={styles.footer}>
        <Button disabled={send.isPending} type="submit">
          {send.isPending ? t('composer.sending') : t('composer.send')}
        </Button>
      </div>
    </form>
  )
}

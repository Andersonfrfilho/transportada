/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useMarkContractorReplyHandledMutation } from '../queries/contractorReply.query'
import { validateHandledNote } from '../shared/contractorReply.service'
import { CONTRACTOR_REPLY_HANDLED_NOTE_MAX_LENGTH } from '../shared/contractorReply.types'
import styles from '../styles/occurrenceConversation.module.css'

type ContractorReplyHandledFormProps = Readonly<{
  occurrenceId: string
}>

const NOT_HANDLEABLE_CODE = 'CONTRACTOR_REPLY_NOT_HANDLEABLE'

/** Spec 248 RF6: "Marcar como tratado" pede a nota (1 a 500) e fica com o autor no servidor. */
export function ContractorReplyHandledForm({ occurrenceId }: ContractorReplyHandledFormProps) {
  const { t } = useTranslation('occurrenceConversation')
  const mutation = useMarkContractorReplyHandledMutation(occurrenceId)
  const [isOpen, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<'required' | 'tooLong' | null>(null)

  function handleSubmit(): void {
    const validated = validateHandledNote(draft)
    if ('error' in validated) {
      setError(validated.error)
      return
    }
    setError(null)
    mutation.mutate(validated.note, { onSuccess: () => setOpen(false) })
  }

  if (!isOpen) {
    return (
      <Button onClick={() => setOpen(true)} size="sm" type="button" variant="secondary">
        <Icon name="check" size="sm" />
        {t('contractorReply.handled.open')}
      </Button>
    )
  }

  const failureCode = mutation.error instanceof Error ? mutation.error.message : null
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
        <span>{t('contractorReply.handled.note')}</span>
        <textarea
          aria-describedby="contractor-reply-handled-hint"
          aria-invalid={error !== null}
          disabled={mutation.isPending}
          maxLength={CONTRACTOR_REPLY_HANDLED_NOTE_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          value={draft}
        />
        {error === null ? (
          <span className={styles.hint} id="contractor-reply-handled-hint">
            {t('contractorReply.handled.hint', { max: CONTRACTOR_REPLY_HANDLED_NOTE_MAX_LENGTH })}
          </span>
        ) : (
          <span className={styles.error} id="contractor-reply-handled-hint">
            {t(`contractorReply.handled.error.${error}`, {
              max: CONTRACTOR_REPLY_HANDLED_NOTE_MAX_LENGTH,
            })}
          </span>
        )}
      </label>
      {mutation.isError ? (
        <p className={styles.error} role="alert">
          {failureCode === NOT_HANDLEABLE_CODE
            ? t('contractorReply.handled.error.notHandleable')
            : t('contractorReply.handled.error.send')}
        </p>
      ) : null}
      <div className={styles.footer}>
        <Button
          disabled={mutation.isPending}
          onClick={() => setOpen(false)}
          type="button"
          variant="secondary"
        >
          {t('contractorReply.handled.cancel')}
        </Button>
        <Button disabled={mutation.isPending} type="submit">
          <Icon name="check" size="sm" />
          {mutation.isPending
            ? t('contractorReply.handled.saving')
            : t('contractorReply.handled.confirm')}
        </Button>
      </div>
    </form>
  )
}

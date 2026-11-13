/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPersonName } from '@/lib/personName'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import {
  useContractorNoticeStateQuery,
  useSendContractorNoticeMutation,
} from '../queries/contractorNotice.query'
import type { ContractorNoticeOutcome } from '../shared/contractorNotice.service'
import { OccurrenceConversationRequestError } from '../shared/occurrenceConversationClient.service'
import conversationStyles from '../styles/occurrenceConversation.module.css'
import styles from '../styles/occurrenceDetails.module.css'

type ContractorNoticeSectionProps = Readonly<{ occurrenceId: string }>

type AvailableState = Readonly<{
  channel: 'email' | 'whatsapp_group'
  preview: null | Readonly<{ bodyText: string; subject: null | string }>
  recipientCount: null | number
}>

const KNOWN_FAILURES = new Set([
  'OCCURRENCE_CONTRACTOR_NOTICE_ALREADY_SENT',
  'OCCURRENCE_CONTRACTOR_NOTICE_BLOCKED',
])

function describeOutcome(
  outcome: ContractorNoticeOutcome,
  t: (key: string) => string,
): Readonly<{ isError: boolean; text: string }> {
  if (outcome.kind === 'sent') {
    return { isError: false, text: t(`contractorNotice.outcome.sent.${outcome.channel}`) }
  }
  if (outcome.kind === 'failed')
    return { isError: true, text: t('contractorNotice.outcome.failed') }
  return { isError: true, text: t(`contractorNotice.outcome.skipped.${outcome.reason}`) }
}

/**
 * Spec 324 T4 (RF2): a confirmação mostra o canal (grupo ou e-mails) e o texto do modelo já preenchido, como o
 * servidor vai mandar. Cancelar não envia. O servidor revalida o canal na hora do envio.
 */
function ContractorNoticeDialog({
  available,
  occurrenceId,
  onClose,
}: Readonly<{ available: AvailableState; occurrenceId: string; onClose: () => void }>) {
  const { t } = useTranslation('occurrenceConversation')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })
  const send = useSendContractorNoticeMutation(occurrenceId)
  const [feedback, setFeedback] = useState<Readonly<{ isError: boolean; text: string }> | null>(
    null,
  )
  const channelText =
    available.channel === 'whatsapp_group'
      ? t('contractorNotice.channel.whatsapp_group')
      : t('contractorNotice.channel.email', { count: available.recipientCount ?? 0 })

  function confirm(): void {
    setFeedback(null)
    send.mutate(undefined, {
      onError: (failure) => {
        const code = failure instanceof OccurrenceConversationRequestError ? failure.code : ''
        setFeedback({
          isError: true,
          text: KNOWN_FAILURES.has(code)
            ? t(`contractorNotice.failure.${code}`)
            : t('contractorNotice.failure.generic'),
        })
      },
      onSuccess: (outcome) => {
        if (outcome.kind === 'sent') onClose()
        else setFeedback(describeOutcome(outcome, (key) => t(key)))
      },
    })
  }

  return createPortal(
    <div
      className={`${conversationStyles.overlay} ${conversationStyles.overlayAbove}`}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <div
        aria-labelledby="contractor-notice-title"
        aria-modal="true"
        className={conversationStyles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={conversationStyles.dialogHeader}>
          <div>
            <h2 id="contractor-notice-title">{t('contractorNotice.dialog.title')}</h2>
            <p className={conversationStyles.hint}>{channelText}</p>
          </div>
          <Button
            aria-label={t('contractorNotice.dialog.close')}
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" size="sm" />
          </Button>
        </header>
        <section aria-labelledby="contractor-notice-preview" className={conversationStyles.panel}>
          <h3 className={conversationStyles.hint} id="contractor-notice-preview">
            {t('contractorNotice.dialog.previewTitle')}
          </h3>
          {available.preview === null ? (
            <p className={conversationStyles.hint}>{t('contractorNotice.dialog.noPreview')}</p>
          ) : (
            <pre className={conversationStyles.preview}>
              {available.preview.subject === null
                ? available.preview.bodyText
                : `${available.preview.subject}\n\n${available.preview.bodyText}`}
            </pre>
          )}
        </section>
        <p
          aria-live="polite"
          className={feedback?.isError === true ? conversationStyles.error : ''}
        >
          {feedback?.text ?? ''}
        </p>
        <div className={conversationStyles.footer}>
          <Button onClick={onClose} type="button" variant="ghost">
            {t('contractorNotice.dialog.cancel')}
          </Button>
          <Button disabled={send.isPending} onClick={confirm} type="button">
            {send.isPending
              ? t('contractorNotice.dialog.sending')
              : feedback?.isError === true
                ? t('contractorNotice.dialog.retry')
                : t('contractorNotice.dialog.confirm')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Spec 324 T4 (RF1–RF4, RF6): "Avisar a contratante" no detalhe da ocorrência. Só quem escreve à contratante
 * (`occurrences.resolve`, D9) vê. Tipo marcado pela 321 não mostra botão; sem destinatário ou modelo mostra o motivo
 * (D6); já avisada mostra quem, quando e por qual canal, sem reenvio.
 */
export function ContractorNoticeSection({ occurrenceId }: ContractorNoticeSectionProps) {
  const { t } = useTranslation('occurrenceConversation')
  const formatMoment = useMomentFormatter()
  const permissions = useAuthMeQuery().data?.data.permissions ?? []
  const canNotify = permissions.includes('occurrences.resolve')
  const query = useContractorNoticeStateQuery({ enabled: canNotify, occurrenceId })
  const [isOpen, setOpen] = useState(false)

  if (!canNotify) return null
  if (query.isLoading) return <Skeleton height="2rem" width="100%" />
  if (query.isError) return <p className={styles.hint}>{t('contractorNotice.error')}</p>
  const state = query.data
  if (state === undefined) return null
  if (state.status === 'unavailable' && state.reason === 'blocked') return null

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('contractorNotice.title')}</h3>
      {state.status === 'notified' ? (
        <p className={styles.hint}>
          {t(
            state.by === 'automatic'
              ? 'contractorNotice.notified.automatic'
              : 'contractorNotice.notified.manual',
            {
              at: formatMoment(state.at),
              channel:
                state.channel === null ? '' : t(`contractorNotice.channelName.${state.channel}`),
              name: state.actorName === null ? '' : formatPersonName(state.actorName),
            },
          )}
        </p>
      ) : null}
      {state.status === 'unavailable' ? (
        <p className={styles.hint}>{t(`contractorNotice.unavailable.${state.reason}`)}</p>
      ) : null}
      {state.status === 'available' ? (
        <>
          <div>
            <Button onClick={() => setOpen(true)} size="sm" type="button" variant="secondary">
              <Icon name="send" size="sm" />
              {t('contractorNotice.button')}
            </Button>
          </div>
          {isOpen ? (
            <ContractorNoticeDialog
              available={state}
              occurrenceId={occurrenceId}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      ) : null}
    </section>
  )
}

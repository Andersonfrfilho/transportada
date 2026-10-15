/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantConversationSummary } from '@adatechnology/conversations-ui/participant'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { RouteOccurrenceServerState } from '@/modules/driver-trip/shared/driverRouteOccurrence.types'

import { DRIVER_CONVERSATION_SUBJECT_TYPE } from '../shared/driverConversation.constant'
import styles from '../styles/conversation.module.css'

type DriverComposerLockProps = Readonly<{
  isCancelled: boolean
  onReopen: () => void
}>

/** No lugar do campo de texto: a ocorrência resolvida pede "Reabrir"; a cancelada só avisa (spec 266 RF9). */
export function DriverComposerLock({ isCancelled, onReopen }: DriverComposerLockProps) {
  const { t } = useTranslation('conversation')
  return (
    <div className={styles.composerLock}>
      <p className={styles.composerLockNotice}>
        {t(isCancelled ? 'reopen.lock.cancelled' : 'reopen.lock.resolved')}
      </p>
      {isCancelled ? null : (
        <button className={styles.composerLockButton} type="button" onClick={onReopen}>
          {t('reopen.lock.reopen')}
        </button>
      )}
    </div>
  )
}

export type ComposerLockRendererInput = Readonly<{
  isArmed: (subject: { subjectId: string; subjectType: string }) => boolean
  onReopen: (subject: { subjectId: string; subjectType: string }) => void
  stateByOccurrenceId: ReadonlyMap<string, RouteOccurrenceServerState>
}>

/** Aberta, desconhecida (sem rede ainda) ou já armada: sem trava — o servidor continua sendo quem recusa. */
export function createComposerLockRenderer(
  input: ComposerLockRendererInput,
): (conversation: ParticipantConversationSummary) => ReactNode | undefined {
  return (conversation) => {
    if (conversation.subjectType !== DRIVER_CONVERSATION_SUBJECT_TYPE) return undefined
    const state = input.stateByOccurrenceId.get(conversation.subjectId)
    if (state === 'cancelled') return <DriverComposerLock isCancelled onReopen={noop} />
    if (state !== 'resolved' || input.isArmed(conversation)) return undefined
    return (
      <DriverComposerLock
        isCancelled={false}
        onReopen={() => {
          input.onReopen({
            subjectId: conversation.subjectId,
            subjectType: conversation.subjectType,
          })
        }}
      />
    )
  }
}

function noop(): void {
  return undefined
}

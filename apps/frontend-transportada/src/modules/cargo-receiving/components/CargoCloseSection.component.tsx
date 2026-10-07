/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX, RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useCargoOccurrence } from '../hooks/useCargoOccurrence.hook'
import { listCloseBlockers } from '../shared/cargoNoteActions.service'
import type { DocumentReference, PendingDocument } from '../shared/cargoReceivingRefusal.service'
import { DOCUMENT_ATTRIBUTE, focusCargoTarget } from '../shared/focusCargoTarget.service'
import officeStyles from '../styles/cargoOccurrenceOffice.module.css'
import styles from '../styles/cargoReceiving.module.css'

type CargoCloseSectionProps = Readonly<{
  documents: readonly DocumentReference[]
  errorCode: string | undefined
  isWorking: boolean
  onClose: () => void
  panelRef: RefObject<HTMLElement | null>
  pending: readonly PendingDocument[]
}>

/** Fechar exige tudo separado; o 409 devolve TODAS as pendentes, e cada uma é um atalho para a linha. */
export function CargoCloseSection({
  documents,
  errorCode,
  isWorking,
  onClose,
  panelRef,
  pending,
}: CargoCloseSectionProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const { returns } = useCargoOccurrence()
  // A nota a devolver espera o contratante; fechada, ficaria presa para sempre — o motivo vem ANTES do clique.
  const blockers = listCloseBlockers({
    documents: documents.map(({ id, number }) => ({ nfeDocumentId: id, number })),
    returns,
  })

  return (
    <section className={styles.actions}>
      <Button
        disabled={isWorking || blockers.length > 0}
        onClick={onClose}
        type="button"
        variant="secondary"
      >
        <Icon name="stop" />
        {isWorking ? t('actions.closing') : t('actions.close')}
      </Button>
      {blockers.length > 0 ? (
        <p className={officeStyles.blockers} data-close-blockers="">
          {t('occurrence.blockers.lead')}{' '}
          {blockers.map((item, index) => (
            <span key={item.documentId}>
              {index === 0 ? null : ', '}
              <button
                className={styles.refusalShortcut}
                onClick={() =>
                  focusCargoTarget({
                    attribute: DOCUMENT_ATTRIBUTE,
                    panel: panelRef.current,
                    value: item.documentId,
                  })
                }
                type="button"
              >
                {t('occurrence.blockers.shortcut', { number: item.number })}
              </button>
            </span>
          ))}
          .
        </p>
      ) : null}
      {pending.length > 0 ? (
        <p className={styles.refusal} data-pending-documents="">
          {t('actions.pendingLead')}{' '}
          {pending.map((item, index) => (
            <span key={item.documentId}>
              {index === 0 ? null : ', '}
              <button
                className={styles.refusalShortcut}
                onClick={() =>
                  focusCargoTarget({
                    attribute: DOCUMENT_ATTRIBUTE,
                    panel: panelRef.current,
                    value: item.documentId,
                  })
                }
                type="button"
              >
                {t('actions.pendingShortcut', { number: item.number })}
              </button>
            </span>
          ))}
          .
        </p>
      ) : errorCode === undefined ? null : (
        <p className={styles.error} role="alert">
          {t([`errors.${errorCode}`, 'errors.unknown'], { code: errorCode })}
        </p>
      )}
    </section>
  )
}

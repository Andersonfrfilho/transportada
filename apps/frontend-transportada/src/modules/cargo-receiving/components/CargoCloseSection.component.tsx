/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX, RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { PendingDocument } from '../shared/cargoReceivingRefusal.service'
import { DOCUMENT_ATTRIBUTE, focusCargoTarget } from '../shared/focusCargoTarget.service'
import styles from '../styles/cargoReceiving.module.css'

type CargoCloseSectionProps = Readonly<{
  errorCode: string | undefined
  isWorking: boolean
  onClose: () => void
  panelRef: RefObject<HTMLElement | null>
  pending: readonly PendingDocument[]
}>

/** Fechar exige tudo separado; o 409 devolve TODAS as pendentes, e cada uma é um atalho para a linha. */
export function CargoCloseSection({
  errorCode,
  isWorking,
  onClose,
  panelRef,
  pending,
}: CargoCloseSectionProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')

  return (
    <section className={styles.actions}>
      <Button disabled={isWorking} onClick={onClose} type="button" variant="secondary">
        <Icon name="stop" />
        {isWorking ? t('actions.closing') : t('actions.close')}
      </Button>
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

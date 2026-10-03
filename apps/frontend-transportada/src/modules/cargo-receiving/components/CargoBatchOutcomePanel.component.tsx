/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX, RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { CargoDocumentOutcome } from '../shared/cargoArrival.types'
import {
  describeBatchOutcomes,
  type DocumentReference,
} from '../shared/cargoReceivingRefusal.service'
import { DOCUMENT_ATTRIBUTE, focusCargoTarget } from '../shared/focusCargoTarget.service'
import styles from '../styles/cargoReceiving.module.css'
import detailStyles from '../styles/cargoDetail.module.css'

type CargoBatchOutcomePanelProps = Readonly<{
  documents: readonly DocumentReference[]
  onDismiss: () => void
  outcomes: readonly CargoDocumentOutcome[]
  panelRef: RefObject<HTMLElement | null>
}>

/**
 * O resultado do lote tem uma linha por nota: uma recusada nunca esconde as outras. Cada recusada diz o
 * motivo e é um atalho que leva o foco à linha dela.
 */
export function CargoBatchOutcomePanel({
  documents,
  onDismiss,
  outcomes,
  panelRef,
}: CargoBatchOutcomePanelProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const summary = describeBatchOutcomes({ documents, results: outcomes })

  return (
    <section className={detailStyles.outcome} data-batch-outcome="">
      <div className={detailStyles.outcomeHead}>
        <h3>{t('outcome.title')}</h3>
        <Button aria-label={t('outcome.dismiss')} onClick={onDismiss} type="button" variant="ghost">
          <Icon name="close" />
        </Button>
      </div>
      <p>
        {t('outcome.summary', {
          changed: summary.changedCount,
          refused: summary.refused.length,
          unchanged: summary.unchangedCount,
        })}
      </p>
      {summary.refused.length === 0 ? null : (
        <>
          <p className={styles.refusal}>{t('outcome.refusedLead')}</p>
          <ul className={styles.refusalList}>
            {summary.refused.map((item) => (
              <li data-refused-document="" key={item.documentId}>
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
                  {t('outcome.refusedShortcut', { number: item.number })}
                </button>{' '}
                {t(`refusal.reasons.${item.reason}`, { defaultValue: item.reason })}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

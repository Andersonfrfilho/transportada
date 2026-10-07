/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { useCargoOccurrence } from '../hooks/useCargoOccurrence.hook'
import type { CargoArrivalDocument } from '../shared/cargoArrival.types'
import styles from '../styles/cargoOccurrence.module.css'
import { CargoNoteActionButtons } from './CargoNoteActionButtons.component'
import { CargoNoteBadge } from './CargoNoteBadge.component'
import { CargoNoteFailure } from './CargoNoteFailure.component'
import { CargoReturnMarkPanel } from './CargoReturnMarkPanel.component'

type CargoNoteOccurrenceActionsProps = Readonly<{
  document: CargoArrivalDocument
  /** Só o celular do separador abre avaria; o escritório marca, desfaz e conclui. */
  showOpen: boolean
}>

/**
 * A avaria e a devolução de UMA nota: o selo da situação, as ações que o papel e o estado permitem, a espera
 * pela decisão do contratante e o que o servidor recusou. A devolvida é terminal: não sobra nenhum botão.
 */
export function CargoNoteOccurrenceActions({
  document,
  showOpen,
}: CargoNoteOccurrenceActionsProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const occurrence = useCargoOccurrence()
  const [isMarking, setIsMarking] = useState(false)
  const { actions } = occurrence.noteOf(document)
  const id = document.nfeDocumentId
  const { errors, pendingIds, retry, run } = occurrence.returnActions
  const failure = errors.get(id)
  const isPending = pendingIds.has(id)

  return (
    <div className={styles.noteActions} data-note-actions="">
      <div className={styles.noteBadges}>
        <CargoNoteBadge badge={actions.badge} />
      </div>
      <CargoNoteActionButtons
        actions={actions}
        isMarking={isMarking}
        isPending={isPending}
        number={document.number}
        onComplete={() => void run({ action: 'complete', documentId: id, note: '' })}
        onMark={() => setIsMarking(true)}
        onOpen={showOpen ? () => occurrence.openForm(document) : undefined}
        onUnmark={() => void run({ action: 'unmark', documentId: id, note: '' })}
      />
      {showOpen && actions.isWindowClosed ? (
        <p className={styles.noteHint}>{t('occurrence.hints.windowClosedShort')}</p>
      ) : null}
      {actions.isAwaitingDecision ? (
        <p className={styles.noteHint}>{t('occurrence.hints.awaitingDecision')}</p>
      ) : null}
      {actions.isReturnCaseCancelled ? (
        <p className={styles.noteHint}>{t('occurrence.hints.returnCaseCancelled')}</p>
      ) : null}
      {isMarking && actions.canMark ? (
        <CargoReturnMarkPanel
          isPending={isPending}
          occurrences={actions.markableOccurrences}
          onCancel={() => setIsMarking(false)}
          onConfirm={({ note, occurrenceId }) =>
            void run({ action: 'mark', documentId: id, note, occurrenceId }).then((isDone) => {
              if (isDone) setIsMarking(false)
            })
          }
        />
      ) : null}
      {failure === undefined ? null : (
        <CargoNoteFailure code={failure} number={document.number} onRetry={() => retry(id)} />
      )}
    </div>
  )
}

/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

import type { TypedNoteFeedback } from '../shared/tripNoteLookup.service'
import styles from '../styles/trip.module.css'

type TripTypedNoteFeedbackProps = Readonly<{
  /** Ícone do botão de cada opção: `add` onde a escolha entra na fila, `link` onde ela vincula. */
  icon?: 'add' | 'link'
  note: TypedNoteFeedback | undefined
  onPick: (document: NfeDocumentListItem) => void
}>

/**
 * Resposta da inserção rápida a um número de nota que não virou linha: aviso quando não há nota
 * livre com ele, e a lista para escolher quando há mais de uma — sempre com emitente e destinatário
 * à vista, que é o que separa duas notas de mesmo número.
 */
export function TripTypedNoteFeedback({ icon = 'add', note, onPick }: TripTypedNoteFeedbackProps) {
  const { t } = useTranslation('trip')

  if (note === undefined) return null

  if (note.kind !== 'ambiguous') {
    return (
      <p className={styles.alert} role="alert">
        {t(`quickCreate.typed.${note.kind}`)}
      </p>
    )
  }

  return (
    <div
      className={styles.linkDocumentsBody}
      role="group"
      aria-label={t('quickCreate.typed.pickTitle')}
    >
      <p className={styles.hint}>
        {t('quickCreate.typed.ambiguous', { count: note.candidates.length })}
      </p>
      {note.candidates.map((candidate) => (
        <Button
          key={candidate.id}
          onClick={() => onPick(candidate)}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name={icon} />
          {t('quickCreate.typed.option', {
            emitter: candidate.emitterName,
            number: candidate.number,
            recipient: candidate.recipientName,
            series: candidate.series,
          })}
        </Button>
      ))}
    </div>
  )
}

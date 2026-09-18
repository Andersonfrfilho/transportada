/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { ProofPunctuality } from '../shared/driverTrip.types'
import type { ProofDocumentLabel } from '../shared/driverTripView.service'
import styles from '../styles/driverTrip.module.css'

type DriverProofOutcomeNoticeProps = Readonly<{
  label: ProofDocumentLabel | undefined
  onDismiss: () => void
  outcome: ProofPunctuality
}>

const GOOD_OUTCOMES: readonly ProofPunctuality[] = ['on_time', 'not_required']

/**
 * Spec 157 (T11/T12): o veredito da foto, fora da lista de pendentes, até ser dispensado. Nomeia a
 * nota — com três avisos na tela, "registrada fora do prazo" sozinho não diz qual foi — e separa a
 * notícia boa da ruim por ícone e texto, com a cor só reforçando.
 */
export function DriverProofOutcomeNotice({
  label,
  onDismiss,
  outcome,
}: DriverProofOutcomeNoticeProps) {
  const { t } = useTranslation('driverTrip')
  const isGood = GOOD_OUTCOMES.includes(outcome)

  return (
    <div
      className={`${styles.proofOutcomeToast} ${isGood ? styles.proofOutcomeToastGood : ''}`}
      role="status"
    >
      <p className={styles.proofOutcomeText}>
        {label === undefined ? null : (
          <span className={styles.proofOutcomeTitle}>
            <Icon name={isGood ? 'check' : 'alert'} />
            {t('pendingProofs.outcomeFor', {
              number: label.number,
              recipient: label.recipientName,
              series: label.series,
            })}
          </span>
        )}
        <span>{t(`pendingProofs.outcome.${outcome}`)}</span>
      </p>
      <Button
        aria-label={t('pendingProofs.outcomeDismiss')}
        onClick={onDismiss}
        type="button"
        variant="ghost"
      >
        <Icon name="close" />
      </Button>
    </div>
  )
}

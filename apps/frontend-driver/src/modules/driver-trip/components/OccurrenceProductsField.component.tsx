/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from '../styles/driverTrip.module.css'

type OccurrenceProductsFieldProps = Readonly<{
  isMarked: boolean
  onToggle: () => void
}>

/**
 * Spec 246 (RF1b, RF1c2): o tipo exige produtos. O snapshot não traz a lista de itens da nota, então
 * o motorista aponta a **nota inteira** — que satisfaz qualquer mínimo, porque o servidor soma todos
 * os itens dela. O alvo é de 44px, como os chips de tipo.
 */
export function OccurrenceProductsField({ isMarked, onToggle }: OccurrenceProductsFieldProps) {
  const { t } = useTranslation('driverTrip')

  return (
    <div className={styles.proofCapture}>
      <p className={styles.proofCaptureTitle}>{t('occurrenceRegistration.products.title')}</p>
      <Button
        aria-checked={isMarked}
        className={styles.occurrenceChip}
        onClick={onToggle}
        role="checkbox"
        type="button"
        variant={isMarked ? 'default' : 'ghost'}
      >
        {isMarked ? <Icon name="check" /> : null}
        {t('documentOccurrenceWholeDocument')}
      </Button>
    </div>
  )
}

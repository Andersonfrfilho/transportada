/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { CanhotoReplacePrompt } from '../shared/canhotoReplacePrompt.service'
import styles from '../styles/driverTrip.module.css'

type DriverCanhotoReplaceDialogProps = Readonly<{
  onKeep: (eventKey: string) => void
  onReplace: (eventKey: string) => void
  prompt: CanhotoReplacePrompt
}>

/** Spec 294 RF26/RF27: a nota já tem outro canhoto; trocar vai para conferência do escritório e pede confirmação. */
export function DriverCanhotoReplaceDialog({
  onKeep,
  onReplace,
  prompt,
}: DriverCanhotoReplaceDialogProps) {
  const { t } = useTranslation('driverTrip')

  return (
    <section
      aria-label={t('canhotoReplace.title')}
      className={styles.rejectedBanner}
      role="alertdialog"
    >
      <h3>{t('canhotoReplace.title')}</h3>
      <p>{t('canhotoReplace.body')}</p>
      <div className={styles.actions}>
        <Button onClick={() => onReplace(prompt.eventKey)} type="button">
          <Icon name="check" />
          {t('canhotoReplace.confirm')}
        </Button>
        <Button onClick={() => onKeep(prompt.eventKey)} type="button" variant="ghost">
          <Icon name="close" />
          {t('canhotoReplace.keep')}
        </Button>
      </div>
    </section>
  )
}

/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import styles from '../styles/fieldDeliveryWizard.module.css'

export type FieldDeliveryWizardHeaderProps = Readonly<{
  driverId: string
  drivers: readonly Readonly<{ driverId: string; driverName: string }>[]
  hasMultipleDrivers: boolean
  hasPreviousStep: boolean
  onClose: () => void
  onDriverChange: (driverId: string) => void
  onPreviousStep: () => void
  titleId: string
}>

/**
 * Spec 156 T11/D3: título, fechar, voltar ao passo anterior e o seletor de motorista (T8) — só
 * quando a viagem tem mais de um. O mesmo motorista vale para todos os rascunhos desta sessão.
 */
export function FieldDeliveryWizardHeader({
  driverId,
  drivers,
  hasMultipleDrivers,
  hasPreviousStep,
  onClose,
  onDriverChange,
  onPreviousStep,
  titleId,
}: FieldDeliveryWizardHeaderProps) {
  const { t } = useTranslation('trip')

  return (
    <>
      <div className={styles.head}>
        <h2 className={styles.title} id={titleId}>
          <Icon name="camera" />
          {t('fieldDelivery.title')}
        </h2>
        <Button
          aria-label={t('fieldDelivery.close')}
          onClick={onClose}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="close" />
        </Button>
      </div>

      {hasPreviousStep ? (
        /**
         * Achado da revisão de design da própria T11: botão solto filho direto do `_dialog_`
         * (flex-column) esticava para 100% da largura — os vizinhos (`TripConfirmDialog`,
         * `FieldOccurrenceDialog`) sempre envolvem o botão numa faixa `flex-row`. Reaproveita
         * `captureActions` em vez de criar uma classe só para isto.
         */
        <div className={styles.captureActions}>
          <Button onClick={onPreviousStep} size="sm" type="button" variant="secondary">
            <Icon name="chevron-left" />
            {t('fieldDelivery.previousStep')}
          </Button>
        </div>
      ) : null}

      {hasMultipleDrivers ? (
        <label>
          {t('fieldActions.driverLabel')}
          <Select
            ariaLabel={t('fieldActions.driverLabel')}
            onChange={onDriverChange}
            options={drivers.map((driver) => ({
              label: driver.driverName,
              value: driver.driverId,
            }))}
            value={driverId}
          />
        </label>
      ) : null}
    </>
  )
}

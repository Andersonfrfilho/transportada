/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { FleetDriverDetail, FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { TripRouteAssemblyController } from '../hooks/useTripRouteAssembly.hook'
import styles from '../styles/trip.module.css'
import { TripRouteAssemblyPanel } from './TripRouteAssemblyPanel.component'

type TripRouteAssemblyDialogProps = Readonly<{
  assembly: TripRouteAssemblyController
  drivers: readonly FleetDriverDetail[]
  vehicles: readonly FleetVehicleDetail[]
}>

/**
 * O roteiro por faixa entra pela mesma porta da criação manual: os dois montam viagem, e deixar um
 * aberto na tela e o outro atrás de um botão fazia a listagem de viagens começar com dois
 * formulários antes da primeira linha da tabela.
 */
export function TripRouteAssemblyDialog({
  assembly,
  drivers,
  vehicles,
}: TripRouteAssemblyDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: assembly.isOpen,
    onClose: assembly.close,
  })

  if (!assembly.isOpen) return null

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-route-assembly-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="trip-route-assembly-title">{t('routeAssembly.title')}</h2>
            <p className={styles.hint}>{t('routeAssembly.intro')}</p>
          </div>
          <Button
            aria-label={t('quickCreate.close')}
            onClick={assembly.close}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </header>

        <TripRouteAssemblyPanel assembly={assembly} drivers={drivers} vehicles={vehicles} />

        <div className={styles.dialogFooter}>
          <Button onClick={assembly.close} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('quickCreate.cancel')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

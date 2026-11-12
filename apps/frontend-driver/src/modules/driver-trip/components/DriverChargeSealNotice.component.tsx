/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type { DriverClientChargeSeal } from '../shared/driverTrip.types'
import styles from '../styles/holidayNotice.module.css'

type DriverChargeSealNoticeProps = Readonly<{
  seal: DriverClientChargeSeal | undefined
}>

/**
 * Spec 317 (E7, RF13, T14a): o cliente da parada foi marcado pelo escritório como "possível cobrança na entrega".
 * Somente leitura: sem toque, sem foco e sem decidir ação — só o escritório limpa a marca, e o servidor só manda o selo
 * quando o tipo liga o aviso ao motorista. Mesmo véu neutro do aviso de feriado.
 */
export function DriverChargeSealNotice({ seal }: DriverChargeSealNoticeProps) {
  const { t } = useTranslation('driverTrip')
  if (seal === undefined) return null

  return (
    <aside aria-label={t('chargeSeal.label')} className={styles.holidayNotice}>
      <p className={styles.holidayNoticeLine}>
        <Icon aria-hidden="true" name="alert" size="sm" />
        <span>{t('chargeSeal.text')}</span>
      </p>
    </aside>
  )
}

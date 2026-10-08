/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { MaterializationController } from '../hooks/useMaterialization.hook'
import styles from '../styles/businessCalendar.module.css'

import { HolidayRefusal } from './HolidayRefusal.component'

type MunicipalHorizonNoticeProps = Readonly<{
  controller: MaterializationController
  coveredThroughYear: number
  hasShortHorizon: boolean
}>

/**
 * Sem rotina agendada (ADR-0096 §6), o horizonte de 10 anos acaba e é a tela quem avisa: abaixo do ano corrente + 2
 * ela diz até que ano as datas foram geradas e oferece a ação idempotente. O resultado e a falha são ditos.
 */
export function MunicipalHorizonNotice({
  controller,
  coveredThroughYear,
  hasShortHorizon,
}: MunicipalHorizonNoticeProps) {
  const { t } = useTranslation('businessCalendar')
  const { summary } = controller

  return (
    <>
      {hasShortHorizon ? (
        <div className={styles.horizonNotice} data-horizon-notice="" role="status">
          <p>{t('municipal.horizon.notice', { year: coveredThroughYear })}</p>
          <div className={styles.actions}>
            <Button
              disabled={controller.isRunning}
              onClick={() => void controller.run()}
              type="button"
              variant="secondary"
            >
              <Icon name="refresh" />
              {controller.isRunning
                ? t('municipal.horizon.running')
                : t('municipal.horizon.action')}
            </Button>
          </div>
        </div>
      ) : null}
      {summary === undefined ? null : (
        <p className={styles.status} data-horizon-result="" role="status">
          {summary.holidaysCreated === 0
            ? t('municipal.horizon.none')
            : t('municipal.horizon.created', {
                count: summary.holidaysCreated,
                rules: summary.rulesProcessed,
              })}
        </p>
      )}
      {controller.refusal === undefined ? null : <HolidayRefusal refusal={controller.refusal} />}
    </>
  )
}

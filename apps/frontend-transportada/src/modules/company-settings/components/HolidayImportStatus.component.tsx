/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useHolidayImportStatusQuery } from '../queries/useHolidayImport.query'
import { useHolidayProviderSettingsQuery } from '../queries/useHolidayProviderSettings.query'
import { describeBusinessCalendarRefusal } from '../shared/businessCalendarRefusal.service'
import businessCalendarStyles from '../styles/businessCalendar.module.css'

import { HolidayImportStatusBody } from './HolidayImportStatusBody.component'
import { HolidayOriginLegend } from './HolidayOriginLegend.component'
import { HolidayRefusal } from './HolidayRefusal.component'

const SKELETON_ROWS = 3

type HolidayImportStatusProps = Readonly<{ companyId: string | undefined; enabled: boolean }>

/**
 * "Importação de feriados" (spec 252 T5.2, RF9): o que a FeriadosAPI faz pelo calendário, o que cada origem quer dizer e
 * o estado da rotina. Carregando é esqueleto na forma do bloco; falha diz o motivo e oferece tentar de novo.
 */
export function HolidayImportStatus({ companyId, enabled }: HolidayImportStatusProps) {
  const { t } = useTranslation('businessCalendar')
  const query = useHolidayImportStatusQuery({ companyId, enabled })
  // O bloco da chave lê a mesma configuração: "sem chave" e "orçamento atingido" dependem dela, o `status` não as traz.
  const settings = useHolidayProviderSettingsQuery({ companyId, enabled })
  // Sem esperar a configuração o cartão piscaria "em dia" e viraria "sem chave" meio segundo depois.
  const isLoading = query.isPending || (query.data !== undefined && settings.isPending)

  return (
    <section aria-labelledby="holiday-import-title" className={businessCalendarStyles.block}>
      <h3 id="holiday-import-title">{t('import.title')}</h3>
      <p className={businessCalendarStyles.hint}>{t('import.hint')}</p>
      <HolidayOriginLegend />
      {isLoading ? (
        <SkeletonGroup label={t('import.status.loading')}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton height="var(--control-height-compact)" key={index} width="100%" />
          ))}
        </SkeletonGroup>
      ) : null}
      {query.isError ? (
        <div className={businessCalendarStyles.actions}>
          <HolidayRefusal refusal={describeBusinessCalendarRefusal(query.error)} />
          <Button onClick={() => void query.refetch()} type="button" variant="secondary">
            <Icon name="refresh" />
            {t('list.retry')}
          </Button>
        </div>
      ) : null}
      {query.data === undefined || settings.isPending ? null : (
        <HolidayImportStatusBody settings={settings.data} status={query.data} />
      )}
    </section>
  )
}

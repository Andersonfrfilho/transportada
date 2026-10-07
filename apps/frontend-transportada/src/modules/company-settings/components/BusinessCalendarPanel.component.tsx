/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { useBusinessCalendarPanel } from '../hooks/useBusinessCalendarPanel.hook'
import styles from '../styles/businessCalendar.module.css'

import { MunicipalHolidaySection } from './MunicipalHolidaySection.component'
import { SaturdayBlock } from './SaturdayBlock.component'
import { StateHolidaySection } from './StateHolidaySection.component'

export type BusinessCalendarPanelProps = Readonly<{
  canManage: boolean
  companyId: string | undefined
}>

/**
 * Aba "Calendário" de Configurações (spec 238 Fase 2): o sábado, os feriados municipais (com o aniversário da
 * cidade) e os estaduais, que o prazo de entrega em dias úteis conta. Só com `settings.manage`: sem a permissão não
 * há bloco e não há chamada à API. O aviso fixo diz o que cada feriado fecha — o roteiro lê só as datas geradas
 * pelas regras municipais.
 */
export function BusinessCalendarPanel({ canManage, companyId }: BusinessCalendarPanelProps) {
  const { t } = useTranslation('businessCalendar')
  const panel = useBusinessCalendarPanel({ canManage, companyId })

  return (
    <section aria-labelledby="business-calendar-title" className={styles.panel}>
      <div className={styles.panelHeading}>
        <p className={styles.kicker}>{t('panel.kicker')}</p>
        <h2 id="business-calendar-title">{t('panel.title')}</h2>
        <p className={styles.hint}>{t('panel.hint')}</p>
      </div>
      {canManage ? (
        <>
          <p className={styles.routingNotice}>
            {t('notice.routing', { year: panel.coveredThroughYear })}
          </p>
          <SaturdayBlock companyId={companyId} enabled />
          <MunicipalHolidaySection companyId={companyId} enabled />
          <StateHolidaySection companyId={companyId} enabled />
        </>
      ) : (
        <p className={styles.alert} role="alert">
          {t('panel.forbidden')}
        </p>
      )}
    </section>
  )
}

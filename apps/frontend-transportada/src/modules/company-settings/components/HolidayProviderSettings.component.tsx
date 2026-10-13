/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useHolidayProviderActions } from '../hooks/useHolidayProviderActions.hook'
import { useHolidayImportStatusQuery } from '../queries/useHolidayImport.query'
import { useHolidayProviderSettingsQuery } from '../queries/useHolidayProviderSettings.query'
import { describeBusinessCalendarRefusal } from '../shared/businessCalendarRefusal.service'
import businessCalendarStyles from '../styles/businessCalendar.module.css'

import { HolidayImportToggle } from './HolidayImportToggle.component'
import { HolidayProviderForm } from './HolidayProviderForm.component'
import { HolidayProviderRemovalDialog } from './HolidayProviderRemovalDialog.component'
import { HolidayProviderSummary } from './HolidayProviderSummary.component'
import { HolidayRefusal } from './HolidayRefusal.component'

const SKELETON_ROWS = 3
const NEVER_SAVED_KEY = 'never-saved'

type HolidayProviderSettingsProps = Readonly<{
  /** `holiday-import.configure`: sem ela o bloco só mostra o estado. */
  canConfigure: boolean
  companyId: string | undefined
  enabled: boolean
}>

/**
 * "Chave da FeriadosAPI" (spec 262, RF11): a chave e o orçamento mensal da INSTALAÇÃO e o liga/desliga da importação da
 * empresa. A chave nunca volta da API nem ao campo — só a dica dos quatro últimos caracteres. Salvar não liga a busca:
 * a rotina nasce pausada e é despausada em Operações, e o texto fixo do bloco diz isso.
 */
export function HolidayProviderSettings({
  canConfigure,
  companyId,
  enabled,
}: HolidayProviderSettingsProps) {
  const { t } = useTranslation('businessCalendar')
  const query = useHolidayProviderSettingsQuery({ companyId, enabled })
  const status = useHolidayImportStatusQuery({ companyId, enabled })
  const actions = useHolidayProviderActions({ companyId })
  const settings = query.data

  return (
    <section aria-labelledby="holiday-provider-title" className={businessCalendarStyles.block}>
      <h3 id="holiday-provider-title">{t('providerSettings.title')}</h3>
      <p className={businessCalendarStyles.hint}>{t('providerSettings.hint')}</p>
      {query.isPending ? (
        <SkeletonGroup label={t('providerSettings.loading')}>
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
      {settings === undefined ? null : (
        <>
          <HolidayProviderSummary
            monthlyRequests={status.data?.monthlyRequests}
            settings={settings}
          />
          {canConfigure ? (
            <HolidayProviderForm
              actions={actions}
              key={settings.version ?? NEVER_SAVED_KEY}
              settings={settings}
            />
          ) : (
            <p className={businessCalendarStyles.hint}>{t('providerSettings.readOnly')}</p>
          )}
        </>
      )}
      <HolidayProviderRemovalDialog actions={actions} />
      <HolidayImportToggle companyId={companyId} enabled={enabled} />
    </section>
  )
}

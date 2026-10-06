/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs } from '@/components/ui/tabs'

import {
  buildTripOccurrencesTabSearch,
  listTripOccurrencesTabs,
  readTripOccurrencesTabParameter,
  resolveTripOccurrencesTab,
  type TripOccurrencesTabId,
} from '../shared/tripOccurrencesTabs.service'
import { TripOccurrenceTypesTab } from './TripOccurrenceTypesTab.component'

type TripOccurrencesTabsProps = Readonly<{
  canManageSettings: boolean
  feedPanel: ReactNode
}>

/**
 * As abas Feed e Tipos de `/ocorrencias`. A aba Tipos só aparece para quem tem `settings.manage` (sem
 * ela o painel abria vazio), e a escolhida vai para a URL.
 */
export function TripOccurrencesTabs({ canManageSettings, feedPanel }: TripOccurrencesTabsProps) {
  const { t } = useTranslation('trip')
  const tabs = listTripOccurrencesTabs({ canManageSettings })
  const [requestedTab, setRequestedTab] = useState<null | string>(() =>
    readTripOccurrencesTabParameter(window.location.search),
  )
  const activeTab = resolveTripOccurrencesTab({ tabs, value: requestedTab })

  function handleChange(id: string) {
    const next: TripOccurrencesTabId = resolveTripOccurrencesTab({ tabs, value: id })
    setRequestedTab(next)
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${buildTripOccurrencesTabSearch(next)}`,
    )
  }

  return (
    <Tabs
      ariaLabel={t('occurrenceFeed.title')}
      items={tabs.map((tab) => ({
        id: tab,
        label: tab === 'feed' ? t('occurrenceFeed.tabs.feed') : t('occurrenceFeed.tabs.types'),
        panel:
          tab === 'feed' ? feedPanel : <TripOccurrenceTypesTab canManage={canManageSettings} />,
      }))}
      onChange={handleChange}
      value={activeTab}
    />
  )
}

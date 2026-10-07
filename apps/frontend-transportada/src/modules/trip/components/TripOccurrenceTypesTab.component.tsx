/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useOccurrenceTypeCatalogPanel } from '../hooks/useOccurrenceTypeCatalogPanel.hook'
import { readOccurrenceTypeLoadStatus } from '../shared/occurrenceTypeLoadStatus.service'
import { resolveTripFeedbackKey } from '../shared/tripFeedback.service'
import { OccurrenceTypeCatalogPanel } from './OccurrenceTypeCatalogPanel.component'

type TripOccurrenceTypesTabProps = Readonly<{
  canManage: boolean
}>

/**
 * Spec 246 RF10: o cadastro dos tipos mora na aba Tipos de Ocorrências. A consulta só liga quando a
 * aba está montada — `Tabs` monta só o painel ativo — e com `settings.manage`.
 */
export function TripOccurrenceTypesTab({ canManage }: TripOccurrenceTypesTabProps) {
  const { isSaving, query, saveMutation, saveType } = useOccurrenceTypeCatalogPanel({
    enabled: canManage,
  })

  return (
    <OccurrenceTypeCatalogPanel
      canManage={canManage}
      isSaving={isSaving}
      loadStatus={canManage ? readOccurrenceTypeLoadStatus(query) : 'ready'}
      onRetry={() => void query.refetch()}
      onSave={saveType}
      saveFeedbackKey={resolveTripFeedbackKey(saveMutation.error)}
      types={query.data ?? []}
    />
  )
}

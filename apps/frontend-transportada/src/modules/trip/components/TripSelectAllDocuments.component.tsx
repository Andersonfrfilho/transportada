import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'

import type { TripDocumentSelectionController } from '../hooks/useTripDocumentSelection.hook'

type TripSelectAllDocumentsProps = Readonly<{
  documentIds: readonly string[]
  selection: TripDocumentSelectionController
}>

/** Caixa única da viagem: soma a das paradas e a das notas sem parada, pelo mesmo `toggleMany`. */
export function TripSelectAllDocuments({ documentIds, selection }: TripSelectAllDocumentsProps) {
  const { t } = useTranslation('trip')
  const allSelected =
    documentIds.length > 0 &&
    documentIds.every((documentId) => selection.selectedIds.has(documentId))
  const someSelected = documentIds.some((documentId) => selection.selectedIds.has(documentId))

  if (documentIds.length === 0) return null

  return (
    <Checkbox
      checked={allSelected}
      indeterminate={someSelected && !allSelected}
      label={t('stops.selectAllTrip')}
      onChange={(checked) => selection.toggleMany(documentIds, checked)}
    />
  )
}

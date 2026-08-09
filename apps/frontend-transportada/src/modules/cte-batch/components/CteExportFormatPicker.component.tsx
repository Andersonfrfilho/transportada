/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import { CTE_EXPORT_FORMATS, type CteExportFormat } from '../shared/cteBatchItemExport.service'

type CteExportFormatPickerProps = Readonly<{
  onChange: (format: CteExportFormat) => void
  value: CteExportFormat
  disabled?: boolean
}>

function isCteExportFormat(value: string): value is CteExportFormat {
  return CTE_EXPORT_FORMATS.some((format) => format === value)
}

export function CteExportFormatPicker({
  disabled = false,
  onChange,
  value,
}: CteExportFormatPickerProps) {
  const { t } = useTranslation('cteBatch')

  return (
    <Select
      ariaLabel={t('cteItems.export.format.label')}
      compact
      disabled={disabled}
      onChange={(selected) => {
        if (isCteExportFormat(selected)) onChange(selected)
      }}
      options={CTE_EXPORT_FORMATS.map((format) => ({
        label: t(`cteItems.export.format.${format}`),
        value: format,
      }))}
      value={value}
    />
  )
}

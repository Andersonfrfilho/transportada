/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FileField } from '@/components/ui/file-field'

import { isDocumentBlocked } from '../hooks/useNfeDocumentTable.hook'
import {
  selectDocumentsBySheet,
  type SheetSelection,
} from '../shared/documentSelectionBySheet.service'
import type { NfeDocumentListItem } from '../shared/nfeWorkspaceClient.service'
import { readInvoiceNumbersFromWorkbook } from '../shared/workbookInvoiceNumbers.service'
import styles from '../styles/nfeWorkspace.module.css'

const MISSING_PREVIEW_LIMIT = 8

type NfeSheetSelectionActionProps = Readonly<{
  documents: readonly NfeDocumentListItem[]
  onSelect: (ids: readonly string[]) => void
}>

/**
 * A planilha semanal do contratante diz quais notas entram. Escolher o arquivo seleciona só essas
 * notas na tabela; quem emite continua sendo "Gerar CT-es", que já mostra a prévia e pede a
 * confirmação — esta ação nunca emite nada.
 */
export function NfeSheetSelectionAction({ documents, onSelect }: NfeSheetSelectionActionProps) {
  const { t } = useTranslation('nfeWorkspace')
  const [result, setResult] = useState<null | SheetSelection>(null)
  const [failed, setFailed] = useState(false)

  async function handleFile(file: File | undefined): Promise<void> {
    if (file === undefined) return
    setFailed(false)
    try {
      const sheetNumbers = await readInvoiceNumbersFromWorkbook(
        new Uint8Array(await file.arrayBuffer()),
      )
      const selection = selectDocumentsBySheet({
        documents,
        isBlocked: isDocumentBlocked,
        sheetNumbers,
      })
      onSelect(selection.selectedIds)
      setResult(selection)
    } catch {
      setResult(null)
      setFailed(true)
    }
  }

  return (
    <div className={styles.sheetSelection}>
      <FileField
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        actionLabel={t('documents.sheetSelect')}
        label={t('documents.sheetLabel')}
        onSelect={(file) => void handleFile(file)}
        placeholder={t('documents.sheetPlaceholder')}
        resetAfterSelect
      />
      {failed && (
        <span className={styles.selectionBlocked} role="alert">
          {t('documents.sheetInvalid')}
        </span>
      )}
      {result !== null && (
        <span role="status">
          {t('documents.sheetResult', {
            selected: result.selectedIds.length,
            total: result.sheetCount,
          })}
          {result.blockedNumbers.length > 0 &&
            ` ${t('documents.sheetBlocked', { count: result.blockedNumbers.length })}`}
          {result.missingNumbers.length > 0 &&
            ` ${t('documents.sheetMissing', {
              count: result.missingNumbers.length,
              numbers: result.missingNumbers.slice(0, MISSING_PREVIEW_LIMIT).join(', '),
            })}`}
        </span>
      )}
    </div>
  )
}

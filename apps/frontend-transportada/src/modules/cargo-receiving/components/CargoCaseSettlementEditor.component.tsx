/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { formatOccurrenceSettlementAmount } from '@/modules/trip/shared/occurrenceSettlementMoney.service'

import {
  useCargoSettlementDraft,
  type CargoSettlementDraftController,
} from '../hooks/useCargoSettlementDraft.hook'
import type { CargoSettlementItem } from '../shared/cargoOccurrenceCase.types'
import type { CargoOccurrenceView } from '../shared/cargoOccurrence.types'
import styles from '../styles/cargoOccurrenceCase.module.css'
import occurrenceStyles from '../styles/cargoOccurrence.module.css'
import { CargoCaseFailure } from './CargoCaseFailure.component'
import { CargoCaseSettlementRow } from './CargoCaseSettlementRow.component'

type CargoCaseSettlementEditorProps = Readonly<{
  initialItems: readonly CargoSettlementItem[]
  occurrence: CargoOccurrenceView
  onDirtyChange: (isDirty: boolean) => void
}>

type RowsProps = Readonly<{
  draft: CargoSettlementDraftController
  occurrence: CargoOccurrenceView
}>

/** O item que cada linha pode escolher: o dela e os que nenhuma outra linha usa (o servidor grava um acerto por item). */
function SettlementRows({ draft, occurrence }: RowsProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const usedCodes = new Set(draft.rows.map((row) => row.productCode))

  return (
    <ul className={styles.settlementRows}>
      {draft.rows.map((row, index) => (
        <CargoCaseSettlementRow
          canRemove={draft.rows.length > 1}
          isDisabled={draft.isSaving}
          issues={draft.issues.get(row.id) ?? []}
          key={row.id}
          onChange={(patch) => draft.updateRow({ id: row.id, patch })}
          onRemove={() => draft.removeRow(row.id)}
          position={index + 1}
          productOptions={occurrence.items
            .filter((item) => item.code === row.productCode || !usedCodes.has(item.code))
            .map((item) => ({
              label: t('occurrence.list.item', { code: item.code, description: item.description }),
              value: item.code,
            }))}
          row={row}
        />
      ))}
    </ul>
  )
}

/** O formulário do acerto por item da avaria (`goods_paid`): sem viagem, sem cobrança, sem motorista. */
export function CargoCaseSettlementEditor(props: CargoCaseSettlementEditorProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const draft = useCargoSettlementDraft({
    initialItems: props.initialItems,
    occurrenceId: props.occurrence.id,
    onDirtyChange: props.onDirtyChange,
  })
  const usedCodes = new Set(draft.rows.map((row) => row.productCode))
  const hasFreeItem = props.occurrence.items.some((item) => !usedCodes.has(item.code))

  return (
    <div className={styles.settlement} data-case-settlement="">
      <h3 className={styles.settlementTitle}>{t('occurrence.settlement.title')}</h3>
      <p className={occurrenceStyles.noteHint}>{t('occurrence.settlement.hint')}</p>
      <SettlementRows draft={draft} occurrence={props.occurrence} />
      <div className={occurrenceStyles.panelActions}>
        <Button
          className={occurrenceStyles.noteAction}
          data-settlement-add=""
          disabled={draft.isSaving || !hasFreeItem}
          onClick={draft.addRow}
          type="button"
          variant="secondary"
        >
          <Icon name="add" />
          {t('occurrence.settlement.add')}
        </Button>
      </div>
      <p className={styles.settlementTotal} data-settlement-total="">
        {t('occurrence.settlement.total')}:{' '}
        <strong>{formatOccurrenceSettlementAmount(draft.total)}</strong>
      </p>
      <SettlementSave draft={draft} />
    </div>
  )
}

function SettlementSave({
  draft,
}: Readonly<{ draft: CargoSettlementDraftController }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  return (
    <>
      <div className={occurrenceStyles.panelActions}>
        <Button
          className={occurrenceStyles.noteAction}
          data-settlement-save=""
          disabled={draft.isSaving}
          onClick={draft.save}
          type="button"
        >
          <Icon name="save" />
          {draft.isSaving ? t('occurrence.settlement.saving') : t('occurrence.settlement.save')}
        </Button>
      </div>
      {draft.errorCode === undefined ? null : <CargoCaseFailure code={draft.errorCode} />}
      {draft.savedTotal === undefined ? null : (
        <p className={occurrenceStyles.noteHint} data-settlement-saved="" role="status">
          {t('occurrence.settlement.saved', {
            total: formatOccurrenceSettlementAmount(draft.savedTotal),
          })}
        </p>
      )}
    </>
  )
}

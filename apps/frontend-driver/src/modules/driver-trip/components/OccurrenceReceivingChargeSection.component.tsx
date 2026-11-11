/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import type { ReceivingChargeForm } from '../hooks/useReceivingChargeForm.hook'
import {
  DRIVER_PIX_KEY_TYPES,
  RECEIVING_CHARGE_MODES,
  RECEIVING_CHARGE_PAID_BY,
  type DriverPixKeyType,
} from '../shared/driverTrip.types'
import styles from '../styles/driverTrip.module.css'
import valueStyles from '../styles/occurrenceValues.module.css'
import { OccurrenceMoneyField } from './OccurrenceMoneyField.component'
import { OccurrencePhotoField } from './OccurrencePhotoField.component'
import { OccurrenceTextField } from './OccurrenceTextField.component'

type OccurrenceReceivingChargeSectionProps = Readonly<{
  /** Número da nota por id, para rotular o valor de cada uma. */
  documentNumbers: ReadonlyMap<string, string>
  form: ReceivingChargeForm
}>

const PIX_KEY_MAX_LENGTH = 140

/**
 * Spec 317 (RF9): o formulário da cobrança no recebimento — valor, notas (quando a parada tem mais de uma), quem pagou,
 * o PIX do motorista e **uma foto por vaga rotulada** que o servidor mandou. Só componentes do design system: rótulo em
 * cima, campo e seletor na altura padrão, botões padrão e chips de 44 px como os do tipo da ocorrência.
 */
export function OccurrenceReceivingChargeSection({
  documentNumbers,
  form,
}: OccurrenceReceivingChargeSectionProps) {
  const { t } = useTranslation('driverTrip')
  const { draft } = form
  const isPerDocument = form.hasDocumentChoice && draft.mode === 'one_per_document'
  const missingKinds = new Set(form.missing.map((entry) => entry.kind))
  const missingSlotKeys = new Set(
    form.missing.flatMap((entry) => (entry.kind === 'photo' ? [entry.slotKey] : [])),
  )

  return (
    <>
      {form.hasDocumentChoice ? (
        <>
          <div className={styles.proofCapture}>
            <p className={styles.proofCaptureTitle}>
              {t('occurrenceRegistration.receivingCharge.documents')}
              {missingKinds.has('documents') ? ' *' : ''}
            </p>
            <p className={styles.stopMeta}>
              {t('occurrenceRegistration.receivingCharge.documentsHint')}
            </p>
            <div className={styles.occurrenceChips} role="group">
              {form.documentIds.map((documentId) => {
                const isSelected = draft.selectedDocumentIds.includes(documentId)
                return (
                  <Button
                    aria-checked={isSelected}
                    className={styles.occurrenceChip}
                    key={documentId}
                    onClick={() => form.handleDocumentToggle(documentId)}
                    role="checkbox"
                    type="button"
                    variant={isSelected ? 'default' : 'ghost'}
                  >
                    {isSelected ? <Icon name="check" /> : null}
                    {t('occurrenceRegistration.receivingCharge.documentNumber', {
                      number: documentNumbers.get(documentId) ?? '',
                    })}
                  </Button>
                )
              })}
            </div>
          </div>
          <div className={styles.proofCapture}>
            <p className={styles.proofCaptureTitle}>
              {t('occurrenceRegistration.receivingCharge.mode')}
            </p>
            <div className={styles.occurrenceChips} role="radiogroup">
              {RECEIVING_CHARGE_MODES.map((mode) => (
                <Button
                  aria-checked={draft.mode === mode}
                  className={styles.occurrenceChip}
                  key={mode}
                  onClick={() => form.handleModeChange(mode)}
                  role="radio"
                  type="button"
                  variant={draft.mode === mode ? 'default' : 'ghost'}
                >
                  {t(`occurrenceRegistration.receivingCharge.modeOption.${mode}`)}
                </Button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {isPerDocument ? (
        draft.selectedDocumentIds.map((documentId) => (
          <div className={valueStyles.block} key={documentId}>
            <OccurrenceMoneyField
              label={t('occurrenceRegistration.receivingCharge.documentAmount', {
                number: documentNumbers.get(documentId) ?? '',
              })}
              onChange={(text) => form.handleDocumentAmountChange(documentId, text)}
              placeholder={t('occurrenceRegistration.declaredAmount.placeholder')}
              value={draft.documentAmountTexts[documentId] ?? ''}
            />
          </div>
        ))
      ) : (
        <div className={valueStyles.block}>
          <OccurrenceMoneyField
            label={t(
              form.hasDocumentChoice
                ? 'occurrenceRegistration.receivingCharge.groupedAmount'
                : 'occurrenceRegistration.receivingCharge.amount',
            )}
            onChange={form.handleAmountChange}
            placeholder={t('occurrenceRegistration.declaredAmount.placeholder')}
            value={draft.amountText}
          />
        </div>
      )}

      <div className={styles.proofCapture}>
        <p className={styles.proofCaptureTitle}>
          {t('occurrenceRegistration.receivingCharge.paidBy')}
          {missingKinds.has('paidBy') ? ' *' : ''}
        </p>
        <div className={styles.occurrenceChips} role="radiogroup">
          {RECEIVING_CHARGE_PAID_BY.map((paidBy) => (
            <Button
              aria-checked={draft.paidBy === paidBy}
              className={styles.occurrenceChip}
              key={paidBy}
              onClick={() => form.handlePaidByChange(paidBy)}
              role="radio"
              type="button"
              variant={draft.paidBy === paidBy ? 'default' : 'ghost'}
            >
              {t(`occurrenceRegistration.receivingCharge.paidByOption.${paidBy}`)}
            </Button>
          ))}
        </div>
      </div>

      {draft.paidBy === 'driver' ? (
        <>
          <label className={valueStyles.field}>
            <span className={valueStyles.fieldLabel}>
              {t('occurrenceRegistration.receivingCharge.pixKeyType')}
            </span>
            <Select
              ariaLabel={t('occurrenceRegistration.receivingCharge.pixKeyType')}
              onChange={(value) => form.handlePixKeyTypeChange(value as DriverPixKeyType)}
              options={DRIVER_PIX_KEY_TYPES.map((type) => ({
                label: t(`occurrenceRegistration.receivingCharge.pixKeyTypeOption.${type}`),
                value: type,
              }))}
              placeholder={t('occurrenceRegistration.receivingCharge.pixKeyTypePlaceholder')}
              value={draft.pixKeyType ?? ''}
            />
          </label>
          <OccurrenceTextField
            hint={t('occurrenceRegistration.receivingCharge.pixKeyHint')}
            inputMode="text"
            label={t('occurrenceRegistration.receivingCharge.pixKey')}
            maxLength={PIX_KEY_MAX_LENGTH}
            onChange={form.handlePixKeyChange}
            value={draft.pixKey}
          />
        </>
      ) : null}

      {form.slots.map((slot) => (
        <OccurrencePhotoField
          isMissing={missingSlotKeys.has(slot.slotKey)}
          key={slot.slotKey}
          limit={1}
          onRemoveLast={() => undefined}
          onSelect={(file) => form.handleSlotPhotoSelect(slot.slotKey, file)}
          photoCount={draft.slotPhotos[slot.slotKey] === undefined ? 0 : 1}
          photoState={form.slotPhotoStates[slot.slotKey] ?? 'idle'}
          previewUrl={form.slotPreviewUrls[slot.slotKey]}
          title={`${slot.label}${slot.required ? ' *' : ''}`}
        />
      ))}
    </>
  )
}

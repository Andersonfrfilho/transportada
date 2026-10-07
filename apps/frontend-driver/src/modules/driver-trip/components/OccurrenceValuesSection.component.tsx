/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { OccurrenceRegistrationForm } from '../hooks/useOccurrenceRegistrationForm.hook'
import { REFERENCE_NUMBER_MAX_LENGTH } from '../shared/occurrenceDecimalInput.service'
import type { OccurrenceRequirements } from '../shared/occurrenceRequirements.service'
import styles from '../styles/occurrenceValues.module.css'
import { OccurrenceMoneyField } from './OccurrenceMoneyField.component'
import { OccurrenceItemsField } from './OccurrenceItemsField.component'
import { OccurrenceProductsField } from './OccurrenceProductsField.component'
import { OccurrenceTextField } from './OccurrenceTextField.component'

export type OccurrenceValueLabels = Readonly<{
  declaredAmount: string
  referenceNumber: string
}>

type OccurrenceValuesSectionProps = Readonly<{
  form: OccurrenceRegistrationForm
  labels: OccurrenceValueLabels
  requirements: OccurrenceRequirements
}>

/**
 * Spec 247 (T5.3, RF11): os produtos, o valor pago da ocorrência e o número do documento do cliente —
 * na ordem do desenho aprovado, antes da observação e da foto. Cada campo só existe quando o tipo
 * efetivo o pede (`off` não aparece) e diz se é obrigatório. Sem lista de produtos no snapshot, o app
 * continua oferecendo só "A nota inteira".
 */
export function OccurrenceValuesSection({
  form,
  labels,
  requirements,
}: OccurrenceValuesSectionProps) {
  const { t } = useTranslation('driverTrip')
  const { valuesForm, visibility } = form
  if (visibility === undefined) return null

  const isDeclaredAmountOn = visibility.rendersDeclaredAmount
  const isOccurrenceAmountVisible =
    isDeclaredAmountOn && valuesForm.values.amountTarget === 'occurrence'
  const isAmountRequired = requirements.declaredAmountMode === 'required'

  return (
    <>
      {visibility.rendersItemsList ? (
        <OccurrenceItemsField
          declaredAmountLabel={isDeclaredAmountOn ? labels.declaredAmount : undefined}
          form={valuesForm}
          isRequired={requirements.itemsMode === 'required'}
        />
      ) : null}
      {visibility.rendersProducts ? (
        <OccurrenceProductsField isMarked={form.hasProducts} onToggle={form.handleProductsToggle} />
      ) : null}
      {isOccurrenceAmountVisible ? (
        <div className={styles.block}>
          <OccurrenceMoneyField
            label={t(
              isAmountRequired
                ? 'occurrenceRegistration.declaredAmount.required'
                : 'occurrenceRegistration.declaredAmount.optional',
              { label: labels.declaredAmount },
            )}
            onChange={valuesForm.handleDeclaredAmountChange}
            placeholder={t('occurrenceRegistration.declaredAmount.placeholder')}
            value={valuesForm.declaredAmountText}
          />
        </div>
      ) : null}
      {visibility.rendersReferenceNumber ? (
        <div className={styles.block}>
          <OccurrenceTextField
            error={
              valuesForm.values.facts.hasInvalidReferenceNumber
                ? t('occurrenceRegistration.referenceNumber.invalid', {
                    max: REFERENCE_NUMBER_MAX_LENGTH,
                  })
                : undefined
            }
            inputMode="text"
            label={t(
              requirements.referenceNumberMode === 'required'
                ? 'occurrenceRegistration.referenceNumber.required'
                : 'occurrenceRegistration.referenceNumber.optional',
              { label: labels.referenceNumber },
            )}
            onChange={valuesForm.handleReferenceNumberChange}
            value={valuesForm.referenceNumberText}
          />
        </div>
      ) : null}
    </>
  )
}

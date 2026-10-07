/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

import { formatBrazilianAmount, formatBrazilianQuantity } from '../shared/occurrenceAmount.service'
import type { OccurrenceItemLine } from '../shared/occurrenceDraftValues.service'
import { formatBrazilianUnitValue } from '../shared/occurrenceMoneyFormat.service'
import type { OccurrenceValuesForm } from '../hooks/useOccurrenceValues.hook'
import styles from '../styles/occurrenceValues.module.css'
import { OccurrenceTextField } from './OccurrenceTextField.component'

type OccurrenceItemRowProps = Readonly<{
  declaredAmountLabel: string
  form: OccurrenceValuesForm
  /** O valor pago se digita nesta linha (escopo "por produto" e tipo que o pede). */
  isAmountVisible: boolean
  line: OccurrenceItemLine
}>

/**
 * Spec 247 (T5.3, RF11): um produto da nota — marcar, quantidade na unidade da nota, valor pago quando
 * o tipo o pede por linha, e a conta da linha à vista (`1 UN × R$ 57,20 = R$ 57,20`).
 */
export function OccurrenceItemRow({
  declaredAmountLabel,
  form,
  isAmountVisible,
  line,
}: OccurrenceItemRowProps) {
  const { t } = useTranslation('driverTrip')
  const { product } = line
  const unitValue = formatBrazilianUnitValue(product.unitValue)
  const lineCents = line.lineAmountCents
  const amountPlaceholder =
    lineCents === undefined
      ? t('occurrenceRegistration.declaredAmount.placeholder')
      : formatBrazilianAmount(lineCents)

  function describeQuantityProblem(): string | undefined {
    if (line.quantityProblem === 'above-note') {
      return t('occurrenceRegistration.items.quantityAboveNote', {
        quantity: formatBrazilianQuantity(product.quantity),
        unit: product.unit,
      })
    }
    return line.quantityProblem === 'missing'
      ? t('occurrenceRegistration.items.quantityMissing')
      : undefined
  }

  return (
    <li className={cn(styles.item, line.isSelected ? styles.itemSelected : '')}>
      <label className={styles.check}>
        <input
          checked={line.isSelected}
          className={styles.checkInput}
          onChange={() => form.handleItemToggle(product.code)}
          type="checkbox"
        />
        <span aria-hidden="true" className={styles.checkBox}>
          {line.isSelected ? <Icon name="check" /> : null}
        </span>
        <span className={styles.productName}>
          <span className={styles.productCode}>{product.code}</span> · {product.description}
        </span>
        <small className={styles.onNote}>
          {t('occurrenceRegistration.items.onNote', {
            quantity: formatBrazilianQuantity(product.quantity),
            unit: product.unit,
            unitValue,
          })}
        </small>
      </label>
      {line.isSelected ? (
        <>
          <div className={styles.itemNumbers}>
            <OccurrenceTextField
              error={describeQuantityProblem()}
              inputMode="decimal"
              label={t('occurrenceRegistration.items.quantityLabel', { unit: product.unit })}
              onChange={(text) => form.handleItemQuantityChange({ code: product.code, text })}
              value={line.draft.quantityText}
            />
            {isAmountVisible ? (
              <OccurrenceTextField
                inputMode="decimal"
                label={t(
                  line.isDeclaredAmountRequired
                    ? 'occurrenceRegistration.items.amountRequired'
                    : 'occurrenceRegistration.items.amountOptional',
                  { label: declaredAmountLabel },
                )}
                onChange={(text) => form.handleItemAmountChange({ code: product.code, text })}
                placeholder={amountPlaceholder}
                value={line.draft.declaredAmountText}
              />
            ) : null}
          </div>
          {isAmountVisible && product.hasVaryingUnitValue ? (
            <p className={styles.fieldHint}>{t('occurrenceRegistration.items.varyingUnitValue')}</p>
          ) : null}
          {lineCents === undefined || line.quantity === undefined ? null : (
            <p className={styles.calculation}>
              {t('occurrenceRegistration.items.calculation', {
                quantity: formatBrazilianQuantity(line.quantity),
                unit: product.unit,
                unitValue,
              })}{' '}
              <strong>
                {t('occurrenceRegistration.items.money', {
                  value: formatBrazilianAmount(lineCents),
                })}
              </strong>
              {line.declaredAmount === undefined || line.itemAmountCents === undefined
                ? null
                : ` ${t('occurrenceRegistration.items.paid', {
                    value: formatBrazilianAmount(line.itemAmountCents),
                  })}`}
            </p>
          )}
        </>
      ) : null}
    </li>
  )
}

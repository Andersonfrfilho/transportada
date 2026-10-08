import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import {
  describeOccurrenceItems,
  describeOccurrenceTotals,
} from '../shared/occurrenceProductSelection.service'
import type { TripDocumentProduct, TripOccurrence } from '../shared/trip.types'

import styles from '../styles/trip.module.css'

type OccurrenceEntryItemsProps = Readonly<{
  occurrence: TripOccurrence
  products: readonly TripDocumentProduct[]
}>

export function OccurrenceEntryItems({
  occurrence,
  products,
}: OccurrenceEntryItemsProps): JSX.Element {
  const { t } = useTranslation('trip')
  const items = describeOccurrenceItems({
    occurrence,
    products,
    unitLabels: {
      box: t('occurrence.quantityUnits.box'),
      unit: t('occurrence.quantityUnits.unit'),
    },
  })
  const totals = describeOccurrenceTotals({ occurrence, products })
  const isWholeDocument = items.length === 0
  const hasTotals = totals.documentAmount !== null && (isWholeDocument || items.length > 1)

  return (
    <>
      {isWholeDocument ? (
        <p className={styles.occurrenceEntryWhole}>{t('occurrence.wholeDocument')}</p>
      ) : (
        <ul className={styles.occurrenceEntryItems}>
          {items.map((item) => (
            <li key={item.code}>
              <span className={styles.occurrenceEntryItemCode}>{item.code}</span>
              {item.description === null ? null : (
                <span className={styles.occurrenceEntryItemName}>{item.description}</span>
              )}
              {item.quantity === null ? null : (
                <span className={styles.occurrenceEntryItemQuantity}>{item.quantity}</span>
              )}
              {item.lineAmount === null ? null : (
                <span className={styles.occurrenceEntryItemAmount}>
                  {t('occurrence.itemAmount', { amount: item.lineAmount })}
                </span>
              )}
              {item.declaredAmount === null ? null : (
                <span className={styles.occurrenceEntryItemDeclared}>
                  {t('occurrence.itemDeclaredAmount', { amount: item.declaredAmount })}
                </span>
              )}
              {item.unitValue === null ? null : (
                <span className={styles.occurrenceEntryItemUnitValue}>
                  {t('occurrence.itemUnitValue', { amount: item.unitValue })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasTotals ? (
        <dl className={styles.occurrenceEntryTotals}>
          <dt>{t(isWholeDocument ? 'occurrence.totalDocument' : 'occurrence.totalItems')}</dt>
          <dd>{t('occurrence.itemAmount', { amount: totals.documentAmount })}</dd>
          {totals.declaredAmount === null ? null : (
            <>
              <dt>{t('occurrence.totalDeclared')}</dt>
              <dd className={styles.occurrenceEntryTotalDeclared}>
                {t('occurrence.itemAmount', { amount: totals.declaredAmount })}
              </dd>
            </>
          )}
        </dl>
      ) : null}
    </>
  )
}

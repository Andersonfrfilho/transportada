/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'

import { useCorrectOccurrenceItems } from '../queries/useOccurrenceCorrection.query'
import { useOccurrenceDocumentProducts } from '../queries/useOccurrenceDocumentProducts.query'
import {
  buildOccurrenceCorrectionItems,
  resolveOccurrenceItemSelectionFromDetail,
} from '../shared/occurrenceProductSelection.service'
import { resolveTripFeedbackKey } from '../shared/tripFeedback.service'
import type { TripOccurrenceDetailItem } from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'
import { OccurrenceItemQuantities } from './OccurrenceItemQuantities.component'
import { OccurrenceProductSelect } from './OccurrenceProductSelect.component'

export type TripOccurrenceCorrectionFormProps = Readonly<{
  documentId: string
  items: readonly TripOccurrenceDetailItem[]
  occurrenceId: string
  onClose: () => void
  tripId: string
}>

/**
 * Spec 235 RF2: reabre com o conjunto que a ocorrência tem hoje e manda o conjunto **inteiro** — o
 * servidor substitui, e a política dele decide se algo mudou; a tela não faz essa conta.
 */
export function TripOccurrenceCorrectionForm({
  documentId,
  items,
  occurrenceId,
  onClose,
  tripId,
}: TripOccurrenceCorrectionFormProps) {
  const { t } = useTranslation('trip')
  const initialSelection = resolveOccurrenceItemSelectionFromDetail(items)
  const [productCodes, setProductCodes] = useState(initialSelection.productCodes)
  const [quantitiesByCode, setQuantitiesByCode] = useState(initialSelection.quantitiesByCode)
  const productsQuery = useOccurrenceDocumentProducts({ documentId, tripId })
  const correction = useCorrectOccurrenceItems()
  const products = productsQuery.data ?? []
  const feedbackKey = resolveTripFeedbackKey(correction.error)

  function handleSubmit(): void {
    correction.mutate(
      {
        documentId,
        items: buildOccurrenceCorrectionItems({ codes: productCodes, quantitiesByCode }),
        occurrenceId,
        tripId,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <section aria-labelledby="occurrence-correction-title" className={styles.occurrenceForm}>
      <h3 id="occurrence-correction-title">{t('occurrenceDetail.correction.form.title')}</h3>
      <p className={styles.hint}>{t('occurrenceDetail.correction.form.hint')}</p>
      {productsQuery.isPending ? <Skeleton height="2.5rem" width="100%" /> : null}
      {productsQuery.isError ? (
        <p className={styles.alert} role="alert">
          {t('occurrenceDetail.correction.form.productsError')}
        </p>
      ) : null}
      {productsQuery.isSuccess ? (
        <>
          <OccurrenceProductSelect
            allowsMultipleItems
            onChange={setProductCodes}
            productCodes={productCodes}
            products={products}
          />
          <OccurrenceItemQuantities
            onChange={setQuantitiesByCode}
            productCodes={productCodes}
            products={products}
            quantitiesByCode={quantitiesByCode}
          />
        </>
      ) : null}
      {feedbackKey === null ? null : (
        <p className={styles.alert} role="alert">
          {t(`feedback.${feedbackKey}`)}
        </p>
      )}
      <footer className={styles.occurrenceFormActions}>
        <Button
          disabled={correction.isPending}
          onClick={onClose}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="close" />
          {t('occurrenceDetail.correction.form.discard')}
        </Button>
        <Button
          disabled={correction.isPending || !productsQuery.isSuccess}
          onClick={handleSubmit}
          size="sm"
          type="button"
        >
          <Icon name="save" />
          {t('occurrenceDetail.correction.form.save')}
        </Button>
      </footer>
    </section>
  )
}

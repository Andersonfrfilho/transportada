/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useId, useRef, useState } from 'react'
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
  companyId?: string
  documentId: string
  id: string
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
  companyId,
  documentId,
  id,
  items,
  occurrenceId,
  onClose,
  tripId,
}: TripOccurrenceCorrectionFormProps) {
  const { t } = useTranslation('trip')
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const initialSelection = resolveOccurrenceItemSelectionFromDetail(items)
  const [productCodes, setProductCodes] = useState(initialSelection.productCodes)
  const [quantitiesByCode, setQuantitiesByCode] = useState(initialSelection.quantitiesByCode)
  const productsQuery = useOccurrenceDocumentProducts({
    ...(companyId === undefined ? {} : { companyId }),
    documentId,
    tripId,
  })
  const correction = useCorrectOccurrenceItems()
  const products = productsQuery.data ?? []
  const feedbackKey = resolveTripFeedbackKey(correction.error)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

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
    <section aria-labelledby={titleId} className={styles.occurrenceForm} id={id}>
      <h3 id={titleId} ref={titleRef} tabIndex={-1}>
        {t('occurrenceDetail.correction.form.title')}
      </h3>
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

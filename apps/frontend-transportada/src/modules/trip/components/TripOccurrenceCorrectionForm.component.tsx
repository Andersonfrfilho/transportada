/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'

import { useOccurrenceTypeRecordConfig } from '../hooks/useOccurrenceTypeRecordConfig.hook'
import { useCorrectOccurrenceItems } from '../queries/useOccurrenceCorrection.query'
import { useOccurrenceDocumentProducts } from '../queries/useOccurrenceDocumentProducts.query'
import {
  EMPTY_CORRECTION_AMOUNTS_DRAFT,
  resolveCorrectionAmounts,
} from '../shared/occurrenceCorrectionAmounts.service'
import { selectRecordConfig } from '../shared/occurrenceRecordConfig.service'
import type { CorrectionRecordedAmounts } from '../shared/occurrenceRecordedAmounts.service'
import {
  buildOccurrenceCorrectionItems,
  resolveOccurrenceItemSelectionFromDetail,
} from '../shared/occurrenceProductSelection.service'
import { resolveTripFeedbackKey } from '../shared/tripFeedback.service'
import type {
  TripOccurrenceDetailItem,
  TripOccurrenceRequirements,
} from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'
import { OccurrenceCorrectionAmounts } from './OccurrenceCorrectionAmounts.component'
import { OccurrenceItemQuantities } from './OccurrenceItemQuantities.component'
import { OccurrenceProductSelect } from './OccurrenceProductSelect.component'

export type TripOccurrenceCorrectionFormProps = Readonly<{
  /** Spec 241 RF9: o teto de um item do tipo, para a escolha única nascer antes do `422`. */
  allowsMultipleItems: boolean
  companyId?: string
  documentId: string
  id: string
  items: readonly TripOccurrenceDetailItem[]
  occurrenceId: string
  onClose: () => void
  /** O que o registro gravou: a correção nasce com isso, em vez de vazia. */
  recorded: CorrectionRecordedAmounts
  /** Spec 247 T7.2b: o requisito efetivo que a API publica; ausente cai no catálogo, se o operador pode lê-lo. */
  requirements?: null | TripOccurrenceRequirements
  tripId: string
  /** Onde achar os rótulos do tipo: o catálogo é de quem tem `settings.manage`. */
  typeLookup: Readonly<{ canReadCatalog: boolean; occurrenceTypeId: null | string }>
}>

/**
 * Spec 240 RF2: reabre com o conjunto que a ocorrência tem hoje e manda o conjunto **inteiro** — o
 * servidor substitui, e a política dele decide se algo mudou; a tela não faz essa conta.
 */
export function TripOccurrenceCorrectionForm({
  allowsMultipleItems,
  companyId,
  documentId,
  id,
  items,
  occurrenceId,
  onClose,
  recorded,
  requirements,
  tripId,
  typeLookup,
}: TripOccurrenceCorrectionFormProps) {
  const { t } = useTranslation('trip')
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const initialSelection = resolveOccurrenceItemSelectionFromDetail(items)
  const [productCodes, setProductCodes] = useState(initialSelection.productCodes)
  const [quantitiesByCode, setQuantitiesByCode] = useState(initialSelection.quantitiesByCode)
  const [amountsDraft, setAmountsDraft] = useState(EMPTY_CORRECTION_AMOUNTS_DRAFT)
  const productsQuery = useOccurrenceDocumentProducts({
    ...(companyId === undefined ? {} : { companyId }),
    documentId,
    tripId,
  })
  const correction = useCorrectOccurrenceItems()
  const products = productsQuery.data ?? []
  const feedbackKey = resolveTripFeedbackKey(correction.error)
  const catalogConfig = useOccurrenceTypeRecordConfig({
    ...typeLookup,
    canReadCatalog: typeLookup.canReadCatalog && (requirements ?? null) === null,
  })
  const typeConfig = selectRecordConfig({ fallback: catalogConfig, requirements })
  const amounts = resolveCorrectionAmounts({
    amountMode: typeConfig.amountMode,
    codes: productCodes,
    draft: amountsDraft,
    recorded,
    referenceMode: typeConfig.referenceMode,
    typeScope: typeConfig.scope,
  })
  const isBlocked = amounts.hasReferenceNumberError || amounts.hasRequiredCleared

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  function handleSubmit(): void {
    if (isBlocked) return
    correction.mutate(
      {
        ...(amounts.declaredAmount === undefined ? {} : { declaredAmount: amounts.declaredAmount }),
        documentId,
        items: buildOccurrenceCorrectionItems({
          codes: productCodes,
          declaredAmounts: amounts.lineAmounts,
          quantitiesByCode,
        }),
        occurrenceId,
        ...(amounts.referenceNumber === undefined
          ? {}
          : { referenceNumber: amounts.referenceNumber }),
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
            allowsMultipleItems={allowsMultipleItems}
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
          <OccurrenceCorrectionAmounts
            draft={amountsDraft}
            onChange={setAmountsDraft}
            recorded={recorded}
            selection={{ codes: productCodes, products, quantitiesByCode }}
            typeConfig={typeConfig}
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
          disabled={correction.isPending || !productsQuery.isSuccess || isBlocked}
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

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { TripDocumentProduct } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

const quantityFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 4,
  minimumFractionDigits: 0,
})

/**
 * Spec 181 RF7/T303: os produtos paravam de ser despejados **incondicionalmente** nos três estados do
 * comprovante — a lista vira a própria expansão, reusando o padrão da spec 180
 * (`aria-expanded`/`aria-controls`, chevron). Nota sem produto não oferece a expansão vazia; ela só
 * imprime o aviso de que não há item (mesma regra da CA07/CA16). As ocorrências saíram daqui
 * (spec 233 D2): são seção da nota aberta (`TripDocumentOccurrences`).
 */
export function TripDeliveryProofDetail({
  documentId,
  products,
}: Readonly<{
  documentId: string
  products: readonly TripDocumentProduct[]
}>) {
  const { t } = useTranslation('trip')
  const [isProductsExpanded, setIsProductsExpanded] = useState(false)
  const productsId = `trip-delivery-proof-products-${documentId}`

  return (
    <>
      {products.length === 0 ? (
        <p className={styles.hint}>{t('deliveryProof.withoutProducts')}</p>
      ) : (
        <>
          <Button
            aria-controls={productsId}
            aria-expanded={isProductsExpanded}
            className={styles.stopDocumentToggle}
            onClick={() => setIsProductsExpanded((current) => !current)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name={isProductsExpanded ? 'chevron-up' : 'chevron-down'} />
            {t('deliveryProof.productsToggle', { count: products.length })}
          </Button>
          {isProductsExpanded ? (
            <div id={productsId}>
              <TripDocumentProducts products={products} />
            </div>
          ) : null}
        </>
      )}
    </>
  )
}

/**
 * A lista que se lê com a caixa na mão: quantidade, unidade e descrição. **Sem NCM e sem CFOP** —
 * a API não os publica, e nem deveria: classificação fiscal é ruído para quem confere carga.
 */
function TripDocumentProducts({
  products,
}: Readonly<{ products: readonly TripDocumentProduct[] }>) {
  const { t } = useTranslation('trip')

  if (products.length === 0) {
    return <p className={styles.hint}>{t('deliveryProof.withoutProducts')}</p>
  }

  return (
    <>
      <h4 className={styles.hint}>{t('deliveryProof.products')}</h4>
      <ul className={styles.documentProductList}>
        {products.map((product) => (
          <li key={product.code + String(product.ordinal)}>
            {t('deliveryProof.productLine', {
              description: product.description,
              quantity: quantityFormatter.format(Number.parseFloat(product.quantity)),
              unit: product.commercialUnit,
            })}
          </li>
        ))}
      </ul>
    </>
  )
}

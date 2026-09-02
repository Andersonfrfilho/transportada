/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import type { DeliveryProof, DeliveryProofView } from '../shared/deliveryProof.service'
import type { TripDocumentProduct } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripDeliveryProofProps = Readonly<{
  /** Spec 079 T019: o que vai dentro da nota, conferido de pé no galpão. */
  products: readonly TripDocumentProduct[]
  view: DeliveryProofView
}>

/**
 * Spec 079 T006/T025: o canhoto que o motorista anexou, do lado do escritório.
 *
 * ⚠️ **A URL assinada expira em cinco minutos e não é guardada em estado.** Uma tela que a copia
 * para dentro de um `useState` e a reusa depois mostra imagem quebrada sem dizer por quê — o
 * componente lê direto o que a consulta trouxe, e recarregar a consulta é o que renova a URL.
 *
 * Os quatro estados chegam inteiros aqui: "entregue sem comprovante" e "não entregue" têm textos
 * diferentes de propósito, porque são fatos diferentes (ver `deliveryProof.service.ts`).
 */
export function TripDeliveryProof({ products, view }: TripDeliveryProofProps) {
  const { t } = useTranslation('trip')

  /**
   * ⚠️ A lista de itens aparece **em todos os estados**, inclusive antes de a nota ser entregue: é
   * justamente antes que alguém confere se a carga está completa. Amarrá-la à entrega esconderia a
   * informação de quem mais precisa dela.
   */
  if (view.state === 'not-delivered') {
    return (
      <>
        <p className={styles.hint}>{t('deliveryProof.notDelivered')}</p>
        <TripDocumentProducts products={products} />
      </>
    )
  }

  if (view.state === 'returned') {
    return (
      <>
        <p className={styles.hint}>
          {view.returnReason === null || view.returnReason === ''
            ? t('deliveryProof.returnedWithoutReason')
            : t('deliveryProof.returned', { reason: view.returnReason })}
        </p>
        <TripDocumentProducts products={products} />
      </>
    )
  }

  return (
    <section aria-labelledby="trip-delivery-proof-title" className={styles.panel}>
      <h4 className={styles.hint} id="trip-delivery-proof-title">
        {t('deliveryProof.title')}
      </h4>
      {view.deliveredAt === null ? null : (
        <p>{t('deliveryProof.deliveredAt', { moment: formatMoment(view.deliveredAt) })}</p>
      )}
      {view.receiverName === null ? null : (
        <p>{t('deliveryProof.receiver', { name: view.receiverName })}</p>
      )}
      {view.state === 'delivered-without-proof' ? (
        <p className={styles.hint}>{t('deliveryProof.withoutProof')}</p>
      ) : null}
      {view.signatures.map((proof) => (
        <ProofImage alt={t('deliveryProof.signatureAlt')} key={proof.id} proof={proof} />
      ))}
      {view.photos.map((proof) => (
        <ProofImage alt={t('deliveryProof.photoAlt')} key={proof.id} proof={proof} />
      ))}
      <TripDocumentProducts products={products} />
    </section>
  )
}

const momentFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

function formatMoment(value: string): string {
  return momentFormatter.format(new Date(value))
}

function ProofImage({ alt, proof }: Readonly<{ alt: string; proof: DeliveryProof }>) {
  return (
    <img alt={alt} className={styles.deliveryProofImage} loading="lazy" src={proof.downloadUrl} />
  )
}

const quantityFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 4,
  minimumFractionDigits: 0,
})

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

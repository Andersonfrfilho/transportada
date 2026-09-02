/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import type { DeliveryProof, DeliveryProofView } from '../shared/deliveryProof.service'
import styles from '../styles/trip.module.css'

type TripDeliveryProofProps = Readonly<{
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
export function TripDeliveryProof({ view }: TripDeliveryProofProps) {
  const { t } = useTranslation('trip')

  if (view.state === 'not-delivered') {
    return <p className={styles.hint}>{t('deliveryProof.notDelivered')}</p>
  }

  if (view.state === 'returned') {
    return (
      <p className={styles.hint}>
        {view.returnReason === null || view.returnReason === ''
          ? t('deliveryProof.returnedWithoutReason')
          : t('deliveryProof.returned', { reason: view.returnReason })}
      </p>
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

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { DeliveryProof, DeliveryProofView } from '../shared/deliveryProof.service'
import type { TripDocumentProduct } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripDeliveryProofProps = Readonly<{
  /** Spec 181 RF7: as duas expansões abaixo precisam de um id estável por nota. */
  documentId: string
  /** Spec 079 T020: o que houve com a carga. Só anota — ver `TripOccurrences`. */
  occurrences: React.ReactNode
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
export function TripDeliveryProof({
  documentId,
  occurrences,
  products,
  view,
}: TripDeliveryProofProps) {
  const { t } = useTranslation('trip')

  /**
   * ⚠️ **A lista de itens continua alcançável em todos os estados**, inclusive antes de a nota ser
   * entregue: é justamente antes que alguém confere se a carga está completa. Amarrá-la à entrega
   * esconderia a informação de quem mais precisa dela — RF7 pede que ela pare de ser despejada
   * **incondicionalmente**, não que ela suma de algum estado.
   */
  if (view.state === 'not-delivered') {
    return (
      <>
        <p className={styles.hint}>{t('deliveryProof.notDelivered')}</p>
        <TripDeliveryProofDetail
          documentId={documentId}
          occurrences={occurrences}
          products={products}
        />
      </>
    )
  }

  if (view.state === 'returned') {
    return (
      <>
        <p className={styles.hint}>
          {view.returnReason === null || view.returnReason === ''
            ? t('deliveryProof.returnedWithoutReason')
            : t('deliveryProof.returned', {
                /**
                 * `returnReason` é código (`recipient_absent`), não texto: o dicionário vive em
                 * `fieldActions.returnReason`. A linha do tempo já traduzia; aqui o código cru saía
                 * em inglês na cara do operador. Código sem tradução cai nele mesmo — feio, mas
                 * some-lo esconderia o motivo da devolução.
                 */
                reason: t(`fieldActions.returnReason.${view.returnReason}`, {
                  defaultValue: view.returnReason,
                }),
              })}
        </p>
        <TripDeliveryProofDetail
          documentId={documentId}
          occurrences={occurrences}
          products={products}
        />
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
      <TripDeliveryProofDetail
        documentId={documentId}
        occurrences={occurrences}
        products={products}
      />
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
 * Spec 181 RF7/T303: produtos e ocorrências paravam de ser despejados **incondicionalmente** nos
 * três estados do comprovante — cada um vira a própria expansão, reusando o padrão da spec 180
 * (`aria-expanded`/`aria-controls`, chevron). Nota sem produto não oferece a expansão vazia; ela só
 * imprime o aviso de que não há item (mesma regra da CA07/CA16). As ocorrências são o formulário
 * inteiro de `TripOccurrences` (registrar + histórico) — o conteúdo delas é da spec 164/166/167,
 * fora do escopo desta feature, então a expansão de ocorrências fica sempre oferecida.
 */
function TripDeliveryProofDetail({
  documentId,
  occurrences,
  products,
}: Readonly<{
  documentId: string
  occurrences: React.ReactNode
  products: readonly TripDocumentProduct[]
}>) {
  const { t } = useTranslation('trip')
  const [isProductsExpanded, setIsProductsExpanded] = useState(false)
  const [isOccurrencesExpanded, setIsOccurrencesExpanded] = useState(false)
  const productsId = `trip-delivery-proof-products-${documentId}`
  const occurrencesId = `trip-delivery-proof-occurrences-${documentId}`

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
      <Button
        aria-controls={occurrencesId}
        aria-expanded={isOccurrencesExpanded}
        className={styles.stopDocumentToggle}
        onClick={() => setIsOccurrencesExpanded((current) => !current)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Icon name={isOccurrencesExpanded ? 'chevron-up' : 'chevron-down'} />
        {isOccurrencesExpanded
          ? t('deliveryProof.occurrencesCollapse')
          : t('deliveryProof.occurrencesToggle')}
      </Button>
      {isOccurrencesExpanded ? <div id={occurrencesId}>{occurrences}</div> : null}
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

/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type { TripOccurrenceDetail } from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'

const MONEY = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' })

/**
 * Spec 317: a cobrança no recebimento no detalhe da ocorrência de parada — o que o motorista digitou no app (valor,
 * quem pagou, PIX) e as fotos das vagas (placa, extrato do pagamento). O PIX é dado financeiro: a API só o manda a quem
 * tem `trip.financials`; sem ele a tela diz que está restrito, nunca esconde em silêncio.
 */
export function OccurrenceReceivingCharge({
  occurrence,
}: Readonly<{ occurrence: TripOccurrenceDetail }>): JSX.Element | null {
  const { t } = useTranslation('trip')
  const charge = occurrence.receivingCharge
  if (charge === undefined || charge === null) return null

  return (
    <section aria-labelledby="occurrence-receiving-charge-title" className={styles.receivingCharge}>
      <h3 id="occurrence-receiving-charge-title">{t('occurrenceDetail.receivingCharge.title')}</h3>
      <dl className={styles.occurrenceFacts}>
        {charge.declaredAmount === null ? null : (
          <div>
            <dt>{t('occurrenceDetail.receivingCharge.amount')}</dt>
            <dd>
              <strong>{MONEY.format(Number(charge.declaredAmount))}</strong>
            </dd>
          </div>
        )}
        {charge.paidBy === null ? null : (
          <div>
            <dt>{t('occurrenceDetail.receivingCharge.paidByLabel')}</dt>
            <dd>{t(`occurrenceDetail.receivingCharge.paidBy.${charge.paidBy}`)}</dd>
          </div>
        )}
        {charge.paidBy !== 'driver' ? null : (
          <div className={styles.occurrenceFactWide}>
            <dt>{t('occurrenceDetail.receivingCharge.pix')}</dt>
            <dd>
              {charge.driverPix === null ? (
                <span className={styles.occurrenceFactNote}>
                  {t('occurrenceDetail.receivingCharge.pixRestricted')}
                </span>
              ) : (
                <>
                  <span className={styles.receivingChargePix}>{charge.driverPix.key}</span>
                  <span className={styles.occurrenceFactNote}>
                    {t(`occurrenceDetail.receivingCharge.pixType.${charge.driverPix.type}`)}
                  </span>
                </>
              )}
            </dd>
          </div>
        )}
      </dl>
      {charge.photos.length === 0 ? null : (
        <ul
          aria-label={t('occurrenceDetail.receivingCharge.photos')}
          className={styles.receivingChargePhotos}
        >
          {charge.photos.map((photo) => (
            <li key={photo.slotKey}>
              <a
                aria-label={t('occurrenceDetail.receivingCharge.openPhoto', { label: photo.label })}
                href={photo.url}
                rel="noreferrer noopener"
                target="_blank"
              >
                <img alt={photo.label} loading="lazy" src={photo.url} />
              </a>
              <span>
                <Icon name="camera" size="sm" />
                {photo.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

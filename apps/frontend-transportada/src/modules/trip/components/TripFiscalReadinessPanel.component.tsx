/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { TripDocumentDetail, TripFiscalReadiness } from '../shared/trip.types'
import { tripDocumentLabel } from '../shared/tripDocument.service'
import styles from '../styles/trip.module.css'

type TripFiscalReadinessPanelProps = Readonly<{
  documents: readonly TripDocumentDetail[]
  readiness: TripFiscalReadiness | undefined
}>

/**
 * Spec 059, P1: **a viagem diz o que falta.** "8 de 10 prontas" e, por nota faltante, o motivo — sem
 * o operador abrir a tela de lote de CT-e para descobrir. O `TripMdfePendingDialog` continua
 * existindo para o clique bloqueado; este painel é o que evita o clique.
 */
export function TripFiscalReadinessPanel({
  documents,
  readiness,
}: TripFiscalReadinessPanelProps) {
  const { t } = useTranslation('trip')
  if (readiness === undefined || readiness.totalCount === 0) return null

  const labelByDocumentId = new Map(
    documents.map((document) => [document.id, tripDocumentLabel(document)]),
  )
  const pending = readiness.documents.filter((entry) => entry.reason !== 'ok')

  return (
    <section className={styles.readinessPanel}>
      <header className={styles.readinessHeader}>
        <h3>{t('readiness.title')}</h3>
        <p className={styles.readinessCount}>
          {t('readiness.count', { ready: readiness.readyCount, total: readiness.totalCount })}
        </p>
      </header>
      <p className={styles.readinessState}>{t(`readiness.state.${readiness.state}`)}</p>

      {pending.length === 0 ? null : (
        <ul className={styles.readinessList}>
          {pending.map((entry) => (
            <li className={styles.readinessItem} key={entry.tripDocumentId}>
              <span>{labelByDocumentId.get(entry.tripDocumentId) ?? entry.tripDocumentId}</span>
              <span className={styles.readinessReason}>
                {t(`readiness.reason.${entry.reason}`)}
                {/* O cStat e a mensagem vão junto: é o que decide o próximo passo do operador */}
                {entry.rejectionCode === null
                  ? null
                  : ` — ${entry.rejectionCode}${
                      entry.rejectionMessage === null ? '' : `: ${entry.rejectionMessage}`
                    }`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

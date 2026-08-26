/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { DriverStopCard } from '../components/DriverStopCard.component'
import { useDriverTrip } from '../hooks/useDriverTrip.hook'
import { getDriverTripClient } from '../shared/driverTripClient.service'
import { readCurrentLocation } from '../shared/driverLocation.service'
import type { DriverOccurrenceKind, DriverReturnReason } from '../shared/driverTrip.types'
import { createIdempotencyKey } from '../shared/offlineQueue.service'
import { findCurrentStop } from '../shared/driverTripView.service'
import styles from '../styles/driverTrip.module.css'

/**
 * Spec 057: só a viagem dele, as paradas na ordem congelada, e dois toques por parada. O que a tela
 * **não** faz é tão decidido quanto o que ela faz: não reordena parada (congelada desde o despacho),
 * não mostra XML e não pede valor de nada.
 */
export function DriverTripWorkspacePage() {
  const { t } = useTranslation('driverTrip')
  const driverTrip = useDriverTrip()
  /** O anexo que falha **não** desfaz a entrega: o aviso é do arquivo, e diz isso por extenso. */
  const [proofFailed, setProofFailed] = useState(false)

  if (driverTrip.status === 'loading') {
    return (
      <main className={styles.shell}>
        <SkeletonGroup label={t('loading')}>
          <Skeleton variant="text" />
          <Skeleton variant="block" />
          <Skeleton variant="block" />
        </SkeletonGroup>
      </main>
    )
  }

  if (driverTrip.status === 'error') {
    return (
      <main className={styles.shell}>
        <p role="alert">{t('error')}</p>
      </main>
    )
  }

  const snapshot = driverTrip.snapshot
  const trip = snapshot?.trips[0]

  async function report(build: (location: Awaited<ReturnType<typeof readCurrentLocation>>) => Parameters<typeof driverTrip.report>[0]): Promise<void> {
    await driverTrip.report(build(await readCurrentLocation()))
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        {trip === undefined ? null : (
          <p className={styles.vehicle}>{t('vehicle', { plate: trip.vehiclePlate })}</p>
        )}
      </header>

      {/* A tela diz a verdade: o que está na fila aparece como aguardando, nunca como enviado */}
      {driverTrip.queuedCount > 0 ? (
        <p className={styles.queueBanner} role="status">
          {t('queued', { count: driverTrip.queuedCount })}
        </p>
      ) : null}

      {proofFailed ? (
        <p className={styles.rejectedBanner} role="alert">
          {t('proofFailed')}
        </p>
      ) : null}

      {driverTrip.rejected.length > 0 ? (
        <p className={styles.rejectedBanner} role="alert">
          {t('rejected')}
        </p>
      ) : null}

      {snapshot?.isRegisteredDriver === false ? <p role="alert">{t('notRegistered')}</p> : null}

      {trip === undefined ? (
        snapshot?.isRegisteredDriver === false ? null : (
          <p>{t('noTrip')}</p>
        )
      ) : (
        <ul className={styles.stopList}>
          {trip.stops.map((stop) => (
            <DriverStopCard
              isCurrent={stop.id === findCurrentStop(trip)?.id}
              key={stop.id}
              stop={stop}
              onArrive={(stopId) =>
                void report((location) => ({
                  idempotencyKey: createIdempotencyKey(),
                  kind: 'arrive',
                  location,
                  stopId,
                }))
              }
              onDeliver={(documentId) =>
                void report((location) => ({
                  documentId,
                  idempotencyKey: createIdempotencyKey(),
                  kind: 'deliver',
                  location,
                }))
              }
              onProof={(input: { documentId: string; file: File }) => {
                void getDriverTripClient()
                  .attachProof({ documentId: input.documentId, file: input.file, kind: 'photo' })
                  .catch(() => setProofFailed(true))
              }}
              onOccurrence={(input: {
                description: string
                kind: DriverOccurrenceKind
                stopId: string
              }) =>
                void driverTrip.report({
                  description: input.description,
                  documentId: null,
                  idempotencyKey: createIdempotencyKey(),
                  kind: 'occurrence',
                  occurrenceKind: input.kind,
                  stopId: input.stopId,
                })
              }
              onReturn={(input: { documentId: string; reason: DriverReturnReason }) =>
                void report((location) => ({
                  documentId: input.documentId,
                  idempotencyKey: createIdempotencyKey(),
                  kind: 'return',
                  location,
                  reason: input.reason,
                }))
              }
            />
          ))}
        </ul>
      )}
    </main>
  )
}

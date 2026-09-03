/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { DriverBottomBar, type DriverSection } from '../components/DriverBottomBar.component'
import { DriverLoadSheet } from '../components/DriverLoadSheet.component'
import { DriverManifestCard } from '../components/DriverManifestCard.component'
import { DriverShellHeader } from '../components/DriverShellHeader.component'
import { DriverStopCard, type DriverProofAttachment } from '../components/DriverStopCard.component'
import { DriverTripProgress } from '../components/DriverTripProgress.component'
import { useDriverTrip } from '../hooks/useDriverTrip.hook'
import { DriverEventQueuePage } from './DriverEventQueue.page'
import { DriverProfilePage } from './DriverProfile.page'
import { getDriverTripClient } from '../shared/driverTripClient.service'
import { readCurrentLocation } from '../shared/driverLocation.service'
import { saveDriverFile } from '../shared/driverFileSave.service'
import type {
  DriverOccurrenceType,
  DriverOccurrenceKind,
  DriverReportedLocation,
  DriverReturnReason,
} from '../shared/driverTrip.types'
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
  /** Spec 082 D1: navegação interna do módulo — estado local, sem rota nova no shell do app. */
  const [section, setSection] = useState<DriverSection>('trip')
  /** Spec 082 D7: a tela de pendentes abre por cima da seção corrente — banner e Perfil chegam nela. */
  const [isQueueOpen, setIsQueueOpen] = useState(false)
  /** O anexo que falha **não** desfaz a entrega: o aviso é do arquivo, e diz isso por extenso. */
  const [proofFailed, setProofFailed] = useState(false)
  /** Spec 082 D6: teto da fila de anexos atingido — anunciado antes de qualquer descarte. */
  const [attachmentLimit, setAttachmentLimit] = useState<'count-limit' | 'size-limit' | undefined>(
    undefined,
  )
  /**
   * A ocorrência que falha **não** muda o estado da nota — ao contrário de entregar e devolver. O
   * aviso diz isso, e repetir o toque é o conserto.
   */
  const [occurrenceFailed, setOccurrenceFailed] = useState(false)
  /**
   * Os tipos cadastrados pela empresa. Falhar aqui deixa a lista vazia e o botão sem opção — o
   * motorista segue entregando e devolvendo, que é o que não pode parar.
   */
  const [occurrenceTypes, setOccurrenceTypes] = useState<readonly DriverOccurrenceType[]>([])
  /** Spec 082 D2: uma leitura ao abrir — recusa vira `null`, e a distância só não aparece. */
  const [lastKnownLocation, setLastKnownLocation] = useState<DriverReportedLocation | null>(null)

  useEffect(() => {
    let ativo = true
    void readCurrentLocation().then((location) => {
      if (ativo) setLastKnownLocation(location)
    })
    return () => {
      ativo = false
    }
  }, [])

  useEffect(() => {
    let ativo = true
    void getDriverTripClient()
      .listOccurrenceTypes()
      .then((types) => {
        if (ativo) setOccurrenceTypes(types)
      })
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [])

  const snapshot = driverTrip.snapshot
  const trip = snapshot?.trips[0]

  if (driverTrip.status === 'loading') {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader />
        <main className={styles.shell}>
          <SkeletonGroup label={t('loading')}>
            <Skeleton variant="text" />
            <Skeleton variant="block" />
            <Skeleton variant="block" />
          </SkeletonGroup>
        </main>
        <DriverBottomBar section={section} onSelect={setSection} />
      </div>
    )
  }

  if (driverTrip.status === 'error') {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader />
        <main className={styles.shell}>
          <p role="alert">{t('error')}</p>
        </main>
        <DriverBottomBar section={section} onSelect={setSection} />
      </div>
    )
  }

  if (isQueueOpen) {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader />
        <DriverEventQueuePage
          isLoading={driverTrip.isQueueLoading}
          isSyncing={driverTrip.isSyncing}
          items={driverTrip.queueView}
          onBack={() => setIsQueueOpen(false)}
          onSendAll={() => driverTrip.sendAllNow()}
          onSendOne={(idempotencyKey) => driverTrip.sendNow(idempotencyKey)}
        />
        <DriverBottomBar section={section} onSelect={setSection} />
      </div>
    )
  }

  if (section === 'profile') {
    return (
      <div className={styles.moduleShell}>
        <DriverShellHeader />
        <DriverProfilePage
          queuedCount={driverTrip.queuedCount}
          snapshot={snapshot}
          onOpenQueue={() => setIsQueueOpen(true)}
        />
        <DriverBottomBar section={section} onSelect={setSection} />
      </div>
    )
  }

  async function openManifestDamdfe(manifestId: string): Promise<void> {
    const file = await getDriverTripClient().readManifestDamdfe(manifestId)
    saveDriverFile(file)
  }

  async function openManifestXml(manifestId: string): Promise<void> {
    const download = await getDriverTripClient().readManifestXml(manifestId)
    window.open(download.downloadUrl, '_blank', 'noopener')
  }

  async function report(
    build: (
      location: Awaited<ReturnType<typeof readCurrentLocation>>,
    ) => Parameters<typeof driverTrip.report>[0],
  ): Promise<void> {
    await driverTrip.report(build(await readCurrentLocation()))
  }

  return (
    <div className={styles.moduleShell}>
      <DriverShellHeader />
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1>{t('title')}</h1>
          {trip === undefined ? null : (
            <p className={styles.vehicle}>{t('vehicle', { plate: trip.vehiclePlate })}</p>
          )}
        </header>

        {trip === undefined ? null : <DriverTripProgress trip={trip} />}

        {/* A tela diz a verdade: o que está na fila aparece como aguardando, nunca como enviado */}
        {driverTrip.queuedCount > 0 ? (
          <button
            className={styles.queueBannerButton}
            type="button"
            onClick={() => setIsQueueOpen(true)}
          >
            {t('queued', { count: driverTrip.queuedCount })}
            <span className={styles.queueBannerAction}>{t('eventQueue.open')}</span>
          </button>
        ) : null}

        {attachmentLimit !== undefined ? (
          <p className={styles.alert} role="alert">
            {t(attachmentLimit === 'count-limit' ? 'attachmentLimitCount' : 'attachmentLimitSize')}
          </p>
        ) : null}

        {occurrenceFailed ? (
          <p className={styles.alert} role="alert">
            {t('documentOccurrenceFailed')}
          </p>
        ) : null}
        {proofFailed ? (
          <p className={styles.rejectedBanner} role="alert">
            {t('proofFailed')}
          </p>
        ) : null}

        {driverTrip.rejectedCount > 0 ? (
          <button
            className={styles.rejectedBannerButton}
            type="button"
            onClick={() => setIsQueueOpen(true)}
          >
            {t('rejected')}
          </button>
        ) : null}

        {snapshot?.isRegisteredDriver === false ? <p role="alert">{t('notRegistered')}</p> : null}

        {/* Spec 065 D9: com manifesto autorizado, o documento da barreira vem antes do romaneio */}
        {trip?.manifest == null ? null : (
          <DriverManifestCard
            manifest={trip.manifest}
            onOpenDamdfe={(manifestId) => openManifestDamdfe(manifestId)}
            onOpenXml={(manifestId) => openManifestXml(manifestId)}
          />
        )}

        {/* Spec 065 D1: o que ele leva na mão desde o despacho, e antes de existir MDF-e */}
        {trip === undefined ? null : <DriverLoadSheet trip={trip} />}

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
                lastKnownLocation={lastKnownLocation}
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
                onProof={(input: DriverProofAttachment) => {
                  setAttachmentLimit(undefined)
                  void driverTrip
                    .attachProof(input)
                    .then((outcome) => {
                      if (outcome === 'count-limit' || outcome === 'size-limit') {
                        setAttachmentLimit(outcome)
                      }
                    })
                    .catch(() => setProofFailed(true))
                }}
                occurrenceTypes={occurrenceTypes}
                onDocumentOccurrence={(input: {
                  documentId: string
                  occurrenceTypeId: string
                  productCode: string
                }) => {
                  void getDriverTripClient()
                    .registerDocumentOccurrence(input)
                    .catch(() => setOccurrenceFailed(true))
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
                onOccurrencePhoto={(input: { documentId: string; file: File }) => {
                  /* A rota de ocorrência não aceita anexo — a foto sobe pelo proof da nota. */
                  setAttachmentLimit(undefined)
                  void driverTrip
                    .attachProof({
                      documentId: input.documentId,
                      file: new File([input.file], `ocorrencia-${input.file.name}`, {
                        type: input.file.type,
                      }),
                      kind: 'photo',
                    })
                    .then((outcome) => {
                      if (outcome === 'count-limit' || outcome === 'size-limit') {
                        setAttachmentLimit(outcome)
                      }
                    })
                    .catch(() => setProofFailed(true))
                }}
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
      <DriverBottomBar section={section} onSelect={setSection} />
    </div>
  )
}

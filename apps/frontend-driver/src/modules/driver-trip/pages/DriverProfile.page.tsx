/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/pages/DriverProfile.page.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { WhatsAppPhonePanel } from '@/modules/identity/components/WhatsAppPhonePanel.component'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { getKeycloakAuthProvider } from '@/modules/shared/KeycloakAuthProvider.provider'

import { DriverLocationConsentCard } from '../components/DriverLocationConsentCard.component'
import type { DriverTrip, DriverTripSnapshot } from '../shared/driverTrip.types'
import { listProofPendingDocuments } from '../shared/driverTripView.service'
import { createIndexedDbTripSnapshotStore } from '../shared/indexedDbQueue.service'
import { discardTripSnapshots } from '../shared/tripSnapshot.service'
import styles from '../styles/driverTrip.module.css'

type DriverProfilePageProps = Readonly<{
  /** Spec 159 (T12): quem vê a nota cair acha dali o caminho para as fotos que faltam. */
  onOpenPendingProofs: () => void
  onOpenQueue: () => void
  queuedCount: number
  snapshot: DriverTripSnapshot | undefined
  /** RF12: a viagem escolhida na tela da viagem — o Perfil mostra a placa dela, não a de `trips[0]`. */
  trip: DriverTrip | undefined
}>

/** Os dois papéis do campo têm rótulo; qualquer outro sai como veio — esconder seria mentir. */
const FIELD_ROLE_LABEL_KEYS: Readonly<Record<string, string>> = {
  aggregate: 'profile.roles.aggregate',
  driver: 'profile.roles.driver',
}

/**
 * Spec 082 D1: nome, papel, veículo da viagem corrente e o estado da fila offline — o que o
 * motorista precisa conferir sem sair da viagem. Sair reutiliza o mesmo logout do shell do app.
 */
export function DriverProfilePage({
  onOpenPendingProofs,
  onOpenQueue,
  queuedCount,
  snapshot,
  trip,
}: DriverProfilePageProps) {
  const { t } = useTranslation('driverTrip')
  const pendingProofCount = listProofPendingDocuments(snapshot).length
  const authMeQuery = useAuthMeQuery()
  const profile = getKeycloakAuthProvider().getProfile()
  const role = authMeQuery.data?.data.roles.find(
    (candidate) => FIELD_ROLE_LABEL_KEYS[candidate] !== undefined,
  )

  return (
    <main className={styles.shell}>
      <section className={styles.profileIdentityCard}>
        <span aria-hidden="true" className={styles.driverAvatarLarge}>
          {profile.initials}
        </span>
        <div className={styles.profileIdentity}>
          <h1 className={styles.profileName}>{profile.displayName}</h1>
          {authMeQuery.isLoading ? (
            <Skeleton height="0.8rem" width="var(--space-16)" />
          ) : (
            <p className={styles.profileRole}>
              {role !== undefined
                ? t(FIELD_ROLE_LABEL_KEYS[role] ?? '')
                : (authMeQuery.data?.data.roles[0] ?? t('profile.roles.unknown'))}
            </p>
          )}
        </div>
      </section>

      <section className={styles.profileCard}>
        <h2 className={styles.profileSectionTitle}>{t('profile.vehicleTitle')}</h2>
        {trip === undefined ? (
          <p className={styles.profileMeta}>{t('profile.noTrip')}</p>
        ) : (
          <p className={styles.profileMeta}>{t('vehicle', { plate: trip.vehiclePlate })}</p>
        )}
      </section>

      <section className={styles.profileCard}>
        <h2 className={styles.profileSectionTitle}>{t('profile.scoreTitle')}</h2>
        {snapshot?.score === undefined || snapshot.score === null ? (
          <p className={styles.profileMeta}>{t('profile.scoreNone')}</p>
        ) : (
          <p className={styles.profileScore}>{t('profile.score', { score: snapshot.score })}</p>
        )}
        <p className={styles.profileMeta}>{t('profile.scoreHint')}</p>
        {pendingProofCount === 0 ? null : (
          <Button
            className={styles.eventQueueOpenButton}
            type="button"
            variant="secondary"
            onClick={onOpenPendingProofs}
          >
            <Icon name="camera" />
            {t('pendingProofs.open')} ({pendingProofCount})
          </Button>
        )}
      </section>

      <section className={styles.profileCard}>
        <h2 className={styles.profileSectionTitle}>{t('profile.queueTitle')}</h2>
        <p className={styles.profileMeta} role="status">
          {queuedCount > 0 ? t('queued', { count: queuedCount }) : t('profile.queueEmpty')}
        </p>
        {/* Spec 082 D7: a entrada pelo Perfil para a tela de eventos pendentes */}
        <Button
          className={styles.eventQueueOpenButton}
          type="button"
          variant="secondary"
          onClick={onOpenQueue}
        >
          {t('eventQueue.open')}
        </Button>
      </section>

      <DriverLocationConsentCard />

      <section className={styles.profileCard}>
        <h2 className={styles.profileSectionTitle}>{t('profile.whatsappTitle')}</h2>
        <WhatsAppPhonePanel />
      </section>

      <Button
        className={styles.signOutButton}
        type="button"
        variant="secondary"
        onClick={() => {
          /**
           * ADR-0075 §8: "Sair" leva a viagem guardada junto — nada dela fica no aparelho. Falha ao
           * apagar não segura o logout; o snapshot ainda vence em 24 h e sai no próximo login.
           */
          void discardTripSnapshots({ store: createIndexedDbTripSnapshotStore() })
            .catch(() => undefined)
            .then(() => getKeycloakAuthProvider().logout())
        }}
      >
        <Icon name="logout" />
        {t('profile.signOut')}
      </Button>
    </main>
  )
}

/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import type { DriverTripSnapshot } from '../shared/driverTrip.types'
import styles from '../styles/driverTrip.module.css'

type DriverProfilePageProps = Readonly<{
  onOpenQueue: () => void
  queuedCount: number
  snapshot: DriverTripSnapshot | undefined
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
export function DriverProfilePage({ onOpenQueue, queuedCount, snapshot }: DriverProfilePageProps) {
  const { t } = useTranslation('driverTrip')
  const authMeQuery = useAuthMeQuery()
  const profile = getKeycloakAuthProvider().getProfile()
  const trip = snapshot?.trips[0]
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

      <Button
        className={styles.signOutButton}
        type="button"
        variant="secondary"
        onClick={() => {
          void getKeycloakAuthProvider().logout()
        }}
      >
        <Icon name="logout" />
        {t('profile.signOut')}
      </Button>
    </main>
  )
}

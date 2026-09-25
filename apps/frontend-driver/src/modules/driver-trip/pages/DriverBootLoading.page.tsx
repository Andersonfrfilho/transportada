/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import styles from '../styles/driverTrip.module.css'

/**
 * O que o boot mostra enquanto sonda o Keycloak e lê o snapshot (spec 189 T9.2 A3): a sonda leva
 * até 5 s com sinal fraco, e a página em branco nesse tempo parece app travada.
 */
export function DriverBootLoadingPage() {
  const { t } = useTranslation('driverTrip')

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

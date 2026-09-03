/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Skeleton } from '@/components/ui/skeleton'
import { useInstallationBrand } from '@/modules/identity/queries/useInstallationBrand.query'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import styles from '../styles/driverTrip.module.css'

/**
 * Spec 082 D1: marca do produto + nome da empresa + quem está dirigindo. O nome da empresa vem das
 * mesmas rotas públicas da tela de entrar (`useInstallationBrand`) — um deploy é de uma
 * transportadora só (ADR-0021), então o dado já existe sem rota nova.
 */
export function DriverShellHeader() {
  const brand = useInstallationBrand()
  const profile = getKeycloakAuthProvider().getProfile()

  return (
    <header className={styles.moduleHeader}>
      <span className={styles.moduleBrand}>
        <img alt="" className={styles.moduleBrandLogo} src="/icons/icon.svg" />
        <span className={styles.moduleBrandCopy}>
          <strong>TransportAdA</strong>
          {brand.isLoading ? (
            <Skeleton height="0.7rem" width="var(--space-16)" />
          ) : brand.data?.name != null ? (
            <span className={styles.moduleCompanyName}>{brand.data.name}</span>
          ) : null}
        </span>
      </span>
      {/* A API não expõe foto ao papel de campo hoje (a rota de foto é `users.manage`): iniciais. */}
      <span aria-hidden="true" className={styles.driverAvatar}>
        {profile.initials}
      </span>
    </header>
  )
}

/* Copyright (c) 2026 Ada Technology. MIT License. */
import { InstallationBrandMark } from '@/modules/identity/components/InstallationBrandMark.component'
import { useInstallationBrandView } from '@/modules/identity/hooks/useInstallationBrandView.hook'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import styles from '../styles/driverTrip.module.css'

/**
 * Spec 082 D1: marca do produto + nome da empresa + quem está dirigindo. O nome da empresa vem das
 * mesmas rotas públicas da tela de entrar (`useInstallationBrand`) — um deploy é de uma
 * transportadora só (ADR-0021), então o dado já existe sem rota nova.
 */
export function DriverShellHeader() {
  const brand = useInstallationBrandView()
  const profile = getKeycloakAuthProvider().getProfile()

  return (
    <header className={styles.moduleHeader}>
      {/* Quem contratou o motorista é a transportadora: a marca dela, não a do produto. */}
      <span className={styles.moduleBrand}>
        <InstallationBrandMark
          brand={brand}
          logoClassName={styles.moduleBrandLogo}
          nameClassName={styles.moduleCompanyName}
        />
      </span>
      {/* A API não expõe foto ao papel de campo hoje (a rota de foto é `users.manage`): iniciais. */}
      <span aria-hidden="true" className={styles.driverAvatar}>
        {profile.initials}
      </span>
    </header>
  )
}

/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/components/DriverShellHeader.component.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * ⚠️ Diferença da origem (T3.3, ADR-0075 §7 linha do sino): o painel não tem `NotificationBell` no
 * `DriverShellHeader` — ele mora no shell inteiro do painel, fora deste componente. Aqui o cabeçalho
 * do módulo É o cabeçalho do app, então o sino entra aqui.
 */
import { NotificationBell } from '@adatechnology/notification-ui'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { InstallationBrandMark } from '@/modules/identity/components/InstallationBrandMark.component'
import { useInstallationBrandView } from '@/modules/identity/hooks/useInstallationBrandView.hook'
import notificationStyles from '@/modules/notification/styles/notification.module.css'
import { navigateToDriverSection } from '@/modules/shared/driverRoute.service'
import { getKeycloakAuthProvider } from '@/modules/shared/KeycloakAuthProvider.provider'

import { formatQueueBadge } from '../shared/pendingQueue.service'
import styles from '../styles/driverTrip.module.css'

const NOTIFICATION_BELL_CLASS = notificationStyles.notificationBell ?? ''

/**
 * Spec 082 D1: marca do produto + nome da empresa + quem está dirigindo. O nome da empresa vem das
 * mesmas rotas públicas da tela de entrar (`useInstallationBrand`) — um deploy é de uma
 * transportadora só (ADR-0021), então o dado já existe sem rota nova.
 *
 * Plan D4: o sino leva a `/notificacoes`, que a casca (`main.tsx`) resolve pela mesma leitura de
 * rota que decide o resto — nenhuma CSP nova, o stream fala com a origem da API já declarada.
 */
type DriverShellHeaderProps = Readonly<{
  /** Spec 193 D13: o `total` do dono na fila (`selectPendingTotal`), vindo do `useDriverTrip`. */
  pendingCount: number
}>

/**
 * Spec 193 D13: a fila de envio ganha lugar fixo entre a marca e o sino — o aviso da viagem some
 * quando a fila esvazia, e a entrada do Perfil fica a dois toques.
 */
export function DriverShellHeader({ pendingCount }: DriverShellHeaderProps) {
  const { t } = useTranslation('driverTrip')
  const brand = useInstallationBrandView()
  const profile = getKeycloakAuthProvider().getProfile()
  const badge = formatQueueBadge(pendingCount)

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
      <button
        aria-label={t('queueHeader.label', { count: pendingCount })}
        className={styles.queueButton}
        type="button"
        onClick={() => navigateToDriverSection('queue')}
      >
        <Icon name="upload" />
        {badge === '' ? null : (
          <span aria-hidden="true" className={styles.queueBadge}>
            {badge}
          </span>
        )}
      </button>
      <NotificationBell
        className={NOTIFICATION_BELL_CLASS}
        onClick={() => navigateToDriverSection('notifications')}
      />
      {/* A API não expõe foto ao papel de campo hoje (a rota de foto é `users.manage`): iniciais. */}
      <span aria-hidden="true" className={styles.driverAvatar}>
        {profile.initials}
      </span>
    </header>
  )
}

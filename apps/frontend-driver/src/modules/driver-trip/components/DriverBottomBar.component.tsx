/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/components/DriverBottomBar.component.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * ⚠️ Diferença da origem (spec 263): a aba "Conversas" com selo de não lidas — o painel não tem
 * esta barra com três seções.
 */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { useConversationsUnreadCount } from '@/modules/conversation/hooks/useConversationsUnreadCount.hook'
import conversationStyles from '@/modules/conversation/styles/conversation.module.css'

import styles from '../styles/driverTrip.module.css'

export type DriverSection = 'conversations' | 'profile' | 'trip'

type DriverBottomBarProps = Readonly<{
  onSelect: (section: DriverSection) => void
  section: DriverSection
}>

const UNREAD_BADGE_MAX = 99

function formatUnreadBadge(total: number): string {
  return total > UNREAD_BADGE_MAX ? `${UNREAD_BADGE_MAX}+` : String(total)
}

/** Spec 082 D1: seções alcançáveis com o polegar — a barra fica fixa no rodapé. */
export function DriverBottomBar({ onSelect, section }: DriverBottomBarProps) {
  const { t } = useTranslation('driverTrip')
  const unreadCount = useConversationsUnreadCount()

  return (
    <nav aria-label={t('nav.label')} className={styles.bottomBar}>
      <button
        aria-current={section === 'trip' ? 'page' : undefined}
        className={section === 'trip' ? styles.bottomBarItemActive : styles.bottomBarItem}
        type="button"
        onClick={() => onSelect('trip')}
      >
        <Icon name="workspace-driver-trip" />
        <span>{t('nav.trip')}</span>
      </button>
      <button
        aria-current={section === 'conversations' ? 'page' : undefined}
        className={section === 'conversations' ? styles.bottomBarItemActive : styles.bottomBarItem}
        type="button"
        onClick={() => onSelect('conversations')}
      >
        <span className={conversationStyles.tabIcon}>
          <Icon name="message" />
          {unreadCount > 0 ? (
            <span aria-hidden="true" className={conversationStyles.unreadBadge}>
              {formatUnreadBadge(unreadCount)}
            </span>
          ) : null}
        </span>
        <span>{t('nav.conversations')}</span>
      </button>
      <button
        aria-current={section === 'profile' ? 'page' : undefined}
        className={section === 'profile' ? styles.bottomBarItemActive : styles.bottomBarItem}
        type="button"
        onClick={() => onSelect('profile')}
      >
        <Icon name="workspace-users" />
        <span>{t('nav.profile')}</span>
      </button>
    </nav>
  )
}

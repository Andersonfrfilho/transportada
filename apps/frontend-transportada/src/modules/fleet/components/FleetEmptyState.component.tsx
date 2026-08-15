/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Button } from '@/components/ui/button'
import { Icon, type IconName } from '@/components/ui/icon'

import styles from '../styles/fleet.module.css'

type FleetEmptyStateProps = Readonly<{
  action?: Readonly<{ icon: IconName; label: string; onAction: () => void }>
  description: string
  title: string
}>

export function FleetEmptyState({ action, description, title }: FleetEmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      <h3>{title}</h3>
      <p>{description}</p>
      {action === undefined ? null : (
        <Button type="button" onClick={action.onAction}>
          <Icon name={action.icon} />
          {action.label}
        </Button>
      )}
    </div>
  )
}

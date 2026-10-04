/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon, type IconName } from '@/components/ui/icon'

import type { CargoPreviewItemActionsController } from '../hooks/useCargoPreviewItemActions.hook'
import type { CargoPreviewItem, CargoPreviewItemAction } from '../shared/cargoPreview.types'
import { resolveCargoPreviewItemActions } from '../shared/cargoPreviewItemActions.service'
import styles from '../styles/cargoPreviewDetail.module.css'

type CargoPreviewItemActionsProps = Readonly<{
  actions: CargoPreviewItemActionsController
  canManage: boolean
  item: CargoPreviewItem
}>

const ICONS: Readonly<Record<CargoPreviewItemAction, IconName>> = {
  confirm: 'check',
  link: 'link',
  unlink: 'close',
}

/** Só as ações que a situação da linha permite, e só com `trip.manage`; a linha inválida não tem nenhuma. */
export function CargoPreviewItemActions({
  actions,
  canManage,
  item,
}: CargoPreviewItemActionsProps): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  const available = resolveCargoPreviewItemActions({ canManage, item })
  if (available.length === 0) return null

  const handlers: Readonly<Record<CargoPreviewItemAction, () => void>> = {
    confirm: () => actions.confirm(item),
    link: () => actions.openLink(item),
    unlink: () => actions.requestUnlink(item),
  }

  return (
    <div className={styles.rowActions}>
      {available.map((action) => (
        <Button
          aria-label={t(`preview.item.actions.${action}Label`, { row: item.rowNumber })}
          disabled={actions.isPending}
          key={action}
          onClick={handlers[action]}
          type="button"
          variant={action === 'confirm' ? 'secondary' : 'ghost'}
        >
          <Icon name={ICONS[action]} />
          {t(`preview.item.actions.${action}`)}
        </Button>
      ))}
    </div>
  )
}

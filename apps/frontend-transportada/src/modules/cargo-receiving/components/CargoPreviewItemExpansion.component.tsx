/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoPreviewItemActionsController } from '../hooks/useCargoPreviewItemActions.hook'
import type { CargoPreviewItem } from '../shared/cargoPreview.types'
import { resolvePreviewErrorKeys } from '../shared/cargoPreviewRefusal.service'
import styles from '../styles/cargoReceiving.module.css'
import { CargoPreviewManualLink } from './CargoPreviewManualLink.component'
import { CargoPreviewUnlinkWarning } from './CargoPreviewUnlinkWarning.component'

type CargoPreviewItemExpansionProps = Readonly<{
  actions: CargoPreviewItemActionsController
  contractorId: string
  item: CargoPreviewItem
  items: readonly CargoPreviewItem[]
}>

/** O que se abre sob a linha: o aviso de desvincular, o seletor de nota, ou só o erro de uma ação direta. */
export function CargoPreviewItemExpansion({
  actions,
  contractorId,
  item,
  items,
}: CargoPreviewItemExpansionProps): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  if (actions.confirmingUnlinkId === item.id) {
    return <CargoPreviewUnlinkWarning actions={actions} item={item} items={items} />
  }
  if (actions.linkingItemId === item.id) {
    return <CargoPreviewManualLink actions={actions} contractorId={contractorId} item={item} />
  }
  if (actions.errorCode === undefined || actions.errorItemId !== item.id) return null
  return (
    <p className={styles.error} role="alert">
      {t(resolvePreviewErrorKeys(actions.errorCode), {
        code: actions.errorCode,
      })}
    </p>
  )
}

/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { CargoPreviewItemActionsController } from '../hooks/useCargoPreviewItemActions.hook'
import type { CargoPreviewItem } from '../shared/cargoPreview.types'
import { countLinkedGroupRows } from '../shared/cargoPreviewItemActions.service'
import { resolvePreviewErrorKeys } from '../shared/cargoPreviewRefusal.service'
import styles from '../styles/cargoPreviewDetail.module.css'

type CargoPreviewUnlinkWarningProps = Readonly<{
  actions: CargoPreviewItemActionsController
  item: CargoPreviewItem
  items: readonly CargoPreviewItem[]
}>

/**
 * Desvincular age no grupo inteiro (RF5a item 9): soltar uma linha de uma soma deixaria as outras
 * apontando para uma nota que não fecha. O aviso diz isso ANTES de a ação sair.
 */
export function CargoPreviewUnlinkWarning({
  actions,
  item,
  items,
}: CargoPreviewUnlinkWarningProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const number = item.document?.number ?? ''

  return (
    <div className={styles.expansion} data-unlink-warning="">
      <p>
        {t('preview.unlink.warning', {
          count: countLinkedGroupRows({ item, items }),
          number,
        })}
      </p>
      {actions.errorCode === undefined ? null : (
        <p className={styles.rowErrors} role="alert">
          {t(resolvePreviewErrorKeys(actions.errorCode), {
            code: actions.errorCode,
          })}
        </p>
      )}
      <div className={styles.expansionActions}>
        <Button disabled={actions.isPending} onClick={() => actions.unlink(item)} type="button">
          <Icon name="close" />
          {t('preview.unlink.confirm')}
        </Button>
        <Button onClick={actions.cancelUnlink} type="button" variant="ghost">
          {t('preview.unlink.cancel')}
        </Button>
      </div>
    </div>
  )
}

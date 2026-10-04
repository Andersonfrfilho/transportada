/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Fragment, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { formatAmount } from '@/modules/shared/decimalAmount.service'

import { CARGO_PREVIEW_DEFAULT_LOCALE } from '../shared/cargoPreview.constant'
import type { CargoPreviewItemActionsController } from '../hooks/useCargoPreviewItemActions.hook'
import type { CargoPreviewItem } from '../shared/cargoPreview.types'
import { formatKilograms, formatOptionalText } from '../shared/cargoPreviewFormat.service'
import styles from '../styles/cargoPreviewDetail.module.css'
import tableStyles from '../styles/cargoTable.module.css'
import { CargoPreviewItemActions } from './CargoPreviewItemActions.component'
import { CargoPreviewItemExpansion } from './CargoPreviewItemExpansion.component'
import { CargoPreviewItemState } from './CargoPreviewItemState.component'

type CargoPreviewItemRowProps = Readonly<{
  actions: CargoPreviewItemActionsController
  canManage: boolean
  contractorId: string
  item: CargoPreviewItem
  /** Todas as linhas carregadas: o aviso de desvincular conta o grupo nelas. */
  items: readonly CargoPreviewItem[]
}>

const COLUMN_COUNT = 7

/**
 * Uma linha da planilha. Os dados do destinatário e o endereço são de terceiros: aparecem ao operador
 * autorizado, mas nunca em URL, título de aba ou log (nada aqui os escreve fora da célula).
 */
export function CargoPreviewItemRow({
  actions,
  canManage,
  contractorId,
  item,
  items,
}: CargoPreviewItemRowProps): JSX.Element {
  const { t, i18n } = useTranslation('cargoReceiving')
  const locale = i18n.resolvedLanguage ?? CARGO_PREVIEW_DEFAULT_LOCALE

  return (
    <Fragment>
      <tr data-item-id={item.id} data-row-number={item.rowNumber} data-state={item.matchState}>
        <td className={tableStyles.mono}>{item.rowNumber}</td>
        <td>
          <span className={styles.recipient}>
            <span>{item.recipientName ?? t('document.unknownRecipient')}</span>
            {item.address === null ? null : (
              <span className={styles.secondary}>{item.address}</span>
            )}
          </span>
        </td>
        <td>{formatOptionalText(item.city)}</td>
        <td>{item.value === null ? formatOptionalText(null) : formatAmount(item.value)}</td>
        <td>{formatKilograms({ locale, value: item.weightKg })}</td>
        <td>
          <CargoPreviewItemState item={item} />
        </td>
        <td>
          <CargoPreviewItemActions actions={actions} canManage={canManage} item={item} />
        </td>
      </tr>
      {actions.isExpanded(item.id) ? (
        <tr>
          <td colSpan={COLUMN_COUNT}>
            <CargoPreviewItemExpansion
              actions={actions}
              contractorId={contractorId}
              item={item}
              items={items}
            />
          </td>
        </tr>
      ) : null}
    </Fragment>
  )
}

/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoPreviewItemActionsController } from '../hooks/useCargoPreviewItemActions.hook'
import type { CargoPreviewItem } from '../shared/cargoPreview.types'
import type { CargoPreviewRouteSection as RouteSection } from '../shared/cargoPreviewDetailView.service'
import detailStyles from '../styles/cargoPreviewDetail.module.css'
import tableStyles from '../styles/cargoTable.module.css'
import { CargoPreviewItemRow } from './CargoPreviewItemRow.component'

type CargoPreviewRouteSectionProps = Readonly<{
  actions: CargoPreviewItemActionsController
  canManage: boolean
  contractorId: string
  items: readonly CargoPreviewItem[]
  section: RouteSection
}>

const COLUMNS = ['row', 'recipient', 'city', 'value', 'weight', 'state', 'actions'] as const
const COLUMN_CLASSES = [
  detailStyles.colRow,
  detailStyles.colRecipient,
  detailStyles.colCity,
  detailStyles.colAmount,
  detailStyles.colWeight,
  detailStyles.colState,
  detailStyles.colActions,
] as const

function RouteFacts({ section }: Readonly<{ section: RouteSection }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const { group } = section
  if (group === undefined) return <></>
  const load =
    group.loadReference === null
      ? t('preview.route.noLoad')
      : t('preview.route.load', {
          origin: group.loadOrigin === null ? '' : t(`preview.route.origin.${group.loadOrigin}`),
          reference: group.loadReference,
        })
  return (
    <p className={detailStyles.routeFacts}>
      <span>{load}</span>
      <span>
        {t('preview.route.counts', { matched: group.counts.matched, total: group.counts.total })}
      </span>
    </p>
  )
}

function RouteTable({
  actions,
  canManage,
  contractorId,
  items,
  section,
  title,
}: CargoPreviewRouteSectionProps & Readonly<{ title: string }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  return (
    <div
      aria-label={t('preview.route.region', { title })}
      className={tableStyles.tableScroll}
      role="region"
      tabIndex={0}
    >
      <table className={`${tableStyles.table} ${tableStyles.stacked} ${detailStyles.itemTable}`}>
        <colgroup>
          {COLUMN_CLASSES.map((className, index) => (
            <col className={className} key={COLUMNS[index]} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col">
                {t(`preview.item.columns.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.items.map((item) => (
            <CargoPreviewItemRow
              actions={actions}
              canManage={canManage}
              contractorId={contractorId}
              item={item}
              items={items}
              key={item.id}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Um roteiro do contratante: a carga que o servidor ligou a ele e as linhas, cada uma com a sua situação. */
export function CargoPreviewRouteSection({
  actions,
  canManage,
  contractorId,
  items,
  section,
}: CargoPreviewRouteSectionProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const title = section.routeName ?? t('preview.route.none')

  return (
    <section className={detailStyles.routeSection} data-route-section={section.routeName ?? ''}>
      <header className={detailStyles.routeHeader}>
        <h3>{title}</h3>
        <RouteFacts section={section} />
      </header>
      <RouteTable
        actions={actions}
        canManage={canManage}
        contractorId={contractorId}
        items={items}
        section={section}
        title={title}
      />
    </section>
  )
}

/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { useTripOccurrenceAttachmentsQuery } from '../queries/tripOccurrenceFeed.query'
import type { TripOccurrenceTableController } from '../hooks/useTripOccurrenceTable.hook'
import {
  describeOccurrenceConversationCell,
  describeOccurrenceDocumentCells,
  formatOccurrenceInvoice,
  resolveOccurrenceTypeLabel,
  type TripOccurrenceColumnKey,
  type TripOccurrenceFeedItem,
} from '../shared/tripOccurrenceFeed.service'
import { OccurrenceAttachmentGrid } from './OccurrenceAttachmentGrid.component'
import { OccurrenceCasePanel } from './OccurrenceCasePanel.component'
import {
  buildTripOccurrenceRoute,
  navigateToTripOccurrence,
} from '../shared/tripOccurrenceRoute.service'
import styles from '../styles/trip.module.css'

const momentFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

export function formatMoment(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : momentFormatter.format(moment)
}

type TripOccurrenceTableProps = Readonly<{
  /** Spec 164 T22: `occurrences.resolve` — quem valida a tratativa, nunca `trip.manage` (D7). */
  canResolveOccurrenceCases: boolean
  table: TripOccurrenceTableController
}>

/** Spec 183 T205: contratante (com CNPJ), destino físico e valor — vazios sem nota. */
function OccurrenceDocumentCell({
  column,
  item,
}: Readonly<{
  column: 'contractor' | 'destination' | 'invoiceValue'
  item: TripOccurrenceFeedItem
}>) {
  const cells = describeOccurrenceDocumentCells(item.document)

  if (column === 'contractor') {
    return (
      <td className={styles.occurrenceWrapCell}>
        {cells.contractorName}
        {cells.contractorTaxId === '' ? null : (
          <span className={styles.occurrenceCellNote}>{cells.contractorTaxId}</span>
        )}
      </td>
    )
  }
  if (column === 'destination') {
    return <td className={styles.occurrenceWrapCell}>{cells.destination}</td>
  }
  return (
    <td className={styles.occurrenceMoneyCell}>
      {cells.totalValue === null ? '' : formatAmount(cells.totalValue)}
    </td>
  )
}

/**
 * Spec 183 T404 (RF4): a decisão da tratativa vence o estado da conversa; as mensagens do motorista
 * ainda não lidas por quem está vendo vão ao lado, em texto — nunca só um número ou uma cor.
 */
function OccurrenceConversationCell({ item }: Readonly<{ item: TripOccurrenceFeedItem }>) {
  const { t } = useTranslation('trip')
  const cell = describeOccurrenceConversationCell(item)

  return (
    <td className={styles.occurrenceConversationCell}>
      {cell.state === null ? null : (
        <span className={styles.statusBadge}>
          {t(`occurrenceFeed.conversation.${cell.state.kind}.${cell.state.value}`)}
        </span>
      )}
      {cell.driverUnreadCount === 0 ? null : (
        <span className={styles.occurrenceCellNote}>
          {t('occurrenceFeed.conversation.driverUnread', { count: cell.driverUnreadCount })}
        </span>
      )}
    </td>
  )
}

/** Sem router: a troca de página é `pushState`, sem recarregar o app (spec 183 P1). */
function openOccurrence(occurrenceId: string): void {
  navigateToTripOccurrence({ navigator: createBrowserWorkspaceNavigator(), occurrenceId })
}

function OccurrenceCell({
  column,
  item,
}: Readonly<{ column: TripOccurrenceColumnKey; item: TripOccurrenceFeedItem }>) {
  const { t } = useTranslation('trip')

  if (column === 'createdAt') return <td>{formatMoment(item.createdAt)}</td>
  if (column === 'stage') {
    const stageKey = item.stage ?? 'stop'
    return (
      <td>
        <span className={styles.statusBadge}>{t(`occurrenceFeed.stage.${stageKey}`)}</span>
      </td>
    )
  }
  if (column === 'typeName') {
    const label = resolveOccurrenceTypeLabel(item)
    /** Spec 183 P1: o tipo é o link da linha — teclado e leitor de tela chegam ao detalhe por ele. */
    return (
      <td>
        <a
          className={styles.occurrenceRowLink}
          href={buildTripOccurrenceRoute(item.id)}
          onClick={(event) => {
            event.preventDefault()
            openOccurrence(item.id)
          }}
        >
          {label.labelKey === null ? label.value : t(label.labelKey)}
        </a>
      </td>
    )
  }
  if (column === 'vehiclePlate') return <td>{item.vehiclePlate}</td>
  if (column === 'driverName') return <td>{item.driverName}</td>
  if (column === 'stopLabel') return <td>{item.stopLabel ?? ''}</td>
  if (column === 'invoice') {
    return <td>{formatOccurrenceInvoice(item.invoiceNumber, item.invoiceSeries)}</td>
  }
  if (column === 'contractor' || column === 'destination' || column === 'invoiceValue') {
    return <OccurrenceDocumentCell column={column} item={item} />
  }
  if (column === 'conversation') return <OccurrenceConversationCell item={item} />
  /** A marca de aviso enviado: o tipo cadastrado que notifica o embarcador. */
  return (
    <td>
      {item.notifies ? (
        <span className={styles.statusBadge}>{t('occurrenceFeed.notified')}</span>
      ) : null}
    </td>
  )
}

/**
 * Spec 161 T24 (RF10, CA6b): busca as miniaturas só ao abrir o detalhe — nunca na carga da
 * lista — e delega a grade (esqueleto, `loading="lazy"`, selo de expirada/erro) ao componente
 * compartilhado com o painel da nota e o detalhe da ocorrência.
 */
export function OccurrenceAttachments({ item }: Readonly<{ item: TripOccurrenceFeedItem }>) {
  const attachmentsQuery = useTripOccurrenceAttachmentsQuery({
    enabled: item.hasAttachment,
    occurrenceId: item.id,
  })

  if (!item.hasAttachment) return null
  if (attachmentsQuery.isLoading) return <Skeleton height="6rem" width="8rem" />
  const attachments = attachmentsQuery.data ?? []
  if (attachments.length === 0) return null

  return (
    <OccurrenceAttachmentGrid
      attachments={attachments}
      occurrenceCreatedAt={item.createdAt}
      onRefresh={async () => (await attachmentsQuery.refetch()).data ?? []}
    />
  )
}

function OccurrenceDetailRow({
  canResolveOccurrenceCases,
  columnCount,
  item,
}: Readonly<{
  canResolveOccurrenceCases: boolean
  columnCount: number
  item: TripOccurrenceFeedItem
}>) {
  const { t } = useTranslation('trip')

  return (
    <tr className={styles.occurrenceDetailRow}>
      <td colSpan={columnCount}>
        <p className={styles.occurrenceDescription}>
          {item.description.length === 0
            ? t('occurrenceFeed.detail.noDescription')
            : item.description}
        </p>
        <OccurrenceAttachments item={item} />
        {item.source === 'document' ? (
          <OccurrenceCasePanel
            canResolve={canResolveOccurrenceCases}
            occurrenceCase={item.case}
            occurrenceId={item.id}
          />
        ) : null}
      </td>
    </tr>
  )
}

export function TripOccurrenceTableSkeleton() {
  const { t } = useTranslation('trip')

  return (
    <div className={styles.tableScroll}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th scope="col">{t('occurrenceFeed.columns.createdAt')}</th>
            <th scope="col">{t('occurrenceFeed.columns.typeName')}</th>
            <th scope="col">{t('occurrenceFeed.columns.vehiclePlate')}</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }, (_, index) => (
            <tr key={index}>
              <td>
                <Skeleton variant="text" width="65%" />
              </td>
              <td>
                <Skeleton variant="text" width="75%" />
              </td>
              <td>
                <Skeleton variant="text" width="50%" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Spec 183 T801 (P11): no celular, cada ocorrência é um cartão com o que decide o clique —
 * contratante, valor, endereço e motorista, além do tipo, da etapa e da conversa. O cartão inteiro
 * é o link do detalhe (o mesmo da linha da tabela).
 */
function OccurrenceCard({ item }: Readonly<{ item: TripOccurrenceFeedItem }>) {
  const { t } = useTranslation('trip')
  const cells = describeOccurrenceDocumentCells(item.document)
  const conversation = describeOccurrenceConversationCell(item)
  const label = resolveOccurrenceTypeLabel(item)

  return (
    <li>
      <a
        className={styles.occurrenceCard}
        href={buildTripOccurrenceRoute(item.id)}
        onClick={(event) => {
          event.preventDefault()
          openOccurrence(item.id)
        }}
      >
        <span className={styles.occurrenceCardHead}>
          <strong>{label.labelKey === null ? label.value : t(label.labelKey)}</strong>
          <span className={styles.statusBadge}>
            {t(`occurrenceFeed.stage.${item.stage ?? 'stop'}`)}
          </span>
        </span>
        <span className={styles.occurrenceCellNote}>
          {formatMoment(item.createdAt)} · {item.vehiclePlate}
        </span>
        <dl className={styles.occurrenceCardFields}>
          {cells.contractorName === '' ? null : (
            <div>
              <dt>{t('occurrenceFeed.columns.contractor')}</dt>
              <dd>{cells.contractorName}</dd>
            </div>
          )}
          {cells.totalValue === null ? null : (
            <div>
              <dt>{t('occurrenceFeed.columns.invoiceValue')}</dt>
              <dd className={styles.occurrenceMoneyCell}>{formatAmount(cells.totalValue)}</dd>
            </div>
          )}
          {cells.destination === '' ? null : (
            <div>
              <dt>{t('occurrenceFeed.columns.destination')}</dt>
              <dd>{cells.destination}</dd>
            </div>
          )}
          <div>
            <dt>{t('occurrenceFeed.columns.driverName')}</dt>
            <dd>{item.driverName}</dd>
          </div>
        </dl>
        {conversation.state === null && conversation.driverUnreadCount === 0 ? null : (
          <span className={styles.occurrenceCardHead}>
            {conversation.state === null ? null : (
              <span className={styles.statusBadge}>
                {t(
                  `occurrenceFeed.conversation.${conversation.state.kind}.${conversation.state.value}`,
                )}
              </span>
            )}
            {conversation.driverUnreadCount === 0 ? null : (
              <span className={styles.occurrenceCellNote}>
                {t('occurrenceFeed.conversation.driverUnread', {
                  count: conversation.driverUnreadCount,
                })}
              </span>
            )}
          </span>
        )}
      </a>
    </li>
  )
}

export function TripOccurrenceTable({
  canResolveOccurrenceCases,
  table,
}: TripOccurrenceTableProps) {
  const { t } = useTranslation('trip')

  if (table.isLoading) return <TripOccurrenceTableSkeleton />

  const columnCount = table.visibleColumns.length + 1

  return (
    <>
      {/** Spec 183 T801: o celular vê cartões; a partir de 40rem, a tabela (só CSS, sem JS). */}
      <div className={styles.occurrenceCardsFrame}>
        <Button onClick={table.toggleOrder} size="sm" type="button" variant="ghost">
          <Icon name={table.order === 'desc' ? 'arrow-down' : 'arrow-up'} />
          {table.order === 'desc'
            ? t('occurrenceFeed.card.newestFirst')
            : t('occurrenceFeed.card.oldestFirst')}
        </Button>
        {table.items.length === 0 ? (
          <p className={styles.occurrenceCellNote}>{t('occurrenceFeed.empty')}</p>
        ) : (
          <ul aria-label={t('occurrenceFeed.card.list')} className={styles.occurrenceCards}>
            {table.items.map((item) => (
              <OccurrenceCard item={item} key={item.id} />
            ))}
          </ul>
        )}
      </div>
      <div className={`${styles.tableScroll} ${styles.occurrenceTableFrame}`}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              {table.visibleColumns.map((column) =>
                column === 'createdAt' ? (
                  <th
                    aria-sort={table.order === 'desc' ? 'descending' : 'ascending'}
                    key={column}
                    scope="col"
                  >
                    <button className={styles.sortButton} onClick={table.toggleOrder} type="button">
                      {t('occurrenceFeed.columns.createdAt')}
                      <span aria-hidden="true" className={styles.sortIndicator}>
                        {table.order === 'desc' ? '▼' : '▲'}
                      </span>
                    </button>
                  </th>
                ) : (
                  <th
                    className={column === 'invoiceValue' ? styles.occurrenceMoneyHeader : undefined}
                    key={column}
                    scope="col"
                  >
                    {t(`occurrenceFeed.columns.${column}`)}
                  </th>
                ),
              )}
              <th scope="col">
                <span className={styles.srOnly}>{t('occurrenceFeed.detail.title')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {table.items.length === 0 ? (
              <tr>
                <td colSpan={columnCount}>{t('occurrenceFeed.empty')}</td>
              </tr>
            ) : (
              table.items.flatMap((item) => {
                const rows = [
                  <tr
                    className={styles.occurrenceRow}
                    key={item.id}
                    onClick={(event) => {
                      /** A linha inteira abre o detalhe; botão e link dentro dela fazem só o deles. */
                      if (
                        event.target instanceof Element &&
                        event.target.closest('a, button') !== null
                      )
                        return
                      openOccurrence(item.id)
                    }}
                  >
                    {table.visibleColumns.map((column) => (
                      <OccurrenceCell column={column} item={item} key={column} />
                    ))}
                    <td>
                      <Button
                        onClick={() => table.toggleExpanded(item.id)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        <Icon name={table.expandedId === item.id ? 'close' : 'eye'} />
                        {table.expandedId === item.id
                          ? t('occurrenceFeed.detail.close')
                          : t('occurrenceFeed.detail.open')}
                      </Button>
                    </td>
                  </tr>,
                ]
                if (table.expandedId === item.id) {
                  rows.push(
                    <OccurrenceDetailRow
                      canResolveOccurrenceCases={canResolveOccurrenceCases}
                      columnCount={columnCount}
                      item={item}
                      key={`${item.id}-detail`}
                    />,
                  )
                }
                return rows
              })
            )}
          </tbody>
        </table>
      </div>

      {table.hasNextPage ? (
        <div className={styles.occurrenceLoadMore}>
          <Button
            disabled={table.isFetchingNextPage}
            onClick={table.fetchNextPage}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name={table.isFetchingNextPage ? 'spinner' : 'chevron-down'} />
            {table.isFetchingNextPage
              ? t('occurrenceFeed.loadingMore')
              : t('occurrenceFeed.loadMore')}
          </Button>
        </div>
      ) : null}
    </>
  )
}

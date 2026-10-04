/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { CargoPreviewItemActionsController } from '../hooks/useCargoPreviewItemActions.hook'
import {
  useCargoPreviewManualLink,
  type CargoPreviewManualLinkController,
  type ManualLinkOption,
} from '../hooks/useCargoPreviewManualLink.hook'
import type { CargoPreviewItem } from '../shared/cargoPreview.types'
import { resolvePreviewErrorKeys } from '../shared/cargoPreviewRefusal.service'
import styles from '../styles/cargoPreviewDetail.module.css'
import receivingStyles from '../styles/cargoReceiving.module.css'

type CargoPreviewManualLinkProps = Readonly<{
  actions: CargoPreviewItemActionsController
  contractorId: string
  item: CargoPreviewItem
}>

function OptionRow({
  isSelected,
  onSelect,
  option,
}: Readonly<{ isSelected: boolean; onSelect: () => void; option: ManualLinkOption }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const { document } = option

  return (
    <li className={styles.option} data-document-option={document.id}>
      <span className={styles.optionInfo}>
        <strong>{t('document.number', { number: document.number })}</strong>
        <span className={styles.secondary}>
          {[document.recipientName, document.cityName, formatAmount(document.totalValue)]
            .filter((part) => part !== null)
            .join(' · ')}
        </span>
      </span>
      {option.isCandidate ? (
        <span className={receivingStyles.badge}>{t('preview.manual.candidate')}</span>
      ) : null}
      <Button
        aria-label={t('preview.manual.chooseLabel', { number: document.number })}
        aria-pressed={isSelected}
        onClick={onSelect}
        type="button"
        variant={isSelected ? 'secondary' : 'ghost'}
      >
        {t('preview.manual.choose')}
      </Button>
    </li>
  )
}

function ManualLinkOptions({
  picker,
}: Readonly<{ picker: CargoPreviewManualLinkController }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  if (picker.isLoading) {
    return (
      <SkeletonGroup label={t('available.loading')}>
        <Skeleton height="2.5rem" />
      </SkeletonGroup>
    )
  }
  if (picker.errorCode !== undefined) {
    return (
      <p className={receivingStyles.error} role="alert">
        {t('available.error', { code: picker.errorCode })}
      </p>
    )
  }
  if (picker.options.length === 0) {
    return <p className={receivingStyles.hint}>{t('preview.manual.empty')}</p>
  }
  return (
    <>
      <ul className={styles.optionList}>
        {picker.options.map((option) => (
          <OptionRow
            isSelected={picker.selected?.id === option.document.id}
            key={option.document.id}
            onSelect={() => picker.select(option.document.id)}
            option={option}
          />
        ))}
      </ul>
      {picker.hasNextPage ? (
        <Button
          disabled={picker.isLoadingMore}
          onClick={picker.loadMore}
          type="button"
          variant="ghost"
        >
          <Icon name="page-next" />
          {t('available.loadMore')}
        </Button>
      ) : null}
    </>
  )
}

/**
 * Vincular à mão: as notas livres do contratante da prévia (a lista da Fase 2), com busca e as candidatas
 * primeiro. A escolha é uma só e só sai quando o operador confirma; o servidor recusa nota de outra prévia.
 */
export function CargoPreviewManualLink({
  actions,
  contractorId,
  item,
}: CargoPreviewManualLinkProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const picker = useCargoPreviewManualLink({
    candidateDocumentIds: item.candidateDocumentIds,
    contractorId,
  })

  return (
    <div className={styles.expansion} data-manual-link={item.id}>
      <h4>{t('preview.manual.title', { row: item.rowNumber })}</h4>
      <label className={receivingStyles.field}>
        {t('preview.manual.search')}
        <input
          onChange={(event) => picker.setQuery(event.target.value)}
          placeholder={t('available.searchPlaceholder')}
          type="search"
          value={picker.query}
        />
      </label>
      <ManualLinkOptions picker={picker} />
      {actions.errorCode === undefined ? null : (
        <p className={receivingStyles.error} role="alert">
          {t(resolvePreviewErrorKeys(actions.errorCode), { code: actions.errorCode })}
        </p>
      )}
      <div className={styles.expansionActions}>
        {picker.selected === undefined ? null : (
          <Button
            disabled={actions.isPending}
            onClick={() => actions.link({ documentId: picker.selected?.id ?? '', item })}
            type="button"
          >
            <Icon name="link" />
            {t('preview.manual.confirm', { number: picker.selected.number })}
          </Button>
        )}
        <Button onClick={actions.closeLink} type="button" variant="ghost">
          {t('preview.manual.cancel')}
        </Button>
      </div>
    </div>
  )
}

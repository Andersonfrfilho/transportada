/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useContractorDirectory } from '../hooks/useContractorDirectory.hook'
import { hasContractorTableCriteria } from '../shared/contractorTable.service'
import styles from '../styles/contractorDirectory.module.css'
import { ContractorFicha } from './ContractorFicha.component'
import { ContractorFilterBar } from './ContractorFilterBar.component'
import { ContractorTable } from './ContractorTable.component'

type ContractorDirectoryPanelProps = Readonly<{
  /** `settings.manage`: quem só lê vê a ficha inteira, mas não a altera. */
  canManage: boolean
}>

/**
 * Spec 237 T1.4: a primeira tela de contratante. Todo contratante nasce da nota, então a lista não
 * tem "novo contratante" — o que esta aba faz é acertar os dados e as regras de recebimento de cada um.
 */
export function ContractorDirectoryPanel({
  canManage,
}: ContractorDirectoryPanelProps): JSX.Element {
  const { t } = useTranslation('contractorDirectory')
  const directory = useContractorDirectory()
  const isFiltered = hasContractorTableCriteria(directory.table.state)

  return (
    <>
      <p className={styles.hint}>{t('hint')}</p>
      <ContractorFilterBar
        shownCount={directory.visible.length}
        table={directory.table}
        totalCount={directory.total}
      />

      {directory.isLoading ? (
        <SkeletonGroup label={t('table.loading')}>
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      ) : directory.errorCode !== undefined ? (
        <p className={styles.error} role="alert">
          {t('table.error', { code: directory.errorCode })}
        </p>
      ) : directory.visible.length === 0 ? (
        <p className={styles.hint}>{isFiltered ? t('table.emptyFiltered') : t('table.empty')}</p>
      ) : null}

      {directory.visible.length === 0 ? null : (
        <ContractorTable
          contractors={directory.visible}
          onOpen={directory.selectContractor}
          profiles={directory.profiles}
          table={directory.table}
        />
      )}

      {directory.selected === undefined ? null : (
        <ContractorFicha
          canManage={canManage}
          contractor={directory.selected}
          key={directory.selected.id}
          onClose={() => directory.selectContractor(null)}
        />
      )}
    </>
  )
}

/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CountBadge } from '@/components/ui/count-badge'
import { Icon } from '@/components/ui/icon'
import { NfeDocumentFilterPanel } from '@/modules/nfe-workspace/components/NfeDocumentFilterPanel.component'
import { useNfeDocumentTable } from '@/modules/nfe-workspace/hooks/useNfeDocumentTable.hook'
import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

import type { ScannedNfeDocument } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripDocumentSearchProps = Readonly<{
  documents: readonly NfeDocumentListItem[]
  /**
   * Onde a escolha já **é** o lote, o que se marca entra direto. O botão de acrescentar só ganha
   * sentido onde a fila mistura o que veio da busca com o que veio do bipe — ali a escolha é um
   * passo, e a fila é outro. No roteiro não há bipe, e o passo a mais só fazia o operador marcar
   * trezentas notas e o botão de montar continuar apagado, sem dizer por quê.
   */
  /**
   * O que o filtro alcança, escolhido ou não. É o que o mapa da montagem desenha em cinza claro:
   * sem isto, a cidade vizinha que ficou de fora não teria como aparecer em lugar nenhum.
   */
  onFilteredChange?: (documents: readonly ScannedNfeDocument[]) => void
  onSelectionChange?: (documents: readonly ScannedNfeDocument[]) => void
  onStage?: (documents: readonly ScannedNfeDocument[]) => void
}>

/**
 * A busca é a **mesma** da tela de notas: o painel de filtro e o controlador vêm de lá inteiros, e
 * não uma cópia. Duas buscas de nota no mesmo produto divergiriam no primeiro filtro novo, e quem
 * monta a viagem espera achar a nota do mesmo jeito que a acha na listagem.
 *
 * O que muda aqui é só o alvo: em vez de emitir, a seleção vira lote de notas da viagem.
 */
export function TripDocumentSearch({
  documents,
  onFilteredChange,
  onSelectionChange,
  onStage,
}: TripDocumentSearchProps) {
  const { t } = useTranslation('trip')
  const [isOpen, setIsOpen] = useState(false)
  /**
   * Os rótulos de situação vêm do vocabulário das notas, não do `trip`: copiar as chaves faria
   * "Autorizada" ter duas grafias no mesmo produto.
   */
  const { t: tNotas } = useTranslation('nfeWorkspace')
  const table = useNfeDocumentTable({
    /** A viagem é operação não fiscal: nota sem CT-e possível continua sendo carga que sai. */
    allowBlocked: true,
    documents,
    statusLabels: {
      authorized: tNotas('documentStatus.authorized'),
      cancelled: tNotas('documentStatus.cancelled'),
      denied: tNotas('documentStatus.denied'),
    },
  })

  const selectedKey = [...table.selectedIds].sort().join(',')
  const reportSelection = useRef(onSelectionChange)
  reportSelection.current = onSelectionChange

  useEffect(() => {
    if (reportSelection.current === undefined) return
    reportSelection.current(documents.filter((document) => table.selectedIds.has(document.id)))
    // A chave é a lista de ids ordenada: o `Set` muda de identidade a cada render e reentraria.
  }, [selectedKey])

  const filteredKey = table.filteredDocuments.map((document) => document.id).join(',')
  const reportFiltered = useRef(onFilteredChange)
  reportFiltered.current = onFilteredChange

  useEffect(() => {
    if (reportFiltered.current === undefined) return
    reportFiltered.current(table.filteredDocuments)
    // Mesma razão da seleção: a lista muda de identidade a cada render e reentraria.
  }, [filteredKey])

  function stageSelected(): void {
    onStage?.(documents.filter((document) => table.selectedIds.has(document.id)))
    table.clearSelection()
  }

  return (
    <section className={styles.searchSection}>
      <div className={styles.scanRow}>
        <Button onClick={() => setIsOpen(!isOpen)} size="sm" type="button" variant="secondary">
          <Icon name="search" />
          {t('quickCreate.search')}
          {table.selectedCount > 0 ? <CountBadge count={table.selectedCount} /> : null}
        </Button>
        {onStage !== undefined && table.selectedCount > 0 ? (
          <Button onClick={() => stageSelected()} size="sm" type="button">
            <Icon name="add" />
            {t('quickCreate.stageSelected', { count: table.selectedCount })}
          </Button>
        ) : null}
        {isOpen && table.totalFiltered > 0 ? (
          <Button onClick={table.toggleAllFiltered} size="sm" type="button" variant="secondary">
            <Icon name={table.allFilteredSelected ? 'remove' : 'check'} />
            {t(
              table.allFilteredSelected
                ? 'quickCreate.clearFilteredSelection'
                : 'quickCreate.selectAllFiltered',
              { count: table.totalFiltered },
            )}
          </Button>
        ) : null}
      </div>

      {isOpen ? (
        <>
          <label className={styles.scanField}>
            {t('quickCreate.searchTerm')}
            <input
              onChange={(event) => table.setSearchTerm(event.target.value)}
              placeholder={t('quickCreate.searchTermPlaceholder')}
              type="search"
              value={table.searchTerm}
            />
          </label>

          <NfeDocumentFilterPanel table={table} />

          <p className={styles.hint}>
            {t('quickCreate.searchResult', { count: table.totalFiltered })}
          </p>

          <div className={styles.searchTableScroll}>
            <table className={styles.searchTable}>
              <thead>
                <tr>
                  <th scope="col">
                    <Checkbox
                      ariaLabel={t('quickCreate.selectAll')}
                      checked={table.allSelected}
                      onChange={table.toggleSelectAll}
                    />
                  </th>
                  <th scope="col">{t('quickCreate.columns.number')}</th>
                  <th scope="col">{t('quickCreate.columns.recipient')}</th>
                  <th scope="col">{t('quickCreate.columns.address')}</th>
                  <th scope="col">{t('quickCreate.columns.city')}</th>
                </tr>
              </thead>
              <tbody>
                {table.pageItems.map((document) => (
                  <tr key={document.id}>
                    <td>
                      <Checkbox
                        ariaLabel={`${document.number}/${document.series}`}
                        checked={table.selectedIds.has(document.id)}
                        onChange={() => table.toggleRow(document.id)}
                      />
                    </td>
                    <td>
                      {document.number}/{document.series}
                    </td>
                    <td>{document.recipientName}</td>
                    <td>{document.recipientAddress ?? ''}</td>
                    <td>
                      {document.recipientCity ?? ''}
                      {document.recipientState === null ? '' : `/${document.recipientState}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  )
}

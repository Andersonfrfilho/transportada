/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { KeyReaderFieldHandle } from '@/components/ui/key-reader-field'
import { Select } from '@/components/ui/select'
import { Tabs } from '@/components/ui/tabs'
import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

import { useBippedNotes, type UseBippedNotesInput } from '../hooks/useBippedNotes.hook'
import type { TripDocumentLinkFormController } from '../hooks/useTripDocumentLinkForm.hook'
import type { ScannedNfeDocument } from '../shared/trip.types'
import styles from '../styles/trip.module.css'
import { TripBippedNotes } from './TripBippedNotes.component'
import { TripDocumentSearch } from './TripDocumentSearch.component'
import { TripScanQueue } from './TripScanQueue.component'
import { TripTypedNoteFeedback } from './TripTypedNoteFeedback.component'

type LinkTab = 'quick' | 'search'

type TripLinkDocumentPanelProps = Readonly<{
  availableDocuments: readonly NfeDocumentListItem[]
  isLinking: boolean
  isLoadingDocuments: boolean
  linkForm: TripDocumentLinkFormController
  /** A pessoa abriu a busca ou começou a digitar: é hora de carregar as notas livres. */
  onNeedDocuments: () => void
  /** Vincula o que está digitado (número, chave ou identificador). */
  onLinkTyped: () => void
  /** Número repetido entre as notas livres: a pessoa escolheu qual. */
  onLinkCandidate: (documentId: string) => void
  /** Só os testes trocam a fila de busca, o cadastro e o envio de XML. */
  bippedOverrides?: Pick<UseBippedNotesInput, 'findDocument' | 'lookup' | 'uploadXml'>
}>

/**
 * "Vincular nota" tem dois caminhos para o mesmo fim. **Buscar e selecionar** usa a mesma busca e os
 * mesmos filtros da tela de notas (`TripDocumentSearch`), sem cópia. **Inserção rápida** é o que já
 * existia — câmera, chave de 44 caracteres — mais o número da nota, resolvido entre as livres.
 * Cálculo de frete não tem nota para buscar: nesse tipo de referência fica só o campo de identificador.
 */
export function TripLinkDocumentPanel({
  availableDocuments,
  bippedOverrides,
  isLinking,
  isLoadingDocuments,
  linkForm,
  onLinkCandidate,
  onLinkTyped,
  onNeedDocuments,
}: TripLinkDocumentPanelProps) {
  const { t } = useTranslation('trip')
  const [tab, setTab] = useState<LinkTab>('search')
  const [selected, setSelected] = useState<readonly ScannedNfeDocument[]>([])
  /** Remonta a busca depois de vincular: a seleção velha apontaria para notas que já saíram da lista. */
  const [searchEpoch, setSearchEpoch] = useState(0)
  const isNfe = linkForm.draft.mode === 'nfe'
  const readerRef = useRef<KeyReaderFieldHandle>(null)
  /** "Acrescentar" chama a mesma rota de vínculo do detalhe: as regras da viagem continuam sendo da API. */
  const bipped = useBippedNotes({
    ...bippedOverrides,
    onStage: (documents) => void linkForm.linkDocuments(documents),
    refocusReader: () => readerRef.current?.focus(),
    stagedDocumentIds: linkForm.linkedDocumentIds,
  })

  /** Chave digitada não vincula direto: vira linha da lista, como a lida pelo leitor. */
  function handleLinkTyped(): void {
    if (linkForm.reference?.kind !== 'accessKey') {
      onLinkTyped()
      return
    }
    bipped.read(linkForm.reference.value)
    linkForm.reset()
  }

  async function linkSelected(): Promise<void> {
    const documents = selected
    setSelected([])
    setSearchEpoch((current) => current + 1)
    await linkForm.linkDocuments(documents)
  }

  const quick = (
    <div className={styles.fieldGrid}>
      <label>
        {t(isNfe ? 'detail.quickInputLabel' : 'detail.linkValue')}
        <input
          autoComplete="off"
          inputMode={isNfe ? 'numeric' : undefined}
          onChange={(event) => {
            if (isNfe) onNeedDocuments()
            linkForm.setValue(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            if (linkForm.reference !== undefined && !isLoadingDocuments) handleLinkTyped()
          }}
          placeholder={isNfe ? t('detail.quickInputPlaceholder') : undefined}
          value={linkForm.draft.value}
        />
        <span className={styles.hint} role={isNfe && isLoadingDocuments ? 'status' : undefined}>
          {isNfe && isLoadingDocuments
            ? t('quickCreate.searchLoading')
            : t(isNfe ? 'detail.quickInputHint' : 'detail.linkValueHint')}
        </span>
      </label>
    </div>
  )

  return (
    <div className={styles.actionForm}>
      <h3>{t('detail.linkDocumentTitle')}</h3>
      {isNfe ? <p className={styles.hint}>{t('detail.linkAvailableHint')}</p> : null}
      <div className={styles.fieldGrid}>
        <label>
          {t('detail.linkMode')}
          <Select
            ariaLabel={t('detail.linkMode')}
            options={[
              { label: t('detail.linkModeNfe'), value: 'nfe' },
              { label: t('detail.linkModeFreight'), value: 'freight' },
            ]}
            value={linkForm.draft.mode}
            onChange={(value) => linkForm.setMode(value as 'freight' | 'nfe')}
          />
        </label>
      </div>

      {isNfe ? <TripBippedNotes bipped={bipped} readerRef={readerRef} /> : null}

      {isNfe ? (
        <Tabs
          ariaLabel={t('detail.linkTabs')}
          items={[
            {
              id: 'search',
              label: t('detail.tabSearch'),
              panel: (
                <div className={styles.linkDocumentsBody}>
                  <TripDocumentSearch
                    documents={availableDocuments}
                    isLoading={isLoadingDocuments}
                    key={searchEpoch}
                    onOpen={onNeedDocuments}
                    onSelectionChange={setSelected}
                  />
                  <div className={styles.actionActions}>
                    <Button
                      disabled={selected.length === 0 || isLinking}
                      onClick={() => void linkSelected()}
                      size="sm"
                      type="button"
                    >
                      <Icon name="link" />
                      {selected.length === 0
                        ? t('detail.linkSelectedEmpty')
                        : t('detail.linkSelected', { count: selected.length })}
                    </Button>
                  </div>
                </div>
              ),
            },
            { id: 'quick', label: t('detail.tabQuick'), panel: quick },
          ]}
          onChange={(id) => setTab(id as LinkTab)}
          value={tab}
        />
      ) : (
        quick
      )}

      {!isNfe || tab === 'quick' ? (
        <>
          {linkForm.issue === undefined ? null : (
            <p className={styles.alert} role="alert">
              {t(`feedback.${linkForm.issue}`)}
            </p>
          )}
          <TripTypedNoteFeedback
            icon="link"
            note={
              linkForm.candidates.length === 0
                ? undefined
                : { candidates: linkForm.candidates, kind: 'ambiguous' }
            }
            onPick={(candidate) => onLinkCandidate(candidate.id)}
          />
          <div className={styles.actionActions}>
            <Button
              disabled={
                linkForm.reference === undefined || isLinking || (isNfe && isLoadingDocuments)
              }
              onClick={handleLinkTyped}
              size="sm"
              type="button"
            >
              <Icon name="link" />
              {t('actions.linkDocument')}
            </Button>
          </div>
        </>
      ) : null}

      <TripScanQueue entries={linkForm.scanEntries} onClear={linkForm.clearScanEntries} />
    </div>
  )
}

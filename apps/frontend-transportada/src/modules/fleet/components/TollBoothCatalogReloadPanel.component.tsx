/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T303: o bloco de recarga do catálogo (RF4/RF6) — só renderizado com `settings.manage`
 * (D6, RF6, aceite 4). Seletor de extrato registrado (RF3), confirmação (D6: o efeito atinge todas
 * as empresas da instalação) e o resultado da execução (aceite 3, 5, 8). Caso extremo: nenhum
 * extrato registrado aponta o runbook quando o catálogo já está populado (aceite 8 é a rejeição de
 * duplicata, provada na API — T301).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

import { useDayFormatter } from '../hooks/useDayFormatter.hook'
import type { TollBoothCatalogReloadInput } from '../shared/tollBoothExtractClient.service'
import type { TollBoothCatalogStatus } from '../shared/tollBoothCatalog.validation'
import type {
  TollBoothExtractRow,
  TollBoothReloadResult,
} from '../shared/tollBoothExtract.validation'
import styles from '../styles/fleet.module.css'
import { TollBoothCatalogReloadDialog } from './TollBoothCatalogReloadDialog.component'
import { TollBoothCatalogReloadError } from './TollBoothCatalogReloadError.component'

export type TollBoothCatalogReloadPanelProps = Readonly<{
  catalogStatus: TollBoothCatalogStatus | undefined
  errorCode?: string
  extracts: readonly TollBoothExtractRow[] | undefined
  isPending: boolean
  /** A leitura da lista falhou: dizer "nenhum extrato" aqui seria afirmar algo falso da instalação. */
  loadFailed: boolean
  loading: boolean
  onReload: (input: TollBoothCatalogReloadInput) => void
  result: TollBoothReloadResult | undefined
}>

function extractOptionValue(extract: TollBoothExtractRow): string {
  return `${extract.dataset}::${extract.observedOn}`
}

function findExtract(
  extracts: readonly TollBoothExtractRow[],
  value: string,
): TollBoothExtractRow | undefined {
  return extracts.find((extract) => extractOptionValue(extract) === value)
}

export type TollBoothCatalogReloadDialogState = Readonly<{
  dialogErrorCode: string | undefined
  dialogExtract: TollBoothExtractRow | null
}>

/**
 * Spec 154 T503, defeito 9: puro e testável isolado, sem `useEffect` — o diálogo fecha sozinho
 * quando a recarga termina com sucesso, e reabrir depois de uma recarga que falhou não mostra o
 * erro antigo antes da nova tentativa. A chave é `hasSubmittedConfirmation`: volta a `false` toda
 * vez que o diálogo é reaberto (`openConfirmation`), então o erro só reaparece depois que ESTA
 * sessão de confirmação chamou `onReload` de verdade.
 */
export function resolveReloadDialogState(
  input: Readonly<{
    confirming: TollBoothExtractRow | null
    errorCode: string | undefined
    hasSubmittedConfirmation: boolean
    result: TollBoothReloadResult | undefined
  }>,
): TollBoothCatalogReloadDialogState {
  const isOpen =
    input.confirming !== null && !(input.hasSubmittedConfirmation && input.result !== undefined)
  return {
    dialogErrorCode: input.hasSubmittedConfirmation ? input.errorCode : undefined,
    dialogExtract: isOpen ? input.confirming : null,
  }
}

export function TollBoothCatalogReloadPanel(props: TollBoothCatalogReloadPanelProps) {
  const { t } = useTranslation('fleet')
  const formatDay = useDayFormatter()
  const [selectedValue, setSelectedValue] = useState('')
  const [confirmingValue, setConfirmingValue] = useState<string | null>(null)
  const [hasSubmittedConfirmation, setHasSubmittedConfirmation] = useState(false)
  const extracts = props.extracts ?? []

  // A recarga sempre começa apontando o extrato mais novo (RF3 devolve do mais novo ao mais
  // antigo) — derivado a cada render, nunca por `useEffect` sincronizando estado com estado
  // (standards/react.md): o operador só grava algo no estado quando troca a seleção.
  const effectiveSelectedValue =
    selectedValue !== ''
      ? selectedValue
      : extracts.length === 0
        ? ''
        : extractOptionValue(extracts[0] as TollBoothExtractRow)
  const selectedExtract = findExtract(extracts, effectiveSelectedValue)

  const confirming =
    confirmingValue === null ? null : (findExtract(extracts, confirmingValue) ?? null)
  const { dialogErrorCode, dialogExtract } = resolveReloadDialogState({
    confirming,
    errorCode: props.errorCode,
    hasSubmittedConfirmation,
    result: props.result,
  })

  const options: readonly SelectOption[] = extracts.map((extract) => ({
    label: t('tollBoothCharges.reload.optionLabel', {
      count: extract.boothCount,
      date: formatDay(extract.observedOn),
      name: extract.dataset,
    }),
    value: extractOptionValue(extract),
  }))

  function openConfirmation(): void {
    if (selectedExtract === undefined) return
    setConfirmingValue(extractOptionValue(selectedExtract))
    setHasSubmittedConfirmation(false)
  }

  function closeConfirmation(): void {
    setConfirmingValue(null)
  }

  function confirmReload(): void {
    if (confirming === null) return
    setHasSubmittedConfirmation(true)
    props.onReload({ dataset: confirming.dataset, observedOn: confirming.observedOn })
  }

  return (
    <section
      className={`${styles.panel} ${styles.tollBoothPanel}`}
      aria-labelledby="toll-booth-reload-panel-title"
    >
      <h2 id="toll-booth-reload-panel-title">{t('tollBoothCharges.reload.title')}</h2>
      <p className={styles.hint}>{t('tollBoothCharges.reload.hint')}</p>

      {props.loading ? (
        <Skeleton height="var(--field-height)" width="100%" />
      ) : props.loadFailed ? (
        <p className={styles.fuelPriceStatusError} role="alert">
          {t('tollBoothCharges.reload.loadError')}
        </p>
      ) : extracts.length === 0 ? (
        <p className={styles.fieldHint}>
          {props.catalogStatus === 'empty'
            ? t('tollBoothCharges.reload.noExtracts')
            : t('tollBoothCharges.reload.noExtractsWithCatalog')}
        </p>
      ) : (
        <>
          <label className={styles.filterBar}>
            <span>{t('tollBoothCharges.reload.selectLabel')}</span>
            <Select
              ariaLabel={t('tollBoothCharges.reload.selectLabel')}
              onChange={setSelectedValue}
              options={options}
              value={effectiveSelectedValue}
            />
          </label>
          <Button
            className={styles.tollBoothReloadAction}
            disabled={selectedExtract === undefined || props.isPending}
            type="button"
            onClick={openConfirmation}
          >
            <Icon name="download" />
            {t('tollBoothCharges.reload.button')}
          </Button>
        </>
      )}

      {props.result !== undefined && (
        <div className={styles.catalogHeader} role="status">
          <p className={styles.counter}>
            {t('tollBoothCharges.reload.resultSaved', { count: props.result.savedBoothCount })}
          </p>
          <p className={styles.counter}>
            {t('tollBoothCharges.reload.resultObservedOn', {
              date: formatDay(props.result.observedOn),
            })}
          </p>
          <p className={styles.counter}>
            {t('tollBoothCharges.reload.resultMissing', {
              count: props.result.boothsMissingFromExtract,
            })}
          </p>
        </div>
      )}

      {props.errorCode !== undefined && dialogExtract === null && (
        <TollBoothCatalogReloadError errorCode={props.errorCode} />
      )}

      <TollBoothCatalogReloadDialog
        errorCode={dialogErrorCode}
        extract={dialogExtract}
        isPending={props.isPending}
        onClose={closeConfirmation}
        onConfirm={confirmReload}
      />
    </section>
  )
}

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T303: o bloco de recarga do catálogo (RF4/RF6) — só renderizado com `settings.manage`
 * (D6, RF6, aceite 4). Seletor de extrato registrado (RF3), confirmação (D6: o efeito atinge todas
 * as empresas da instalação) e o resultado da execução (aceite 3, 5, 8). Caso extremo: nenhum
 * extrato registrado aponta o runbook quando o catálogo já está populado (aceite 8 é a rejeição de
 * duplicata, provada na API — T301).
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select, type SelectOption } from '@/components/ui/select'

import { useDayFormatter } from '../hooks/useDayFormatter.hook'
import type { TollBoothCatalogReloadInput } from '../shared/tollBoothExtractClient.service'
import type { TollBoothCatalogStatus } from '../shared/tollBoothCatalog.validation'
import type {
  TollBoothExtractRow,
  TollBoothReloadResult,
} from '../shared/tollBoothExtract.validation'
import styles from '../styles/fleet.module.css'
import { TollBoothCatalogReloadDialog } from './TollBoothCatalogReloadDialog.component'

export type TollBoothCatalogReloadPanelProps = Readonly<{
  catalogStatus: TollBoothCatalogStatus | undefined
  errorCode?: string
  extracts: readonly TollBoothExtractRow[] | undefined
  isPending: boolean
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

export function TollBoothCatalogReloadPanel(props: TollBoothCatalogReloadPanelProps) {
  const { t } = useTranslation('fleet')
  const formatDay = useDayFormatter()
  const [selectedValue, setSelectedValue] = useState('')
  const [confirming, setConfirming] = useState<TollBoothExtractRow | null>(null)
  const extracts = props.extracts ?? []

  // A recarga sempre começa apontando o extrato mais novo (RF3 devolve do mais novo ao mais antigo).
  useEffect(() => {
    if (selectedValue !== '' || extracts.length === 0) return
    setSelectedValue(extractOptionValue(extracts[0] as TollBoothExtractRow))
  }, [extracts, selectedValue])

  // A recarga terminou com sucesso: o diálogo de confirmação fecha sozinho, o resultado fica no painel.
  useEffect(() => {
    if (props.result !== undefined) setConfirming(null)
  }, [props.result])

  const selectedExtract = findExtract(extracts, selectedValue)
  const options: readonly SelectOption[] = extracts.map((extract) => ({
    label: t('tollBoothCharges.reload.optionLabel', {
      count: extract.boothCount,
      date: formatDay(extract.observedOn),
      name: extract.dataset,
    }),
    value: extractOptionValue(extract),
  }))

  function closeConfirmation(): void {
    setConfirming(null)
  }

  function confirmReload(): void {
    if (confirming === null) return
    props.onReload({ dataset: confirming.dataset, observedOn: confirming.observedOn })
  }

  return (
    <section className={styles.panel} aria-labelledby="toll-booth-reload-panel-title">
      <h3 id="toll-booth-reload-panel-title">{t('tollBoothCharges.reload.title')}</h3>
      <p className={styles.hint}>{t('tollBoothCharges.reload.hint')}</p>

      {props.loading ? null : extracts.length === 0 ? (
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
              value={selectedValue}
            />
          </label>
          <Button
            disabled={selectedExtract === undefined || props.isPending}
            type="button"
            onClick={() => setConfirming(selectedExtract ?? null)}
          >
            {t('tollBoothCharges.reload.button')}
          </Button>
        </>
      )}

      {props.result !== undefined && (
        <dl className={styles.catalogHeader} role="status">
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
        </dl>
      )}

      {props.errorCode !== undefined && confirming === null && (
        <p className={styles.feedback} role="alert">
          {t(`tollBoothCharges.reload.errors.${props.errorCode}`, {
            defaultValue: t('tollBoothCharges.reload.errors.default'),
          })}
        </p>
      )}

      <TollBoothCatalogReloadDialog
        errorCode={confirming === null ? undefined : props.errorCode}
        extract={confirming}
        isPending={props.isPending}
        onClose={closeConfirmation}
        onConfirm={confirmReload}
      />
    </section>
  )
}

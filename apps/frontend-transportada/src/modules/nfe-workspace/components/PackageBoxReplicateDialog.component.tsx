/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { usePackageBoxSiblings } from '../hooks/usePackageBoxQueue.hook'
import { toCentimetres } from '../shared/packageBoxMeasurementUnits.service'
import type { ReplicateDimensions } from '../shared/packageBoxReplicateOffer.service'
import {
  initialReplicateSelection,
  resolveReplicateTargets,
  resolveSelectedTargetIds,
} from '../shared/packageBoxReplicateSelection.service'
import styles from '../styles/packageBoxes.module.css'

export type { ReplicateDimensions } from '../shared/packageBoxReplicateOffer.service'

type PackageBoxReplicateDialogProps = Readonly<{
  boxId: string
  dimensions: ReplicateDimensions
  errorCode: string | undefined
  onClose: () => void
  onConfirm: (targetIds: readonly string[]) => void
  saving: boolean
}>

/**
 * Spec 155 (D5, D6, D11, G010, G011): abre depois de salvar uma caixa cuja família ainda tem
 * pendente. Reaproveita o molde do `ImpreciseConfirmDialog` (portal + `useModalDialog`) — nada de UI
 * paralela. Cancelar fecha sem chamar `onConfirm`: nada é gravado (D5).
 */
export function PackageBoxReplicateDialog({
  boxId,
  dimensions,
  errorCode,
  onClose,
  onConfirm,
  saving,
}: PackageBoxReplicateDialogProps) {
  const { t } = useTranslation('nfeWorkspace')
  /**
   * T14 (revisão final, ALTO-2): fechar durante a gravação abriria espaço para um sucesso tardio
   * desta réplica atingir outro diálogo já aberto — o `onSuccess` por chamada (painel) já cobre a
   * maioria dos casos, mas aqui a tela nem deixa o conferente tentar trocar de caixa no meio.
   */
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: true,
    onClose: saving ? () => undefined : onClose,
  })
  /** D9: sob demanda — as irmãs só existem para este diálogo, nunca junto da fila de 50 linhas. */
  const { loading, siblings } = usePackageBoxSiblings({ boxId })
  const targets = siblings === null ? [] : resolveReplicateTargets(siblings.family)
  const isLowConfidenceFamily = siblings?.isLowConfidenceFamily ?? false
  /**
   * Re-revisão (B3): `boxId` é sempre a origem resolvida — a própria caixa medida (D5/D6) ou a
   * irmã preferida por "aplicar a todos" (D12) — então `originVariantLabel` desta MESMA consulta
   * já é o rótulo do sabor de origem, nunca o da caixa que abriu o fluxo.
   */
  const originVariantLabel = siblings?.originVariantLabel ?? ''

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const initializedForRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (siblings === null || initializedForRef.current === boxId) return
    initializedForRef.current = boxId
    setSelected(initialReplicateSelection({ isLowConfidenceFamily, targets }))
  }, [siblings, boxId, isLowConfidenceFamily, targets])

  /**
   * T14 (revisão final, MÉDIO-1): `selected` pode ter sobrevivido a um refetch que tirou uma irmã
   * de `targets` (medida por outra pessoa nesse meio-tempo) — contar e enviar o `selected` cru
   * gravaria esse id junto, e a API recusaria (409) o lote inteiro por causa dele.
   */
  const selectedTargetIds = resolveSelectedTargetIds({ selected, targets })

  function toggleTarget(id: string): void {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return createPortal(
    <div className={styles.candidatesOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="package-box-replicate-title"
        aria-modal="true"
        className={styles.candidatesDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h3 id="package-box-replicate-title">
          {originVariantLabel === ''
            ? t('packageBoxes.replicateDialog.title')
            : t('packageBoxes.replicateDialog.titleWithOrigin', { originVariantLabel })}
        </h3>
        <p className={styles.hint}>
          {t('packageBoxes.replicateDialog.dimensions', {
            height: toCentimetres(dimensions.heightMm),
            length: toCentimetres(dimensions.lengthMm),
            units: dimensions.unitsPerBox,
            width: toCentimetres(dimensions.widthMm),
          })}
        </p>

        {!isLowConfidenceFamily ? null : (
          <p className={styles.marginWarning} role="alert">
            <Icon name="alert" size="sm" />
            {t('packageBoxes.replicateDialog.lowConfidence')}
          </p>
        )}

        {loading ? (
          <Skeleton height="var(--field-height)" width="100%" />
        ) : targets.length === 0 ? (
          <p className={styles.notice}>{t('packageBoxes.replicateDialog.noTargets')}</p>
        ) : (
          <ul className={styles.candidatesList}>
            {targets.map((target) => (
              <li key={target.id}>
                <Checkbox
                  ariaLabel={t('packageBoxes.replicateDialog.targetAriaLabel', {
                    description: target.description || target.productCode,
                    productCode: target.productCode,
                  })}
                  checked={selected.has(target.id)}
                  label={
                    <span className={styles.candidateMain}>
                      <strong>{target.description || target.productCode}</strong>
                      <span className={styles.hint}>
                        {t('packageBoxes.replicateDialog.targetCode', {
                          productCode: target.productCode,
                        })}
                      </span>
                    </span>
                  }
                  onChange={() => toggleTarget(target.id)}
                />
              </li>
            ))}
          </ul>
        )}

        {errorCode === undefined ? null : (
          <p className={styles.notice} role="alert">
            {t('packageBoxes.replicateDialog.failed', { code: errorCode })}
          </p>
        )}

        <div className={styles.actions}>
          <Button
            disabled={saving || selectedTargetIds.length === 0}
            onClick={() => onConfirm(selectedTargetIds)}
            size="sm"
            type="button"
          >
            <Icon name="check" />
            {t('packageBoxes.replicateDialog.confirm', { count: selectedTargetIds.length })}
          </Button>
          <Button disabled={saving} onClick={onClose} size="sm" type="button" variant="ghost">
            {t('packageBoxes.replicateDialog.cancel')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

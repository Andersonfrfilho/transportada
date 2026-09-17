/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { usePackageBoxSiblings } from '../hooks/usePackageBoxQueue.hook'
import type { PackageBox } from '../shared/packageBoxClient.service'
import { resolveFamilyReplicationSource } from '../shared/packageBoxFamilySource.service'
import type { ReplicateOffer } from '../shared/packageBoxReplicateOffer.service'
import styles from '../styles/packageBoxes.module.css'

type PackageBoxFamilyApplyButtonProps = Readonly<{
  box: PackageBox
  onResolved: (offer: ReplicateOffer) => void
}>

/**
 * Spec 155 (D12, G012): "aplicar medida de um sabor a todos" — extraído de
 * `PackageBoxMeasurementPanel` (o painel já passa de 700 linhas). As irmãs só são buscadas **no
 * clique**, nunca junto da fila de 50 linhas — o botão pode aparecer em toda linha cuja família tem
 * medido e pendente, e buscar de cara multiplicaria por 50 uma consulta que só um clique precisa.
 */
export function PackageBoxFamilyApplyButton({ box, onResolved }: PackageBoxFamilyApplyButtonProps) {
  const { t } = useTranslation('nfeWorkspace')
  const [requested, setRequested] = useState(false)
  const [unresolved, setUnresolved] = useState(false)
  const resolvedForRef = useRef<string | undefined>(undefined)
  const { loading, siblings } = usePackageBoxSiblings({ boxId: requested ? box.id : null })

  useEffect(() => {
    if (!requested || loading || siblings === null) return
    if (resolvedForRef.current === box.id) return
    resolvedForRef.current = box.id
    const offer = resolveFamilyReplicationSource({ currentBox: box, siblings: siblings.family })
    setRequested(false)
    if (offer === undefined) {
      setUnresolved(true)
      return
    }
    onResolved(offer)
  }, [box, loading, onResolved, requested, siblings])

  return (
    <>
      <Button
        disabled={requested}
        onClick={() => {
          setUnresolved(false)
          resolvedForRef.current = undefined
          setRequested(true)
        }}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Icon name="copy" size="sm" />
        {t('packageBoxes.family.applyToAll')}
      </Button>
      {!unresolved ? null : (
        <p className={styles.hint}>{t('packageBoxes.family.applyUnresolved')}</p>
      )}
    </>
  )
}

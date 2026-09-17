/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { usePackageBoxSiblingsFetcher } from '../hooks/usePackageBoxQueue.hook'
import { packageBoxErrorCode, type PackageBox } from '../shared/packageBoxClient.service'
import { resolveFamilyReplicationSource } from '../shared/packageBoxFamilySource.service'
import { PACKAGE_BOX_FAMILY_APPLY_FAILED_CODE } from '../shared/nfeWorkspace.constant'
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
 *
 * ⚠️ Re-revisão (M1, M2): busca direta com `queryClient.fetchQuery` no `onClick`, não mais um
 * efeito que reage a `usePackageBoxSiblings`. Duas falhas do efeito: (M1) com `retry: false`
 * (`main.tsx`), uma busca que falhava nunca devolvia `loading=false` de novo — `requested` ficava
 * ligado para sempre e o botão travava sem mensagem nenhuma; (M2) o React Query pode devolver dado
 * `stale` com `isLoading=false` enquanto refaz em segundo plano — o efeito abria o diálogo com a
 * medida ANTIGA da origem, exatamente no instante em que a API já tinha a atual. `staleTime: 0`
 * (`usePackageBoxSiblingsFetcher`) força ida ao servidor a cada clique.
 */
export function PackageBoxFamilyApplyButton({ box, onResolved }: PackageBoxFamilyApplyButtonProps) {
  const { t } = useTranslation('nfeWorkspace')
  const [isFetching, setIsFetching] = useState(false)
  const [message, setMessage] = useState<'error' | 'unresolved' | undefined>(undefined)
  const fetchSiblings = usePackageBoxSiblingsFetcher()
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined)

  async function handleClick(): Promise<void> {
    setIsFetching(true)
    setMessage(undefined)
    try {
      const siblings = await fetchSiblings(box.id)
      const offer = resolveFamilyReplicationSource({ currentBox: box, siblings: siblings.family })
      if (offer === undefined) {
        setMessage('unresolved')
        return
      }
      onResolved(offer)
    } catch (error) {
      setErrorCode(packageBoxErrorCode(error) ?? PACKAGE_BOX_FAMILY_APPLY_FAILED_CODE)
      setMessage('error')
    } finally {
      setIsFetching(false)
    }
  }

  return (
    <>
      <Button
        disabled={isFetching}
        onClick={() => void handleClick()}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Icon name="copy" size="sm" />
        {t('packageBoxes.family.applyToAll')}
      </Button>
      {message !== 'unresolved' ? null : (
        <p className={styles.hint}>{t('packageBoxes.family.applyUnresolved')}</p>
      )}
      {message !== 'error' ? null : (
        <p className={styles.notice}>{t('packageBoxes.family.applyFailed', { code: errorCode })}</p>
      )}
    </>
  )
}

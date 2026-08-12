/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import { useNfseEmissionDialog } from '../hooks/useNfseEmissionDialog.hook'

import { NfseEmissionDialog } from './NfseEmissionDialog.component'

type NfseEmissionActionProps = Readonly<{
  companyId?: string
  documentIds: readonly string[]
  onEmitted: () => void
  permissions: readonly string[]
  className?: string | undefined
}>

/**
 * A ação mora no módulo da nota de serviço e carrega a própria tradução: a tabela de notas só
 * empresta o estilo do botão da barra de seleção.
 */
export function NfseEmissionAction({
  className,
  companyId,
  documentIds,
  onEmitted,
  permissions,
}: NfseEmissionActionProps) {
  const { t } = useTranslation('nfseInvoice')
  const dialog = useNfseEmissionDialog({
    ...(companyId === undefined ? {} : { companyId }),
    documentIds,
    onEmitted,
    permissions,
  })

  // `dialog.canOpen` é `canOpenNfseEmission(permissions)`: sem `nfse.manage` não há botão morto.
  if (!dialog.canOpen) return null

  return (
    <>
      <button className={className} onClick={dialog.open} type="button">
        <Icon name="invoice" />
        {t('emission.action')}
      </button>
      <NfseEmissionDialog dialog={dialog} />
    </>
  )
}

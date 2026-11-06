/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from '../styles/nfeWorkspace.module.css'

type NfeImportByScanShortcutProps = Readonly<{
  canImport: boolean
  onOpen: () => void
}>

/** Atalho visível para a origem "Importar por bip": abre a aba Importações já nela. */
export function NfeImportByScanShortcut({ canImport, onOpen }: NfeImportByScanShortcutProps) {
  const { t } = useTranslation('nfeWorkspace')
  if (!canImport) return null

  return (
    <div className={styles.importByScanShortcut}>
      <Button onClick={onOpen} size="sm" type="button">
        <Icon name="camera" />
        {t('importByScan.action')}
      </Button>
    </div>
  )
}

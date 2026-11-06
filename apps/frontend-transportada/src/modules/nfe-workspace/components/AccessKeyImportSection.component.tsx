/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import type { KeyReaderFieldHandle } from '@/components/ui/key-reader-field'

import { useAccessKeyImport } from '../hooks/useAccessKeyImport.hook'
import { AccessKeyImportPanel } from './AccessKeyImportPanel.component'

type AccessKeyImportSectionProps = Readonly<{
  canImport: boolean
  onOpenDocument: (documentId: string) => void
}>

function AccessKeyImportActive({
  onOpenDocument,
}: Pick<AccessKeyImportSectionProps, 'onOpenDocument'>) {
  const readerRef = useRef<KeyReaderFieldHandle>(null)
  const importer = useAccessKeyImport({ refocusReader: () => readerRef.current?.focus() })

  return (
    <AccessKeyImportPanel
      importer={importer}
      onOpenDocument={onOpenDocument}
      readerRef={readerRef}
    />
  )
}

/** Monta a fila só enquanto a origem "Importar por bip" está aberta: fechar a origem para o polling. */
export function AccessKeyImportSection({ canImport, onOpenDocument }: AccessKeyImportSectionProps) {
  const { t } = useTranslation('nfeWorkspace')
  if (!canImport) return <p role="status">{t('accessKeyImport.forbidden')}</p>

  return <AccessKeyImportActive onOpenDocument={onOpenDocument} />
}

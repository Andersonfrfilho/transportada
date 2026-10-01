/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

import { LegalDocumentView } from '@/modules/legal/components/LegalDocument.component'
import {
  resolveLegalDocument,
  type LegalDocumentKey,
} from '@/modules/legal/shared/legalDocuments.service'
import type { LandingSettings } from '@/modules/shared/landingSettings.service'

type LegalPageProps = Readonly<{
  documentKey: LegalDocumentKey
  onNavigateHome: () => void
  settings: LandingSettings
}>

export function LegalPage({ documentKey, onNavigateHome, settings }: LegalPageProps): ReactNode {
  const document = resolveLegalDocument({ documentKey, settings })

  return <LegalDocumentView document={document} onNavigateHome={onNavigateHome} />
}

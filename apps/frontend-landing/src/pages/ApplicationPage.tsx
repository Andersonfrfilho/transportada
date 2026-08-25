/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

import { PreRegistrationForm } from '@/modules/application/components/PreRegistrationForm.component'
import type { LandingSettings } from '@/modules/shared/landingSettings.service'
import styles from './ApplicationPage.module.css'

type ApplicationPageProps = Readonly<{
  onNavigateHome: () => void
  settings: LandingSettings
}>

export function ApplicationPage({ onNavigateHome, settings }: ApplicationPageProps): ReactNode {
  return (
    <>
      <a
        className={styles.breadcrumb}
        href="/"
        onClick={(event) => {
          event.preventDefault()
          onNavigateHome()
        }}
      >
        ← Voltar para a página inicial
      </a>
      <PreRegistrationForm settings={settings} />
    </>
  )
}

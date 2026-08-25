/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

import { PreRegistrationForm } from '@/modules/application/components/PreRegistrationForm.component'
import {
  CtaSection,
  HeroSection,
  OfferSection,
  RequirementsSection,
  WhereWeAreSection,
} from '@/modules/landing/components/LandingSections.component'
import { useLandingSettings } from '@/modules/shared/useLandingSettings.query'

const APPLICATION_FORM_ID = 'pre-cadastro'

function scrollToApplicationForm(): void {
  document.getElementById(APPLICATION_FORM_ID)?.scrollIntoView({ behavior: 'smooth' })
}

export function App(): ReactNode {
  const { data: settings } = useLandingSettings()

  return (
    <main>
      <HeroSection settings={settings} />
      <OfferSection settings={settings} />
      <RequirementsSection settings={settings} />
      <WhereWeAreSection settings={settings} />
      <CtaSection settings={settings} onCallToAction={scrollToApplicationForm} />
      <div id={APPLICATION_FORM_ID}>
        <PreRegistrationForm settings={settings} />
      </div>
    </main>
  )
}

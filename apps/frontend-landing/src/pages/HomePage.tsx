/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

import {
  AboutSection,
  AppSection,
  ContactSection,
  CtaSection,
  HeroSection,
  RequirementsSection,
  ServicesSection,
  WhereWeAreSection,
} from '@/modules/landing/components/LandingSections.component'
import type { LandingSettings } from '@/modules/shared/landingSettings.service'

type HomePageProps = Readonly<{
  onNavigateToApplication: () => void
  settings: LandingSettings
}>

export function HomePage({ onNavigateToApplication, settings }: HomePageProps): ReactNode {
  return (
    <>
      <HeroSection settings={settings} />
      <AboutSection settings={settings} />
      <ServicesSection settings={settings} />
      <RequirementsSection settings={settings} />
      <AppSection settings={settings} />
      <WhereWeAreSection settings={settings} />
      <ContactSection settings={settings} />
      <CtaSection settings={settings} onCallToAction={onNavigateToApplication} />
    </>
  )
}

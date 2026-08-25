/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

import type { LandingGroupUnit, LandingSettings } from '@/modules/shared/landingSettings.service'
import landingLocale from '../locales/landing.locale.json'
import { resolveSectionList, resolveSectionText } from '../shared/landingSections.service'
import styles from './LandingSections.module.css'

const LOCALE = landingLocale.landing

type SectionProps = Readonly<{ settings: LandingSettings }>

export function HeroSection({ settings }: SectionProps): ReactNode {
  const title = settings.brandName ?? LOCALE.hero.title
  const subtitle = resolveSectionText(settings.sections, 'hero', 'subtitle', LOCALE.hero.subtitle)

  return (
    <section className={`${styles.section} ${styles.hero}`}>
      <h1 className={styles.heroTitle}>{title}</h1>
      <p className={styles.heroSubtitle}>{subtitle}</p>
    </section>
  )
}

export function OfferSection({ settings }: SectionProps): ReactNode {
  const title = resolveSectionText(settings.sections, 'offer', 'title', LOCALE.offer.title)
  const items = resolveSectionList(settings.sections, 'offer', 'items', LOCALE.offer.items)

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <ul className={styles.list}>
        {items.map((item) => (
          <li className={styles.listItem} key={item}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function RequirementsSection({ settings }: SectionProps): ReactNode {
  const title = resolveSectionText(
    settings.sections,
    'requirements',
    'title',
    LOCALE.requirements.title,
  )
  const items = resolveSectionList(
    settings.sections,
    'requirements',
    'items',
    LOCALE.requirements.items,
  )

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <ul className={styles.list}>
        {items.map((item) => (
          <li className={styles.listItem} key={item}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}

function unitAddress(unit: LandingGroupUnit): string {
  const parts = [unit.street, unit.number, unit.district, unit.city, unit.state].filter(
    (part) => part.length > 0,
  )
  return parts.join(', ')
}

/** Sem unidade nenhuma (grupo não configurado), a seção não desenha — não há "onde estamos" a mostrar. */
export function WhereWeAreSection({ settings }: SectionProps): ReactNode {
  if (settings.units.length === 0) return null

  const title = resolveSectionText(
    settings.sections,
    'whereWeAre',
    'title',
    LOCALE.whereWeAre.title,
  )

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.list}>
        {settings.units.map((unit) => (
          <article className={styles.unitCard} key={`${unit.tradeName}-${unit.postalCode}`}>
            <p className={styles.unitName}>{unit.tradeName}</p>
            <p className={styles.unitAddress}>{unitAddress(unit)}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

type CtaSectionProps = SectionProps & Readonly<{ onCallToAction: () => void }>

export function CtaSection({ onCallToAction, settings }: CtaSectionProps): ReactNode {
  const title = resolveSectionText(settings.sections, 'cta', 'title', LOCALE.cta.title)
  const subtitle = resolveSectionText(settings.sections, 'cta', 'subtitle', LOCALE.cta.subtitle)

  return (
    <section className={`${styles.section} ${styles.cta}`}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <p>{subtitle}</p>
      <button className={styles.ctaButton} type="button" onClick={onCallToAction}>
        {LOCALE.cta.buttonLabel}
      </button>
    </section>
  )
}

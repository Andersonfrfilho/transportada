/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

import { Icon, type IconName } from '@/modules/shared/components/Icon.component'
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
    <section className={styles.hero}>
      <div className={styles.heroInner}>
        <p className={styles.eyebrow}>{LOCALE.hero.eyebrow}</p>
        <h1 className={styles.heroTitle}>{title}</h1>
        <p className={styles.heroSubtitle}>{subtitle}</p>
        <div className={styles.heroActions}>
          <a className={styles.primaryButton} href="/cadastro">
            {LOCALE.hero.primaryCta}
          </a>
          <a className={styles.secondaryButton} href="#servicos">
            {LOCALE.hero.secondaryCta}
          </a>
        </div>
      </div>
    </section>
  )
}

export function AboutSection({ settings }: SectionProps): ReactNode {
  const title = resolveSectionText(settings.sections, 'about', 'title', LOCALE.about.title)
  const body = resolveSectionText(settings.sections, 'about', 'body', LOCALE.about.body)

  return (
    <section className={styles.section} id="sobre">
      <div className={styles.aboutGrid}>
        <div>
          <p className={styles.eyebrow}>{LOCALE.about.eyebrow}</p>
          <h2 className={styles.sectionTitle}>{title}</h2>
        </div>
        <p className={styles.aboutBody}>{body}</p>
      </div>
    </section>
  )
}

const SERVICE_ICONS: readonly IconName[] = ['truck', 'route', 'shield-check', 'wallet']

export function ServicesSection({ settings }: SectionProps): ReactNode {
  const title = resolveSectionText(settings.sections, 'services', 'title', LOCALE.services.title)
  const items = resolveSectionList(settings.sections, 'services', 'items', LOCALE.services.items)

  return (
    <section className={styles.section} id="servicos">
      <p className={styles.eyebrow}>{LOCALE.services.eyebrow}</p>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.serviceGrid}>
        {items.map((item, index) => (
          <article className={styles.serviceCard} key={item}>
            <span className={styles.serviceIcon}>
              <Icon name={SERVICE_ICONS[index % SERVICE_ICONS.length] ?? 'truck'} />
            </span>
            <p className={styles.serviceLabel}>{item}</p>
          </article>
        ))}
      </div>
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

export function AppSection({ settings }: SectionProps): ReactNode {
  const title = resolveSectionText(settings.sections, 'app', 'title', LOCALE.app.title)
  const body = resolveSectionText(settings.sections, 'app', 'body', LOCALE.app.body)
  const items = resolveSectionList(settings.sections, 'app', 'items', LOCALE.app.items)

  return (
    <section className={`${styles.section} ${styles.appSection}`} id="app">
      <div className={styles.appGrid}>
        <div>
          <p className={styles.eyebrow}>{LOCALE.app.eyebrow}</p>
          <h2 className={styles.sectionTitle}>{title}</h2>
          <p className={styles.aboutBody}>{body}</p>
          <ul className={styles.featureList}>
            {items.map((item) => (
              <li className={styles.featureItem} key={item}>
                <Icon aria-hidden="true" height="20" name="shield-check" width="20" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.appDeviceFrame} aria-hidden="true">
          <Icon height="48" name="smartphone" width="48" />
        </div>
      </div>
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

export function ContactSection({ settings }: SectionProps): ReactNode {
  const title = resolveSectionText(settings.sections, 'contact', 'title', LOCALE.contact.title)
  const body = resolveSectionText(settings.sections, 'contact', 'body', LOCALE.contact.body)

  return (
    <section className={styles.section} id="contato">
      <p className={styles.eyebrow}>{LOCALE.contact.eyebrow}</p>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <p className={styles.aboutBody}>{body}</p>
      <div className={styles.contactGrid}>
        {settings.contactPhone === undefined ? null : (
          <a className={styles.contactCard} href={`tel:${settings.contactPhone}`}>
            <Icon name="phone" />
            <span>{settings.contactPhone}</span>
          </a>
        )}
        {settings.contactEmail === undefined ? null : (
          <a className={styles.contactCard} href={`mailto:${settings.contactEmail}`}>
            <Icon name="mail" />
            <span>{settings.contactEmail}</span>
          </a>
        )}
        {settings.units[0] === undefined ? null : (
          <div className={styles.contactCard}>
            <Icon name="map" />
            <span>{unitAddress(settings.units[0])}</span>
          </div>
        )}
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

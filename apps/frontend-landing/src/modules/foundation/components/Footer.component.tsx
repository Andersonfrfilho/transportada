/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'

import { BrandMark } from '@/modules/shared/components/BrandMark.component'
import { Icon } from '@/modules/shared/components/Icon.component'
import type { LandingSettings } from '@/modules/shared/landingSettings.service'
import styles from './Footer.module.css'

const NAV_LINKS = [
  { href: '#sobre', label: 'Sobre' },
  { href: '#servicos', label: 'Serviços' },
  { href: '#app', label: 'App' },
  { href: '#contato', label: 'Contato' },
] as const

type FooterProps = Readonly<{
  brandName: string
  onNavigateToApplication: () => void
  settings: LandingSettings
}>

export function Footer({ brandName, onNavigateToApplication, settings }: FooterProps): ReactNode {
  const year = new Date().getUTCFullYear()

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandColumn}>
          <div className={styles.brandRow}>
            <BrandMark className={styles.brandMark} />
            <span className={styles.brandName}>{brandName}</span>
          </div>
          <p className={styles.tagline}>
            Transporte de carga com rota planejada e acompanhamento de ponta a ponta.
          </p>
        </div>
        <div>
          <p className={styles.columnTitle}>Navegação</p>
          <ul className={styles.linkList}>
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
            <li>
              <a
                href="/cadastro"
                onClick={(event) => {
                  event.preventDefault()
                  onNavigateToApplication()
                }}
              >
                Seja um agregado
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className={styles.columnTitle}>Contato</p>
          <ul className={styles.linkList}>
            {settings.contactPhone === undefined ? null : (
              <li className={styles.contactItem}>
                <Icon aria-hidden="true" height="18" name="phone" width="18" />
                {settings.contactPhone}
              </li>
            )}
            {settings.contactEmail === undefined ? null : (
              <li className={styles.contactItem}>
                <Icon aria-hidden="true" height="18" name="mail" width="18" />
                {settings.contactEmail}
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className={styles.bottomBar}>
        <div className={styles.bottomBarInner}>
          <p className={styles.copyright}>
            © {year} {brandName}. Todos os direitos reservados.
          </p>
          <p className={styles.poweredBy}>
            <img alt="" className={styles.poweredByMark} src="/icons/icon.svg" />
            Plataforma TransportAdA
          </p>
        </div>
      </div>
    </footer>
  )
}

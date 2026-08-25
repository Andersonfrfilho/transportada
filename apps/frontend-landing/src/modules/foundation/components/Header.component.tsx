/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type ReactNode } from 'react'

import { Icon } from '@/modules/shared/components/Icon.component'
import styles from './Header.module.css'

const NAV_LINKS = [
  { href: '#sobre', label: 'Sobre' },
  { href: '#servicos', label: 'Serviços' },
  { href: '#app', label: 'App' },
  { href: '#contato', label: 'Contato' },
] as const

type HeaderProps = Readonly<{
  brandName: string
  onNavigateHome: () => void
  onNavigateToApplication: () => void
}>

export function Header({ brandName, onNavigateHome, onNavigateToApplication }: HeaderProps): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <a
          className={styles.brand}
          href="/"
          onClick={(event) => {
            event.preventDefault()
            onNavigateHome()
          }}
        >
          <img alt="" className={styles.brandMark} src="/icons/icon.svg" />
          <span className={styles.brandName}>{brandName}</span>
        </a>
        <nav aria-label="Navegação principal" className={styles.nav}>
          {NAV_LINKS.map((link) => (
            <a className={styles.navLink} href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className={styles.actions}>
          <a
            className={styles.ctaButton}
            href="/cadastro"
            onClick={(event) => {
              event.preventDefault()
              onNavigateToApplication()
            }}
          >
            Quero ser agregado
          </a>
          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            className={styles.menuButton}
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
          >
            <Icon name={menuOpen ? 'x' : 'menu'} />
          </button>
        </div>
      </div>
      {menuOpen ? (
        <nav aria-label="Navegação móvel" className={styles.mobileMenu}>
          {NAV_LINKS.map((link) => (
            <a
              className={styles.navLink}
              href={link.href}
              key={link.href}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </nav>
      ) : null}
    </header>
  )
}

/* Cópia por valor de apps/frontend-transportada/src/modules/notification/shared/notificationTheme.constant.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import styles from '../styles/notification.module.css'

/**
 * A classe que traduz os tokens do produto para os nomes `--adn-*` do pacote. Ela vai no
 * `theme.rootClassName` do `NotificationProvider`, que o sino e a lista aplicam sozinhos.
 */
export const NOTIFICATION_THEME_CLASS = styles.notificationTheme ?? ''

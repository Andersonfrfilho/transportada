/* Copyright (c) 2026 Ada Technology. MIT License. */
import styles from '../styles/notification.module.css'

/**
 * A classe que traduz os tokens do produto para os nomes `--adn-*` do pacote. Ela vai em dois
 * lugares por motivos diferentes: no `theme.rootClassName` do provider, que o sino, a lista e o
 * painel de preferências aplicam sozinhos, e no `className` das duas telas compostas, que **não**
 * leem o tema do provider. O tipo gerado para CSS Module devolve `string | undefined`, e o pacote
 * pede classe obrigatória.
 */
export const NOTIFICATION_THEME_CLASS = styles.notificationTheme ?? ''

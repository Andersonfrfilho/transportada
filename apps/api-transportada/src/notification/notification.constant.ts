/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * As rotas do módulo nascem versionadas: são superfície de terceiro, e a versão dele muda em ritmo
 * próprio. As rotas da aplicação seguem sem prefixo — nenhuma delas se move por causa disto.
 */
export const NOTIFICATION_ROUTES_BASE_PATH = '/v1'
export const NOTIFICATION_DEFAULT_LOCALE = 'pt-BR'
export const NOTIFICATION_DEFAULT_TIMEZONE = 'America/Sao_Paulo'

/** A rota da fila, sem o prefixo do ambiente — o worker precisa nomear a mesma trilha. */
export const NOTIFICATION_QUEUE_ROUTE = 'notification.v1'

/** Uma entrega por vez: o gargalo é o provedor de e-mail, não o consumo da fila. */
export const NOTIFICATION_QUEUE_PREFETCH = 1

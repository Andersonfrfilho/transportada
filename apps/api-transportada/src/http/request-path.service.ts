/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  API_AUTH_ME_PATH,
  API_COMPANY_SETTINGS_PATH,
  API_LIVE_PATH,
  API_READY_PATH,
  UNMATCHED_LOG_PATHNAME,
} from '../shared/api.constant'

export function isNoStorePath(pathname: string): boolean {
  return pathname === API_AUTH_ME_PATH || pathname === API_COMPANY_SETTINGS_PATH
}

export function resolveLogPathname(pathname: string): string {
  return pathname === API_AUTH_ME_PATH ||
    pathname === API_COMPANY_SETTINGS_PATH ||
    pathname === API_LIVE_PATH ||
    pathname === API_READY_PATH
    ? pathname
    : UNMATCHED_LOG_PATHNAME
}

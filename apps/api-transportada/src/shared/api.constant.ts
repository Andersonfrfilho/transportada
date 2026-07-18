/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const API_SERVICE_NAME = 'api'
export const API_HOSTNAME = '0.0.0.0'
export const API_LIVE_PATH = '/health/live'
export const API_READY_PATH = '/health/ready'
export const CORRELATION_ID_HEADER = 'x-correlation-id'
export const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'
export const HTTP_GET_METHOD = 'GET'
export const APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES = 1_048_576
export const SERVER_MAX_REQUEST_BODY_SIZE_BYTES = 2_097_152
export const IDLE_TIMEOUT_SECONDS = 10
export const REQUEST_TIMEOUT_SECONDS = 10
export const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
export const INVALID_LOG_PATHNAME = '<invalid>'

export const HTTP_ERROR = {
  internal: {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    status: 500,
  },
  invalidRequest: {
    code: 'INVALID_REQUEST',
    message: 'Invalid request',
    status: 400,
  },
  methodNotAllowed: {
    code: 'METHOD_NOT_ALLOWED',
    message: 'Method not allowed',
    status: 405,
  },
  payloadTooLarge: {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Request body too large',
    status: 413,
  },
  notFound: {
    code: 'NOT_FOUND',
    message: 'Resource not found',
    status: 404,
  },
  requestAborted: {
    code: 'REQUEST_ABORTED',
    message: 'Request aborted',
    status: 499,
  },
} as const

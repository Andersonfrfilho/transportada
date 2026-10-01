/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readListQuery, readPaging, type Paging } from '../../http/request-parsing.service.js'

const PENDING_ITEM_LIST_QUERY_KEYS = new Set(['cursor', 'limit'])

/** `readPaging` já recusa `limit` acima de 100 e cursor malformado com `400`. */
export function parsePendingItemListQuery(url: URL): Paging {
  return readPaging(readListQuery(url, PENDING_ITEM_LIST_QUERY_KEYS))
}

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { storedObjects } from './storage.schema.js'

/** O literal gravado pelos cinco repositórios de `src/trips/**` antes da correção (spec 161). */
const STALE_STORED_OBJECT_BUCKET = 'fiscal'

export type StoredObjectBucketRepairPort = {
  /** `UPDATE stored_objects SET bucket = <bucket> WHERE bucket = 'fiscal'`, devolve as linhas corrigidas. */
  repairStaleBucket(input: { readonly bucket: string }): Promise<number>
}

/**
 * Repara `stored_objects.bucket` gravado com o literal `'fiscal'` por `src/trips/**` (spec 161):
 * os bytes sempre subiram para o bucket real configurado, mas a linha guardava um nome de bucket
 * que não existe — a leitura assinava a URL para o host errado e o storage respondia 403/503.
 *
 * Idempotente por desenho: depois da primeira correção não sobra linha com `bucket = 'fiscal'`, e
 * repetir o deploy é sempre `0`. Roda depois das migrations, no mesmo processo do pre-deploy.
 */
export async function repairStoredObjectBuckets({
  bucket,
  port,
}: {
  readonly bucket: string
  readonly port: StoredObjectBucketRepairPort
}): Promise<number> {
  return port.repairStaleBucket({ bucket })
}

type Queryable =
  | ReturnType<typeof createDrizzleProvider>['db']
  | Parameters<Parameters<ReturnType<typeof createDrizzleProvider>['db']['transaction']>[0]>[0]

export function createDrizzleStoredObjectBucketRepairPort(
  queryable: Queryable,
): StoredObjectBucketRepairPort {
  return {
    async repairStaleBucket({ bucket }) {
      const repaired = await queryable
        .update(storedObjects)
        .set({ bucket })
        .where(eq(storedObjects.bucket, STALE_STORED_OBJECT_BUCKET))
        .returning({ id: storedObjects.id })

      return repaired.length
    },
  }
}

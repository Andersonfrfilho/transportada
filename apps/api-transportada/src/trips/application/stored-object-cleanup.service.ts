/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T15: as rotas do escritório sobem o arquivo **dentro** da transação da baixa — assim o
 * anexo recusado desfaz a entrega inteira. O avesso é o objeto que já subiu quando a transação
 * desfaz: sem esta limpeza, ele fica no bucket sem nenhuma linha que aponte para ele.
 */
export type RemovableObjectStoragePort = {
  remove(input: { readonly objectKey: string }): Promise<void>
  store(input: {
    readonly bytes: Uint8Array
    readonly companyId: string
    readonly mimeType: string
    readonly objectId: string
    readonly objectKey: string
  }): Promise<{ readonly sha256: string }>
}

/**
 * Roda `operation` com um armazenamento que anota cada objeto gravado. Se `operation` falhar, apaga
 * o que subiu e relança o erro original — é limpeza de recurso, não tratamento: a falha da remoção
 * não troca o erro que o cliente recebe (a varredura periódica de órfãos está em `docs/SECURITY.md`).
 */
export async function runWithStoredObjectCleanup<TResult>(params: {
  readonly operation: (storage: RemovableObjectStoragePort) => Promise<TResult>
  readonly storage: RemovableObjectStoragePort
}): Promise<TResult> {
  const storedKeys: string[] = []
  const trackedStorage: RemovableObjectStoragePort = {
    remove: (input) => params.storage.remove(input),
    async store(input) {
      const stored = await params.storage.store(input)
      storedKeys.push(input.objectKey)
      return stored
    },
  }

  try {
    return await params.operation(trackedStorage)
  } catch (error) {
    await Promise.allSettled(storedKeys.map((objectKey) => params.storage.remove({ objectKey })))
    throw error
  }
}

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { importarNfeXml, type ImportedNfeXml } from '@adatechnology/fiscal-provider'

type NfeXmlImportFunction = (xml: string) => ImportedNfeXml

export type NfeXmlImporter = {
  importXml(input: { readonly xml: string }): Promise<ImportedNfeXml>
}

export function createNfeXmlImporter(
  options: { readonly importXml?: NfeXmlImportFunction } = {},
): NfeXmlImporter {
  const runImport = options.importXml ?? importarNfeXml

  return {
    async importXml(input: { readonly xml: string }): Promise<ImportedNfeXml> {
      return runImport(input.xml)
    },
  }
}

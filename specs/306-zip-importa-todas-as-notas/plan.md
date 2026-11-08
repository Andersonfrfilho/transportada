# Plano — spec 306

1. `drizzle-received-xml-import.gateway.ts`: `itemEntries` abre o zip são em um item por XML (usa `listSafeXmlEntries`, já exportada de `zip-queue-chunking.policy.ts`).
2. `nfe-import-archive-expander.gateway.ts`: `ZIP_ENTRY_SOURCE_PREFIX`; `readArchive`/`readStreamedArchive` filtram pela entrada pedida.
3. Testes: contrato do expansor (zip comum e em fluxo) e do gateway (3 XMLs → 3 itens, 1 objeto, ordinais 1..3).

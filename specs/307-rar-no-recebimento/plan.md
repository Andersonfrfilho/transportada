# Plano — spec 307

1. `rar-to-zip.policy.ts` (worker, domínio): `convertRarToZip`.
2. `received-xml-files.policy.ts` e `receipt-messages.policy.ts`: aceitar `.rar` e ajustar os textos.
3. `intake-nfe-xml-email.use-case.ts` e `process-whatsapp-receipts.use-case.ts`: converter antes de fatiar.
4. Testes de contrato com RAR 4.x armazenado montado byte a byte (`test/fixtures/rar-archive.fixture.ts`; não há `rar` no CI).

# Evidência
- Worker `bun run test`: 3111 pass; as 5 falhas são do decodificador de canhoto, que já falhavam antes.
- Integração `nfe-xml-receipts.integration.ts`: 11 pass (relatório lido do Postgres).
- Contratos novos: relatório em e-mail, só e-mail concluído leva o relatório, adaptador envia html com logo, XML de 6 MiB entra e de 26 MiB é recusado.
- Não pude abrir o zip do Anderson (host do anexo bloqueado no ambiente): o que causou o `ZIP_ENTRY_TOO_LARGE` real não foi medido.

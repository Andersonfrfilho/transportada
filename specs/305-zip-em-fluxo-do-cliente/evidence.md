# Evidência

- Repro com o zip real do cliente (extraído do `.eml` enviado): antes `ZIP_ENTRY_TOO_LARGE`, com `originalSize = 4294967295` em todas as 389 entradas; depois `ok 389`.
- Worker `bun run test`: 3113 pass; as 5 falhas são do decodificador de canhoto, que já falhavam antes.
- Contratos novos: zip em fluxo expande pelos tamanhos reais, continua recusado quando o tamanho real passa do teto, e é fatiado em vez de seguir inteiro.

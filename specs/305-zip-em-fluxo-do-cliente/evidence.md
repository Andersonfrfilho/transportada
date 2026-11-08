# Evidência

- Repro com o zip real do cliente (extraído do `.eml` enviado): antes `ZIP_ENTRY_TOO_LARGE`, com `originalSize = 4294967295` em todas as 389 entradas; depois `ok 389`.
- Worker `bun run test`: 3113 pass; as 5 falhas são do decodificador de canhoto, que já falhavam antes.
- Contratos novos: zip em fluxo expande pelos tamanhos reais, continua recusado quando o tamanho real passa do teto, e é fatiado em vez de seguir inteiro.

## Correção (CI vermelho no merge da primeira entrega)

Os dois contratos novos falharam no CI (Bun 1.3.14) com `ZIP_INVALID_ARCHIVE`, e passavam localmente (Bun 1.4.4). Causa: quando o `filter` do `fflate` aceita uma entrada com o marcador `0xFFFFFFFF`, ele aloca o buffer de saída com 4 GiB. O Bun 1.4.4 aceita a alocação preguiçosa; o 1.3.14 lança `RangeError: Out of memory`. No worker de produção isso derrubaria o processo. A primeira entrega só corrigia a conferência dos tetos, não a alocação.

Agora zip em fluxo não passa pelo `unzipSync`: o diretório central é lido (`readZipDirectory`), os tetos são aplicados ao tamanho real e cada entrada é extraída com buffer do tamanho real (`extractZipEntry`). Vale para o expansor e para o fatiador.

- Contratos rodados nos dois Bun (1.3.14 e 1.4.4): 64 pass / 0 fail nos dois arquivos do tema.
- Zip real do cliente com Bun 1.3.14: 389 entradas expandidas.
- Contrato novo: zip em fluxo que declara 1 TiB no tamanho real é recusado (`ZIP_ENTRY_TOO_LARGE`) antes de alocar qualquer buffer.

# Spec 305 — Zip em fluxo (Zip64) não pode parecer arquivo gigante

## Problema medido

O zip real do cliente (`ID19045_procNFe_parte1.zip`, 389 notas, maior XML de 51 KB, 6,3 MB no total) foi recusado com `ZIP_ENTRY_TOO_LARGE`. A causa não é o tamanho: o zip foi feito em fluxo e traz `0xFFFFFFFF` nos campos de 32 bits do diretório central, com o tamanho real no campo extra Zip64. O `filter` do `fflate` entrega o valor cru (4 GiB em toda entrada) e o teto por arquivo recusava o zip inteiro. A spec 304 subiu o teto de 5 para 25 MiB sem resolver isso.

## Requisitos

- RF1: o expansor e o fatiador de zip leem o tamanho real da entrada no diretório central quando o campo de 32 bits é `0xFFFFFFFF`.
- RF2: o teto por arquivo, o total por zip e a razão de compressão seguem valendo sobre o tamanho real (zip bomba continua recusado).
- RF3: tamanho que não se consegue resolver continua recusado (falha fechada), nunca aceito.

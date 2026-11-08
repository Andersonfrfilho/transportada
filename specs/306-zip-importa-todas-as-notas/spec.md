# Spec 306 — Zip recebido importa todas as notas

## Problema

Em staging (08/11/2026), o zip `ID19045_procNFe_parte1.zip` (389 notas) enviado por e-mail resultou em "1 nota nova" e
"A importação terminou sem problemas". Os outros 388 XMLs foram ignorados em silêncio.

Causa: o recebimento (e-mail e WhatsApp) criava **um item por arquivo**, e o consumidor da importação lê só a primeira
entrada do zip (`const [expandedXmlEntry] = expand(...)`). A spec 301 só testou zip com uma nota.

## Regra

- RF1. Um zip são vira **um item por XML**, todos apontando para o mesmo objeto do zip; `sourceEntry = entry:<nome>`.
- RF2. O expansor, diante de `entry:<nome>`, lê só essa entrada, com os mesmos tetos por entrada (tamanho, razão de compressão, nome seguro).
- RF3. Zip fora do normal (corrompido, caminho perigoso, entrada grande demais) segue como item único; o expansor o recusa com o código `ZIP_*` exato.
- RF4. Entrada pedida que não existe no zip é recusada (`ZIP_NO_XML_ENTRIES`), nunca troca por outra nota.
- RF5. Nota já cadastrada segue virando "duplicada", sem regravar (comportamento existente do consumidor).

## Fora de escopo

RAR (spec seguinte). A importação pela tela não muda.

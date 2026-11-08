# Spec 307 — RAR no recebimento de notas

## Problema

A caixa de notas (e-mail) e o WhatsApp aceitam só `.xml` e `.zip`. O Anderson quer enviar também `.rar`.

## Regra

- RF1. `.rar` passa pela classificação do recebimento (e-mail e WhatsApp). A importação pela tela não muda.
- RF2. O RAR é aberto **na entrada** e vira um zip interno só com os XMLs (`level: 0`); dali em diante é o fluxo do zip (spec 306: um item por XML).
- RF3. Tetos sobre o tamanho declarado no cabeçalho, antes de descomprimir: entrada ≤ 25 MiB, total ≤ 256 MiB, ≤ 5000 entradas, nome seguro, sem senha. O tamanho de cada entrada extraída é conferido de novo.
- RF4. RAR corrompido, com senha, sem XML, com caminho perigoso ou acima dos tetos segue como item recusado (`<nome>.rar.zip`, bytes originais): o expansor o recusa com `ZIP_INVALID_ARCHIVE` e o resumo mostra o problema, sem derrubar o lote.
- RF5. Mensagens ao remetente passam a dizer `.xml, .zip ou .rar`.

## Fora de escopo

RAR em volumes; importação pela tela; RAR dentro de ZIP.

## Dependência

`node-unrar-js` 2.0.2 (WASM do unrar oficial da RARLAB; wrapper MIT; a licença do unrar permite extrair, não recriar o compressor RAR — não o usamos para isso).

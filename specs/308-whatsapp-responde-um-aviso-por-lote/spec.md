# Spec 308 — WhatsApp responde um aviso por lote

## Problema

Em staging (08/11/2026), o Anderson mandou vários XMLs soltos no chat direto do bot e recebeu "Recebi 1 arquivo e já estou importando" para cada arquivo, e o resumo final também sairia por arquivo.

## Regra

- RF1. Os recibos importados no mesmo ciclo, da mesma empresa, mesmo remetente e mesma conversa, recebem **um** aviso de recebimento ("Recebi N arquivos e já estou importando"). Cada recibo é marcado como avisado.
- RF2. Os resumos prontos no mesmo ciclo, para o mesmo remetente e conversa no WhatsApp, viram **um** resumo com as contagens somadas e os problemas juntos. Recusas e falhas de texto igual viram uma mensagem só.
- RF3. O e-mail não muda: um recibo por e-mail, com o relatório detalhado (spec 304).
- RF4. Se o envio falha, nada é marcado como enviado; o ciclo seguinte tenta de novo (sem perda, sem duplicar o que já saiu).

## Limite conhecido

O agrupamento é por ciclo (60 s). Arquivos que terminam em ciclos diferentes geram resumos diferentes.

## Fora de escopo

Resposta a texto livre ("ola") no chat direto: está na thread do menu do bot.

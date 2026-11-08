# Spec 309 — Aviso e resumo do XML no padrão do bot

Pedido do Anderson (08/11/2026): o cliente precisa saber que o envio chegou ("Recebi os arquivos… estou separando, já te dou um retorno"), com uma mensagem só por lote, valendo para zip também, no padrão de mensagens que estamos montando.

## Regra

- RF1. O aviso de recebimento segue a spec 300 RF1: `📥 *Recebi seu envio.*`, corpo "Recebi N arquivo(s) e já estou separando as notas.", e o próximo passo na última linha (`➡️ _Próximo passo:_ já te dou um retorno com o resultado.`). Um aviso por lote (spec 308), vale para zip e RAR.
- RF2. O resumo final segue o mesmo padrão: `✅ *Importação concluída.*` ou `⚠️ *Importação concluída com problemas.*`, contagens, problemas, e o próximo passo.
- RF3. O e-mail não muda (modelo padrão de Notificações, spec 304).

## Fora de escopo

Recusa e falha continuam no texto curto de antes (também usado no e-mail). Transformar as falas em nós `fala_*` editáveis do grafo (spec 286) fica como decisão: hoje o texto mora na política do worker.

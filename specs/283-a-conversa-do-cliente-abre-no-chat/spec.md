# Feature 283 — A conversa do cliente abre no chat da ocorrência

Pedido do dono (Anderson, 27/10/2026): quando o sistema envia algo ao cliente (WhatsApp ou e-mail), abrir o chat do cliente
na tela de conversas da ocorrência, com a mensagem enviada, as respostas e os canais que foram abertos. Aprovado o layout
"terceira coluna" (maquete aprovada pelo dono em 27/10/2026).

Specs lidas antes: 143/274 (contratante responde por e-mail), 183 (conversas lado a lado), 279 (boleto ao cliente por e-mail),
281 (WhatsApp pelo Evolution: T5 envio, T6 webhook, T9 linha do tempo).

## Problema e resultado

Hoje a tela da ocorrência tem duas conversas (Contratante e Motorista). O envio ao cliente (281 T5, 279) fica só na linha do
tempo e na fila de "não atribuídas" quando ele responde. Resultado: o cliente vira um **terceiro participante** da conversa
da ocorrência, com o que foi enviado, o estado de cada entrega, as respostas e os canais abertos.

## Fora do escopo

- Resposta do cliente por e-mail (hoje só o WhatsApp tem retorno): o e-mail mostra apenas o enviado e o estado.
- Mostrar a conversa do cliente ao motorista ou à contratante: é só do painel.
- Campanha, disparo em massa e chat livre sem ocorrência.

## Decisões

- **D1 — Uma conversa por ocorrência e contato** (cliente da entrega, `tax_id`), com os canais como etiquetas dentro dela.
- **D2 — Participante `client`** ao lado de `contractor`, `driver` e `operator`: cor, ícone e nome próprios (nunca só a cor).
- **D3 — Nasce no primeiro envio** ao cliente (WhatsApp ou e-mail) e só existe a partir daí; sem envio, a tela fica como está.
- **D4 — Faixa "Canais abertos"**: cada número (mascarado) e cada e-mail, com estado (fila, enviado, entregue, lido, respondeu, falhou).
- **D5 — Resposta só pelo WhatsApp.** O webhook (281 T6) que casa pelo aviso citado entra nesta conversa; sem citação, a resposta de um número que já recebeu algo do painel entra na conversa do cliente mais recente dele (decisão do Anderson em 31/10/2026: o "obrigado" solto não pode sumir); número desconhecido continua em "não atribuídas", com ação "vincular a esta conversa".
- **D6 — Responder pelo painel** é envio real: escolhe o número em "Responder por", confirma o número no primeiro envio e fica desligado com o WhatsApp desconectado (D14 da 281: cai no e-mail guardado, com aviso).
- **D7 — Layout.** Tela larga (≥ 80 rem): terceira coluna à direita. Média (64–80 rem): duas colunas e o Cliente numa faixa recolhida abaixo, com canais e contagem à vista. Celular e modo abas: aba "Cliente" com contador, só quando a conversa existe. A preferência de layout do operador (lado a lado/abas) não muda.
- **D8 — E-mail é canal, não conversa.** Não existe quarta coluna.

## Requisitos funcionais

- **RF1** Primeiro envio ao cliente cria a conversa e grava a mensagem enviada com ator, canal, destino mascarado e estado.
- **RF2** Reenvio ao mesmo contato reaproveita a conversa (idempotente por ocorrência, contato e envio).
- **RF3** Resposta do WhatsApp citando o aviso entra na conversa, com o número que respondeu.
- **RF4** A lista de chats mostra a conversa com a etiqueta "Cliente" e a contagem de não lidas.
- **RF5** Os estados de entrega atualizam a mensagem e a faixa de canais.
- **RF6** A tela generaliza as combinações de coluna minimizada de duas para três, com contrato de layout.
- **RF7** Permissão: só quem já pode enviar ao cliente vê e responde; log sem número ou e-mail em claro.

## Requisitos não funcionais

Texto pt-BR/en acentuado em `*.locale.json`; primitivos do design system; print em 375 px e desktop como prova (web.md §15);
migração aditiva e com rollback.

## Casos extremos e falhas

WhatsApp cai e o e-mail de reserva envia (as duas entregas aparecem); e-mail falha por caixa cheia (aviso do sistema); cliente
com dois números (dois chips, uma conversa); resposta de número desconhecido (não atribuídas); contato removido (conversa
fica, canal some da faixa).

## Critérios de aceite

Enviar o boleto abre a coluna Cliente com a mensagem e os canais; a resposta citada entra; sem envio nada muda; as três
larguras e o modo abas funcionam; testes de contrato passam; print no `evidence.md`.

## Dúvidas

Nenhuma bloqueante. Escolhas (a) uma conversa por ocorrência e contato e (b) só o WhatsApp responde foram aprovadas pelo dono em 27/10/2026.

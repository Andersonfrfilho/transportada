# Feature 276 — A resposta da contratante se confere

Pedido do dono (Anderson, 20/10/2026, com o e-mail real "PRORROGAÇÃO DE BOLETO - NF 912453"): automatizar a resposta da
contratante por tipo de ocorrência, mudar o status sozinho conforme a resposta, e não dar falso positivo quando o PDF não é o
documento pedido. Desenho conferido no preview interativo (https://claude.ai/artifact/NyALtpHfUc5HH9So1bQRig) antes da
implementação. Estende a 248 (retorno da contratante) e a 266 (andamento da ocorrência); não recria nada delas.

## Problema e resultado

No e-mail real a contratante responde duas vezes: "Solicitado" (sem anexo) e, minutos depois, "Segue" com o PDF. Hoje
(`decideContractorReply`, 248 RF4) a primeira resposta já leva o retorno a `needs_operator`, e esse estado ignora as
respostas seguintes (`already_answered`): o PDF que chega depois nunca é aceito. Além disso, qualquer PDF único passa como
"Boleto recebido", mesmo que seja outro documento.

Resultado: a resposta só com texto mantém o retorno aguardando; o PDF é conferido antes de mudar o status; a ocorrência ganha
status com o horário e a duração de cada etapa; pedido repetido na mesma nota tem trava configurável.

## Etapas (uma por PR, staging antes de main)

1. **Resposta sem anexo continua aguardando** (esta entrega). Zero anexos em `awaiting_contractor`/`overdue` → `ignore`
   com motivo `awaiting_attachment`: status, prazo e alarme não mudam, a mensagem fica na conversa. Anexo de tipo não aceito
   (só foto num tipo PDF) continua em `needs_operator`.
2. **Conferência do documento por tipo** (`boleto`: linha digitável de 47/48 dígitos com DV válido e NF ou valor da nota no
   texto do PDF; `pdf`: como hoje; `none`). Dúvida → `needs_operator` com motivo próprio, nunca avança sozinho. O envio
   automático ao motorista só vale com conferência.
3. **Status e tempos da ocorrência**: Recebida, Aberta, Aguardando contratante, Resposta recebida, Entregue ao motorista,
   Solucionada, Cancelada (e Precisa/Aguardando o operador), lidos dos eventos já gravados (248 RF15, 266), com início, autor e
   duração de cada etapa. Fechar sozinha depois de entregar é opção do tipo.
4. **Trava de pedido repetido na mesma nota**, opção do tipo: bloquear enquanto houver um em aberto (padrão), permitir depois
   de solucionada/cancelada, ou permitir sempre. Vale no servidor (app, escritório, WhatsApp).
5. **Resposta automática à contratante** (opcional, desligada por padrão), texto das respostas rápidas, uma por conversa.

## Fora do escopo

Ler boleto escaneado (OCR); decidir pela conversa a tratativa da 164 (183 D4 continua valendo).

## Critérios de aceite da etapa 1

- **CA1** `decideContractorReply` com zero anexos e retorno aguardando (`awaiting_contractor` ou `overdue`) devolve
  `{ kind: 'ignore', reason: 'awaiting_attachment' }`; com o PDF depois, `accept`.
- **CA2** Contra Postgres: "Solicitado" sem anexo deixa o retorno `awaiting_contractor`, sem evento, e o "Segue" com o PDF é o
  aceito (e-mail e portal).
- **CA3** A política e o contrato seguem idênticos na API e no worker (paridade).

# Feature 324 — Botão "Avisar a contratante" na ocorrência (rascunho para aprovação)

> Pedido do Anderson em 13/11/2026: os tipos Local fechado, Espera longa, Cobrança inesperada e Endereço incorreto **não vão direto** à contratante (`emails_contractor = false`). Quando o escritório achar necessário, quer um botão no painel que contate a contratante **pelo canal que ela tiver** (grupo de WhatsApp ou e-mail), **com os nossos modelos**, como o envio automático faria.

## Estado de hoje (lido em `origin/staging`)

- O aviso automático (`send-automatic-occurrence-mail.use-case.ts`) escolhe o canal pela contratante (`groupChannel` da 318, senão e-mail) e para em `type_off` quando `emails_contractor = false`. O modelo vem do tipo/exceção da contratante (269) ou, no grupo, do `ocorrencia.contratante-grupo`.
- Já existem envios manuais: campo "Mensagem à contratante" na conversa (sai por e-mail) e "Encaminhar à contratante" numa mensagem. Nenhum deles usa o modelo do tipo nem o grupo de WhatsApp, e nenhum é um botão na ocorrência.
- A marca `blocks_contractor_notice` (321) bloqueia **todos** os envios, inclusive os manuais. Esta spec não a toca: o botão **não aparece** no tipo marcado (ex.: canhoto retido).

## Problema e resultado

O escritório não tem como acionar o aviso padrão de uma ocorrência que o tipo deixou desligado. **Resultado:** na ocorrência, quem tem permissão vê "Avisar a contratante"; ao confirmar, o sistema manda **uma vez** o mesmo aviso que o automático mandaria (mesmo modelo, mesmo canal), registra quem enviou e mostra o resultado.

## Fora do escopo

- Mudar `emails_contractor` dos tipos ou ligar aviso automático.
- Texto livre (continua o campo de mensagem da conversa).
- Tipo com `blocks_contractor_notice` (canhoto retido): fica sem botão.
- Novos canais além de grupo de WhatsApp e e-mail.

## Decisões propostas

- **D1 — Reusa o plano e os dois remetentes do automático** (`findPlan`, `sendThroughGroup`, `sendByEmail`). Nova entrada `sendManual` que ignora só o corte `type_off`; a guarda `occurrenceTypeNeverNotifiesContractor` continua valendo primeiro.
- **D2 — Canal é o da contratante, sem escolha no botão.** Grupo (318) se ela tem; senão e-mail aos contatos da etapa. Fallback por e-mail segue o `email_fallback` já configurado.
- **D3 — Um envio por ocorrência por vez.** Chave de idempotência própria `occurrence-manual-notice:<id>`; reenviar só depois de falha. Evita duplicar o aviso se dois atendentes clicam.
- **D4 — Auditoria e andamento:** grava quem enviou, quando, canal e resultado; aparece na linha do tempo da ocorrência (frase fixa nova, espelhada nas três apps se o contrato de paridade exigir).
- **D5 — Permissão:** mesma de enviar mensagem à contratante na conversa (a confirmar no código na T1).
- **D6 — Sem destinatário:** o botão mostra o motivo em texto claro (contratante sem contato da etapa, e-mail não verificado) em vez de enviar vazio. Modelo ausente deixa de ser motivo: vale o geral (D10).
- **D8 — Também em tipo com aviso ligado quando o automático falhou** (resposta do Anderson à dúvida 1): o botão reenvia o aviso que não saiu por canal nenhum. Em tipo com aviso ligado e já avisado, não aparece.
- **D9 — Permissão:** a mesma de enviar mensagem à contratante na conversa (resposta do Anderson à dúvida 2). Nenhuma permissão nova.
- **D10 — Modelo geral criado junto (pedido do Anderson: "já crie o modelo").** Para o botão nunca ficar bloqueado por falta de modelo, nasce o modelo geral `ocorrencia.contratante-aviso-manual`: e-mail (assunto + corpo HTML, mesma família visual dos modelos de ocorrência) e WhatsApp pt-BR (o grupo continua com `ocorrencia.contratante-grupo`). Ordem de escolha: modelo do tipo/exceção da contratante (269) → modelo geral. Variáveis só da lista fechada já usada pelo grupo (tipo, contratante, nota, cliente, endereço, valor, data, momento, observação); nada de CPF/CNPJ/telefone. Publicado em staging por script com simulação primeiro, versão nova, nunca `UPDATE`.
- **D7 — Visual:** componentes padrão do design system (Button, Dialog de confirmação), igual ao "Encaminhar à contratante"; rótulo em cima, sem estilo próprio. Prints claro/escuro, desktop/celular antes do PR.

## Requisitos funcionais

- **RF1** Botão "Avisar a contratante" no detalhe da ocorrência de nota, visível se: sem `blocks_contractor_notice`, usuário com permissão (D9), a contratante ainda sem aviso por nenhum canal (tipo com aviso desligado, ou ligado cujo automático falhou, D8).
- **RF2** Confirmação mostra o canal (grupo X / e-mails Y) e o texto do modelo já preenchido; cancelar não envia.
- **RF3** Envio usa o modelo e o canal do automático (D1/D2); resultado `enviado`, `falhou` ou `não enviado` com motivo (D6).
- **RF4** Depois de enviado, o botão vira "Avisada em <data> por <nome> (<canal>)", sem reenvio. Falha permite tentar de novo.
- **RF5** Rota `POST /trip-occurrences/:id/contractor-notice` e leitura do estado no `GET` da ocorrência.
- **RF6** Tipo bloqueado (321): rota responde 409 e o botão não aparece.

## Requisitos não funcionais

- Aditivo: sem mudar o automático nem os tipos. Uma tabela/colunas novas de registro do envio manual, com rollback que recusa rodar com linha gravada.
- Textos em pt-BR e en; sem CNPJ/nome de contratante no código; sem dado pessoal no log.

## Casos extremos e falhas

- Dois cliques/atendentes: segundo recebe "já enviada" (D3).
- Grupo falha e há `email_fallback`: sai e-mail e o resultado diz.
- Contratante trocou de canal entre abrir e confirmar: vale o canal na hora do envio; a tela revalida.
- Ocorrência já avisada (automático ou manual): botão não aparece.

## Critérios de aceite

- **CA01** Tipo com aviso desligado: botão aparece; automático continua `type_off`.
- **CA02** Contratante em grupo: mensagem no grupo com o modelo `ocorrencia.contratante-grupo`, nenhum e-mail.
- **CA03** Contratante por e-mail: e-mail com o modelo do tipo aos contatos da etapa.
- **CA04** Segundo envio é recusado; falha permite repetir.
- **CA05** Canhoto retido: sem botão e rota 409.
- **CA06** Prints no padrão visual, claro/escuro, desktop/celular.

## Dúvidas

Todas respondidas pelo Anderson em 13/11/2026 (ver D8–D10). Sem `[NEEDS CLARIFICATION]` aberto.

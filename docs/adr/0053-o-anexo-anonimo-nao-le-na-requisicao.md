# ADR-0053 — O anexo anônimo não é lido na requisição

- Status: aceita
- Data: 2026-09-01
- Contexto: spec 069, sucessora da 066

## O problema

A spec 066 pôs a leitura do CCMEI **dentro** do `POST /public/aggregate-application-attachments`:
`createAggregateApplicationAttachmentUseCase` gravava o objeto e, na mesma requisição, chamava
`extractAttachmentFields` — pdf.js, no processo da API.

A rota é **anônima**. Turnstile e rate limit encarecem a chamada, não o trabalho que ela provoca:
quem passa pelos dois escolhe quanto CPU a API gasta, num runtime de um event loop só. Um PDF com
milhares de fragmentos de texto trava a API inteira — a emissão de CT-e do operador junto.

Isso viola a regra que o próprio ecossistema escreveu (`api.md`): a API salva o estado inicial e
**produz uma mensagem**; processamento pesado não bloqueia o event loop.

Enquanto a landing não enviava anexo, o defeito era teórico. Ligando o upload, ele passa a ser a
porta principal.

## A decisão

**A requisição grava e enfileira. Ninguém lê PDF na API.**

1. `aggregate_attachment_outbox`, tabela própria, escrita na **mesma transação** que o rascunho.
   Não é o `processing_outbox`: `actor_user_id` é `not null` lá, e aqui não há ator — quem anexa é
   anônimo. Inventar um UUID de sistema para caber na tabela alheia é mentir na trilha.
2. Trilho `aggregate-attachment.v1` (main/retry/dead) no `worker-transportada`, com relay próprio,
   no mesmo desenho dos outros quatro.
3. **O parse roda em `worker_thread`**, não no event loop do worker. Ali dentro correm emissão de
   CT-e, MDF-e e NFS-e; trocar o bloqueio da API pelo bloqueio do worker não seria conserto, seria
   mudança de vítima.
4. `extracted_fields` é escrito pelo consumidor, depois. A fila de revisão já tolera o campo nulo —
   ela sempre tolerou, porque a extração sempre pôde não reconhecer nada.

## O que não muda

**A landing continua lendo no navegador.** As duas leituras existem por motivos diferentes, e a 066
já dizia isso: a do navegador é conveniência para preencher o formulário — instantânea, sem rede,
sem nada gravado; a do servidor é **prova**, o que o operador confere. Aceitar a leitura do cliente
anônimo como prova deixaria um atacante escolher o que o operador vê.

Por isso o upload responde `201` com o `draftId` e **nada mais**. Não devolve campo extraído, e a
landing não espera por nenhum: quem preenche o formulário já preencheu, antes do upload terminar.

## Alternativas descartadas

- **Serviço separado de extração**, como o `tesseract-server` do OCR. Dá teto de recurso próprio e
  derruba sozinho, e é o caminho certo no dia em que a extração crescer para além de PDF. Hoje custa
  app, Dockerfile, deploy, env e um contrato de rede por um parse que o `worker_thread` isola pelo
  mesmo efeito prático. Fica registrado como o próximo passo, não como o passo de agora.
- **Parse no worker sem thread.** Mais simples de escrever, e move o bloqueio para onde ele custa
  mais caro: fila fiscal.
- **Manter síncrono e limitar o tamanho do PDF.** Tamanho não é o custo — um PDF de 200 KB com
  geometria patológica lê pior que um de 5 MB escaneado.

## Consequência aceita

Entre o upload e a extração existe uma janela em que o anexo aparece na fila do operador **sem**
campos lidos. É a mesma tela do anexo cuja leitura não reconheceu nada, e o operador já sabe abrir o
arquivo. A janela é o preço de a API não parar.

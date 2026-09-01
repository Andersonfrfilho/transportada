# 069 — O anexo sai da requisição

## O que se pede

Duas coisas, que só fazem sentido juntas:

1. **A landing envia o anexo.** Hoje o PDF é lido no navegador para preencher o formulário e morre
   com a aba. A rota pública de upload existe desde a 066, com Turnstile, rate limit, rascunho por
   `draft_id`, revisão e download assinado no painel — e **nenhum chamador**.
2. **A leitura sai da requisição.** Ligar o upload sem isso aponta tráfego anônimo para um parse de
   pdf.js rodando dentro do `POST`, no event loop da API. Ver ADR-0053.

## Estado de hoje

- `POST /public/aggregate-application-attachments` grava o objeto e **lê o PDF na mesma requisição**
  (`aggregate-application-attachment.use-case.ts`).
- O submit de candidatura já aceita `attachmentDraftIds` (até `MAX_ATTACHMENT_DRAFTS`) e amarra os
  rascunhos na mesma transação. Esta metade está pronta.
- A landing lê CCMEI no navegador (`documentIntake.service.ts`) e preenche campo vazio
  (`mergeCcmeiIntoFields`). Isso **fica**.

## O que muda

### API

- `createAggregateApplicationAttachmentUseCase` deixa de receber `extractFields`. Ele grava o objeto,
  e o repositório insere rascunho **e** evento de `aggregate_attachment_outbox` numa transação só.
- `extractAttachmentFields` sai da API.

### Worker

- Trilho `aggregate-attachment.v1` + relay, no desenho dos outros quatro outboxes.
- O consumidor baixa o objeto do bucket, roda o parse em `worker_thread` e grava `extracted_fields`.
- Extração vazia é resultado, não falha: grava `null` e fecha. Objeto ausente e parse estourado são
  falha, e vão para retry.

### Landing

- Anexar um arquivo faz duas coisas em paralelo: lê no navegador (preenche) e envia (rascunho).
- O submit manda os `draftIds` recebidos.
- Falha de upload **não** bloqueia o envio da candidatura: o formulário é o que importa, o anexo é
  comprovante. Quem falhou aparece na tela como "não enviado", nomeando o arquivo.

## Não escopo

- Expurgo de rascunho vencido (T015 da 066, ainda aberta).
- Criptografia dos campos extraídos (ADR-0039).
- Extração de CNH e CRLV — segue só CCMEI, como na 066.
- Serviço separado de extração — registrado na ADR-0053 como próximo passo.

## Perguntas fechadas

- **A resposta do upload devolve campo extraído?** Não. `201` com `draftId`. Decidido 2026-09-01.
- **Onde roda o parse?** `worker_thread` dentro do `worker-transportada`. Decidido 2026-09-01.
- **A landing para de ler no navegador?** Não — ver ADR-0053, "O que não muda".

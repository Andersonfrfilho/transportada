# Spec 226 — A fila do motorista não trava com o servidor fora do ar

## Problema

Levantamento de 02/10/2026 sobre eventos que o app do motorista cria e não consegue enviar. Dois
defeitos, os dois com a mesma raiz: **o evento é tratado como recusado ou perdido por causa de uma
falha que não é dele.**

1. **Servidor indisponível vira recusa.** Toda resposta não-OK — inclusive o HTML de um `502` durante
   o deploy, ou um `429` — virava `rejected`. O item sai da drenagem automática e fica parado até o
   motorista tocar "Enviar agora". Itens bons ficam presos por causa de um deploy.
2. **A ocorrência de nota sem foto não passa pela fila.** Era chamada direta
   (`registerDocumentOccurrence`): sem rede o toque falhava com alerta e o texto digitado se perdia;
   e a `Idempotency-Key` nascia nova a cada chamada, então uma resposta perdida seguida de novo toque
   podia duplicar a ocorrência.

## Decisões

- **D1 — O que é "tente depois".** `408`, `429`, `502`, `503` e `504`: quem falhou foi o caminho,
  não o item. Viram `failed-network` — o item fica na fila, `attempts + 1`, a drenagem tenta de novo.
  ⚠️ **O `500` fica de fora de propósito.** `failed-network` para a drenagem inteira (`break`), então
  um item que derruba o servidor travaria todos os de trás por até 7 dias (spec 159). O `500` segue
  sendo recusa, e o item à vista no aparelho.
- **D2 — O corpo ilegível de um não-OK guarda o status.** O HTML de um `502` não é JSON; o erro
  `RESPONSE_INVALID` passa a carregar `status` quando a resposta já era recusa, senão D1 não tem como
  decidir. Um `200` com corpo ilegível continua recusado e **sem** status na causa (o rótulo da tela
  de pendentes não muda).
- **D3 — O PUT da foto ao storage segue a mesma régua.** `503` do storage espera; `403` (URL
  assinada vencida) continua recusa.
- **D4 — Vale para as duas cópias.** `apps/frontend-driver` e o legado `/minha-viagem` em
  `apps/frontend-transportada` (ADR-0075 §7: cópia por valor). O campo ainda usa o legado enquanto
  `VITE_DRIVER_APP_URL` estiver desligado.
- **D5 — A ocorrência de nota sem foto vira o item `documentOccurrence` com `photo: null`.** Reverte
  em parte a 218 D1/D3 ("sem foto continua chamada direta; fila é mudança de arquitetura maior").
  O motivo da reversão: o item já aceitava `photo: null` (o "Não entreguei" o usa), o servidor recebe o
  mesmo `POST` e abre a mesma tratativa (`trip_occurrence_cases`), e a chave agora nasce **uma vez**,
  no toque. A chamada direta e `registerDocumentOccurrence` saem do cliente.
- **D6 — O retorno visível muda de forma, não de existência.** Antes: "Ocorrência registrada às
  HH:MM" só após o `POST`. Agora: o selo `DriverNotDeliveredStatus` ("na fila" / "enviada" /
  "recusada"), o mesmo da ocorrência com foto, mais o aviso transitório de sempre.

## Fora de escopo (e por quê)

- **Despachar a viagem continua online-only.** Muda o estado da viagem (`route_planned` →
  `dispatched`) e o servidor valida pré-condições; enfileirar faria o motorista sair achando que
  despachou enquanto o escritório ainda vê a viagem parada. Falhar com aviso é mais honesto.
- **Descarte silencioso aos 7 dias** (spec 159, risco aceito em `docs/SECURITY.md`), **posição sem
  fila** e **falha de gravação no IndexedDB** — achados do mesmo levantamento, não tratados aqui.
- **Backoff exponencial.** A drenagem segue a cada 30 s; um `503` prolongado repete uma requisição
  por item parado a cada 30 s.
- **Conversa da ocorrência no app novo** (spec 183 T604 só existe no legado) — decisão de produto
  sobre a ordem de desligar o legado.

## Critérios de aceite

- **CA1** `408/429/502/503/504`, com corpo JSON **ou HTML**, deixam o item na fila (`failed-network`);
  `400/403/404/409/422/500` seguem recusa. Nas duas apps.
- **CA2** Um `503` na drenagem deixa o item e os de trás para a próxima, e a seguinte os envia.
- **CA3** Um `500` no primeiro item não impede o envio dos de trás.
- **CA4** `503` do storage espera; `403` do storage recusa.
- **CA5** Ocorrência de nota sem foto sai por `enqueueDocumentOccurrence` com `photo: null`; o `send`
  leva a chave do item e nenhum `attachmentObjectId`; sem rede o texto fica na fila.
- **CA6** A tela e o cliente não têm mais `registerDocumentOccurrence`.

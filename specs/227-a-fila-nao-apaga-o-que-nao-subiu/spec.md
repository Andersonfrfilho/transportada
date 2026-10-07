# Spec 227 — A fila não apaga o que não subiu

## Problema

Decisão do usuário (02/10/2026): **"não apaga até sincronizar"**. Hoje a fila offline do motorista
apaga, sem avisar, evento e anexo parados há mais de 7 dias (spec 159 T11.4 para anexos, spec 189
T9.2 para eventos). O que o motorista fez e o aparelho ainda não conseguiu enviar é a **única cópia**
do trabalho dele; apagá-lo em silêncio é perder entrega, canhoto ou ocorrência.

## Decisões

- **D1 — Nada sai da fila por idade.** `discardStaleAttachments`, `isAttachmentDiscardable` e
  `ATTACHMENT_DISCARD_AFTER_MS` saem das duas apps (app nova e legado `/minha-viagem`). A abertura do
  app não descarta mais nada. `countPending` deixa de ignorar anexo antigo: ele conta como qualquer
  pendência (antes sumia do selo e da contagem).
- **D2 — O recusado de negócio sai só pela mão do motorista, com confirmação.** Sem o prazo, um item
  que o servidor recusou (4xx) nunca sincroniza e ficaria para sempre no aparelho e no selo. O app
  novo ganha o "Descartar" da tela de pendências que o legado já tinha (ADR-0075 §6, cópia por
  valor): primeiro toque abre o aviso — "A entrega não foi registrada; fale com o escritório" —,
  segundo apaga **o item e o dado dele** (blob e posição). Enquanto a confirmação está aberta, a linha
  "Enviar agora / Descartar" some, para não haver dois "Descartar" lado a lado.
- **D3 — Só a recusa de negócio é descartável.** `401`, `403`, `408`, `429`, qualquer `5xx` e
  `REQUEST_FAILED` (rede, sessão expirada) **nunca** mostram "Descartar": a próxima tentativa pode
  levar o item, e descartá-lo apagaria uma entrega que subiria. É o critério do legado
  (`isBusinessRejectionCause`), copiado.
- **D4 — Risco aceito, registrado.** A posição e a foto ficam no IndexedDB do aparelho por tempo
  indeterminado, legíveis por quem o desbloquear. `docs/SECURITY.md` troca "prazo de 7 dias" por
  esta decisão. Continuam tirando dado do aparelho: o envio, o descarte do recusado (D2), o
  "Descartar e sair" e o descarte de pendência de outra conta.

## Fora de escopo

- Aviso antes do descarte, heartbeat para o escritório e `navigator.storage.persist()` — as outras
  propostas do levantamento; o usuário decidiu pelo mais simples: não apagar.
- `countPending` ainda aceita o campo `now` (hoje sem uso): removê-lo toca ~15 chamadas, a maioria em
  testes, e não muda comportamento.
- Backoff na drenagem.

## Critérios de aceite

- **CA1** Evento e anexo de 30 dias continuam na fila e contados como pendência a enviar.
- **CA2** Nenhum módulo exporta descarte por idade; a abertura do app não chama nenhum.
- **CA3** Recusa 4xx de negócio mostra "Descartar" com confirmação; 401/403/408/429/5xx/
  `REQUEST_FAILED` não mostram.
- **CA4** Descartar remove o evento recusado com os anexos dele; anexo recusado sai sozinho.

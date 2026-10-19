# Feature 275 — O aviso da ocorrência do motorista chega ao painel

> Pedido do dono em 2026-10-19. **Reverte** a decisão da 079 registrada só como comentário em
> `apps/api-transportada/src/main.ts` ("Sem notificador: quem despachou a viagem é justamente quem receberia o aviso…").
> **Emenda** a 267 § Fora do escopo ("Notificação no sino para os responsáveis") para este caso. Sem ADR nova: a
> decisão revertida nunca virou ADR (vivia num comentário de código), e esta spec registra a reversão e o porquê.

## Specs do mesmo assunto (lidas contra o código em `origin/staging` f8e5a7a, 2026-10-19)

| Spec | O que já decidiu e esta spec **usa sem refazer** (ou reverte/emenda, marcado) |
| ---- | ----------------------------------------------------------------------------- |
| 079  | Aviso interno da ocorrência de nota: `resolveOccurrenceNotification` (só com `notifies = true`), template `email_template_key` do tipo ou `trip.delivery-occurrence`, destinatário = quem despachou (`trip_dispatch_snapshots.actor_user_id`, último despacho), falha engolida (`notifyOccurrence`). **Reverte** só o "sem notificador" da rota do motorista. O caminho do escritório fica como está. |
| 156  | Lote do escritório avisa por nota com `notifyOccurrence`; `dedupeKey` com a nota por id (M4). Não muda. |
| 183  | T802: aviso automático à contratante (`automaticOccurrenceMail.announce`) depois do registro, em todo canal. Não muda; o aviso interno é outro trilho. |
| 267  | RF3 — lista efetiva de responsáveis (vínculo ativo, `occurrences.resolve`, com e-mail, sem duplicata). **Usa** a regra inteira (`resolveEffectiveWatchers`). **Emenda** o "fora do escopo: sino para os responsáveis": vale para a ocorrência do motorista em nota. |
| 271  | D10/D11 — lista do tipo vence a da contratante, que vence a da empresa (`loadEffectiveWatcherCandidates`). **Usa.** `email_template_key` continua sendo o aviso interno (271 § tabela). |

## Problema

O motorista registra a ocorrência na nota pelo app ou pelo WhatsApp e o painel não fica sabendo: a rota do motorista
não tem notificador. A 079 decidiu assim supondo que o motorista contava a ocorrência por rádio a quem despachou. Na
operação de hoje isso não acontece — o registro do app **é** o relato —, e quem trata a ocorrência (os responsáveis da
267/271) nem sempre é quem despachou. A ocorrência só aparece para quem abre a viagem.

## Resultado

Toda ocorrência que o **motorista** registra **numa nota** (app ou WhatsApp) vira aviso interno (caixa de entrada do
módulo de notificação) para os responsáveis por ocorrências **e** para quem despachou a viagem.

## Decisões

- **D1 — Sempre.** A ocorrência do motorista em nota avisa para **todo** tipo, sem olhar `notifies`. O `notifies` continua
  valendo só para o registro do escritório.
- **D2 — Destinatários.** Lista efetiva de responsáveis (267 RF3 + 271: tipo > contratante > empresa; contratante da nota
  pelo emitente; sem contratante cadastrada, tipo > empresa) **∪** quem despachou (último despacho), sem duplicar. Sem
  lista configurada → só quem despachou. Sem lista e sem despacho → ninguém.
- **D3 — Template.** O `email_template_key` do tipo, se houver; senão `trip.delivery-occurrence` (a regra da 079).
- **D4 — Canais.** Os do módulo de notificação: caixa de entrada sempre; e-mail conforme preferência/roteamento do módulo.
  A API não escolhe canal.
- **D5 — Idempotência.** `dedupeKey = <template>:<ocorrência>:<destinatário>` — o índice único do módulo é
  `(company_id, dedupe_key)`, então a chave carrega o destinatário. O reenvio da fila offline (mesma ocorrência) não
  duplica aviso.
- **D6 — Falha não derruba.** O aviso sai depois do commit; erro de leitura ou de envio vira `warn` sem PII (ids e
  contagens) e o registro responde normalmente. Um destinatário que falha não impede os outros (`allSettled`).
- **D7 — O que não muda.** Registro pelo escritório (rota e lote), ocorrência de parada (`createStopOccurrenceNotifier`)
  e o aviso automático à contratante.

## Critérios de aceite

1. Tipo com `notifies = false`, lista da empresa {Ana} e despacho de Beto: o motorista registra → um aviso para Ana e um
   para Beto, com `trip.delivery-occurrence`.
2. Beto também na lista → um aviso só para Beto.
3. Sem lista → só Beto. Tipo com `email_template_key` → o aviso sai com essa chave.
4. O mesmo vale pelo WhatsApp.
5. O notificador falha → a ocorrência é gravada e a resposta é a de sempre.
6. O registro pelo escritório continua avisando só quem despachou e só com `notifies = true`.

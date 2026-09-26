# Spec 203 — O attach nunca descarta

> P0, aberto pelo orquestrador (2026-09-25) como pré-requisito citado nas specs 193 (D8, T4.0),
> 194 ("Pré-requisito"), 195 e 196: "nenhum caminho de `attach` joga a foto fora". Esta spec é o
> registro dele — pequena de propósito, sem fases.

## Problema e resultado

`DeliveryProofSection` (`apps/frontend-driver/src/modules/driver-trip/components/DriverStopCard.component.tsx`)
captura o canhoto (foto ou assinatura) e o entrega a `attach(kind, file)`. Antes desta task, `attach`
chamava `blockedByFields(next)` e, se algum campo obrigatório do comprovante estivesse vazio
(nome/documento de quem recebeu, ou a própria foto/assinatura marcada `required`), `return`ava **antes**
de chamar `onProof(...)` — o `File` já recortado (`ProofCrop`/`SignaturePad`) era descartado em
silêncio. O motorista precisava fotografar de novo, sem nenhum aviso do porquê.

A foto do canhoto é a prova nº 1 do usuário (nota de sessão anterior) — perdê-la por um campo de
texto vazio é o defeito mais caro que este fluxo pode ter.

**Resultado:** `attach()` não tem mais nenhum `return` antecipado. A foto/assinatura entra na fila
offline (IndexedDB, via `onProof` → `attachProof` → `enqueueAttachment`) **incondicionalmente**. O
veredito de campo obrigatório (`blockedByFields`/`listMissingProofFields`) continua rodando, mas só
alimenta um aviso visível e não-bloqueante (`role="status"`, nunca mais `role="alert"`) — a foto já
está guardada, o aviso só diz o que falta completar.

## O que muda

- **`DriverStopCard.component.tsx` — `attach()`.** Ordem invertida: `setAttached` → `onProof(...)`
  (sempre) → `blockedByFields(next)` (só para popular `missing`, sem gatilhar `return`). Vale para
  `kind: 'photo'` e `kind: 'signature'` — é a mesma função para as duas capturas, então um fix só
  cobre as duas (o pedido original citava linhas ~549-555 e ~686-693 de uma revisão anterior do
  arquivo; o acordeão dos commits `8ba3e4b17`/`9ec97d683` moveu tudo para dentro de `attach`).
- **Aviso não-bloqueante.** Os três `<span role="alert">{t('proofFields.requiredField')}</span>`
  (nome, documento, foto/assinatura) viram `role="status"` com `t('proofFields.pendingField')` — a
  chave e o texto trocam porque "antes de anexar o comprovante" deixou de ser verdade (o anexo já
  foi feito). Textos novos em pt-BR e en.
- **Campo preenchido depois do anexo.** Nova função pura `applyAttachmentReceiverFields` em
  `offlineAttachments.service.ts` (mesmo formato de `applyAttachmentLocation`, spec 159 T11 item 6),
  casando por `documentId` em vez de `attachmentKey` — a captura não devolve a chave gerada ao
  formulário, e um documento tem no máximo uma foto e uma assinatura pendentes por vez, então casar
  pelas duas é suficiente e mais simples. `useDriverTrip.hook.ts` ganha `updateProofFields(input)`:
  varre `attachmentStore.readAll()` (mesma varredura que a drenagem usa) atrás do grupo que tem um
  item daquele documento e aplica a mutação por `eventKey`. Sem grupo (o anexo já subiu), não faz
  nada. `DeliveryProofSection` chama isso no `onBlur` dos campos de nome/documento, só depois de
  `attached.photo || attached.signature` — o formulário permanece montado no cartão da parada
  (`DocumentRow`, documento `delivered`) mesmo depois do anexo entrar na fila, então o motorista
  pode completar o campo no mesmo lugar.
- **Fora desta task (documentado, não implementado):** se o anexo **já subiu** para o servidor antes
  de o motorista completar o campo, `updateProofFields` não encontra grupo nenhum e não faz nada — a
  spec 193 (D5, rota `PATCH /me/trips/current/documents/:documentId/proof/receiver`) é quem fecha
  esse caso.
- **`captureRegistry`.** Conferido, sem mudança: `persistWhileOpen(captureRegistry, ...)` (dentro de
  `attachProof`) abre `'persisting'` **na mesma volta síncrona** do `onConfirm` do `ProofCrop`, antes
  do `close('crop')` que só chega no commit do React (spec 189 T9.2, A4). Como `attach()` agora
  sempre chama `onProof` de forma síncrona (nunca mais atrás de um `if` que aborta antes), essa
  garantia continua valendo sem precisar de outro ajuste.

## Legado (`apps/frontend-transportada`)

`apps/frontend-transportada/src/modules/driver-trip/components/DriverStopCard.component.tsx:448-453`
tem o **mesmo defeito** (`attach()` com `if (blockedByFields(next)) return` antes do `onProof`) — é
a origem de onde `apps/frontend-driver` copiou por valor (ADR-0075 §7). Não foi corrigido aqui: o
pedido desta task era só a app do motorista, e "cópia por valor" não sincroniza as duas
automaticamente. Registrado para o dono do painel decidir se replica o fix.

## Aceite

- `attach()` não tem `return` nenhum (asserção de texto em
  `test/driver-trip/proof-attach-queue-first.contract.ts`).
- Foto com campo obrigatório vazio entra na fila e o aviso aparece, sem bloquear.
- Preencher o campo depois, com o item ainda na fila, atualiza o mesmo item
  (`applyAttachmentReceiverFields`, testado em `test/driver-trip/offline-attachments.contract.ts`).
- Campo opcional: comportamento de hoje, sem aviso.

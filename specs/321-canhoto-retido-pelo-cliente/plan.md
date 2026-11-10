# Plano — Feature 321

Fase 1: tipo + garantia de não-aviso + liberação da nota (D4) + selo/lista. Fase 2: nota na nova viagem como "coletar canhoto" finalizada pela foto (D4b), resolução automática e alerta de prazo. A fase 2 depende de T0 (estado da nota solta e encaixe em viagem; 297 é rascunho).

## Peças

1. **Catálogo** — `occurrence-type-catalog.constant.ts`: entrada literal `CANHOTO_RETAINED_OCCURRENCE_TYPE_NAME`, `itemsMode: off`,
   `stage: delivery`, sem e-mail. O seed só grava em empresa sem tipo; empresas existentes recebem pelo script de staging
   (`staging-configura-tipos-ocorrencia.sh`, acrescentar o tipo com `notifies = false`, `emails_contractor = false`,
   `note_mode = required`, `attachment_mode = optional`) e, depois de aprovado, pelo cadastro na aba Tipos.
2. **Guarda de não-aviso** — função pura `occurrenceTypeNeverNotifiesContractor(type)` lida pelos três pontos que avisam: envio
   automático (143/269/271), envio manual e canal de grupo da 318. Contrato de paridade cobrindo os três.
3. **Resolução automática** — no ponto em que o comprovante de canhoto passa a existir ou a ser aprovado/reprovado
   (`document-outcome-proof.service.ts` e a rota do robô `PATCH .../proof/review/automatic`), chamar o escritor de andamento
   da 266 (`system`, `phraseKey` novo `canhoto_received`; `rejected` → `reopened`).
4. **Casamento entre viagens** — conferir `resolveCanhotoMatch` do worker (294): se só considera notas abertas da viagem, incluir
   notas com ocorrência aberta do tipo.
5. **Painel** — selo na nota e filtro na lista de ocorrências com os componentes padrão do design system; sem input/botão novo.
6. **App do motorista / WhatsApp** — o tipo aparece na lista de tipos de nota; observação obrigatória pelo resolvedor espelhado.

7. **Liberação** — coluna `releases_document_for_pickup` no tipo (aditiva, padrão `false`) e, no registro, soltar a nota da parada/viagem de origem pelo caminho que a 164 e a 185 já usam; a nota entra em outra viagem pelo fluxo normal de acrescentar nota.

## Riscos

- Tipo renomeado no painel perde a guarda por nome: a guarda é pelo `id` gravado, não pelo nome.
- Resolução automática por foto errada: a conferência manual (220) vale; reprovar reabre.

# Plano — Feature 321

Premissa corrigida pela T0 (`evidence.md`): nota entregue não é solta; a retenção cria uma **coleta de canhoto** ligada à viagem
nova. Etapas na ordem de publicação: painel tolerante → API → app do motorista.

## Peças

1. **Tipo e guarda (API)** — colunas `blocks_contractor_notice` e `counts_cargo_on_pickup_trip` em `company_occurrence_types`
   (aditivas, padrão que não muda tipo nenhum). Função pura `occurrenceTypeNeverNotifiesContractor` lida pelos quatro pontos de
   aviso (T0 §4) e, quando entrar, pelo canal de grupo da 318. Contrato de paridade nos pontos.
2. **Coleta** — tabela `trip_canhoto_pickups` (D4), caso de uso de registro (cria a coleta junto da ocorrência, na mesma transação),
   encaixe do escritório (`pickup_trip_id`/`pickup_stop_id`, parada no endereço do cliente), cancelamento/volta a `pending`.
3. **Casamento do canhoto** — worker (`drizzle-canhoto-read-queue.repository.ts`, `canhoto-barcode.policy.ts`) e bot
   (`whatsapp-canhoto-recognition.service.ts`) passam a considerar as coletas `scheduled` do motorista, além das notas abertas.
4. **Andamento da 266** — migration que relaxa os CHECKs do `system` para aceitar `pickup_id`, frase `canhoto_collected`, espelhada
   nas três apps; resolve ao `collected`, reabre ao reprovar.
5. **Cargas** — nada a somar (coleta fora de `trip_documents`). Contrato que prova que os leitores de T0 §8 não a contam. `true` fica
   recusado no cadastro.
6. **Painel** — seletores na aba Tipos; encaixe da coleta; flag "Coleta de canhoto" + tooltip (molde `proofPending`); filtro por id do tipo.
7. **App do motorista** — parada "Coletar canhoto" com a foto; campo novo no snapshot.
8. **Staging** — tipo criado pelo script de configuração (dry-run primeiro); runbook.

## Riscos

- Coleta amarrada a nota/ocorrência de origem: a ponte `nfe_document_id` entre a linha antiga e a coleta é o ponto delicado (T0 §10).
- Relaxar CHECK do andamento afeta a 266: rollback recusa rodar com dado dependente.
- A 318 ainda é PR: a guarda cobre o canal dela quando entrar.

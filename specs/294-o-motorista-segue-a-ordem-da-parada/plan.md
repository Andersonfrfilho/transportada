# Plano — 294 O motorista segue a ordem da parada

## Contexto e premissas (levantamento em `origin/staging`, 2026-11-05)

- Saída: `trips/application/report-stop-departure.use-case.ts` — trava as paradas da viagem, no-op se já a
  caminho/chegou/fechou ou toque velho (`isDepartureTapStale`), `409 TRIP_HAS_STOP_EN_ROUTE`, grava `departed`.
- Chegada: `report-stop-arrival.use-case.ts` — não exige saída (206 D6), grava só a primeira, o canal do motorista
  limpa "a caminho" de toda a viagem (206 D7) e desloca previsões (109).
- Baixa: `document-outcome.service.ts` + `document-outcome-steps.service.ts`; `checkTripDocumentTransition` olha só
  nota `loaded` e viagem. `completeStopIfSettled` (`drizzle-driver-field-report.repository.ts` ~605) preenche
  `arrived_at` sem evento.
- Os três abrem cada um seu `unitOfWork.execute` + `withFieldReport` (chave + operação `stop.depart`,
  `stop.arrive`, `document.deliver`; escritório com prefixo `office.`).
- Motorista × escritório: `{ driverId }` × `{ target }` (`field-trip-target.types.ts:56`), `deriveFieldAuthorship`
  → `driver_app` | `whatsapp` | `office`.
- App: `DriverStopCard.component.tsx` já ordena os botões; fila offline FIFO (`offlineQueue.service.ts:209–263`)
  segue drenando depois de recusa.
- Endereço: `geocoded_addresses` global por `address_key`, com `precision` e `source`; correção do operador em
  `PATCH /geocoded-addresses/:key` (`drizzle-geocoded-address-correction.repository.ts:81`, `origin` já aceita
  `'driver'`). `precision` não chega ao snapshot do motorista.
- Bot: localização compartilhada em memória por processo, consumida por uma ação
  (`whatsapp-shared-location.service.ts`); grupo e individual já a recebem.

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`)

- **Política pura** `trips/domain/stop-event-sequence.policy.ts`: dado o estado da parada (`enRouteSince`,
  `arrivedAt`, `completedAt`), o evento pedido e a autoria, devolve as etapas a marcar junto
  (`[] | ['departed'] | ['departed','arrived'] | ['arrived']`). Escritório → sempre `[]`.
- **Extrair os `perform`** de saída e chegada para `stop-event-steps.service.ts` (como a baixa já faz), chamáveis
  dentro de outra transação sem nova reserva de chave.
- `report-stop-arrival` e `document-outcome` (caminho do motorista) chamam a política e os passos extraídos antes
  do próprio evento, na mesma transação, gravando os eventos com `recorded_together = true`.
- Resultado dos três use cases ganha `recordedTogether: readonly ('departed'|'arrived')[]` e, na baixa,
  `nextStop` quando `stopCompleted` (id, sequência, total, cliente, endereço, notas, coordenada, `precision`).
- Estatísticas: `service-time.policy.ts`, `stop-dwell.policy.ts`, amostras de deslocamento e o deslocamento de
  previsão (109) ignoram eventos `recorded_together`.
- **Endereço**: `address-arrival-correction.policy.ts` (pura: precisão atual, distância, tolerâncias) →
  `apply` | `suggest` | `ignore`. `apply` grava pelo mesmo repositório da correção do operador com
  `origin: 'driver'`; `suggest` grava em `address_correction_suggestions` (absorve o desenho útil da 195).
- `GET /pending-items` ganha o tipo "endereço sugerido pelo motorista"; aplicar/descartar pelo painel.
- Snapshot do motorista (`drizzle-current-driver-trip.repository.ts`) passa a levar `precision` por parada.

### Bot (`whatsapp/`, `whatsapp-commands/`)

- Respostas de "saí", "cheguei", "entreguei" e "devolvi" incluem a linha de etapa marcada junto (RF5).
- Novo fluxo `whatsapp-group-next-stop-flow.service.ts` (e o equivalente individual): oferta (RF8–RF10), passo
  `confirm`, "1" → `reportStopDeparture` com chave `whatsapp-group-request:<id>`.
- Abertura condicionada (RNF1): só abre pedido se `findOpen` do grupo for vazio; senão a frase vai sem pergunta.
- "Cheguei" em parada não confiável: se não houver localização consumível, pede e espera no mesmo pedido (passo
  `location`); com o ponto, chama a correção (RF14/RF15).
- RF17: `describeStopReference`, `GROUP_STOP_TEXT.askStop`, `GROUP_DELIVERY_TEXT.askDocument` com cliente;
  cabeçalhos de `whatsapp-group-*-flow.service.ts` e `whatsapp-driver-stop.policy.ts` sem a proibição.

### App do motorista (`apps/frontend-driver`)

- Confirmação do "Entreguei"/"Não entreguei" sem chegada diz "Vamos marcar Cheguei junto"; aviso depois da baixa
  com `recordedTogether`.
- "Registrar entrega depois" mantém a queda no placar e mostra as etapas marcadas junto.
- Card da próxima parada com "Iniciar rota" em destaque e aviso de endereço não confiável; no "Cheguei" de parada
  não confiável, pede a localização do aparelho (já pedida hoje para o carimbo do evento).

### Painel (`apps/frontend-transportada`)

- Linha do tempo mostra "marcada junto" e "endereço corrigido pelo motorista" (tolerante antes da API).
- `/pendencias`: sugestões de endereço do motorista com mapa (ponto atual × ponto sugerido), aplicar/descartar.

## Contratos/API/eventos

- `trip_stop_events` (ou a tabela de eventos de campo em uso — confirmar na T0.1): coluna
  `recorded_together boolean not null default false`.
- Resposta de `POST /me/trips/current/stops/:id/arrival|departure` e das baixas do motorista:
  `recordedTogether: string[]`; baixa também `nextStop: {…} | null`.
- `address_correction_suggestions` (id uuid, company_id, address_key, stop_id, latitude, longitude,
  distance_meters, status varchar `pending|applied|dismissed`, created_by, decided_by, timestamps).
- Novo ADR `0113-o-ponto-da-chegada-corrige-o-endereco.md` (substitui ADR-0080 em parte).

## Dados, migration e rollback

- Migration A aditiva: coluna `recorded_together` + tabela de sugestões + `source`/`origin` aceitando `driver`
  (VARCHAR já). Rollback: drop da coluna e da tabela (sem dado de negócio perdido além das sugestões).
- Nenhuma reescrita de evento antigo: o histórico antes do deploy continua sem etapa marcada junto.

## Segurança e tenant

- `geocoded_addresses` é global (sem `company_id`): a correção do motorista altera o ponto para todas as empresas
  do ambiente. Aceitável pela instalação dedicada (ADR-0021); a sugestão carrega `company_id`, e o painel só lista
  as da empresa. Registrar no ADR.
- Coordenada do motorista é dado pessoal (ADR-0081/196): a correção copia o ponto para o cadastro do endereço
  (dado de cadastro) sem ligar ao motorista além do evento de auditoria.
- Rotas do motorista continuam presas à viagem atual do token (BOLA).

## Idempotência e concorrência

- Etapas marcadas junto gravam sob a chave do evento pedido; reenvio cai no `recall` e devolve o mesmo resultado.
- A política lê a parada já travada (`for update` das paradas da viagem, como a saída faz hoje).
- Correção de endereço: chave `address-correction:<eventId>`; duas chegadas no mesmo endereço → a segunda,
  já confiável, cai em RF15.

## Observabilidade

- Logs `stop_event.recorded_together`, `address_correction.applied|suggested|ignored`,
  `whatsapp_next_stop.offered|accepted|declined|deferred` — só ids e motivo.

## Estratégia de testes

- Contrato da política (tabela de estados × evento × autoria).
- Integração (banco): baixa do motorista sem chegada grava 3 eventos em 1 transação; escritório grava 1; reenvio
  não duplica; estatística ignora marcados junto.
- Contratos do bot: oferta, aceite, recusa, última parada, e a matriz de não interferência (RNF1).
- App: fila offline com "Cheguei" recusado → entrega com `recordedTogether`.

## Riscos

- Extrair os `perform` toca o caminho mais usado da API: fazer em task isolada, sem mudar comportamento, com a
  suíte de integração inteira verde antes de ligar a política.
- Amostras históricas de tempo de serviço já contaminadas por 205 D6 (sem evento) não mudam.

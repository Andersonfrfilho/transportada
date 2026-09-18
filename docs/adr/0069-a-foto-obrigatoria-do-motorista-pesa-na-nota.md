# ADR-0069 — A foto obrigatória do motorista não recusa a entrega, pesa na nota

- **Status:** aceita
- **Data:** 2026-09-18
- **Decisores:** usuário (regra da nota, geolocalização + horas, pontos que descem, onde a nota
  aparece, anexo em lote), na conversa da spec 159
- **Fecha:** a T1 da spec 159 (`specs/159-a-foto-obrigatoria-pesa-na-nota-do-motorista/`)
- **Complementa:** ADR-0057 (comprovante configurável) e ADR-0067 §5, emenda 2 (o 422
  `TRIP_DELIVERY_PROOF_PHOTO_REQUIRED` vale só para o escritório)

## Contexto

`photo = 'required'` só é obedecido pelo canal do escritório, onde a entrega e a foto chegam juntas.
Pelas portas do motorista (`/me/trips/current/documents/:id/deliver` e `.../proof`) elas chegam
separadas: a fila offline do PWA manda a entrega primeiro e a foto depois, e o formulário da foto só
aparece com a entrega confirmada. O app nativo descarta qualquer 4xx da fila. Recusar a entrega do
motorista transformaria falta de sinal em entrega perdida, e a entrega física já aconteceu.

## Decisão

1. **A entrega do motorista nunca é recusada por falta de foto.** A resposta e o snapshot passam a dizer
   `proofPending`. O 422 continua só no canal do escritório.
2. **A foto carrega onde e quando foi tirada** (`latitude`, `longitude`, `accuracyMeters`, `capturedAt`,
   opcionais no multipart). A API grava a pontualidade da foto: `on_time`, `late`, `away`,
   `late_and_away` ou `not_required`.
3. **Tardia** é a foto com referência de tempo mais de `proofWindowMinutes` depois da entrega. O
   `capturedAt` do aparelho vale, mas limitado a `[entrega − 2 min, recebimento + 2 min]` — mesma folga
   da baixa pelo escritório —, porque o relógio do aparelho não é confiável e a foto pode subir horas
   depois pela fila.
4. **Longe** é a foto a mais de `proofRadiusMeters + precisão` da parada (ou do evento de entrega, se a
   parada não tem coordenada). **Foto sem posição conta como longe**: sem posição não há como provar que
   foi tirada no local, e aceitar a ausência seria o caminho mais curto para o mau uso que a regra quer
   punir.
5. **A nota é `100 − penalidades vigentes`**, mínimo 0, derivada na leitura. Foto fora da regra tira
   `latePenaltyPoints` (5); foto obrigatória que não chegou em `missingAfterHours` (24 h) tira
   `missingPenaltyPoints` (10). Uma penalidade por entrega. Cada uma expira em 90 dias. Sem entrega com
   foto obrigatória em 90 dias, a nota é `null` (sem histórico, não zero).
6. **Só o motorista que registrou a entrega é avaliado**, e a entrega registrada pelo escritório não
   entra — o escritório já é obrigado a mandar a foto na mesma transação.
7. **A nota ordena a recomendação** no seletor de motoristas da viagem, aparece na ficha do motorista
   com as penalidades e no app do motorista. Não bloqueia escalar ninguém: ordena, não filtra.

## Consequências

- O motorista nunca perde entrega por falta de sinal, e o escritório pesa na escolha quem pula a foto.
- A regra é parametrizável por empresa (janela, raio, pontos, prazo de ausência); os 90 dias são fixos.
- Posição da foto é dado pessoal de localização: não vai para log e não aparece na ficha (só o motivo).
- O app nativo, quando ganhar entrega, segue o mesmo contrato sem mudança no backend.
- Recalcular é barato e sem cron; mudar os pontos da empresa muda a nota de todos imediatamente, o que
  é intencional (a regra é da empresa, não do momento).

## Emenda 2026-09-18 — revisão T11 (decisões do usuário)

A revisão da T11 achou brechas na regra acima; o usuário decidiu:

- **D1 — sem retroatividade.** A nota conta só entrega a partir da ativação:
  `company_delivery_proof_settings.score_effective_since` (`timestamptz not null default now()`). A
  migration grava o instante dela em toda linha existente e cria a linha de fábrica para toda empresa
  que ainda não tinha (mesmos valores que a ausência de linha já significava, ADR-0057 §4). Empresa
  criada depois não tem entrega anterior à regra — sem linha, não há corte. O `PUT` da configuração
  nunca altera a data.
- **D2 — só o app entra na nota.** `channel = 'whatsapp'` fica fora, como `office` (§6): o canal
  ainda não será liberado. `proofPending` continua calculado para ele.
- **D3a — o relógio do aparelho tem prazo.** O piso da referência de tempo (§3) passa a ser
  `max(entrega − 2 min, recebimento − missingAfterHours)`: foto que sobe dias depois com o relógio
  voltado para a hora da entrega não passa mais como pontual.
- **D3b — a foto substituta nunca melhora a pontualidade.** Fica a pior das duas; `late` e `away`
  pesam igual e juntos viram `late_and_away`; `on_time` só vence `not_required`. A foto do
  escritório (`field-proof`) não classifica e é fundida do mesmo jeito: não penaliza o motorista
  (sem posição ela contaria como `away`) e não lava uma foto dele fora da regra.
- **D4 — as penalidades continuam sob `fleet.read`.** Sem mudança.

E, sem decisão nova, a revisão consertou: a precisão soma ao raio no máximo um raio (e acima de
10 km é `400`); a baixa repetida do motorista não grava `delivered` novo; o motorista do evento passa
a ser gravado nele (`reported_by_driver_id`), e desligar o acesso ao app não apaga o histórico; as
fotos pendentes de viagem concluída aparecem em `pendingProofs` no snapshot; a posição da foto cai
aos 90 dias com a do evento. Riscos aceitos em `docs/SECURITY.md` (2026-09-18, spec 159).

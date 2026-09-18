# ADR-0068 — A foto obrigatória do motorista não recusa a entrega, pesa na nota

- **Status:** aceita
- **Data:** 2026-09-18
- **Decisores:** usuário (regra da nota, geolocalização + horas, pontos que descem, onde a nota
  aparece, anexo em lote), na conversa da spec 157
- **Fecha:** a T1 da spec 157 (`specs/157-a-foto-obrigatoria-pesa-na-nota-do-motorista/`)
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

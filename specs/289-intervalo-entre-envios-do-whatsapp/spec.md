# Spec 289 — O WhatsApp espera o intervalo entre envios

**Origem:** o campo "intervalo mínimo" (15 s) da configuração do Evolution (spec 281) era só gravado e exibido; nenhum envio o lia.
Vários boletos pedidos ao mesmo tempo saíam colados, o que é o padrão que o WhatsApp pune em número recém-conectado. O teto
diário de 50 também era baixo para a operação.

## Requisitos

- **RF1** Cada envio pelo Evolution reserva uma vaga em `whatsapp_evolution_settings.next_send_at`, `min_interval_seconds` depois
  da vaga anterior, e só sai quando a vaga chega. A reserva é um `UPDATE` atômico: API e worker dividem a mesma fila de vagas.
- **RF2** A primeira vaga é imediata (sem envio anterior ou vaga já vencida).
- **RF3** Se a vaga fica além do que o chamador aguenta esperar, o envio é recusado como `failed`, nunca fura o intervalo:
  API (requisição HTTP) até 20 s; worker (entrega automática) até 120 s, depois cai no e-mail pelo caminho que já existe.
- **RF4** O teto diário padrão passa de 50 a 300; a migration leva quem ainda está em 50 a 300. O limite aceito segue 1–1000.

## Fora do escopo (decisão pendente)

Fila que guarda o que passa do teto diário ou da espera máxima e envia depois. Hoje o excedente é recusado (pedido do motorista
recebe 429; o worker cai no e-mail).

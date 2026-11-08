# Spec 310 — o aviso do XML ao contratante cumprimenta, agradece e não expõe o sistema

Corrige a 309 por feedback do dono (2026-11-08): o texto do WhatsApp vai a quem enviou — em geral a contratante.

- RF1. O aviso de recebimento cumprimenta, agradece o envio e diz quantos arquivos chegaram; sem "Próximo passo" (o rodapé do padrão do bot é para o fluxo interno).
- RF2. O resumo final cumprimenta, diz quantas notas novas entraram, quantas já estavam cadastradas e, se houver, quantos arquivos não puderam ser importados com o motivo; fecha agradecendo.
- RF3. Nenhum detalhe interno no WhatsApp: sem horários de entrada no sistema, sem lista de arquivos, sem contratantes, sem "página de NF-e". Esses detalhes ficam só no e-mail detalhado (spec 304).
- RF4. O e-mail não muda.

- RF5. No WhatsApp, o resumo de um envio pronto não sai enquanto outro recibo do mesmo remetente e conversa, criado nos últimos 30 minutos, ainda está sendo recebido ou importado (`hasBatchInFlight`). Recusa e falha saem na hora; e-mail não espera. O teto de 30 minutos impede que um recibo preso segure o resto.

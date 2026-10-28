# ADR 0112 — WhatsApp não oficial (Evolution API) como opção gratuita

- **Status:** proposta — aguarda o aceite do Anderson (T0 da spec 281, dúvida R1 em aberto).
- **Data:** 2026-10-28
- **Nasce da spec 281:** o Evolution API entra no SDK de notificação ao lado do provedor Meta, para quem não tem conta
  empresarial aprovada.

## Contexto

- O Evolution (Baileys) fala o protocolo do WhatsApp Web, que a Meta não autoriza: o número pode ser banido e uma mudança
  do WhatsApp pode quebrar o envio até o pacote atualizar (spec 281 R1).
- Número e conteúdo são dado pessoal e, no caso do boleto, fiscal (R3).

## Decisão proposta

1. O Evolution é uma **opção gratuita por empresa, desligada por padrão**; o e-mail continua sendo o padrão e a reserva.
2. A empresa só liga depois de ler o aviso de risco na tela de configuração (RF7) e marcar o aceite, que fica gravado.
3. Escopo mínimo: boleto ao cliente e resposta no fio da conversa. Teto diário e intervalo mínimo por empresa (R2).
4. Hospedagem: serviço próprio por ambiente, com Postgres e Redis próprios. Hoje só em staging; produção só com aprovação
   do Anderson.

## Consequências

- Banimento do número é risco aceito pela empresa que liga; o sistema cai no e-mail, nunca em silêncio.
- O roteador por custo e risco (spec 281 D8/D9, T1b) fica para depois.

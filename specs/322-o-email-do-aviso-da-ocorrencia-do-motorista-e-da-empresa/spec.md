# Feature 322 — O e-mail do aviso da ocorrência do motorista é da empresa

> Pedido do Anderson (admin) em 2026-11-10: parar de receber, por e-mail, o aviso "ocorrência registrada pelo motorista", e poder desligar isso **por tela, para a empresa toda**, não só na própria conta.

## Specs do mesmo assunto (lidas contra o código em `origin/staging`)

| Spec | O que já decidiu e esta spec usa sem refazer                                                                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 034  | Preferência **por usuário**, por assunto (`trip`) e canal. Continua valendo; esta spec não a altera.                                                                  |
| 267  | Lista de responsáveis por ocorrências (aba de Configurações). O aviso da 275 vai a eles; o interruptor mora ao lado.                                                  |
| 275  | O aviso interno do motorista vai a responsáveis + quem despachou, **sempre** (D1), pelo módulo de notificação (D4). Esta spec acrescenta um corte só do canal e-mail. |

## Problema e resultado

Hoje só cada usuário desliga o e-mail de "Viagens e entregas" (assunto inteiro) na própria conta. A empresa não tem como
parar o e-mail desse aviso para todos. **Resultado:** em Configurações → Responsáveis por ocorrências, quem tem
`settings.manage` liga ou desliga "Enviar esse aviso também por e-mail". Desligado, o aviso **segue na caixa de entrada
(sino)** e nenhum e-mail sai dele. Os outros e-mails (contratante, conversas) não mudam.

## Decisões

- **D1** Interruptor por empresa, tabela própria `company_driver_occurrence_email_settings`; `GET/PUT /company-settings/driver-occurrence-email`, `settings.manage`, corpo estrito `{ enabled }`.
- **D2** Sem linha vale **ligado**: nada muda até alguém desligar.
- **D3** Desligado: o notificador manda `channels: ['inbox']` a todo destinatário; ligado, não força canal e valem as preferências de cada usuário (034).
- **D4** Falha ao ler o interruptor: o e-mail **não** sai (o sino sim), com `warn` sem dado pessoal.
- **D5** Auditoria na mesma transação, só quando o valor muda (`company-driver-occurrence-email.changed`).

## Fora do escopo

Interruptor por tipo de ocorrência; avisos da ocorrência de parada; e-mail à contratante.

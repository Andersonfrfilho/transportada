# Feature 318 — A ocorrência da contratante vai no grupo do WhatsApp

Rascunho para aprovação do Anderson (10/11/2026). Nada implementado. Alvo: staging primeiro.

## Problema e resultado

Hoje o aviso automático da ocorrência (spec 183 T802, tipo com `emails_contractor`) sai por e-mail (Resend) para os
contatos da contratante. A **Única** quer receber esse aviso **num grupo de WhatsApp, marcando um número**, e não por e-mail.

Resultado: a contratante passa a ter um canal de aviso de ocorrência configurável. Para a Única, o aviso é postado no
grupo escolhido, com o número escolhido marcado (@). As outras contratantes continuam por e-mail, sem mudança.

## Decisões já tomadas (Anderson, 10/11/2026)

- D1. A regra é **por contratante**, não um tipo de ocorrência duplicado. O tipo geral continua igual; a contratante
  ganha "avisar ocorrência por: e-mail | WhatsApp (grupo)", com grupo e número a marcar.
- D2. A contratante sobrepõe só o **canal** do aviso. Quais tipos avisam a contratante (`emails_contractor`) e o texto
  continuam definidos no tipo.

## Fora do escopo

- Produção: o Evolution só existe em staging; levar a produção (número dedicado) é decisão separada.
- API oficial da Meta: não posta em grupo, não participa.
- Resposta da contratante pelo grupo (o bot lendo respostas da Única). Só envio.
- Outras contratantes além da Única (o mecanismo é genérico, a configuração é só da Única).

## Histórias priorizadas

### P1 — Aviso de ocorrência no grupo

**Given** a Única está com canal "WhatsApp (grupo)", grupo e número configurados, e o tipo da ocorrência avisa a contratante
**When** o motorista registra a ocorrência numa nota da Única
**Then** o bot posta no grupo uma mensagem marcando o número, com tipo, nota e resumo; **nenhum e-mail** sai para a Única.

### P1 — Outras contratantes não mudam

**Given** uma contratante sem canal WhatsApp **When** há ocorrência **Then** o aviso segue por e-mail como hoje.

### P2 — Falha no grupo

**Given** o Evolution fora do ar, bot fora do grupo ou grupo inexistente **When** o envio falha
**Then** o resultado é registrado (não silencioso), a ocorrência não é derrubada, o envio é tentado de novo e, esgotadas as
tentativas, cai no e-mail de reserva **se** a contratante tiver "e-mail como reserva" ligado, e a operação é alertada.

### P2 — Configuração na tela da contratante

Escolher o canal, escolher o grupo (lista dos grupos do Evolution, como na ficha do motorista), digitar o número a marcar
(telefone válido, validado) e ligar/desligar o e-mail de reserva. Botão "enviar mensagem de teste" ao grupo.

## Requisitos funcionais

- RF1. Colunas/tabela de canal de ocorrência por contratante: canal (`email` padrão | `whatsapp_group`), `group_jid`
  (`@g.us`, mesmo CHECK de `fleet_driver_whatsapp_groups`), número marcado, `email_fallback`.
- RF2. O envio reusa `sendEvolutionTextWithMention` (mensagem com `@número` no corpo e `mentioned`).
- RF3. Um aviso por ocorrência: mesma chave de idempotência do aviso por e-mail (`occurrence-auto-mail:`); reprocessar não duplica.
- RF4. Texto enxuto: tipo da ocorrência, número da nota e resumo. **Sem** valores, CPF/CNPJ ou dados pessoais do destinatário.
  Texto vem do módulo de notificações (spec 286), não do código.
- RF5. Um mesmo grupo não pode ser de dois motoristas nem de duas contratantes (regra de identidade do grupo).
- RF6. Resultado do envio entra na linha do tempo da ocorrência (enviado, falhou, usou reserva), como o e-mail hoje.
- RF7. Só a Única fica configurada, por migration/script de ops em staging; produção só depois da decisão do Evolution.

## Requisitos não funcionais

- Multi-tenant: tudo por `company_id` do contexto. Telefone e grupo nunca vão a log.
- Respeita o ritmo de envio do Evolution (`evolution-send-pacer`).
- Painel usa os componentes padrão do design system (regra do projeto); prints em tema claro/escuro, desktop e celular.

## Casos extremos e falhas

- Número marcado não está no grupo: a mensagem sai, mas a marca não notifica; o teste do botão avisa.
- Bot removido do grupo / grupo apagado: falha classificada, reserva por e-mail, alerta.
- Ocorrência de nota sem contratante casada: segue o comportamento atual (`skipped`).
- Tipo sem `emails_contractor`: nada sai, em nenhum canal.

## Critérios de aceite

1. Em staging, ocorrência numa nota da Única chega ao grupo de teste marcando o número, sem e-mail.
2. Ocorrência de outra contratante continua por e-mail (teste de regressão).
3. Reprocessar não duplica a mensagem.
4. Falha simulada do Evolution cai no e-mail de reserva e fica registrada.

## Dúvidas

- [NEEDS CLARIFICATION: nome exato do grupo da Única (ou escolher na lista do Evolution em staging)]
- [NEEDS CLARIFICATION: número a marcar, com DDD]
- [NEEDS CLARIFICATION: e-mail fica como reserva ou sai de vez para a Única?]
- [NEEDS CLARIFICATION: vale para os dois momentos (separação e entrega) ou só um?]
- [NEEDS CLARIFICATION: o texto da mensagem — usar o modelo atual do e-mail resumido ou um texto curto novo?]

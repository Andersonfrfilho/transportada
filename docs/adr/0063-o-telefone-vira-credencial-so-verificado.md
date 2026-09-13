# ADR-0063 — O telefone vira credencial só verificado

- **Data:** 2026-09-11
- **Estado:** aceita
- **Contexto:** habilita D1/D2 da **spec 144**. Responde à Fase 1 (T002, T003, T005) e à revisão do
  architect que a validou no mesmo dia.

## Contexto

A spec 144 precisa que uma mensagem do WhatsApp autentique quem fala — sem isso não há como
distinguir um motorista da própria empresa de um número qualquer que descobriu o telefone do canal.
O candidato óbvio já existia: `login_identifiers`, a tabela que a spec 062 criou para casar convite
por telefone com conta.

**Medido, não é reusável.** `rebuildLoginIdentifiers`
(`identity/infrastructure/drizzle-company-user.repository.ts:120-163`) faz **delete + insert** das
linhas `source='profile'` toda vez que a ficha do usuário é editada. `login_identifiers` é uma
**projeção reconstruída** a cada gravação, não uma tabela de vínculo estável — gravar
`verified_at` numa linha que desaparece na próxima edição de perfil apagaria a prova de posse do
número sem nenhum evento que avise disso. Também não é única: dois usuários da mesma empresa podem
ter o mesmo telefone gravado (contato de recado, número de outra pessoa), e a tabela existe para
convite, não para autenticação de canal.

## Decisão

O vínculo mora em tabela própria, `user_whatsapp_phones` (`user_id` único, `phone`, `verified_at`),
separada de `login_identifiers` e nunca reconstruída por outra rotina.

**Verificação de entrada, com o `from` casado.** O painel pede o código
(`POST /me/whatsapp-phone/verification`) e a mensagem que confirma só vale se ela chegar **do**
número declarado — comparação `timingSafeEqual` sobre o digest do código, nunca aceitando o texto
como prova sozinha. Isso dispensa template pago de saída (a Meta cobra por template fora da janela
de 24 h) e evita depender de o operador digitar o nono dígito do jeito exato que o cadastro espera:
quem prova a posse é a própria rede da Meta, entregando a mensagem a partir do número que ela sabe
que é aquele.

**Unicidade global na instalação, não por empresa.** Um número de WhatsApp é uma linha física; duas
contas da mesma instalação não podem alegar o mesmo telefone verificado ao mesmo tempo — a segunda
tentativa colide (`WhatsAppPhoneTakenError`, 409) e não desloca a primeira.

**90 dias, e só o administrador desfaz.** Chip reciclado pela operadora é o risco central: o
número muda de dono e o vínculo antigo, se ficasse eterno, autenticaria a pessoa errada. A validade
é o prazo depois do qual o vínculo deixa de autorizar sozinho — `resolveWhatsAppActor` recusa
verificação vencida antes até de olhar a membership — e a liberação do número para um novo dono
acontece **na mesma transação** da próxima verificação bem-sucedida daquele número
(`releaseExpiredBindings`), nunca por rotina agendada à parte. Fora isso, só
`DELETE /me/whatsapp-phone` (o próprio dono) ou `DELETE /company-users/:id/whatsapp-phone`
(`users.manage`, o administrador) desfazem o vínculo antes do prazo.

**Quatro recusas, uma resposta.** `resolveWhatsAppActor` tem quatro caminhos de negação —
`unknown_phone` (número nunca vinculado), `unverified_or_expired` (vinculado mas fora da janela),
`no_membership` (usuário sem vínculo com a empresa do canal) e `suspended` (membership existe mas
está desativada) — e todos chegam à conversa como a **mesma** resposta neutra, no máximo uma vez a
cada 24 horas por número. A razão de negação some no log, nunca chega ao WhatsApp: distinguir os
casos na conversa seria dar a quem não é dono do número um oráculo de "esse número já foi vinculado
por alguém" ou "essa empresa existe".

## Alternativas rejeitadas

**Coluna nova em `login_identifiers`.** Rejeitada porque a tabela é apagada e reconstruída a cada
edição de perfil — qualquer coluna de estado (verificado, validade) morreria junto, silenciosamente,
na primeira vez que o usuário mudasse o nome ou o e-mail.

**Verificação de saída, por template.** A alternativa óbvia seria a empresa enviar um código ao
número declarado e o usuário confirmá-lo de volta pelo painel. Rejeitada porque exige um template
aprovado pela Meta (custo e latência de aprovação) toda vez que o vínculo expira ou muda, e não
prova nada que a verificação de entrada já não prove com o `from` assinado — a mensagem que chega
**é** a prova, sem round-trip nenhum.

## Consequências

- **O telefone vira credencial**, no sentido estrito: `resolveWhatsAppActor` transforma um número de
  origem numa `AuthenticatedContext`, sem token, sem senha — só posse comprovada da linha. Isso é
  poder novo, e por isso a T005b fechou os casos em que essa credencial não deveria valer: conta de
  serviço, administrador de plataforma e o próprio contexto de canal são recusados na
  `MembershipAuthorizationPolicy` e no `resolveWhatsAppActor`.
- **A validade não é grátis.** 90 dias é um compromisso: curto demais reverifica gente que não trocou
  de chip; longo demais deixa uma janela grande para um número reciclado ser aceito como se ainda
  fosse do dono anterior — o risco fica registrado em `docs/SECURITY.md` como mitigação, não como
  ausência de risco.
- **A resposta neutra tem custo de suporte.** Quem erra o código, quem manda de outro número, quem
  perdeu a janela de 90 dias — todos recebem a mesma frase. É deliberado (impede oráculo), mas
  significa que o suporte humano precisa saber diagnosticar pelo log, nunca pela conversa.
- **O teto por processo (30 mensagens/10 min, resposta neutra 1×/24h por número) vive em memória**,
  sem estado compartilhado entre réplicas — registrado como achado aberto, não decisão desta ADR.

## O que reabriria esta decisão

Se `login_identifiers` deixar de ser reconstruída a cada edição de perfil (mudança de arquitetura
maior, fora do escopo desta spec), a pergunta de reusá-la poderia voltar. Enquanto ela for projeção
apagada e recriada, a resposta continua não.

# Feature 175 — O documento que a nota espera

## Problema e resultado

A spec 174 pôs o estado fiscal na linha da nota, e com ele o selo "espera NFS-e". O botão da mesma
linha continuou fixo em **Gerar CT-e**. Numa entrega urbana a tela passa a dizer, lado a lado, que
a nota espera NFS-e e que a ação disponível emite CT-e — o operador tem de saber, de cabeça, que
ali ele não deve clicar.

A informação para decidir **já existe e já é calculada**, e viaja por nota em `expectedDocument`,
na resposta de prontidão. Quem não usa é o botão.

⚠️ **Emenda de 23/09 (ADR-0071).** Esta spec nasceu apontando para `resolveFiscalDocumentKind`, que
decide por código IBGE de município. A análise da T201 achou uma **segunda** política decidindo o
mesmo fato — `classifyDocumentOutput`, que decide pelo perfil de emissão, alimenta a coluna
"Documento" da tela de notas e devolve o `nfseProfileId` junto. As duas podem discordar sobre a
mesma nota. O ADR-0071 elegeu a do **perfil** como fonte única; a de município vira entrada dela.
Tudo o que esta spec diz sobre `expectedDocument` vale, com o valor vindo da fonte única.

Resultado: **um botão por linha, rotulado pelo documento que aquela nota espera**. A tela deixa de
perguntar ao operador o que o dado já responde, e some a vizinhança perigosa de duas ações
parecidas emitindo documentos diferentes.

⚠️ Emitir NFS-e **não é um clique**: o `POST /nfse-service-invoices` exige `profileId` e aceita
`descriptionTemplate` e `period` (`nfse-invoices.schema.ts:188`). O botão da linha abre o diálogo
que já existe na tela de notas, com aquela nota já selecionada — ele não emite sozinho. Só o CT-e
emite direto, porque é o que o caminho de hoje faz.

## Fora do escopo

- A regra fiscal de quando cada documento cabe: ela é do domínio e já está decidida na política.
- A emissão em massa pela seleção e o lote de CT-e da viagem, que continuam como estão.
- O arquivamento, o cancelamento e a reemissão de NFS-e, que vivem na tela de NFS-e.
- MDF-e, que é decisão da viagem e não da nota.

## Histórias priorizadas

### P1 — Ver a ação certa para aquela nota

**Given** uma nota cujo destino é o município da transportadora
**When** o operador olha a linha dela na viagem
**Then** a ação oferecida é emitir NFS-e, não gerar CT-e.

### P2 — Não ser oferecido o que não se pode decidir

**Given** uma nota sem município de destino resolvido (`city_unknown`)
**When** o operador olha a linha
**Then** não há botão de emissão nenhum, e o motivo aparece em texto.

### P3 — Emitir a NFS-e sem sair da viagem

**Given** uma nota que espera NFS-e
**When** o operador usa a ação da linha
**Then** abre o diálogo de emissão com aquela nota já selecionada, e ele escolhe o perfil ali.

### P4 — Saber quando não há perfil

**Given** uma nota sem perfil de emissão configurado (`no_profile`)
**When** o operador olha a linha
**Then** a tela diz que falta perfil, e não oferece uma ação que terminaria em erro.

### P5 — Ver o botão só quem pode usá-lo

**Given** um operador sem permissão de emitir
**When** ele olha a linha
**Then** o estado aparece e a ação não — para os dois documentos.

## Requisitos funcionais

- **RF1** A ação da linha é **uma só**, e seu rótulo vem de `expectedDocument`: `cte` → "Gerar
  CT-e"; `nfse` → "Emitir NFS-e".
- **RF2** `expectedDocument === null` (`city_unknown`) não oferece ação nenhuma. O selo já explica
  o motivo; um botão ali emitiria no escuro.
- **RF3** A ação de NFS-e **abre o diálogo de emissão** (`NfseEmissionDialog`) com a nota
  pré-selecionada, nunca emite direto: `profileId` é obrigatório e é escolha do operador.
- **RF4** A ação de CT-e segue emitindo direto, como hoje — esta spec não muda o caminho dele.
- **RF5** Nota sem perfil de emissão (`no_profile`) ou bloqueada (`blocked`) informa o estado e não
  oferece ação. ⚠️ Corrigido depois da análise de 23/09: "nenhum perfil casa com a nota" é resolução
  de perfil de **CT-e** (`emission-profile-resolution.policy.ts`), não existe no caminho da NFS-e. O
  que a linha sabe vem da fonte única do ADR-0071, que transporta o `nfseProfileId` junto.
- **RF6** O gate de permissão do frontend para NFS-e passa a ser **`nfse.issue`**, que é o que a
  API exige em `nfse-invoices.routes.ts:172`. Hoje o frontend usa `nfse.manage`
  (`nfseEmission.service.ts:101`): quem tem só essa vê o botão e toma 403.
- **RF7** A permissão de cada documento é conferida separadamente — `cte.submit` para CT-e,
  `nfse.issue` para NFS-e. Quem pode um e não o outro vê só o que pode.
- **RF8** O painel de prontidão fiscal passa a contar as notas que esperam NFS-e junto das que
  esperam CT-e, para o resumo não dizer "pronta" sobre viagem com NFS-e pendente.
- **RF9** Textos em pt-BR e en, nas duas locales.

## Requisitos não funcionais

- Sem rota nova: a emissão de NFS-e usa `POST /nfse-service-invoices` com `documentIds` de um item.
  Se a implementação concluir que um atalho por viagem é necessário, isso é decisão de arquitetura
  e **para aqui** para virar ADR — não se inventa rota no meio da task.
- Área de toque de 44px em mobile; a linha não vira parede de botão.
- Contraste conferido no estado normal e na linha marcada.
- O diálogo de emissão é reaproveitado, não duplicado: uma segunda cópia divergiria na primeira
  mudança de regra.

## Casos extremos e falhas

- **Nota urbana já com NFS-e emitida**: sem ação, com o estado dizendo que está resolvida.
- **Nota que espera CT-e com rejeição da SEFAZ**: segue como a spec 174 entregou — código e
  mensagem na linha, ação de reemitir onde já existia.
- **Viagem com notas dos dois tipos**: cada linha com o seu botão; nenhuma ação em massa muda de
  comportamento nesta spec.
- **Permissão só de CT-e numa viagem só de NFS-e**: nenhuma ação aparece, e o resumo continua
  dizendo o que falta — informação não é permissão.
- **`expectedDocument` ausente na resposta** (API anterior): trata como `city_unknown` — sem ação.
  Ausência é ausência, nunca "é CT-e".

## Critérios de aceite

- **CA01** Nota urbana mostra "Emitir NFS-e"; nota interurbana mostra "Gerar CT-e".
- **CA02** `city_unknown` não mostra ação nenhuma.
- **CA03** A ação de NFS-e abre o diálogo com a nota pré-selecionada e não emite antes do perfil.
- **CA04** Nota `no_profile` ou `blocked` diz o estado e não oferece a ação.
- **CA05** O gate do frontend usa `nfse.issue`; um contrato prova que ele casa com a permissão que
  a rota exige.
- **CA06** Sem permissão do documento esperado, o estado aparece e a ação não.
- **CA07** O resumo de prontidão conta NFS-e pendente.
- **CA08** Revisão de design com print, em 375px e no desktop (web.md §15).

## Dúvidas

Nenhuma.

# Feature 273 — A ocorrência tem dono

> Pedido do dono em 2026-10-17: "o que você sugere para direcionar já para o atendimento correto? vamos adicionar
> atendentes de ocorrências" — "e por tipo de ocorrência". Decisões do dono em [`evidence.md`](evidence.md) § Decisões do
> dono. A 272 (e-mail em HTML) sai **antes**: entrega a porta `OccurrenceOwnerReader` (nula), a regra única do "De" e o
> cargo na assinatura; esta spec implementa a porta (plan § Coordenação com a 272).

## Specs do mesmo assunto (lidas contra o código em `origin/staging` 68613c0f9, 2026-10-17)

| Spec | O que já decidiu e esta spec **usa sem refazer** (ou emenda, marcado)                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 267  | Listas de responsáveis da empresa (`company_occurrence_watchers`) e da contratante (`contractor_occurrence_watchers`), `status` ativo/inativo, até 10 ativos, auditoria em `audit_logs`, elegível = vínculo ativo + `occurrences.resolve` (`occurrence-watcher-directory.query.ts`). Telas: aba "Responsáveis por ocorrências" e seção na ficha da contratante. **Emenda:** 267 deixou o sino para os responsáveis fora do escopo; esta spec avisa **só o dono** no sino. |
| 271  | Lista "Em cópia" do tipo (`company_occurrence_type_watchers`, FK para a linha da empresa, status lido de lá) e precedência da **cópia** tipo → contratante → empresa (`occurrence-watcher.policy.ts` `selectSource`). **Não muda**: a cópia continua nessa ordem.                                                                                                                                                                                                         |
| 270  | Tipo "Geral" ou "Só estas contratantes". Usa sem refazer: tipo de uma contratante só já é a combinação contratante × tipo.                                                                                                                                                                                                                                                                                                                                                |
| 248  | Alarme de resposta atrasada (`occurrence.contractor-reply.alert`) vai a quem despachou a viagem. **Emenda:** vai ao dono; sem dono, a quem despachou, como hoje.                                                                                                                                                                                                                                                                                                          |
| 266  | Reabrir avisa quem resolveu por último (`occurrence-resolution-notifier.gateway.ts`). **Emenda:** avisa o dono; sem dono, como hoje.                                                                                                                                                                                                                                                                                                                                      |
| 183  | Conversa da contratante separada da do motorista. O dono é da **ocorrência** e aparece só no painel; nada muda no app do motorista.                                                                                                                                                                                                                                                                                                                                       |

## Problema e resultado

A ocorrência nasce sem ninguém responsável. A resposta da contratante não avisa ninguém no sino, o e-mail automático
assina "Equipe <transportadora>", e o alarme de resposta atrasada cai em quem despachou a viagem — que muitas vezes não é
quem atende aquele cliente.

**Resultado:** cada lista de responsáveis (empresa, contratante, tipo) pode marcar **um principal** com uma estrela. Ao
ser registrada, a ocorrência ganha um **dono**, escolhido na ordem **contratante → tipo → empresa**. O dono recebe no sino
a resposta da contratante, o alarme de atraso e a reabertura; o e-mail automático sai em nome dele. O painel tem o filtro
"Minhas ocorrências" e "Sem dono", e qualquer pessoa da equipe pode **assumir** ou **passar** a ocorrência, com registro.

## Requisitos funcionais

- **RF1 — Principal na lista.** Nas três listas (aba da empresa, ficha da contratante, bloco "E-mail à contratante" →
  "Em cópia" do tipo) uma estrela marca **no máximo um** principal por lista. Marcar outro desmarca o anterior. Só
  pode ser principal quem está ativo na lista e é elegível (vínculo ativo + `occurrences.resolve`). Editar exige
  `settings.manage`. Toda troca grava `audit_logs` (ator, lista, principal antes/depois).
- **RF2 — Lista que dá o dono.** Na ordem contratante (da nota) → tipo → empresa, vale a **primeira lista com pelo
  menos um membro ativo e elegível**. Dentro dela: o principal, se elegível; senão o primeiro elegível por nome.
  Nenhuma lista com elegível → ocorrência **sem dono**. Ocorrência sem nota (parada) pula a contratante.
- **RF3 — Quando o dono é escolhido.** No registro da ocorrência, por qualquer caminho (motorista, painel, parada),
  na mesma transação. Grava `owner_user_id`, `owner_source` (`contractor`|`occurrence_type`|`company`|`manual`) e
  `owner_assigned_at`. Mudar as listas depois **não** troca o dono de ocorrência já registrada.
- **RF4 — Assumir e passar.** Quem tem `occurrences.resolve` pode **assumir** (vira dono) ou **passar** a outra pessoa
  elegível da empresa. Gera evento na linha do tempo da ocorrência ("Ana assumiu", "Ana passou para Bruno") e
  `audit_logs`. Passar para alguém inelegível ou de outra empresa: 404. A ocorrência resolvida também pode trocar de dono.
- **RF5 — Dono que perde o perfil.** Se o dono perde o vínculo ou `occurrences.resolve`, a ocorrência aparece como
  "sem dono" na leitura (o dono gravado fica para histórico) e os avisos seguem a regra de "sem dono" do RF6. A mesma
  regra vale na API e no worker (D-f).
- **RF6 — Avisos.**
  - Resposta da contratante (e-mail recebido na conversa da contratante): sino para o dono. Sem dono: nada novo (como hoje).
  - Alarme de resposta atrasada (248): dono; sem dono, quem despachou (como hoje).
  - Reabertura (266): dono; sem dono, quem resolveu por último (como hoje).
  - Assumir/passar: sino para quem recebeu, se não foi ele mesmo que fez.
  - Registro da ocorrência: **sem sino** ao dono (D-g); o aviso é o status no painel (RF9).
- **RF7 — E-mail em nome do dono.** O envio **automático** usa o dono elegível como quem assina (`signer` `owner` da
  272): "De" vira `<nome do dono> — <nome de exibição da transportadora>` (regra única da 272, nos dois transportes;
  endereço continua o da empresa) e a assinatura leva o nome e o cargo do dono. Sem dono: assina a equipe (`team`, da
  272). O envio manual continua com o operador.
- **RF8 — Dono em cópia.** O dono elegível com e-mail sempre entra na cópia do e-mail da ocorrência, mesmo que a lista
  da cópia (tipo → contratante → empresa) não o tenha. Conta no limite de 50.
- **RF9 — Painel.** Na lista de ocorrências: filtro "Minhas", "Sem dono", "Todas" (padrão "Todas") e coluna/selo do dono.
  No detalhe: o dono, a origem ("pela contratante", "pelo tipo", "pela empresa", "atribuído por Ana") e os botões
  "Assumir" / "Passar para…". **Emenda D-g:** na lista e no detalhe, a ocorrência cujo dono elegível é quem está vendo
  mostra o selo "Atribuída a você"; para os demais, o nome do dono; sem dono, "Sem dono". Status derivado, sem
  "lida/não lida".

## Requisitos não funcionais

- **Isolamento:** `companyId` do token; FK composta com `company_id` para o dono (membership). Contrato negativo de BOLA
  em toda rota nova (outra empresa → 404).
- **Sem PII em log:** ids e contagens; nunca nome ou e-mail.
- **Migration aditiva** (colunas novas anuláveis, índice parcial de um principal por lista). Sem backfill: ocorrência
  antiga fica "sem dono".
- **Publicação em etapas:** painel tolerante → API (migration) → worker → painel com as telas.

## Fora do escopo

- Divisão automática entre vários atendentes (rodízio, menor carga).
- Responsável por etapa, por região ou por horário; ausência/férias.
- Mudar a precedência da cópia (271) ou o app do motorista.
- Layout do e-mail (spec 272).

## Critérios de aceite

1. Empresa {Ana★, Bruno}, contratante X sem lista, tipo T sem estrela: ocorrência T de X nasce com Ana, origem `company`.
2. Contratante X {Carla★}: mesma ocorrência nasce com Carla, origem `contractor`, mesmo com o tipo T tendo {Bruno★}.
3. Contratante Y sem lista, tipo T {Bruno★}: nasce com Bruno, origem `occurrence_type`.
4. Carla perde `occurrences.resolve`: a próxima ocorrência de X vai ao primeiro elegível da lista de X; sem elegível, ao
   tipo; a ocorrência antiga de Carla aparece "sem dono".
5. Lista de X com membros só inativos: herda tipo → empresa.
6. Marcar Bruno★ na lista da empresa desmarca Ana; `audit_logs` registra os dois ids.
7. Bruno assume a ocorrência de Ana: evento na linha do tempo, sino para ninguém (fez ele mesmo); Bruno passa para Ana:
   sino para Ana. Passar para usuário de outra empresa: 404.
8. Contratante responde por e-mail: sino só para o dono.
9. Alarme de atraso e reabertura vão ao dono; sem dono, ao comportamento de hoje.
10. Envio automático com dono Ana (nome de exibição da transportadora "Tapete Mágico Transportes", cargo "Atendimento"):
    "De: Ana Souza — Tapete Mágico Transportes", assinatura "Ana Souza" com "Atendimento", Ana em cópia.
11. Filtro "Minhas" mostra só as do usuário; "Sem dono" mostra as sem dono e as de dono inelegível.
12. Ocorrência registrada com dono Ana: nenhum sino; na lista, Ana vê "Atribuída a você" e Bruno vê "Ana Souza".
13. Dono que perdeu só `occurrences.resolve` (vínculo ativo): resposta da contratante não gera sino a ele; o alarme vai a
    quem despachou (worker aplica a mesma regra da API).

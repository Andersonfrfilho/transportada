# Feature 091 — O documento do motorista tem onde ficar

## Problema e resultado

Quem cadastra um motorista pela ficha da frota **não tem onde guardar documento nenhum**. A ficha
pede número de CNH, validade, o trio do RG e o endereço residencial — tudo como texto digitado — e
não aceita o arquivo de que esses campos foram copiados.

O anexo existe, mas só do outro lado: na landing pública, no pré-cadastro do agregado (spec 071), o
candidato sobe CRLV, CNH, documento da empresa e comprovante de endereço. Quem entra pela ficha da
frota — o caminho normal do `operator`, e o único caminho de motorista celetista, de motorista que
já trabalhava antes da landing existir, e de qualquer correção posterior — não passa por lá.

O resultado desta feature é o anexo do motorista **na ficha dele**, com o mesmo cuidado que a 071
teve com o do candidato: bucket privado, referência na fila, decisão explícita sobre o que se lê e
prazo declarado para o que se guarda.

⚠️ **Isto não é "acrescentar um campo".** Documento de motorista é PII de pessoa física em repouso,
num produto cuja ADR-0039 já decidiu criptografar os campos de texto equivalentes e **ainda não foi
executada**. Abrir um caminho novo para o documento inteiro enquanto o antigo espera cifra é piorar
a exposição, não empatá-la. A ordem entre as duas é a primeira decisão desta spec.

## O que foi medido

Medido em 06/09/2026, na base local:

| medida                                        | resultado                           |
| --------------------------------------------- | ----------------------------------- |
| Motoristas cadastrados                        | 6, **todos** pela ficha da frota    |
| Candidaturas de agregado                      | **0**                               |
| Anexos de candidatura                         | **0**                               |
| Motoristas com `license_number` preenchido    | 6 de 6                              |
| Motoristas com `birth_date` preenchido        | 6 de 6                              |
| Campos de arquivo no módulo `fleet` do painel | 1 — a importação da tabela de frete |

O número que ordena o resto é o par **6 motoristas / 0 candidaturas**: o caminho que tem anexo é o
que ninguém usou, e o que todo mundo usa é o que não tem. A landing não é o funil real desta
instalação — é um funil futuro.

E os `6 de 6` com CNH e data de nascimento dizem que o dado sensível **já está lá**, em claro, sem o
documento. A cifra da ADR-0039 não é hipótese: ela tem alvo hoje.

## Decisões

- **D1 — A ADR-0039 vem antes, e esta spec não a contorna.** O anexo entra depois de os campos de
  texto do motorista estarem cifrados, ou junto, no mesmo envelope
  (`transportada:fleet-driver:v1:${companyId}:${driverId}`). O que não pode acontecer é o documento
  entrar antes: seria a terceira cópia do mesmo CPF em claro — a coluna, o payload do MDF-e e agora
  o arquivo — com a diferença de que arquivo não se migra com um `UPDATE`.
- **D2 — A tabela é nova, não a da candidatura.** `aggregate_application_attachments` é amarrada a
  `draft_id`/`application_id` e ao fluxo anônimo; generalizá-la faria uma tabela responder por dois
  ciclos de vida com prazos diferentes. Nasce `fleet_driver_attachments`, com `company_id` e
  `driver_id`, e a de candidatura fica como está.
- **D3 — Ler é permissão própria, e o precedente já existe.** `fleet.manage` permite editar a ficha;
  **ver o documento é outra coisa**. O produto já separa isso em `users.reveal`, ao lado de
  `users.manage`, e a mesma forma se aplica: `fleet.reveal` para abrir o arquivo, `fleet.manage`
  para anexar e substituir. Sem isso, quem cadastra frota passa a poder baixar a CNH de todo
  motorista da empresa por ter uma permissão que ganhou para outra finalidade.
- **D4 — Comprovante de endereço não ganha parser, e CNH ganha o que já existe.** A 071 mediu que
  conta de luz, água e telefone não têm layout que se ancore, e a decisão continua valendo. A CNH
  reusa `extractCnhFields` do `@adatechnology/document-intake` — o pacote existe justamente porque
  duas apps precisavam dele.
- **D5 — O que a leitura extrai é descartado na decisão.** Mesma regra da 070: `extracted_fields`
  some no **mesmo `UPDATE`** que aprova ou reprova. Em duas escritas, uma falha no meio deixa a PII
  para trás no caminho de erro.
- **D6 — Prazo de descarte declarado, ao contrário da 071.** A tabela de candidatura ficou **sem**
  `expires_at` por decisão de 27/08/2026, e a própria 071 registrou a consequência: PII sem prazo
  torna a ADR-0039 mais urgente. Aqui o documento acompanha o motorista — sai quando a ficha sai —,
  e substituir um documento **apaga o objeto anterior do bucket**, não só a linha.

## Fora do escopo

- Executar a ADR-0039. Ela é pré-requisito (D1) e tem trabalho próprio; esta spec depende dela, não
  a contém.
- Anexo na landing — já existe (spec 071) e não muda.
- Aviso de CNH a vencer. `NOTIFICATION_TEMPLATE_KEY` não tem chave de habilitação, e o trilho é
  feature separada, como o `CLAUDE.md` já registra.
- Assinatura digital, validação de autenticidade do documento e consulta a Detran.
- Migrar anexo de candidatura aprovada para a ficha do motorista que nasceu dela.

## Histórias priorizadas

### P1 — O operador guarda a CNH de quem já está cadastrado

**Given** um motorista com ficha preenchida e nenhum documento
**When** o operador com `fleet.manage` anexa o PDF ou a foto da CNH
**Then** o arquivo fica no bucket privado, a linha aparece na ficha com tipo, data e quem anexou, e
a ficha não muda de valor nenhum sem alguém confirmar.

### P2 — Quem cuida da frota não vê o documento por tabela

**Given** um usuário com `fleet.manage` e sem `fleet.reveal`
**When** ele abre a ficha de um motorista com documentos
**Then** ele vê que existem, com tipo e data, e **não** consegue abrir nem baixar nenhum.

### P3 — A CNH lida adianta o preenchimento, e só isso

**Given** um motorista com os campos de habilitação vazios
**When** o operador anexa a CNH e a leitura reconhece número e validade
**Then** a tela **oferece** preencher, campo a campo, e nada é gravado sem o operador aceitar —
divergência com o que já está na ficha avisa, nunca corrige.

### P4 — Substituir apaga o anterior

**Given** um motorista com CNH anexada e vencida
**When** o operador anexa a nova
**Then** a linha antiga sai e **o objeto anterior é removido do bucket**, não fica órfão.

## Requisitos funcionais

### R1 — `fleet_driver_attachments`

`(company_id, driver_id, type, stored_object_id, extracted_fields, uploaded_by, created_at)`, com
`company_id` em toda FK composta — a FK simples aceitaria amarrar documento de uma empresa ao
motorista de outra, que é o defeito que `contractor_portal_bindings` já evita. Tipos:
`cnh`, `address_proof`, `identity_document`, `other`. Um documento vivo por tipo e motorista
(índice único parcial), porque a pergunta que a tela faz é "qual é a CNH dele", não "quantas já
foram".

### R2 — Duas rotas de escrita e uma de leitura

- `POST /fleet/drivers/:id/attachments` — `fleet.manage`, escopo `company`. Multipart, teto de
  tamanho declarado, tipos aceitos por assinatura de arquivo e não por extensão.
- `DELETE /fleet/drivers/:id/attachments/:attachmentId` — `fleet.manage`.
- `GET /fleet/drivers/:id/attachments/:attachmentId/content` — **`fleet.reveal`**, respondendo
  presigned URL de vida curta, nunca o corpo.

A listagem dos anexos (tipo, data, quem anexou) vem junto da ficha do motorista e pede só
`fleet.read`: saber que existe documento não é ver o documento.

### R3 — A leitura roda onde já roda

O anexo de imagem vai para o `tesseract-server` e o de PDF para a camada de texto, pelo mesmo
`document-extraction.gateway.ts` do trilho de candidatura — quem escolhe o mecanismo é a assinatura
do arquivo. ⚠️ **No `worker_thread`, como a 070 decidiu**: pdf.js no event loop da API pararia
emissão de CT-e junto.

### R4 — O campo é o `FileField` do design system

Nada de `<input type="file">` cru: o contrato `test/design-system/file-field.contract.ts` já reprova
campo novo que nascer nativo.

## Requisitos não funcionais

- Nome do objeto no bucket **nunca** carrega dado pessoal — nem CPF, nem nome, nem número de CNH
  (`security.md` §7).
- Nada de conteúdo de documento em log, em nenhum nível.
- Trilha de auditoria em anexar, substituir, remover e **revelar** — revelar é o que a `fleet.reveal`
  existe para controlar, e trilha sem ele não responde quem viu o quê.
- Bucket privado; entrega por presigned URL de vida curta.

## Casos extremos e falhas

- Arquivo que não é do tipo declarado (JPEG chamado de PDF) — decide a assinatura, não o nome.
- Objeto apagado do bucket entre o upload e a leitura: fecha sem escrever, como na 070.
- Leitura que não reconhece nada grava `null` e fecha — é resultado, não falha.
- Motorista removido: os objetos dele saem do bucket na mesma transação que remove a ficha, ou a
  remoção falha. Órfão em bucket é PII que ninguém sabe que existe.
- Dois uploads simultâneos do mesmo tipo: o único parcial decide, e o perdedor apaga o objeto que
  acabou de subir.

## Critérios de aceite

- [ ] ADR-0039 executada, ou o envelope desta feature escrito no mesmo AAD (D1)
- [ ] `fleet.reveal` no catálogo, nos papéis, e **nenhuma** rota de conteúdo sem ela
- [ ] Contrato de isolamento multiempresa em `test/fleet-schema/tenant-safety.contract.ts`
- [ ] Contrato negativo: `fleet.manage` sem `fleet.reveal` recebe 403 no conteúdo
- [ ] Substituir apaga o objeto anterior — verificado contra o bucket, não só contra a tabela
- [ ] Remover motorista não deixa objeto órfão
- [ ] Nenhum caminho novo de `<input type="file">` cru
- [ ] Smoke: anexar, ver na lista, revelar, substituir, remover

## Dúvidas

- [NEEDS CLARIFICATION: `fleet.reveal` é permissão nova ou o `users.reveal` existente se
  generaliza para "revelar PII"? A segunda forma é mais simples e mistura dois cadastros que hoje
  têm donos diferentes — quem administra usuários não é quem administra frota.]
- [NEEDS CLARIFICATION: o documento acompanha o motorista para sempre, ou tem prazo próprio? A D6
  diz "sai quando a ficha sai", mas ficha de motorista não é removida na prática — ela é
  desativada. Prazo por inatividade precisa de número, e o número é decisão de negócio.]
- [NEEDS CLARIFICATION: anexo de candidatura aprovada deve virar anexo do motorista criado a partir
  dela? Está fora do escopo por ora, e isso deixa o mesmo documento em duas tabelas quando a landing
  passar a ser usada.]

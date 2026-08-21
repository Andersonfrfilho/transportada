# 049 — O motorista nasce usuário

## Problema e resultado

Escolher **Agregado** no formulário de veículo abria dois cadastros ao mesmo tempo. O bloco
"Propriedade do veículo" pedia nome, CPF/CNPJ, RNTRC, UF e tipo de proprietário — os mesmos dados que
a ficha do motorista já guarda —, e o formulário de motorista pedia um **usuário vinculado** que o
operador tinha de ter criado antes, em outra tela, com o UUID do vínculo na mão.

O agregado é o motorista. Ele não é um segundo cadastro, é o mesmo, visto pelo lado do veículo.

**Resultado:** o veículo referencia o motorista e **deriva** dele o proprietário; cadastrar motorista
cria o usuário do sistema junto, com o papel que a seleção declarou. O operador preenche uma ficha,
não duas.

## Decisões

### O proprietário é derivado, não digitado

Os cinco campos de proprietário saem do formulário de veículo. Nome, CPF/CNPJ, RNTRC e UF vêm da
ficha do motorista selecionado; `tpProp` vem do papel (`aggregate` → `0` TAC agregado). Digitar duas
vezes o mesmo CNPJ é a forma mais barata de emitir MDF-e com proprietário errado.

### Criar motorista cria o usuário

Não existe mais select de "usuário vinculado". `POST /fleet/drivers` passa pelo convite: o motorista
nasce com vínculo na empresa e papel próprio — `aggregate` ou `driver`, conforme a seleção. O papel é
novo no catálogo de `membership_roles` e `user_invitation_roles`.

Esse usuário **não acessa o painel**. Ele existe para o aplicativo de entregas, que ainda não existe;
o papel é o lugar onde essa distinção fica registrada em vez de virar convenção oral.

### A ficha ganha contato e registro

`email`, `rntrc`, `antt_category` e `linked_legal_name` entram em `fleet_drivers`. O e-mail é o
contato do convite — sem ele o usuário não nasce. RNTRC e categoria ANTT são do agregado: é ele quem
aparece como proprietário no MDF-e. `linked_legal_name` só é legal quando há `linked_tax_id`, e o
CHECK diz isso.

### Os dados da empresa vêm por API

CNPJ digitado no vínculo do motorista consulta o cadastro público e devolve razão social. O operador
confere, não transcreve.

### A cobertura entra no cadastro

As zonas que o motorista atende são seleção múltipla dentro do próprio formulário. Antes eram outra
tela, depois do cadastro — e um motorista sem zona não aparece em cálculo nenhum.

### A semente mostra os dois perfis

A seleção de proprietário não tem o que mostrar num banco vazio. A semente local cria seis
motoristas pelo **use case real** — três `aggregate` com RNTRC e categoria ANTT, três `driver` — e
por isso cada um também ganha usuário. Documento fictício de propósito: ambiente descartável não
recebe CPF de pessoa real.

## Fora do escopo

- **Aplicativo de entregas.** O papel `aggregate` nasce sem consumidor; quem for escrever o app
  encontra o vínculo já gravado.
- **Aviso de CNH a vencer.** Continua não existindo (`NOTIFICATION_TEMPLATE_KEY` não tem a chave).
- **Criptografia dos campos de pessoa física.** ADR-0039 segue pendente, e esta spec não a executa —
  mas acrescenta `email`, que é PII e entra na mesma decisão quando ela for executada.

## Histórias

### P1 — O agregado não é digitado duas vezes

**Given** o operador no formulário de veículo com "Agregado" escolhido
**When** ele seleciona o motorista
**Then** proprietário, documento, RNTRC, UF e tipo de proprietário são os do motorista, sem campo
para digitar.

### P1 — Cadastrar motorista cria o usuário

**Given** o operador no cadastro de motorista
**When** ele grava com perfil `aggregate` ou `driver`
**Then** o motorista existe na frota **e** como usuário da empresa com aquele papel, sem passar pela
tela de usuários.

### P1 — O botão de cadastrar não quebra linha

**Given** o campo de seleção de motorista
**When** a tela é desenhada
**Then** seleção e "Cadastrar novo motorista" ficam na mesma fileira, na altura de controle do
design system.

### P2 — A semente povoa a seleção

**Given** um banco local recém-migrado
**When** a semente da frota roda
**Then** há motorista dos dois perfis para escolher, e rodar de novo não cria ninguém duas vezes.

# Retomada da 272 (parada em 2026-10-18 para formatar a máquina)

A sessão do autopilot foi interrompida no meio das tasks de código. O último commit `wip(272)` guarda
migrations (job_title e logo embutido), schema e a política do cargo **pela metade, sem gates rodados**:
confira, rode os testes e feche as tasks antes de seguir. Onde parou na doc: `evidence.md` § "Onde parou".

## Como retomar no sistema novo

```bash
cd ~/Documents/personal && git clone git@github.com:Andersonfrfilho/transportada.git   # se ainda não existir
cd transportada && git fetch origin && git worktree add ../transportada-wt/spec-272 work/spec-272
cd ../transportada-wt/spec-272 && ln -sf ../../transportada/.env .env && ln -sf ../../transportada/.env.test .env.test
bun install --frozen-lockfile   # Bun 1.3.14
OMC_GIT_GUARDRAILS=0 claude    # sem a trava, para o push depois de cada commit
```

Na sessão, cole o prompt abaixo.

## Prompt de retomada

```text
/oh-my-claudecode:autopilot Execute a spec specs/272-o-email-da-ocorrencia-sai-em-html/ (leia spec.md, plan.md,
tasks.md e evidence.md antes de começar; leia também specs/268-*, 269-*, 271-* (+ ADR-0108) com os evidence.md, e a
spec 273 em ~/Documents/personal/transportada-wt/spec-273/specs/273-a-ocorrencia-tem-dono/ para o ponto signer).
Árvore única: ~/Documents/personal/transportada-wt/spec-272 (FS do Linux, branch work/spec-272, criada de origin/staging);
nada fora dela. Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet (T0.2 🧠 → opus: escrever a ADR-0110 e validar com architect antes de
qualquer código) · Fase 1 → executor model=haiku (T1.3 sonnet) · Fase 2 → executor model=sonnet (T2.1/T2.3/T2.8/T2.9 haiku;
T2.9 antes da T2.4) ·
Fase 3 → executor model=sonnet (T3.3 haiku) · Fase 4 → executor model=sonnet (T4.3 haiku) · Fase 5 → sonnet ·
revisão final → code-reviewer model=sonnet e security-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Teste antes da implementação. Cada task fecha com bun run typecheck + lint por app (cwd na app) + script `test` do
package.json da app (nunca `bun test` cru) + commit isolado (`git commit --only <paths>`), evidência em evidence.md.
Task que toca test/integration/** só fecha com `bun --env-file=../../.env.test run test:integration` (de
apps/api-transportada), ZERO skips. Migration: aplica, reverte e reaplica e db:generate esperando no_changes.
Antes de publicar: git fetch, rebase em origin/staging, bun install --frozen-lockfile, gates,
`bunx prettier --check .` na raiz; conferir numeração de spec/ADR/migration contra origin/staging e contra a 273.
Pare e pergunte antes de: qualquer merge em main (T1.3, T5.4 — o painel tolerante vai a produção ANTES da API, e a
272 só vai a main depois de 269 + 270 + 271); qualquer mudança de dados ou consulta que não seja contagem em staging
ou produção; deploy da API sem o worker no mesmo deploy (plan § Publicação passo 2); e qualquer
[NEEDS CLARIFICATION] que surgir.
Decisões já tomadas (evidence.md): o modelo continua texto (271 recusa HTML) e o servidor monta o HTML em volta, com
multipart text+html; cores fixas da plataforma, tabelas e estilos inline, sem biblioteca; logo da transportadora
embutido por cid: lido de company_logos; marcas TransportAdA e Ada por APP_BASE_URL do painel; assunto
"<nome de exibição> · CNPJ <cnpj> — <assunto do modelo>"; resumo Nota fiscal / Partes / Registro; {{linhasItens}} vira
tabela (no manual só se o bloco ficou intacto); faixa de resposta só com Reply-To; assinatura operador / dono (porta
OccurrenceOwnerReader, nula até a 273) / equipe, com o cargo livre do usuário na empresa (job_title na membership,
editado em Usuários por users.manage na rota PATCH /company-users/:id, sem auditoria como o perfil; vazio → rótulo do
papel); "De" por buildSenderDisplayName com o nome de exibição SEMPRE (Resend e sandbox; o sender_name do Resend não
aparece), e a 273 RF7 herda essa regra.


RETOMADA: a sessão anterior foi interrompida para formatar a máquina; o último commit wip(272) tem código pela metade (migrations job_title e inline logo, schemas, política do cargo) sem gates — confira, teste e feche as tasks correspondentes antes de seguir. Leia RETOMADA.md, evidence.md e tasks.md; o tasks.md e o prompt reescritos MANDAM sobre o texto acima quando divergirem. Continue da próxima task aberta. Depois de CADA commit, git push origin work/spec-272. Infra de teste: ENV_FILE=.env.test SERVICES="postgres rabbitmq" make up. Bun 1.3.14.

PRIORIDADE DO DONO: TERMINAR O MAIS RÁPIDO POSSÍVEL. Para isso, e só nesta spec:
- Por task: typecheck só da(s) app(s) tocada(s) + os testes dos arquivos tocados/novos (rodando o arquivo, ex.: `./test/x.contract.ts` pelo script da app), commit e push. NÃO rode a suíte inteira, lint de tudo nem `make check` a cada task.
- Gate completo (typecheck + lint por app + script `test` de cada app + integração da API com --env-file, zero skips) UMA vez no fim de cada fase e na T5.1.
- Tasks independentes podem rodar em paralelo em executores separados quando não editam os mesmos arquivos; evidence.md é atualizado pela sessão principal, não pelos executores.
- Não reescreva documentação além do necessário; não peça revisão do architect de novo salvo bloqueio real.
- Continuam valendo: teste antes da implementação, push depois de cada commit, parar e perguntar antes de merge em main, de gravar dados em staging/produção e de [NEEDS CLARIFICATION].

RESPOSTAS DO DONO às perguntas Q1–Q5 do evidence.md (registre-as no evidence.md como decisões D14–D18 e siga sem perguntar de novo):
- Q1 (envio manual): o envio manual NUNCA perde o desenho. O modelo HTML é a moldura e tem uma área de corpo: o texto que o operador vê e edita no diálogo é o conteúdo dessa área (ex.: variável de sistema `{{corpo}}`/`{{mensagem}}` dentro do modelo HTML). Texto mantido ou editado, sai sempre o HTML do modelo com o texto do operador (escapado, em parágrafos) no lugar do corpo. Desenhe isso no renderer e no diálogo (o diálogo continua editando texto simples).
- Q2 (faixa "Responda este e-mail"): variável de HTML do sistema `faixaResposta`, preenchida só quando a mensagem tem Reply-To (vazia no sandbox/Mailpit). O dono perguntou por que não dá para responder no ambiente local: registre no evidence que a resposta depende do inbound do Resend (subdomínio de resposta + webhook), que o Mailpit não tem; um simulador de resposta local fica como sugestão de spec seguinte, fora da 272.
- Q3: criar as variáveis de texto `cidadeTransportadora`, `razaoSocialTransportadora`, `assinaturaIniciais`; linha vazia no resumo é aceita.
- Q4: não criar `dataRegistro`; usar o `{{data}}` existente.
- Q5: não gravar o assinante na mensagem nesta spec.
```

## Depois da 272

A 273 (o dono da ocorrência) está pronta em `origin/work/spec-273`, Fase 0 fechada; prompt no fim do
`specs/273-a-ocorrencia-tem-dono/tasks.md`. Roda depois da 272 (a T2.10 dela espera a 272 em staging).

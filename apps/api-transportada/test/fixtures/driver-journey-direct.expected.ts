/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O que o bot responde a cada mensagem da jornada na conversa individual (texto exato; lista e botões como `[ opção ]`). As horas vêm do relógio do teste: `at` é a hora
 * do registro (saída, chegada, baixa) e `eta` a chegada prevista pela estrada (25 min depois).
 */
export type JourneyClock = {
  readonly at: string
  readonly eta: string
  readonly farewell: string
  readonly greeting: string
}

export type JourneyExchange = { readonly answered: readonly string[]; readonly shown: string }

export function directJourneyExpected({ at, eta }: JourneyClock): readonly JourneyExchange[] {
  return [
    {
      answered: [
        `Toque na parada em que você vai sair para.
[ 1ª · NF 17234 · PAD… ]
[ 2ª · NF 17235 · MER… ]
[ 3ª · NF 17236 · ACO… ]`,
        `Toque numa parada da lista acima.`,
      ],
      shown: 'iniciar rota',
    },
    {
      answered: [
        `📍 *Mande sua localização* para medir a distância até a parada.
Clipe 📎 → Localização → Enviar localização atual.
_Se não puder agora, responda pular._`,
        `O que você quer fazer com esta viagem?

📍 Se puder, compartilhe sua localização antes de confirmar: toque no clipe (anexo) → Localização → Enviar localização atual.
[ 🚚 Saí para a entrega ]
[ 📍 Cheguei ]
[ 📦 Entregar ]
[ ↩️ Devolver ]
[ ⚠️ Ocorrência ]`,
      ],
      shown: '(toca) NF 17234',
    },
    {
      answered: [
        `🚚 *Saída registrada* · ${at}

> *PARADA 1 de 3*
> 🧾 NF \`17234\` · *PADARIA SOL NASCENTE*
> 🏢 Contratante: Distribuidora Aurora
> 📍 RUA DAS FLORES, 100, RIBEIRAO PRETO, SP
> 📦 3 volumes
> 📏 *12 km* · ⏱️ _~25 min_
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81
> 💰 Valor da nota: *R$ 1.234,56*
> ⏱️ Chegada prevista: *~${eta}*

➡️ _Próximo passo:_ quando chegar, mande *cheguei*.`,
      ],
      shown: '📍 (localização)',
    },
    {
      answered: [
        `📍 *Mande sua localização* para medir a distância até a parada.
Clipe 📎 → Localização → Enviar localização atual.
_Se não puder agora, responda pular._`,
        `O que você quer fazer com esta viagem?

📍 Se puder, compartilhe sua localização antes de confirmar: toque no clipe (anexo) → Localização → Enviar localização atual.
[ 🚚 Saí para a entrega ]
[ 📍 Cheguei ]
[ 📦 Entregar ]
[ ↩️ Devolver ]
[ ⚠️ Ocorrência ]`,
      ],
      shown: 'cheguei',
    },
    {
      answered: [
        `📍 *Chegada registrada* · ${at}

> *PARADA 1 de 3*
> 🧾 NF \`17234\` · *PADARIA SOL NASCENTE*
> 🏢 Contratante: Distribuidora Aurora
> 📍 RUA DAS FLORES, 100, RIBEIRAO PRETO, SP
> 📦 3 volumes
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81
> 💰 Valor da nota: *R$ 1.234,56*

🔜 *Depois desta:* parada 2 · MERCADO LUA CHEIA – Ribeirao Preto

➡️ _Próximo passo:_ depois da entrega, mande a *foto do canhoto*, ou *não entreguei*.`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `⚠️ *A chegada na parada 1 já foi registrada* às ${at}.

> *PARADA 1 de 3*
> 🧾 NF \`17234\` · *PADARIA SOL NASCENTE*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81

*O que você quer fazer agora?*
*1* - ✅ Entreguei _(mande a foto do canhoto)_
*2* - ↩️ Não entreguei
*3* - ⚠️ Abrir ocorrência
*4* - 💤 Nada por enquanto`,
        `O que você quer fazer com esta viagem?

📍 Se puder, compartilhe sua localização antes de confirmar: toque no clipe (anexo) → Localização → Enviar localização atual.
[ 🚚 Saí para a entrega ]
[ 📍 Cheguei ]
[ 📦 Entregar ]
[ ↩️ Devolver ]
[ ⚠️ Ocorrência ]`,
      ],
      shown: 'cheguei',
    },
    {
      answered: [
        `⚠️ *Falta a baixa da parada 1.*
Você chegou às ${at} e ainda não registrou a entrega.

> *PARADA 1 de 3*
> 🧾 NF \`17234\` · *PADARIA SOL NASCENTE*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81

*O que você quer fazer agora?*
*1* - ✅ Entreguei _(mande a foto do canhoto)_
*2* - ↩️ Não entreguei
*3* - 🚚 Sair para outra parada sem dar a baixa
*4* - 💤 Nada por enquanto`,
        `O que você quer fazer com esta viagem?

📍 Se puder, compartilhe sua localização antes de confirmar: toque no clipe (anexo) → Localização → Enviar localização atual.
[ 🚚 Saí para a entrega ]
[ 📍 Cheguei ]
[ 📦 Entregar ]
[ ↩️ Devolver ]
[ ⚠️ Ocorrência ]`,
      ],
      shown: 'saí',
    },
    {
      answered: [
        `🎙️ _Escutando seu áudio, só um momento._`,
        `🎙️ *Entendi assim:*
> 💬 _"um"_

*Está certo?*
*1* - ✅ Sim, pode seguir
*2* - ❌ Não, descartar

_Responda com o número ou por áudio (sim ou não)._`,
      ],
      shown: '🎤 (áudio: "um")',
    },
    {
      answered: [
        `Entregar NF 17234?`,
        `Confirma?

📍 Se puder, compartilhe sua localização antes de confirmar: toque no clipe (anexo) → Localização → Enviar localização atual.
[ ✅ Sim ]
[ ❌ Não ]`,
      ],
      shown: '1',
    },
    {
      answered: [
        `📍 *NF \`17234\` · localização*
Se puder, compartilhe a localização da entrega (clipe 📎 → Localização).
_Falta 1 item. Se não tiver, responda pular._`,
        `O que você quer fazer com esta viagem?

📍 Se puder, compartilhe sua localização antes de confirmar: toque no clipe (anexo) → Localização → Enviar localização atual.
[ 🚚 Saí para a entrega ]
[ 📍 Cheguei ]
[ 📦 Entregar ]
[ ↩️ Devolver ]
[ ⚠️ Ocorrência ]`,
      ],
      shown: '(toca) ✅ Sim',
    },
    {
      answered: [
        `👍 _Ok, sem a localização._

📸 *NF \`17234\` · foto do canhoto*
Mande a foto do canhoto assinado.
_Falta 1 item. Se não tiver, responda pular._`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `📋 *Confira a entrega da NF \`17234\`*

> 🏢 Contratante: Distribuidora Aurora
> 🏪 Cliente: *PADARIA SOL NASCENTE*
> 📍 RUA DAS FLORES, 100, RIBEIRAO PRETO, SP
> 💰 Valor da nota: *R$ 1.234,56*

🧾 Canhoto: sem foto
📍 Localização: não enviada

*Confirma a entrega?*
*1* - ✅ Sim, confirmar
*2* - ❌ Não, cancelar`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `✅ *NF \`17234\` entregue.* Parada 1 concluída.

➡️ *Próxima parada*

> *PARADA 2 de 3*
> 🧾 NF \`17235\` · *MERCADO LUA CHEIA*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.14,-47.99

*O que você quer fazer agora?*
*1* - 🚚 Seguir para a *parada 2*
*2* - 📋 Escolher outra da lista
*3* - 💤 Nada por enquanto`,
      ],
      shown: '1',
    },
    {
      answered: [
        `🚚 *Para qual parada você saiu?*

> 👉 *PARADA 2 de 3* · _próxima da rota_
> 🧾 NF \`17235\` · *MERCADO LUA CHEIA*

*PARADA 3 de 3*
🧾 NF \`17236\` · *ACOUGUE ESTRELA*

_Responda com o número da parada ou da nota._`,
      ],
      shown: '2',
    },
    {
      answered: [
        `📍 *Mande sua localização* para medir a distância até a parada.
Clipe 📎 → Localização → Enviar localização atual.
_Se não puder agora, responda pular._`,
      ],
      shown: '3',
    },
    {
      answered: [
        `⚠️ *Fora da rota sugerida*
A rota sugere ir antes para a *parada 2*. Se achar melhor, pode seguir para a 3.

> 🚚 *VOCÊ ESCOLHEU · PARADA 3*
> 🧾 NF \`17236\` · *ACOUGUE ESTRELA*

> 👉 *PRÓXIMA DA ROTA · PARADA 2*
> 🧾 NF \`17235\` · *MERCADO LUA CHEIA*

*Para onde você vai?*
*1* - ✅ Seguir para a *parada 3*
*2* - 👉 Ir para a *parada 2*

_Responda 1 ou 2._`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `🚚 *Saída registrada* · ${at}

> *PARADA 3 de 3*
> 🧾 NF \`17236\` · *ACOUGUE ESTRELA*
> 🏢 Contratante: Distribuidora Aurora
> 📍 RUA SETE, 7, CRAVINHOS, SP
> 📦 12 volumes
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.34,-47.73
> 💰 Valor da nota: *R$ 10,00*

➡️ _Próximo passo:_ quando chegar, mande *cheguei*.`,
      ],
      shown: '1',
    },
    {
      answered: [
        `⚠️ *Você já está a caminho da parada 3.*
Registre a chegada nela antes de sair para outra.

> *PARADA 3 de 3*
> 🧾 NF \`17236\` · *ACOUGUE ESTRELA*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.34,-47.73

*O que você quer fazer agora?*
*1* - 📍 Cheguei na *parada 3*
*2* - ⚠️ Abrir ocorrência
*3* - 💤 Nada por enquanto`,
        `O que você quer fazer com esta viagem?

📍 Se puder, compartilhe sua localização antes de confirmar: toque no clipe (anexo) → Localização → Enviar localização atual.
[ 🚚 Saí para a entrega ]
[ 📍 Cheguei ]
[ 📦 Entregar ]
[ ↩️ Devolver ]
[ ⚠️ Ocorrência ]`,
      ],
      shown: 'saí',
    },
    {
      answered: [
        `👍 *Certo, nada foi registrado.*
➡️ _Próximo passo:_ quando chegar, mande *cheguei*.`,
      ],
      shown: '3',
    },
    {
      answered: [
        `📍 *Mande sua localização* para medir a distância até a parada.
Clipe 📎 → Localização → Enviar localização atual.
_Se não puder agora, responda pular._`,
        `O que você quer fazer com esta viagem?

📍 Se puder, compartilhe sua localização antes de confirmar: toque no clipe (anexo) → Localização → Enviar localização atual.
[ 🚚 Saí para a entrega ]
[ 📍 Cheguei ]
[ 📦 Entregar ]
[ ↩️ Devolver ]
[ ⚠️ Ocorrência ]`,
      ],
      shown: 'cheguei',
    },
    {
      answered: [
        `📍 *Chegada registrada* · ${at}

> *PARADA 3 de 3*
> 🧾 NF \`17236\` · *ACOUGUE ESTRELA*
> 🏢 Contratante: Distribuidora Aurora
> 📍 RUA SETE, 7, CRAVINHOS, SP
> 📦 12 volumes
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.34,-47.73
> 💰 Valor da nota: *R$ 10,00*

🔜 *Depois desta:* parada 2 · MERCADO LUA CHEIA – Ribeirao Preto

➡️ _Próximo passo:_ depois da entrega, mande a *foto do canhoto*, ou *não entreguei*.`,
      ],
      shown: '📍 (localização)',
    },
    {
      answered: [
        `⚠️ *Falta a baixa da parada 3.*
Você chegou às ${at} e ainda não registrou a entrega.

> *PARADA 3 de 3*
> 🧾 NF \`17236\` · *ACOUGUE ESTRELA*
> 📍 Ribeirao Preto
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.34,-47.73

*O que você quer fazer agora?*
*1* - ✅ Entreguei _(mande a foto do canhoto)_
*2* - ↩️ Não entreguei
*3* - 🚚 Sair para outra parada sem dar a baixa
*4* - 💤 Nada por enquanto`,
        `O que você quer fazer com esta viagem?

📍 Se puder, compartilhe sua localização antes de confirmar: toque no clipe (anexo) → Localização → Enviar localização atual.
[ 🚚 Saí para a entrega ]
[ 📍 Cheguei ]
[ 📦 Entregar ]
[ ↩️ Devolver ]
[ ⚠️ Ocorrência ]`,
      ],
      shown: 'saí',
    },
    {
      answered: [
        `Qual foi o motivo da devolução?

📍 Se puder, compartilhe sua localização antes de confirmar: toque no clipe (anexo) → Localização → Enviar localização atual.
[ 🚪 Destinatário ausente ]
[ 🙅 Recusou receber ]
[ 📍 Endereço não achado ]
[ 📦 Carga avariada ]
[ 🔒 Local fechado ]`,
      ],
      shown: '2',
    },
    {
      answered: [
        `↩️ *NF \`17236\` não entregue* · Recusou receber
A nota volta com você para o armazém.

➡️ *Próxima parada*

> *PARADA 2 de 3*
> 🧾 NF \`17235\` · *MERCADO LUA CHEIA*
> 📍 Ribeirao Preto
> 📏 *12 km* · ⏱️ _~25 min_
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.14,-47.99

*O que você quer fazer agora?*
*1* - 🚚 Seguir para a *parada 2*
*2* - 📋 Escolher outra da lista
*3* - 💤 Nada por enquanto`,
        `O que você quer fazer com esta viagem?

📍 Se puder, compartilhe sua localização antes de confirmar: toque no clipe (anexo) → Localização → Enviar localização atual.
[ 🚚 Saí para a entrega ]
[ 📍 Cheguei ]
[ 📦 Entregar ]
[ ↩️ Devolver ]
[ ⚠️ Ocorrência ]`,
      ],
      shown: '(toca) 🙅 Recusou receber',
    },
    {
      answered: [
        `📍 *Mande sua localização* para medir a distância até a parada.
Clipe 📎 → Localização → Enviar localização atual.
_Se não puder agora, responda pular._`,
      ],
      shown: '1',
    },
    {
      answered: [
        `🚚 *Saída registrada* · ${at}

> *PARADA 2 de 3*
> 🧾 NF \`17235\` · *MERCADO LUA CHEIA*
> 🏢 Contratante: Distribuidora Aurora
> 📍 AVENIDA BRASIL, 2500, SERTAOZINHO, SP
> 📦 1 volume
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.14,-47.99
> 💰 Valor da nota: *R$ 99,90*

➡️ _Próximo passo:_ quando chegar, mande *cheguei*.`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `📍 *Mande sua localização* para medir a distância até a parada.
Clipe 📎 → Localização → Enviar localização atual.
_Se não puder agora, responda pular._`,
        `O que você quer fazer com esta viagem?

📍 Se puder, compartilhe sua localização antes de confirmar: toque no clipe (anexo) → Localização → Enviar localização atual.
[ 🚚 Saí para a entrega ]
[ 📍 Cheguei ]
[ 📦 Entregar ]
[ ↩️ Devolver ]
[ ⚠️ Ocorrência ]`,
      ],
      shown: 'cheguei',
    },
    {
      answered: [
        `📍 *Chegada registrada* · ${at}

> *PARADA 2 de 3*
> 🧾 NF \`17235\` · *MERCADO LUA CHEIA*
> 🏢 Contratante: Distribuidora Aurora
> 📍 AVENIDA BRASIL, 2500, SERTAOZINHO, SP
> 📦 1 volume
> 🗺️ *Como chegar:* https://www.google.com/maps/dir/?api=1&destination=-21.14,-47.99
> 💰 Valor da nota: *R$ 99,90*

➡️ _Próximo passo:_ depois da entrega, mande a *foto do canhoto*, ou *não entreguei*.`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `Entregar NF 17235?`,
        `Confirma?

📍 Se puder, compartilhe sua localização antes de confirmar: toque no clipe (anexo) → Localização → Enviar localização atual.
[ ✅ Sim ]
[ ❌ Não ]`,
      ],
      shown: 'entreguei 17235',
    },
    {
      answered: [
        `📍 *NF \`17235\` · localização*
Se puder, compartilhe a localização da entrega (clipe 📎 → Localização).
_Falta 1 item. Se não tiver, responda pular._`,
        `O que você quer fazer com esta viagem?

📍 Se puder, compartilhe sua localização antes de confirmar: toque no clipe (anexo) → Localização → Enviar localização atual.
[ 🚚 Saí para a entrega ]
[ 📍 Cheguei ]
[ 📦 Entregar ]
[ ↩️ Devolver ]
[ ⚠️ Ocorrência ]`,
      ],
      shown: '(toca) ✅ Sim',
    },
    {
      answered: [
        `👍 _Ok, sem a localização._

📸 *NF \`17235\` · foto do canhoto*
Mande a foto do canhoto assinado.
_Falta 1 item. Se não tiver, responda pular._`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `📋 *Confira a entrega da NF \`17235\`*

> 🏢 Contratante: Distribuidora Aurora
> 🏪 Cliente: *MERCADO LUA CHEIA*
> 📍 AVENIDA BRASIL, 2500, SERTAOZINHO, SP
> 💰 Valor da nota: *R$ 99,90*

🧾 Canhoto: sem foto
📍 Localização: não enviada

*Confirma a entrega?*
*1* - ✅ Sim, confirmar
*2* - ❌ Não, cancelar`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `✅ *NF \`17235\` entregue.* Parada 2 concluída.

🏁 *Rota concluída!* Todas as 3 paradas estão fechadas.
Bom descanso, Motorista. 🌙`,
      ],
      shown: '1',
    },
  ]
}

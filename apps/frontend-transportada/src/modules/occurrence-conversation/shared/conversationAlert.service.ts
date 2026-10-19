/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Aviso de mensagem nova que o operador não está vendo: conversa minimizada, em outra aba ou página em segundo plano. */

const TITLE_PREFIX = /^\(\d+\) /u

/** Toca só quando chegou mensagem (a contagem subiu) e a conversa não está aberta à vista. */
export function shouldChime(input: { isOpen: boolean; next: number; previous: number }): boolean {
  return input.next > input.previous && !input.isOpen
}

export function titleWithUnread(title: string, count: number): string {
  const base = title.replace(TITLE_PREFIX, '')
  return count > 0 ? `(${count}) ${base}` : base
}

/** Dois toques curtos pelo Web Audio, sem arquivo de som; navegador sem áudio ou sem gesto prévio fica em silêncio. */
export function playConversationChime(): void {
  try {
    const AudioContextCtor =
      typeof window === 'undefined'
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    if (AudioContextCtor === undefined) return
    const context = new AudioContextCtor()
    const gain = context.createGain()
    gain.gain.value = 0.08
    gain.connect(context.destination)
    for (const [index, frequency] of [880, 1175].entries()) {
      const oscillator = context.createOscillator()
      oscillator.frequency.value = frequency
      oscillator.connect(gain)
      oscillator.start(context.currentTime + index * 0.14)
      oscillator.stop(context.currentTime + index * 0.14 + 0.1)
    }
    window.setTimeout(() => void context.close(), 600)
  } catch {
    // aviso sonoro é conveniência
  }
}

/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Toca só quando a soma de não lidas subiu em relação à leitura anterior; a primeira leitura não é mensagem nova. */
export function shouldChime(previous: null | number, next: number): boolean {
  return previous !== null && next > previous
}

/** Dois toques curtos pelo Web Audio, sem arquivo de som; sem áudio ou sem gesto prévio do usuário fica em silêncio. */
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
    gain.gain.value = 0.15
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

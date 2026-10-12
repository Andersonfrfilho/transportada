/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type CommandOutcome =
  | { readonly outcome: 'exited'; readonly exitCode: number; readonly stdout: string }
  | { readonly outcome: 'timed_out' }
  | { readonly outcome: 'spawn_failed' }

export type RunCommandParams = {
  readonly command: string
  readonly args: readonly string[]
  readonly timeoutMilliseconds: number
}

export type RunCommand = (params: RunCommandParams) => Promise<CommandOutcome>

/** O filho é morto no prazo: arquivo hostil que trava o `ffprobe` não prende a execução. */
export const runCommandWithTimeout: RunCommand = async (params) => {
  let child: Bun.Subprocess<'ignore', 'pipe', 'ignore'>
  try {
    child = Bun.spawn([params.command, ...params.args], {
      stderr: 'ignore',
      stdin: 'ignore',
      stdout: 'pipe',
    })
  } catch {
    return { outcome: 'spawn_failed' }
  }

  let isTimedOut = false
  const timer = setTimeout(() => {
    isTimedOut = true
    child.kill('SIGKILL')
  }, params.timeoutMilliseconds)

  try {
    const [stdout, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited])
    if (isTimedOut) return { outcome: 'timed_out' }
    return { exitCode, outcome: 'exited', stdout }
  } finally {
    clearTimeout(timer)
  }
}

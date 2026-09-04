export type AgentTerminalState = 'completed' | 'error' | 'cancelled' | 'interrupted'

export interface RunToken {
  runId: number
  sessionId: string | null
  assistantMessageId: string
}

export class RunOwnership {
  private generation = 0
  private active: RunToken | null = null

  begin(sessionId: string | null, assistantMessageId: string): RunToken {
    this.generation += 1
    this.active = { runId: this.generation, sessionId, assistantMessageId }
    return { ...this.active }
  }

  owns(token: RunToken): boolean {
    return (
      this.active !== null &&
      this.active.runId === token.runId &&
      this.active.sessionId === token.sessionId &&
      this.active.assistantMessageId === token.assistantMessageId
    )
  }

  updateSession(token: RunToken, sessionId: string): RunToken | null {
    if (!this.owns(token)) return null
    const next: RunToken = {
      runId: token.runId,
      sessionId,
      assistantMessageId: token.assistantMessageId,
    }
    this.active = next
    return { ...next }
  }

  commitTerminal(token: RunToken, _state: AgentTerminalState): boolean {
    if (!this.owns(token)) return false
    this.active = null
    return true
  }

  invalidate(): void {
    this.generation += 1
    this.active = null
  }
}

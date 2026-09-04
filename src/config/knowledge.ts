export interface KnowledgeCapabilities {
  upload: boolean
  deleteDocument: boolean
  feedback: boolean
  deleteRemoteSession: boolean
}

type CapabilityEnvironment = Record<string, unknown>

function strictlyEnabled(value: unknown): boolean {
  return value === 'true'
}

export function resolveKnowledgeCapabilities(
  environment: CapabilityEnvironment,
): KnowledgeCapabilities {
  return {
    upload: strictlyEnabled(environment.VITE_RAG_UPLOAD_ENABLED),
    deleteDocument: strictlyEnabled(environment.VITE_RAG_DELETE_ENABLED),
    feedback: strictlyEnabled(environment.VITE_RAG_FEEDBACK_ENABLED),
    deleteRemoteSession: strictlyEnabled(environment.VITE_RAG_SESSION_DELETE_ENABLED),
  }
}

// 这些值只是控制产品界面，不能代替网关或服务端授权。
export const KNOWLEDGE_CAPABILITIES = resolveKnowledgeCapabilities(import.meta.env)

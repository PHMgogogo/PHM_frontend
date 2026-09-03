export type DocumentStatus = 'processing' | 'indexed' | 'failed' | 'unknown'

export interface DocumentItem {
  id: string
  filename: string
  status: DocumentStatus
  chunks: number
  created_at: number
  size_bytes: number
  file_hash: string
}

export interface DocumentListResponse {
  documents: DocumentItem[]
  total: number
}

export interface RetrievalResultItem {
  content: string
  source: string
  title: string
  score: number | null
  retrieval_score: number | null
  rerank_score: number | null
  rerank_applied: boolean
}

export interface RetrievalResponse {
  query: string
  results: RetrievalResultItem[]
  total: number
  retrieval_time_ms: number
}

export interface SourceDocument {
  content: string
  source: string
  title: string
  score: number | null
  retrieval_score: number | null
  rerank_score: number | null
  rerank_applied: boolean
}

export interface StructuredAnswer {
  summary: string
  details: string[]
  steps: string[]
  notes: string
  sources: string[]
  gaps: string
}

export interface PublicKnowledgeMetadata {
  route?: string
  prompt_profile?: string
  force_rag?: boolean
  message_id?: string
  trace_id?: string
  confidence?: number | null
  intent_confidence?: number | null
  confidence_level?: string
  refused?: boolean
  source_count?: number
  structured_answer?: StructuredAnswer | null
  section_labels?: string[]
  error?: string
}

export type KnowledgeStreamEvent =
  | { type: 'session'; session_id: string }
  | { type: 'status'; message: string }
  | {
      type: 'intent'
      intent: string
      confidence: number | null
      route: string
      force_rag: boolean
    }
  | { type: 'node'; name: string }
  | { type: 'token'; content: string }
  | {
      type: 'done'
      full_response: string
      sources: SourceDocument[]
      processing_time_ms: number | null
      metadata: PublicKnowledgeMetadata
    }
  | { type: 'error'; message: string }

export interface HistoricalMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number | null
}

export interface ChatHistoryResponse {
  session_id: string
  messages: HistoricalMessage[]
  total_messages: number
}

export const KNOWLEDGE_NORMALIZATION_LIMITS = Object.freeze({
  documents: 200,
  retrievalResults: 50,
  sources: 50,
  sourceContentChars: 20_000,
  answerChars: 200_000,
  messageChars: 200_000,
  shortTextChars: 2_000,
  historyMessages: 50,
})

export class KnowledgePayloadLimitError extends Error {
  constructor() {
    super('响应超过安全限制，可重试')
    this.name = 'KnowledgePayloadLimitError'
  }
}

function recordOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function text(value: unknown, maxChars: number): string {
  return typeof value === 'string' ? value.slice(0, maxChars) : ''
}

function answerText(value: unknown): string {
  if (
    typeof value === 'string' &&
    value.length > KNOWLEDGE_NORMALIZATION_LIMITS.answerChars
  ) {
    throw new KnowledgePayloadLimitError()
  }
  return text(value, KNOWLEDGE_NORMALIZATION_LIMITS.answerChars)
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  const normalized = finite(value)
  return normalized === null ? fallback : Math.max(0, Math.floor(normalized))
}

function stringArray(value: unknown, limit: number, itemLimit: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .slice(0, limit)
    .map((item) => item.slice(0, itemLimit))
}

function normalizeDocumentStatus(value: unknown): DocumentStatus {
  return value === 'processing' || value === 'indexed' || value === 'failed' ? value : 'unknown'
}

function normalizeDocument(value: unknown): DocumentItem | null {
  const record = recordOf(value)
  if (!record) return null
  const id = text(record.id, 256)
  const filename = text(record.filename, 1_024)
  if (!id || !filename) return null
  return {
    id,
    filename,
    status: normalizeDocumentStatus(record.status),
    chunks: nonNegativeInteger(record.chunks),
    created_at: finite(record.created_at) ?? 0,
    size_bytes: nonNegativeInteger(record.size_bytes),
    file_hash: text(record.file_hash, 256),
  }
}

export function normalizeDocumentList(value: unknown): DocumentListResponse {
  const record = recordOf(value)
  const rawDocuments = Array.isArray(record?.documents) ? record.documents : []
  const documents = rawDocuments
    .slice(0, KNOWLEDGE_NORMALIZATION_LIMITS.documents)
    .map(normalizeDocument)
    .filter((item): item is DocumentItem => item !== null)
  return {
    documents,
    total: nonNegativeInteger(record?.total, documents.length),
  }
}

export function normalizeDocumentDetail(value: unknown): DocumentItem | null {
  return normalizeDocument(value)
}

function normalizeRetrievalItem(value: unknown): RetrievalResultItem | null {
  const record = recordOf(value)
  if (!record) return null
  const content = text(record.content, KNOWLEDGE_NORMALIZATION_LIMITS.sourceContentChars)
  if (!content) return null
  return {
    content,
    source: text(record.source, 2_000),
    title: text(record.title, 2_000),
    score: finite(record.score),
    retrieval_score: finite(record.retrieval_score),
    rerank_score: finite(record.rerank_score),
    rerank_applied: record.rerank_applied === true,
  }
}

export function normalizeRetrievalResponse(value: unknown): RetrievalResponse {
  const record = recordOf(value)
  const rawResults = Array.isArray(record?.results) ? record.results : []
  const results = rawResults
    .slice(0, KNOWLEDGE_NORMALIZATION_LIMITS.retrievalResults)
    .map(normalizeRetrievalItem)
    .filter((item): item is RetrievalResultItem => item !== null)
  return {
    query: text(record?.query, 10_000),
    results,
    total: nonNegativeInteger(record?.total, results.length),
    retrieval_time_ms: finite(record?.retrieval_time_ms) ?? 0,
  }
}

function normalizeSource(value: unknown): SourceDocument | null {
  const normalized = normalizeRetrievalItem(value)
  return normalized ? { ...normalized } : null
}

function normalizeStructuredAnswer(value: unknown): StructuredAnswer | null {
  const record = recordOf(value)
  if (!record) return null
  return {
    summary: text(record.summary, 20_000),
    details: stringArray(record.details, 100, 10_000),
    steps: stringArray(record.steps, 100, 10_000),
    notes: text(record.notes, 20_000),
    sources: stringArray(record.sources, 100, 2_000),
    gaps: text(record.gaps, 20_000),
  }
}

export function normalizePublicMetadata(value: unknown): PublicKnowledgeMetadata {
  const record = recordOf(value)
  if (!record) return {}
  const result: PublicKnowledgeMetadata = {}

  const route = text(record.route, 128)
  if (route) result.route = route
  const promptProfile = text(record.prompt_profile, 256)
  if (promptProfile) result.prompt_profile = promptProfile
  if (typeof record.force_rag === 'boolean') result.force_rag = record.force_rag
  const messageId = text(record.message_id, 256)
  if (messageId) result.message_id = messageId
  const traceId = text(record.trace_id, 256)
  if (traceId) result.trace_id = traceId

  if (record.confidence === null) result.confidence = null
  else {
    const confidence = finite(record.confidence)
    if (confidence !== null) result.confidence = confidence
  }
  if (record.intent_confidence === null) result.intent_confidence = null
  else {
    const intentConfidence = finite(record.intent_confidence)
    if (intentConfidence !== null) result.intent_confidence = intentConfidence
  }

  const confidenceLevel = text(record.confidence_level, 64)
  if (confidenceLevel) result.confidence_level = confidenceLevel
  if (typeof record.refused === 'boolean') result.refused = record.refused
  const sourceCount = finite(record.source_count)
  if (sourceCount !== null) result.source_count = Math.max(0, Math.floor(sourceCount))

  if ('structured_answer' in record) {
    result.structured_answer = normalizeStructuredAnswer(record.structured_answer)
  }
  const labels = stringArray(record.section_labels, 6, 128)
  if (labels.length) result.section_labels = labels
  const error = text(record.error, 2_000)
  if (error) result.error = error
  return result
}

export function normalizeKnowledgeStreamEvent(value: unknown): KnowledgeStreamEvent | null {
  const record = recordOf(value)
  if (!record) return null
  const type = text(record.type, 64)
  switch (type) {
    case 'session': {
      const sessionId = text(record.session_id, 256)
      return sessionId ? { type, session_id: sessionId } : null
    }
    case 'status':
    case 'error': {
      const message = text(record.message, KNOWLEDGE_NORMALIZATION_LIMITS.shortTextChars)
      return message ? { type, message } : null
    }
    case 'node': {
      const name = text(record.name, 128)
      return name ? { type, name } : null
    }
    case 'token': {
      const content = answerText(record.content)
      return content ? { type, content } : null
    }
    case 'intent':
      return {
        type,
        intent: text(record.intent, 128),
        confidence: finite(record.confidence),
        route: text(record.route, 128),
        force_rag: record.force_rag === true,
      }
    case 'done': {
      const rawSources = Array.isArray(record.sources) ? record.sources : []
      const sources = rawSources
        .slice(0, KNOWLEDGE_NORMALIZATION_LIMITS.sources)
        .map(normalizeSource)
        .filter((item): item is SourceDocument => item !== null)
      return {
        type,
        full_response: answerText(record.full_response),
        sources,
        processing_time_ms: finite(record.processing_time_ms),
        metadata: normalizePublicMetadata(record.metadata),
      }
    }
    default:
      return null
  }
}

export function normalizeChatHistory(value: unknown): ChatHistoryResponse | null {
  const record = recordOf(value)
  if (!record) return null
  const sessionId = text(record.session_id, 256)
  if (!sessionId) return null
  const rawMessages = Array.isArray(record.messages) ? record.messages : []
  const messages: HistoricalMessage[] = []
  for (const rawMessage of rawMessages.slice(-KNOWLEDGE_NORMALIZATION_LIMITS.historyMessages)) {
    const message = recordOf(rawMessage)
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue
    const content = text(message.content, KNOWLEDGE_NORMALIZATION_LIMITS.messageChars)
    if (!content) continue
    messages.push({
      role: message.role,
      content,
      timestamp: finite(message.timestamp),
    })
  }
  return {
    session_id: sessionId,
    messages,
    total_messages: nonNegativeInteger(record.total_messages, messages.length),
  }
}

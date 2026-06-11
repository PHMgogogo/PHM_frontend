// ============================================================
// 文档管理 & 知识库检索 API（对应 /document 代理）
// ============================================================

import { createClient } from './client'

const client = createClient({ baseURL: '/document' })

// ---- 类型 ----

export type DocumentStatus = 'processing' | 'completed'

export interface DocumentItem {
  id: string
  filename: string
  status: DocumentStatus
  chunks: number
  created_at: number
  size_bytes: number
  file_hash: string
}

export interface DocumentUploadResponse {
  id: string
  filename: string
  status: 'processing' | 'duplicate'
  message: string
}

export interface DocumentListResponse {
  documents: DocumentItem[]
  total: number
}

export interface DocumentDeleteResponse {
  status: string
  message: string
}

export interface ReindexResponse {
  status: string
  message: string
}

export interface RetrievalRequest {
  query: string
  top_k?: number
}

export interface RetrievalResultItem {
  content: string
  source: string
  title: string
  score: number
}

export interface RetrievalResponse {
  query: string
  results: RetrievalResultItem[]
  total: number
  retrieval_time_ms: number
}

// ---- 3.1 上传文档 ----

/** 上传文档到知识库，后台自动分块、向量化并存入 Milvus */
export function uploadDocument(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return client.upload<DocumentUploadResponse>('/documents/upload', fd)
}

// ---- 3.2 文档列表 ----

export interface DocumentListParams {
  skip?: number
  limit?: number
}

/** 获取已上传文档列表 */
export function getDocumentList(params?: DocumentListParams) {
  const query: Record<string, string> = {}
  if (params?.skip !== undefined) query.skip = String(params.skip)
  if (params?.limit !== undefined) query.limit = String(params.limit)
  return client.get<DocumentListResponse>('/documents', query)
}

// ---- 3.3 文档详情 ----

/** 获取单个文档详情 */
export function getDocumentDetail(docId: string) {
  return client.get<DocumentItem>(`/documents/${docId}`)
}

// ---- 3.4 删除文档 ----

/** 删除文档（同步清理 Milvus 向量库与 BM25 索引） */
export function deleteDocument(docId: string) {
  return client.del<DocumentDeleteResponse>(`/documents/${docId}`)
}

// ---- 3.5 重建索引 ----

/** 重新扫描 md/ 目录并重建向量索引（后台异步） */
export function reindexDocuments() {
  return client.post<ReindexResponse>('/documents/reindex')
}

// ---- 5.1 混合检索（dense + BM25，RRF 融合） ----

/** 混合检索：dense 向量 + BM25 关键词，RRF 融合排序 */
export function hybridRetrieval(params: RetrievalRequest) {
  return client.post<RetrievalResponse>('/retrieval', params)
}

// ---- 5.2 纯向量检索 ----

/** 纯向量检索：仅 embedding 余弦相似度 */
export function denseRetrieval(params: RetrievalRequest) {
  return client.post<RetrievalResponse>('/retrieval/dense', params)
}

// ---- 5.3 纯关键词检索 ----

/** 纯关键词检索：仅 BM25 词频匹配（适用于 ATA 编号、零件号、故障代码等精确查询） */
export function sparseRetrieval(params: RetrievalRequest) {
  return client.post<RetrievalResponse>('/retrieval/sparse', params)
}

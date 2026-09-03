// 文档管理与低层检索 API（/document -> RAG /api）。

import { createClient, type RequestOptions } from './client'
import { API_PREFIX } from '@/config/endpoints'
import {
  normalizeDocumentDetail,
  normalizeDocumentList,
  normalizeRetrievalResponse,
  type DocumentItem,
  type DocumentListResponse,
  type DocumentStatus,
  type RetrievalResponse,
  type RetrievalResultItem,
} from '@/utils/knowledge-normalize'

const client = createClient({ baseURL: API_PREFIX.RAG })

export type {
  DocumentItem,
  DocumentListResponse,
  DocumentStatus,
  RetrievalResponse,
  RetrievalResultItem,
}

export interface DocumentUploadResponse {
  id: string
  filename: string
  status: 'processing'
  message: string
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

export type RetrievalStrategy = 'hybrid' | 'dense' | 'sparse'

export interface DocumentListParams {
  skip?: number
  limit?: number
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeUploadResponse(value: unknown): DocumentUploadResponse {
  const record = recordOf(value)
  if (
    !record ||
    typeof record.id !== 'string' ||
    typeof record.filename !== 'string' ||
    record.status !== 'processing'
  ) {
    throw new Error('上传响应格式无效')
  }
  return {
    id: record.id.slice(0, 256),
    filename: record.filename.slice(0, 1_024),
    status: 'processing',
    message: typeof record.message === 'string' ? record.message.slice(0, 2_000) : '',
  }
}

export async function uploadDocument(file: File, options?: RequestOptions) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await client.upload<unknown>('/documents/upload', formData, options)
  return normalizeUploadResponse(response)
}

export async function getDocumentList(
  params?: DocumentListParams,
  options?: RequestOptions,
): Promise<DocumentListResponse> {
  const query: Record<string, string> = {}
  if (params?.skip !== undefined) query.skip = String(params.skip)
  if (params?.limit !== undefined) query.limit = String(params.limit)
  const response = await client.get<unknown>('/documents', query, options)
  return normalizeDocumentList(response)
}

export async function getDocumentDetail(
  docId: string,
  options?: RequestOptions,
): Promise<DocumentItem> {
  const response = await client.get<unknown>(
    `/documents/${encodeURIComponent(docId)}`,
    undefined,
    options,
  )
  const normalized = normalizeDocumentDetail(response)
  if (!normalized) throw new Error('文档详情响应格式无效')
  return normalized
}

export function deleteDocument(docId: string, options?: RequestOptions) {
  return client.del<DocumentDeleteResponse>(`/documents/${encodeURIComponent(docId)}`, options)
}

export function reindexDocuments(options?: RequestOptions) {
  return client.post<ReindexResponse>('/documents/reindex', undefined, options)
}

export async function runRetrieval(
  strategy: RetrievalStrategy,
  params: RetrievalRequest,
  options?: RequestOptions,
): Promise<RetrievalResponse> {
  const suffix = strategy === 'hybrid' ? '' : `/${strategy}`
  const response = await client.post<unknown>(`/retrieval${suffix}`, params, options)
  return normalizeRetrievalResponse(response)
}

export function hybridRetrieval(params: RetrievalRequest, options?: RequestOptions) {
  return runRetrieval('hybrid', params, options)
}

export function denseRetrieval(params: RetrievalRequest, options?: RequestOptions) {
  return runRetrieval('dense', params, options)
}

export function sparseRetrieval(params: RetrievalRequest, options?: RequestOptions) {
  return runRetrieval('sparse', params, options)
}

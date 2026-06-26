// ============================================================
// 通用文件存储 API（对应 /api/storage 代理）
// ============================================================

import { ApiError } from './client'

/**
 * 上传文件到后端通用存储，返回后端生成的文件路径。
 *
 * 后端：POST /api/storage/upload（multipart/form-data）
 *   - file:     要上传的文件
 *   - filename: 可选文件名，默认空串（与后端 curl 行为一致）
 *
 * 返回：后端原始路径字符串，形如 /mnt/d/.../xxx.csv（Linux 挂载路径）。
 * 注意：返回的是原始路径；调用方如需本地/UNC 访问，应再调用
 *       stores/task.ts 的 convertPath 转成 \\192.168.31.13\... 形式
 *       （与 createTask 处理 instance file_path 的做法一致）。
 *
 * 说明：该接口响应为 text/plain（非 JSON），不能复用 client.upload
 *       （其内部 res.json() 会解析失败），故直接用 fetch + res.text()。
 */
export async function uploadToStorage(file: File, filename = ''): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('filename', filename)

  const res = await fetch('/api/storage/upload', {
    method: 'POST',
    body: fd,
  })

  if (!res.ok) {
    let detail = ''
    try {
      detail = await res.text()
    } catch {
      /* 忽略 */
    }
    throw new ApiError(detail || `上传失败: ${res.status}`, res.status)
  }

  return (await res.text()).trim()
}

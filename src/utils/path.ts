// ============================================================
// 路径工具
// ============================================================

/**
 * 将后端返回的 Linux 挂载路径（/mnt/d/...）转为 Windows UNC 路径（\\192.168.31.13\...）。
 *
 * 后端文件存储（/api/storage/upload）与 instance 接口返回的都是 /mnt/d/... 形式，
 * 前端运行在 Windows，需经此转换后才能作为本地/UNC 路径访问，或交给 opencode 会话使用。
 */
export function convertPath(filePath: string): string {
  return filePath.replace(/^\/mnt\/d/, '\\\\192.168.31.13').replace(/\//g, '\\')
}

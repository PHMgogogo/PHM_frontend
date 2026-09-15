// ============================================================
// 机型编码来源判定
// ============================================================

/**
 * 机型编码来源约定：后端把航新/633 的机型拼成 `${modelCode}:${modelId}`
 * （如 JX-20A:10001），本地机型编码不含 ':'。据此区分本地与外源机型。
 */
export function isExternalModelCode(modelCode: string): boolean {
  return modelCode.includes(':')
}

export function isLocalModelCode(modelCode: string): boolean {
  return !isExternalModelCode(modelCode)
}

/** 机型来源展示文案：外源机型显示为「第三方服务」，其余为「本地」 */
export function modelSourceText(modelCode: string): string {
  return isExternalModelCode(modelCode) ? '第三方服务' : '本地'
}

/**
 * 取基础机型编码：去掉外源机型的 ':modelId' 后缀。
 * GET /aircraft/plane 的 modelCode 参数只认基础编码——传 'JX-20A:10001' 返回 0 行，
 * 传 'JX-20A' 才能查到该型号下的单机。
 */
export function baseModelCode(modelCode: string): string {
  const i = modelCode.indexOf(':')
  return i >= 0 ? modelCode.slice(0, i) : modelCode
}

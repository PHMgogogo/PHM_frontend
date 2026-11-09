export const PIPELINE_NODE_TYPES = [
  'LocalTimeseriesInputNode',
  'InferenceNode',
  'OutputNode',
] as const

const pipelineNodeTypeSet = new Set<string>(PIPELINE_NODE_TYPES)

export function isPipelineNodeType(nodeType: string): boolean {
  return pipelineNodeTypeSet.has(nodeType)
}

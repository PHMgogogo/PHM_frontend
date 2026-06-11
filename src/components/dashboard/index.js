// 仪表盘组件导出
import DashboardContainer from './DashboardContainer.vue'
import ChartWidget from './ChartWidget.vue'

export { DashboardContainer, ChartWidget }

export * from '../../utils/dashboard-types.js'
export * from '../../utils/dashboard-utils.js' 
export * from '../../utils/chart-configs.js'

export function install(app) {
  app.component('DashboardContainer', DashboardContainer)
  app.component('ChartWidget', ChartWidget)
}

export default { install, DashboardContainer, ChartWidget }

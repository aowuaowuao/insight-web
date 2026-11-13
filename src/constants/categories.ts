/** 一级分类：id ↔ 中文名（与后端 app/vocab/categories.json 保持一致） */
export const CATEGORY_NAMES: Record<string, string> = {
  project_application: '项目申报',
  industry_policy: '行业政策',
  talent_application: '人才申报',
  enterprise_certification: '企业资质申报',
  funding_subsidy: '资金补贴',
  other: '其他',
}

/** 后端声明的固定类顺序，前端布局可直接用 */
export const CATEGORY_ORDER = [
  'project_application',
  'industry_policy',
  'talent_application',
  'enterprise_certification',
  'funding_subsidy',
  'other',
] as const

export function categoryName(id: string): string {
  return CATEGORY_NAMES[id] ?? id
}

/** 新闻来源标识 → 中文名（未知来源原样显示） */
const SOURCE_NAMES: Record<string, string> = {
  'prov-sci-tech': '省科技厅',
  'city-sme': '市中小企业服务局',
  'pboc-news': '中国人民银行',
  'tech-daily': '科技日报',
}

export function sourceName(source: string | null | undefined): string {
  if (!source) return '未知来源'
  return SOURCE_NAMES[source] ?? source
}

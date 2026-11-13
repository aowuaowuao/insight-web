/**
 * 新闻来源标识 → 中文名（未知来源原样显示）。
 * 前四条对应 news-insight 的 demo 数据，其余是 news-crawler 里真实配置的 source。
 */
const SOURCE_NAMES: Record<string, string> = {
  'prov-sci-tech': '省科技厅',
  'city-sme': '市中小企业服务局',
  'pboc-news': '中国人民银行',
  'tech-daily': '科技日报',
  most_kjjh: '科技部（国家科技管理信息系统）',
  ndrc_tz: '国家发展改革委',
  ctp_kjb: '长春高新区',
  gov_qiye: '中国政府网·惠企政策库',
  rc_jxzzb: '江西省委组织部·人才政策',
  shpolicy_ssme: '上海企业服务云',
}

export function sourceName(source: string | null | undefined): string {
  if (!source) return '未知来源'
  return SOURCE_NAMES[source] ?? source
}

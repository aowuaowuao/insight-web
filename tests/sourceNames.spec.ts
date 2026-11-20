import { describe, expect, it } from 'vitest'
import { sourceName } from '@/constants/sources'

describe('sourceName', () => {
  it('返回真实站点的发布单位中文名', () => {
    expect(sourceName('hubei_kjt_tzgg')).toBe('湖北省科学技术厅')
    expect(sourceName('jzsc_mohurd_tzgg')).toBe('全国建筑市场监管公共服务平台')
    expect(sourceName('moa_tzgg_gg')).toBe('农业农村部（公告）')
    expect(sourceName('moa_tzgg_tfw')).toBe('农业农村部（其他）')
  })

  it('未知来源保持原样，空来源显示未知来源', () => {
    expect(sourceName('unknown_source')).toBe('unknown_source')
    expect(sourceName('')).toBe('未知来源')
  })
})

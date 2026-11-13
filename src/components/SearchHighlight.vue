<!--
  关键词高亮。
  规范 2.2.1（二）模块五（3）：搜索关键词在标题和摘要中高亮显示（黄色背景）。
  实现上不用 v-html（XSS 面为零），而是把文本切成片段后逐段渲染 <mark>。
-->
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  text: string
  /** 要高亮的词，多个词按最长优先匹配，避免短词把长词切碎 */
  terms: string[]
}>()

interface Segment {
  text: string
  hit: boolean
}

const segments = computed<Segment[]>(() => {
  const words = [...new Set(props.terms.map((t) => t.trim()).filter(Boolean))]
  if (words.length === 0 || !props.text) return [{ text: props.text, hit: false }]

  // 最长优先：否则「申报」会先吃掉「项目申报」的一部分
  words.sort((a, b) => b.length - a.length)
  // 正则元字符要转义，用户可能输入 . * ( ) 之类
  const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const re = new RegExp(`(${pattern})`, 'gi')

  const out: Segment[] = []
  let last = 0
  for (const match of props.text.matchAll(re)) {
    const index = match.index ?? 0
    if (index > last) out.push({ text: props.text.slice(last, index), hit: false })
    out.push({ text: match[0], hit: true })
    last = index + match[0].length
  }
  if (last < props.text.length) out.push({ text: props.text.slice(last), hit: false })
  return out.length ? out : [{ text: props.text, hit: false }]
})
</script>

<template>
  <span class="hl">
    <template v-for="(segment, index) in segments" :key="index">
      <mark v-if="segment.hit" class="hl__mark">{{ segment.text }}</mark>
      <template v-else>{{ segment.text }}</template>
    </template>
  </span>
</template>

<style scoped>
.hl__mark {
  padding: 0 1px;
  background: #ffe58f;
  color: inherit;
  border-radius: 2px;
}
</style>

/**
 * 提交信息规范（规范 2.2.1（四）4：Husky + Commitlint，提交前自动检查）。
 * 允许的类型：feat / fix / docs / style / refactor / perf / test / build / ci / chore / revert
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
}

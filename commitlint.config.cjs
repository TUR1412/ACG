module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // 允许中文/多语言 subject，避免因大小写规则导致不必要的阻塞。
    "subject-case": [0]
  }
};

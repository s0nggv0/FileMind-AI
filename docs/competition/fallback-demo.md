# 演示故障备用流程

预先保存专用 Demo 的已处理资料、原图和校验备份；现场始终显示真实模式和当前错误。已有来源可以展示，历史答案需说明其生成时间。Mock 是明确标记的本地模拟，不能作为真实 AI、Embedding、Vision 或事实质量证据。

| 故障 | 可继续的操作 | 对观众的说明 |
| --- | --- | --- |
| Kimi 超时/503/schema 失败 | 保留 Search 检索段落，展开原文；服务恢复后 Retry | 这次回答不可用，尚未发布通过校验的答案。 |
| DashScope 不可用 | Find 关键词检索已提取 chunks，查看原文；语义索引恢复后重建 | 当前使用关键词来源，语义检索不可用。 |
| Vision 不可用、OCR 成功 | 显示原图和 OCR 文字、Vision unavailable 标签 | 当前只有文字提取，不能声称理解了图形。 |
| OCR 不可用、Vision 成功 | 展示原图和标明 AI interpretation 的现有解释 | 不是准确文字转录；应核对原图。 |
| Vision 与 OCR 均失败 | 保留图片原文件并说明没有可索引内容 | 不展示伪造的图像知识。 |
| PostgreSQL 不可用 | 展示清晰错误/Retry，检查本地启动器与专用实例；使用静态 fixture 和验收报告解释 | 持久数据暂不可访问，不能宣称 Save/Apply/Import 成功。 |
| 原文件缺失 | 显示 Original file unavailable 和仍保留的提取文字；Maintenance 检查 | 原文链接不可用，已保存知识仍可查看。 |
| Agent 超时或 plan_validation fallback | 使用实际 fallback 提案进入 Review，解释诊断；或打开预先处理 Demo | 人工确认仍必需；fallback 不是 LLM 计划成功。 |
| 索引中断 | 未改动资料的旧 ready 索引继续使用，重试构建 | 新构建尚未发布；资料真实变化后不能使用旧索引冒充新版本。 |

不反复修改 Provider 配置或数据库权限“碰运气”。现场先检查 `demo:check` 的失败项和本地诊断；端口检查需要目标端口空闲。已发布 preflight receipt 来自验收机器，不代表现场刚刚成功。

重新准备 Demo：等待索引结束 → 确认当前专用 Demo 身份 → Settings Reset → 第二次确认 → 重新上传。取消确认不产生变化；服务器拒绝普通身份、错误 workspace 和活动索引期间的 Reset。不能为了彩排删除普通用户库，也不能自动清理隔离文件。

[失败矩阵](../evaluation/phase8-provider-failure-matrix.md) 区分本地注入的云错误、真实本地 OCR、真实 PostgreSQL 拒连与实际进程中断；不宣称故意让第三方线上服务发生故障。

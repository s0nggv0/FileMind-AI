# ADR-007: 图像原文、OCR 与 Vision 分开呈现

Status: accepted; Phase 6 决策，Phase 8 补记。

OCR 可能误读文字，Vision 可能误解图形。保留原图，独立运行本地 OCR 与真实 Vision，并分别存储状态、版本、hash、缓存键和结果。合并检索文本明确区分 extracted text 与 AI interpretation，citation/source drawer 可回到原图核对。

Vision 失败可以使用成功 OCR；OCR 失败只保留带标记的图像解释；两者失败则明确 NO_CONTENT，不宣称完成索引。图片不能获得虚构 PDF 页号、文本行号或精确框定位。自动扫描 PDF OCR fallback 不在本阶段实现，手写和公式识别仍有限。详见 [多模态说明](../architecture/multimodal.md) 和 [失败矩阵](../evaluation/phase8-provider-failure-matrix.md)。

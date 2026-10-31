"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

// Original illustrative passages. Never presented as a live model response.
const passages = [
  { name: "注意力课程笔记.txt", text: "Query 表示当前要查找的信息，Key 用于计算匹配程度，Value 承载参与组合的内容。" },
  { name: "注意力复习卡片.md", text: "注意力权重由 Query 与 Key 的匹配结果得到，再用这些权重对 Value 加权组合。" },
];

export function CitationDemo() {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <section id="citation-demo" aria-labelledby="citation-demo-title" className="marketing-width scroll-mt-24 pb-14">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="citation-demo-title" className="text-xl font-medium sm:text-2xl">答案有出处，点击就能核对</h2>
        <p className="text-xs text-muted-foreground">预设交互示例 · 原创示例文字 · 未调用模型</p>
      </div>
      <div className="grid overflow-hidden rounded-xl border bg-card md:grid-cols-2">
        <div className="p-6 sm:p-8">
          <h3 className="text-base font-medium">Query、Key、Value 如何配合？</h3>
          <div className="mt-5 space-y-4 text-sm leading-7">
            {passages.map((source, index) => (
              <p key={source.name}>{source.text} <button type="button" onClick={() => setSelected(index)} aria-label={`查看示例引用 ${index + 1}`} aria-pressed={selected === index} aria-controls="citation-demo-source" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-primary/10 px-2 font-medium text-primary hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">[{index + 1}]</button></p>
            ))}
          </div>
        </div>
        <div id="citation-demo-source" role="region" aria-label="示例来源摘录" aria-live="polite" className="border-t bg-muted/30 p-6 sm:p-8 md:border-l md:border-t-0">
          {selected === null ? <div className="flex h-full min-h-36 flex-col justify-center"><FileText className="mb-4 size-5 text-primary" /><p className="text-base font-medium">试着点击回答中的 [1] 或 [2]</p><p className="mt-3 text-sm leading-7 text-muted-foreground">这里将显示对应的示例来源。使用自己的资料时，可继续查看上下文、提取全文和原文件。</p></div> : <><h3 className="break-words text-sm font-medium">{passages[selected].name}</h3><p className="mt-3 text-xs text-muted-foreground">示例来源摘录</p><blockquote className="mt-5 text-base leading-8"><mark className="bg-primary/10 text-foreground">{passages[selected].text}</mark></blockquote><p className="mt-5 text-sm leading-7 text-muted-foreground">核对出处后，再判断答案是否适用于你的问题。</p></>}
        </div>
      </div>
    </section>
  );
}

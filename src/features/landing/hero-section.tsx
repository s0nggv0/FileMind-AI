import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HeroSection({ formats }: { formats: string[] }) {
  return (
    <section className="marketing-width pb-10 pt-14 text-center sm:pb-12 sm:pt-20">
      <h1 className="mx-auto max-w-5xl text-[clamp(2.25rem,4.8vw,4rem)] font-medium leading-[1.15] tracking-[-0.03em]">
        从资料中找到答案，<br className="hidden sm:block" /> <span className="text-primary">回到原文核对。</span>
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-base leading-7 sm:text-lg">导入课件、笔记和图片，审阅整理建议，再向这批资料提问。</p>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">回答中的引用带你查看原文。资料有分歧时保留双方来源，依据不足时明确说明。</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg"><Link href="/workspace">开始整理 <ArrowRight /></Link></Button>
        <Button asChild size="lg" variant="outline"><a href="#citation-demo">体验引用核对 <ArrowDown /></a></Button>
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground" aria-label="支持的文件格式">
        {formats.map((format) => <span key={format} className="font-mono">{format}</span>)}
      </div>
    </section>
  );
}

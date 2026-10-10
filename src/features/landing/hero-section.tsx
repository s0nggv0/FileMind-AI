import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HeroSection({ formats }: { formats: string[] }) {
  return (
    <section className="marketing-width pb-10 pt-14 text-center sm:pb-12 sm:pt-20">
      <h1 className="mx-auto max-w-5xl text-[clamp(2.25rem,4.8vw,4rem)] font-medium leading-[1.1] tracking-[-0.045em]">

        整理散落的资料，<br className="hidden sm:block" /> <span className="text-primary">连接已有的知识。</span>
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-base leading-7 sm:text-lg">让散乱的文件，成为可以搜索、理解和关联的个人知识空间。</p>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">AI 整理助手分析资料，提出分类与关联建议。<br className="hidden sm:block" />  从已有文件出发，建立可搜索、可核对的知识空间。</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg"><Link href="/workspace">开始整理 <ArrowRight /></Link></Button>
        <Button asChild size="lg" variant="outline"><a href="#product">查看演示 <ArrowDown /></a></Button>
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground" aria-label="支持的文件格式">
        {formats.map((format) => <span key={format} className="font-mono">{format}</span>)}
      </div>
    </section>
  );
}

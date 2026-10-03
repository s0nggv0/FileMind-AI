"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
type Operation = {id:string;type:string;status:string;stage:string;errorCode:string|null;updatedAt:string};
type Report = {referenced:number;orphan:number;missing:number;notStored:number;unsafe:number};
export function StorageMaintenance() {
  const [operations,setOperations]=useState<Operation[]>([]),[persistent,setPersistent]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[report,setReport]=useState<Report|null>(null);
  async function refresh(signal?:AbortSignal) {
    const response=await fetch("/api/maintenance",{signal}),data=await response.json();
    if(!response.ok)throw new Error(data.error || "维护状态暂时不可用。");
    if(!signal?.aborted){setPersistent(data.persistent);setOperations(data.operations);}
    return data;
  }
  useEffect(()=>{const abort=new AbortController();void fetch("/api/maintenance",{signal:abort.signal}).then(async response=>{if(!response.ok)throw new Error("维护状态暂时不可用。");return response.json();}).then(data=>{if(!abort.signal.aborted){setPersistent(data.persistent);setOperations(data.operations);}}).catch(()=>{if(!abort.signal.aborted)setError("维护状态暂时不可用，请重试。");}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[]);
  async function check() {
    setBusy(true);setError("");
    try {const state=await refresh();if(!state.persistent)return;const response=await fetch("/api/maintenance",{method:"POST"}),data=await response.json();if(!response.ok)throw new Error(data.error || "存储检查中断，请重试。");setReport(data);await refresh();}
    catch(e){setError(e instanceof Error?e.message:"存储检查暂时不可用。");}finally{setBusy(false);}
  }
  return <section className="space-y-4 border-t border-border pt-7" aria-busy={busy||loading}><div><h2 className="text-sm font-semibold">Storage &amp; Maintenance</h2><p className="mt-2 max-w-prose text-sm leading-7 text-muted-foreground">核对当前身份的原文件。孤立文件先移入私有隔离区并保留记录；原文件缺失时，已保存的提取文本仍可搜索。</p></div>{loading?<p role="status" className="text-sm text-muted-foreground">正在读取维护状态…</p>:<p className="text-sm text-muted-foreground">{persistent?"已连接持久化存储。中断操作会按日志安全恢复。":"请先配置持久化存储。"}</p>}<Button size="sm" variant="outline" disabled={busy||loading||!persistent&&!error} onClick={()=>void check()}>{busy?"正在核对…":error?"重试存储检查":"检查私有存储"}</Button>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{report&&<p role="status" className="text-sm leading-7">检查完成：{report.referenced} 份原文件可用，{report.missing} 份原文件缺失，{report.notStored} 份仅保存提取内容。{report.orphan} 个孤立文件已隔离。{report.unsafe>0&&"检测到不安全路径，未跟随该路径。"}</p>}{operations.some(o=>o.status==="interrupted")&&<p role="status" className="text-sm leading-7 text-muted-foreground">检测到中断操作。已完成安全修复的文件会保留在隔离区；失败的索引可在 Library 中重新建立。</p>}</section>;
}

"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/features/workspace/store/workspace-store";
type State={enabled:boolean;active?:boolean;workspaceId?:string|null};
export function DemoWorkspace() {
  const router=useRouter();
  const [state,setState]=useState<State>({enabled:false}),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[error,setError]=useState("");
  useEffect(()=>{const controller=new AbortController();void fetch("/api/demo",{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>{if(!controller.signal.aborted)setState(data);}).catch(()=>{});return()=>controller.abort();},[]);
  async function act(action:"open"|"reset") {
    setBusy(true);setError("");
    try {const r=await fetch("/api/demo",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(action==="open"?{action}:{action,workspaceId:state.workspaceId,confirm:"RESET_DEMO_WORKSPACE"})}),data=await r.json();if(!r.ok)throw new Error(data.error||"演示工作区暂时不可用，请重试。");useWorkspaceStore.getState().reset();router.push(`/workspace?workspace=${data.workspaceId}`);router.refresh();}
    catch(e){setError(e instanceof Error?e.message:"演示操作失败，请重试。");setBusy(false);}
  }
  if(!state.enabled)return null;
  return <section className="space-y-4 border-t border-border pt-7" aria-busy={busy}><div><h2 className="text-sm font-semibold">比赛演示工作区</h2><p className="mt-2 max-w-prose text-sm leading-7 text-muted-foreground">使用 8 份自建混合资料。打开后切换到专用演示身份；请先为当前身份保存恢复密钥。分析沿用当前服务配置，模式显示在工作区。</p></div><div className="flex flex-wrap gap-3"><Button size="sm" disabled={busy} onClick={()=>void act("open")}>{busy?"正在处理…":"打开专用演示工作区"}</Button><a href="/api/demo?download=fixtures" className="inline-flex min-h-9 items-center rounded-md px-3 text-sm text-primary underline underline-offset-4">下载演示资料</a>{state.active&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>setConfirm(true)}>重置演示资料</Button>}</div>{confirm&&<div className="space-y-3 rounded-lg border border-border p-4"><p className="text-sm leading-7">确认清空专用演示工作区？演示记录和索引将重置，原文件进入隔离区。其他工作区保留。</p><div className="flex gap-3"><Button size="sm" variant="destructive" disabled={busy} onClick={()=>void act("reset")}>确认重置演示资料</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setConfirm(false)}>取消</Button></div></div>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</section>;
}

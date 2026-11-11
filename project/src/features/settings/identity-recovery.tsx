"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function downloadNote(text: string, name: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function IdentityRecovery() {
  const router = useRouter();
  const [status, setStatus] = useState<{ available: boolean; configured: boolean } | null>(null);
  const [key, setKey] = useState(""); const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/identity", { signal: abort.signal, cache: "no-store" }).then(async r => { const value = await r.json(); if (!r.ok) throw new Error(value.error); return value; }).then(setStatus).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, []);
  async function act(action: "create" | "rotate" | "recover") {
    setBusy(true); setError(""); setMessage(""); setKey("");
    try {
      const response = await fetch("/api/identity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...(action === "recover" ? { key: input } : {}) }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error);
      setInput("");
      if (action === "recover") { router.replace("/dashboard"); router.refresh(); return; }
      setKey(value.key); setStatus({ available: true, configured: true });
    } catch (e) { setError(e instanceof Error ? e.message : "身份恢复暂时不可用，请重试。"); }
    finally { setBusy(false); }
  }
  return <section className="border-t pt-7" aria-labelledby="identity-heading">
    <h2 id="identity-heading" className="text-base font-semibold">身份与恢复</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">清除 Cookie 或更换浏览器后，用恢复密钥找回同一 FileMind 数据库里的身份和知识空间。</p>
    <p role="status" className="mt-4 text-sm">{status ? status.configured ? "已配置恢复密钥" : "尚未配置恢复密钥" : "正在检查恢复状态…"}</p>
    {status && !status.available && <p className="mt-2 text-sm text-muted-foreground">请先配置 FileMind 数据库存储，再使用身份恢复。</p>}
    <div className="mt-4 flex flex-wrap gap-3"><Button variant="outline" disabled={busy || !status?.available} onClick={() => void act(status?.configured ? "rotate" : "create")}>{busy && <Loader2 size={15} className="animate-spin" />}{status?.configured ? "更换恢复密钥" : "创建恢复密钥"}</Button></div>
    {status?.configured && <p className="mt-2 text-sm leading-7 text-muted-foreground">重新生成后，旧密钥立即失效。</p>}
    {key && <div className="mt-5 space-y-3 rounded-xl bg-muted p-5"><p className="text-sm font-medium">请妥善保存此密钥。</p><p className="text-sm leading-7 text-muted-foreground">FileMind cannot show this exact key again. 密钥可以访问你的资料，请保存在安全位置。</p><output aria-label="新恢复密钥" className="block break-all rounded-md bg-background p-3 font-mono text-sm leading-7">{key}</output><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(key); setMessage("恢复密钥已复制。"); } catch { setError("复制失败，请下载恢复说明或手动选择密钥复制。"); } }}><Copy size={15} />复制</Button><Button variant="outline" onClick={() => downloadNote(`FileMind Identity Recovery\n\n${key}\n\nKeep this key somewhere safe. FileMind cannot show this exact key again.\nThis key restores identity in the same database. It is not a data backup.\n`, "filemind-recovery-note.txt")}><Download size={15} />下载恢复说明</Button><Button variant="ghost" onClick={() => { setKey(""); setMessage(""); }}>我已保存密钥</Button></div></div>}
    <form onSubmit={e => { e.preventDefault(); void act("recover"); }} className="mt-7 max-w-xl space-y-3"><h3 className="text-sm font-medium">恢复已有 FileMind 身份</h3><label htmlFor="recovery-key" className="block text-sm text-muted-foreground">恢复密钥</label><Input id="recovery-key" type="password" autoComplete="off" spellCheck={false} maxLength={200} value={input} onChange={e => setInput(e.target.value)} placeholder="fm-recovery-v1-…" disabled={busy || !status?.available} /><p className="text-sm leading-7 text-muted-foreground">恢复后会切换到原来的知识空间。密钥恢复身份；迁移资料请使用下方备份。</p><Button type="submit" disabled={busy || !input.trim() || !status?.available}>恢复身份</Button></form>
    {message && <p role="status" className="mt-4 text-sm">{message}</p>}{error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
  </section>;
}

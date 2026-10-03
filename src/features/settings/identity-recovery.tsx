"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, KeyRound, Loader2 } from "lucide-react";
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
    } catch (e) { setError(e instanceof Error ? e.message : "Identity recovery is unavailable. Please retry."); }
    finally { setBusy(false); }
  }
  return <section className="border-t pt-7" aria-labelledby="identity-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="identity-heading" className="text-base font-semibold">Identity &amp; Recovery</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">清除 Cookie 或更换浏览器后，用恢复密钥找回同一 FileMind 数据库里的身份和知识空间。</p></div><KeyRound size={20} className="mt-1 text-muted-foreground" /></div>
    <p role="status" className="mt-4 text-sm">{status ? status.configured ? "Recovery configured" : "Recovery not configured" : "Checking recovery status…"}</p>
    {status && !status.available && <p className="mt-2 text-sm text-muted-foreground">请先配置 FileMind 数据库存储，再使用身份恢复。</p>}
    <div className="mt-4 flex flex-wrap gap-3"><Button variant="outline" disabled={busy || !status?.available} onClick={() => void act(status?.configured ? "rotate" : "create")}>{busy && <Loader2 size={15} className="animate-spin" />}{status?.configured ? "Rotate Recovery Key" : "Create recovery key"}</Button></div>
    {status?.configured && <p className="mt-2 text-sm leading-7 text-muted-foreground">重新生成后，旧密钥立即失效。</p>}
    {key && <div className="mt-5 space-y-3 rounded-xl bg-muted p-5"><p className="text-sm font-medium">Keep this key somewhere safe.</p><p className="text-sm leading-7 text-muted-foreground">FileMind cannot show this exact key again. 密钥可以访问你的资料，请保存在安全位置。</p><output aria-label="New recovery key" className="block break-all rounded-md bg-background p-3 font-mono text-sm leading-7">{key}</output><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(key); setMessage("Recovery key copied."); } catch { setError("Copy failed. Download the recovery note or select the key manually."); } }}><Copy size={15} />Copy</Button><Button variant="outline" onClick={() => downloadNote(`FileMind Identity Recovery\n\n${key}\n\nKeep this key somewhere safe. FileMind cannot show this exact key again.\nThis key restores identity in the same database. It is not a data backup.\n`, "filemind-recovery-note.txt")}><Download size={15} />Download recovery note</Button><Button variant="ghost" onClick={() => { setKey(""); setMessage(""); }}>I saved my key</Button></div></div>}
    <form onSubmit={e => { e.preventDefault(); void act("recover"); }} className="mt-7 max-w-xl space-y-3"><h3 className="text-sm font-medium">Recover existing FileMind identity</h3><label htmlFor="recovery-key" className="block text-sm text-muted-foreground">Recovery Key</label><Input id="recovery-key" type="password" autoComplete="off" spellCheck={false} maxLength={200} value={input} onChange={e => setInput(e.target.value)} placeholder="fm-recovery-v1-…" disabled={busy || !status?.available} /><p className="text-sm leading-7 text-muted-foreground">恢复后会切换到原来的知识空间。密钥恢复身份；迁移资料请使用下方备份。</p><Button type="submit" disabled={busy || !input.trim() || !status?.available}>Recover identity</Button></form>
    {message && <p role="status" className="mt-4 text-sm">{message}</p>}{error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
  </section>;
}

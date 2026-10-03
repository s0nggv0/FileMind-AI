"use client";
export default function GlobalError({retry}:{error:Error & {digest?:string};retry:()=>void}) {
  return <html lang="zh-CN"><body style={{margin:0,fontFamily:"system-ui, sans-serif",background:"#f7f9f8",color:"#132322"}}><main style={{maxWidth:640,margin:"15vh auto",padding:24}}><h1 style={{fontSize:28,lineHeight:1.5}}>FileMind 暂时无法打开</h1><p style={{lineHeight:1.8}}>页面加载中断，请重试。恢复连接后，可以在 Settings 查看操作恢复状态。</p><div style={{display:"flex",flexWrap:"wrap",gap:16,marginTop:24}}><button onClick={retry} style={{minHeight:44,padding:"8px 20px",border:"1px solid #287f7a",borderRadius:8,background:"#287f7a",color:"white",cursor:"pointer"}}>重试加载</button><a href="/dashboard" style={{padding:"12px 16px",color:"#176c67"}}>Dashboard</a></div></main></body></html>;
}

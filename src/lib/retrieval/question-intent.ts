export type QuestionIntent = "multi_source" | "specific";
// Intent controls scope, never the evidence or fact-validation gate. No domain
// values or fixture entities appear here.
export function questionIntent(query: string): QuestionIntent {
  return /比较|对比|对照|分歧|差异|区别|分别|各自|是否一致|是否相同|一致吗|有什么不同|矛盾|汇总|总结|综述|综合|各(?:份|个|项|种|方案)|\b(?:compar(?:e|ison|ing)|contrast|differences?|disagree\w*|summari[sz]e|synthesis|across (?:all|sources)|both)\b/i.test(query) ? "multi_source" : "specific";
}

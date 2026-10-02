// English words and Chinese character bigrams; intentionally not a claim that
// PostgreSQL's default simple dictionary can segment Chinese words.
export function lexicalTokens(text: string): string[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  const tokens: string[] = [...(normalized.match(/[a-z0-9_]+/g) ?? [])];
  for (const run of normalized.match(/\p{Script=Han}+/gu) ?? []) {
    const chars = [...run];
    if (chars.length === 1) tokens.push(run);
    for (let i = 0; i < chars.length - 1; i++) tokens.push(chars[i] + chars[i + 1]);
  }
  const stop = new Set(["the", "a", "an", "is", "in", "of", "to", "and", "for", "what", "which", "my", "我", "我的", "哪些", "资料", "有没有", "关于", "找出"]);
  return [...new Set(tokens.filter(token => !stop.has(token)))].slice(0, 2000);
}

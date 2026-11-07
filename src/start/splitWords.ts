/** 先生が貼った語の並びを、改行・読点・空白で区切って一つずつにする */
export function splitWords(text: string): string[] {
  return [...new Set(text.split(/[\s、,，・]+/).map(w => w.trim()).filter(Boolean))]
}

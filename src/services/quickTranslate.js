/**
 * Dịch nhanh EN→VI (MyMemory, miễn phí). Dùng khi từ không có trong bộ từ của app.
 */
export async function translateEnglishToVietnamese(text) {
  const t = String(text || '').trim();
  if (!t) {
    return '';
  }
  const q = t.length > 450 ? `${t.slice(0, 447)}...` : t;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      q,
    )}&langpair=en|vi`;
    const res = await fetch(url);
    const json = await res.json();
    const out = json?.responseData?.translatedText;
    if (typeof out !== 'string') {
      return '';
    }
    const s = out.trim();
    if (!s || s === q) {
      return '';
    }
    return s;
  } catch {
    return '';
  }
}

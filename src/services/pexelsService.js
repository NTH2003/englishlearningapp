import {AI_SERVER_URL} from '../constants';

const _imageCache = new Map();

function normalizeQuery(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

export async function searchPexelsPhoto(query) {
  const q = normalizeQuery(query);
  if (!q) return '';
  if (_imageCache.has(q)) {
    return _imageCache.get(q) || '';
  }
  try {
    const resp = await fetch(
      `${AI_SERVER_URL}/media/pexels/search?query=${encodeURIComponent(q)}&perPage=1`,
    );
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      _imageCache.set(q, '');
      return '';
    }
    const first = Array.isArray(json?.photos) ? json.photos[0] : null;
    const url =
      String(first?.src?.medium || first?.src?.large || first?.src?.original || '').trim() ||
      '';
    _imageCache.set(q, url);
    return url;
  } catch (_) {
    _imageCache.set(q, '');
    return '';
  }
}


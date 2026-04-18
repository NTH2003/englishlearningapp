export const WORD_TYPES = ['Danh từ', 'Động từ', 'Tính từ', 'Trạng từ', 'Cụm từ', 'Khác'];

export const EMPTY_TOPIC_FORM = {
  name: '',
  description: '',
};

export const EMPTY_WORD_ROW = {
  word: '',
  pronunciation: '',
  meaning: '',
  partOfSpeech: 'Danh từ',
  example: '',
  exampleVi: '',
};

export function buildAutoTopicId(name, topics) {
  const raw = String(name || '').trim().toLowerCase();
  const base =
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'bo-tu-vung';

  const used = new Set((Array.isArray(topics) ? topics : []).map((t) => String(t?.id || '').trim()));
  if (!used.has(base)) return base;

  let i = 2;
  while (used.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

export function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

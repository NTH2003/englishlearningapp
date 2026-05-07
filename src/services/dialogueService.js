import {getDialogueConfig, saveDialogueConfig} from './firebaseService';

let _dialogueCache = [];
let _dialogueTopicsCache = [];

function normalizeTopicId(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();
}

function inferTopicsFromDialogues(dialogues) {
  const map = new Map();
  for (const row of dialogues || []) {
    const id = normalizeTopicId(row?.topicId || row?.topicName || 'general');
    if (!id) continue;
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: String(row?.topicName || row?.topicId || 'Chung').trim() || 'Chung',
        icon: '💬',
        color: row?.accentColor || '#2563EB',
      });
    }
  }
  return [...map.values()];
}

function normalizeDialogueTurn(turn, index) {
  const speaker = String(turn?.speaker || '').trim() || (index % 2 === 0 ? 'A' : 'B');
  const text = String(turn?.text || turn?.line || '').trim();
  if (!text) return null;
  return {
    id: String(turn?.id || `turn_${index}`).trim(),
    speaker,
    text,
    translation: String(turn?.translation || turn?.meaning || '').trim(),
    audioUrl: String(turn?.audioUrl || turn?.audio || '').trim(),
    hint: String(turn?.hint || '').trim(),
  };
}

function normalizeDialogueRow(row, index) {
  const id = String(row?.id || `dialogue_${Date.now()}_${index}`).trim();
  const topicId = normalizeTopicId(row?.topicId || 'general');
  const turns = (Array.isArray(row?.turns) ? row.turns : [])
    .map(normalizeDialogueTurn)
    .filter(Boolean);
  const suggestions = Array.isArray(row?.suggestions) ? row.suggestions : [];
  return {
    ...row,
    id,
    topicId,
    title: String(row?.title || 'Hội thoại mới').trim() || 'Hội thoại mới',
    description: String(row?.description || '').trim(),
    topicName: String(row?.topicName || row?.topicId || 'Chung').trim() || 'Chung',
    icon: String(row?.icon || '💬').trim() || '💬',
    accentColor: String(row?.accentColor || '#2563EB').trim() || '#2563EB',
    turns,
    suggestions,
  };
}

function normalizeTopicRow(row, fallbackName = 'Chung') {
  const id = normalizeTopicId(row?.id || row?.name || fallbackName);
  if (!id) return null;
  return {
    id,
    name: String(row?.name || fallbackName).trim() || fallbackName,
    icon: String(row?.icon || '💬').trim() || '💬',
    color: String(row?.color || '#2563EB').trim() || '#2563EB',
  };
}

export function getAllDialogues() {
  return _dialogueCache;
}

export function getAllDialogueTopics() {
  if (_dialogueTopicsCache.length > 0) {
    return _dialogueTopicsCache;
  }
  return inferTopicsFromDialogues(_dialogueCache);
}

export function getDialogueById(id) {
  const sid = String(id || '').trim();
  return _dialogueCache.find((x) => String(x.id) === sid) || null;
}

export function getDialoguePracticeTurns(id) {
  const row = getDialogueById(id);
  if (!row) return [];
  return Array.isArray(row.turns) ? row.turns : [];
}

export async function loadDialoguesFromFirebase(options = {}) {
  try {
    const cfg = await getDialogueConfig(options);
    const serverDialogues = Array.isArray(cfg?.dialogues) ? cfg.dialogues : null;
    const serverTopics = Array.isArray(cfg?.topics) ? cfg.topics : null;
    if (!serverDialogues || serverDialogues.length === 0) {
      // Tránh xóa cache khi lần đọc tạm thời rỗng (auth/network chậm).
      if (_dialogueCache.length > 0) {
        return _dialogueCache;
      }
      _dialogueCache = [];
      _dialogueTopicsCache = [];
      return _dialogueCache;
    }
    _dialogueCache = serverDialogues.map(normalizeDialogueRow);
    const normalizedTopics = (serverTopics || [])
      .map((x) => normalizeTopicRow(x))
      .filter(Boolean);
    _dialogueTopicsCache =
      normalizedTopics.length > 0
        ? normalizedTopics
        : inferTopicsFromDialogues(_dialogueCache);
    return _dialogueCache;
  } catch (_) {
    _dialogueCache = [];
    _dialogueTopicsCache = [];
    return _dialogueCache;
  }
}

export async function persistDialogueConfig({topics, dialogues}) {
  const nextDialogues = (Array.isArray(dialogues) ? dialogues : _dialogueCache).map(
    normalizeDialogueRow,
  );
  const nextTopicsRaw =
    Array.isArray(topics) && topics.length > 0 ? topics : inferTopicsFromDialogues(nextDialogues);
  const nextTopics = nextTopicsRaw.map((x) => normalizeTopicRow(x)).filter(Boolean);
  const res = await saveDialogueConfig({
    topics: nextTopics,
    dialogues: nextDialogues,
  });
  if (res?.ok) {
    _dialogueCache = nextDialogues;
    _dialogueTopicsCache = nextTopics;
  }
  return res;
}

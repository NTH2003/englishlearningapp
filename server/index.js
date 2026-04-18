import path from 'path';
import {fileURLToPath} from 'url';
import dotenv from 'dotenv';
import express from 'express';
import {
  YoutubeTranscript,
} from 'youtube-transcript/dist/youtube-transcript.esm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({path: path.join(__dirname, '.env')});
import cors from 'cors';
import {GoogleGenerativeAI} from '@google/generative-ai';

const app = express();
app.use(cors());
app.use(express.json({limit: '1mb'}));

const port = Number(process.env.PORT) || 3001;
const apiKey = process.env.GEMINI_API_KEY;
const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

if (!apiKey) {
  console.warn(
    '[ai-server] Missing GEMINI_API_KEY. Copy .env.example to .env and set your key.',
  );
}

const genAI = new GoogleGenerativeAI(apiKey || '');

function safeString(x, max = 2000) {
  return String(x ?? '').slice(0, max);
}

function extractJsonObject(text) {
  const s = String(text || '').trim();
  // Remove common Markdown fences
  const unfenced = s
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const first = unfenced.indexOf('{');
  const last = unfenced.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return unfenced.slice(first, last + 1);
  }
  return unfenced;
}

let cachedModels = null;
let cachedModelsAt = 0;
async function listModels() {
  const now = Date.now();
  if (cachedModels && now - cachedModelsAt < 10 * 60 * 1000) return cachedModels;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
    apiKey || '',
  )}`;
  const resp = await fetch(url);
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      json?.error?.message || `ListModels failed (${resp.status})`,
    );
  }
  const models = Array.isArray(json?.models) ? json.models : [];
  cachedModels = models;
  cachedModelsAt = now;
  return models;
}

function normalizeModelName(name) {
  const s = String(name || '');
  return s.startsWith('models/') ? s.slice('models/'.length) : s;
}

function formatSecondsToTimestamp(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function normalizeYoutubeUrlForTranscript(rawUrl) {
  const input = safeString(rawUrl, 1500).trim();
  if (!input) return '';
  try {
    const u = new URL(input);
    const host = String(u.hostname || '').toLowerCase();
    const pathParts = String(u.pathname || '')
      .split('/')
      .filter(Boolean);

    if (host.includes('youtu.be') && pathParts[0]) {
      return `https://www.youtube.com/watch?v=${pathParts[0]}`;
    }

    if (host.includes('youtube.com') || host.includes('m.youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/watch?v=${v}`;

      const shortsIdx = pathParts.indexOf('shorts');
      if (shortsIdx >= 0 && pathParts[shortsIdx + 1]) {
        return `https://www.youtube.com/watch?v=${pathParts[shortsIdx + 1]}`;
      }

      const embedIdx = pathParts.indexOf('embed');
      if (embedIdx >= 0 && pathParts[embedIdx + 1]) {
        return `https://www.youtube.com/watch?v=${pathParts[embedIdx + 1]}`;
      }
    }
  } catch (_) {
    return input;
  }
  return input;
}

function normalizeSubtitleTextForDedup(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:'"()\-_[\]{}]/g, '')
    .trim();
}

function normalizeMp4Url(rawUrl) {
  const s = safeString(rawUrl, 1500).trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    if (!/^https?:$/i.test(u.protocol)) return '';
    return u.toString();
  } catch (_) {
    return '';
  }
}

function looksLikeMp4Url(url) {
  return /\.mp4($|[?#])/i.test(String(url || '').trim());
}

function toSubtitleTimeFromSeconds(secondsFloat) {
  const sec = Math.max(0, Math.floor(Number(secondsFloat) || 0));
  return formatSecondsToTimestamp(sec);
}

function cleanLineForExplain(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 220);
}

function normalizePartOfSpeechVi(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'phrase';
  if (s.includes('noun') || s.includes('danh')) return 'noun';
  if (s.includes('verb') || s.includes('động')) return 'verb';
  if (s.includes('adjective') || s.includes('tính')) return 'adjective';
  if (s.includes('adverb') || s.includes('trạng')) return 'adverb';
  if (s.includes('pronoun') || s.includes('đại')) return 'pronoun';
  if (s.includes('preposition') || s.includes('giới')) return 'preposition';
  if (s.includes('conjunction') || s.includes('liên')) return 'conjunction';
  if (s.includes('interjection') || s.includes('thán')) return 'interjection';
  if (s.includes('phrase') || s.includes('cụm') || s.includes('sentence') || s.includes('câu')) {
    return 'phrase';
  }
  return 'phrase';
}

async function pickModelName() {
  const models = await listModels();
  const candidates = models
    .filter((m) =>
      Array.isArray(m?.supportedGenerationMethods)
        ? m.supportedGenerationMethods.includes('generateContent')
        : false,
    )
    .map((m) => normalizeModelName(m?.name));

  const preferredOrder = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro',
    'gemini-1.0-pro',
  ];

  for (const p of preferredOrder) {
    const found = candidates.find((c) => c === p || c.startsWith(`${p}-`));
    if (found) return found;
  }
  return candidates[0] || null;
}

async function pickModelCandidates() {
  const models = await listModels();
  const candidates = models
    .filter((m) =>
      Array.isArray(m?.supportedGenerationMethods)
        ? m.supportedGenerationMethods.includes('generateContent')
        : false,
    )
    .map((m) => normalizeModelName(m?.name));
  const preferredOrder = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro',
    'gemini-1.0-pro',
  ];
  const ordered = [];
  for (const p of preferredOrder) {
    const found = candidates.find((c) => c === p || c.startsWith(`${p}-`));
    if (found && !ordered.includes(found)) {
      ordered.push(found);
    }
  }
  for (const c of candidates) {
    if (!ordered.includes(c)) ordered.push(c);
  }
  return ordered;
}

app.get('/health', (_req, res) => {
  res.json({ok: true});
});

/**
 * POST /video/subtitles/auto
 * body: { videoUrl: string, lang?: string }
 * returns: { subtitles: [{time, text}], source: 'youtube' }
 */
app.post('/video/subtitles/auto', async (req, res) => {
  try {
    const videoUrl = safeString(req.body?.videoUrl, 1000).trim();
    const lang = safeString(req.body?.lang, 10).trim() || 'en';
    if (!videoUrl) {
      return res.status(400).json({error: 'Missing videoUrl'});
    }
    const lower = videoUrl.toLowerCase();
    const isYoutube =
      lower.includes('youtube.com/watch') ||
      lower.includes('youtube.com/shorts/') ||
      lower.includes('m.youtube.com/shorts/') ||
      lower.includes('youtu.be/') ||
      lower.includes('youtube.com/embed') ||
      lower.includes('m.youtube.com/');
    if (!isYoutube) {
      return res.status(400).json({
        error: 'Auto subtitle currently supports YouTube URL only.',
      });
    }

    if (!YoutubeTranscript?.fetchTranscript) {
      throw new Error('youtube-transcript package is not available.');
    }
    const normalizedVideoUrl = normalizeYoutubeUrlForTranscript(videoUrl);
    const transcript = await YoutubeTranscript.fetchTranscript(normalizedVideoUrl, {lang});
    const seen = new Set();
    const subtitles = Array.isArray(transcript)
      ? transcript
          .map((item) => {
            const text = safeString(item?.text, 500).replace(/\s+/g, ' ').trim();
            const dedupKey = normalizeSubtitleTextForDedup(text);
            const offsetSec =
              Number.isFinite(item?.offset)
                ? Number(item.offset) / 1000
                : Number.isFinite(item?.start)
                  ? Number(item.start)
                  : 0;
            if (!text || !dedupKey) return null;
            if (seen.has(dedupKey)) return null;
            seen.add(dedupKey);
            return {
              time: formatSecondsToTimestamp(offsetSec),
              text,
            };
          })
          .filter(Boolean)
      : [];

    if (!subtitles.length) {
      return res
        .status(404)
        .json({error: 'No transcript found for this YouTube video.'});
    }

    return res.json({subtitles, source: 'youtube'});
  } catch (e) {
    return res.status(500).json({
      error: e?.message || 'Cannot auto-generate subtitles.',
    });
  }
});

/**
 * POST /video/subtitles/mp4-auto
 * body: { videoUrl: string, lang?: string }
 * returns: { subtitles: [{time, text}], source: 'deepgram' }
 */
app.post('/video/subtitles/mp4-auto', async (req, res) => {
  try {
    if (!deepgramApiKey) {
      return res.status(500).json({
        error:
          'Server missing DEEPGRAM_API_KEY. Add it to server/.env to auto-generate subtitles for MP4.',
      });
    }

    const inputUrl = safeString(req.body?.videoUrl, 1200).trim();
    const lang = safeString(req.body?.lang, 12).trim() || 'en';
    const videoUrl = normalizeMp4Url(inputUrl);

    if (!videoUrl) {
      return res.status(400).json({error: 'Invalid videoUrl. Require http/https URL.'});
    }
    if (!looksLikeMp4Url(videoUrl)) {
      return res
        .status(400)
        .json({error: 'Only .mp4 URL is supported for mp4-auto subtitles.'});
    }

    const dgResp = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&utterances=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${deepgramApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: videoUrl,
          language: lang,
        }),
      },
    );
    const dgJson = await dgResp.json().catch(() => ({}));
    if (!dgResp.ok) {
      return res.status(500).json({
        error:
          dgJson?.err_msg ||
          dgJson?.error ||
          `Deepgram transcription failed (${dgResp.status})`,
      });
    }

    const utterances = Array.isArray(dgJson?.results?.utterances)
      ? dgJson.results.utterances
      : [];
    const fallbackText =
      dgJson?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

    const seen = new Set();
    const subtitles = utterances
      .map((u) => {
        const text = safeString(u?.transcript, 500).replace(/\s+/g, ' ').trim();
        const dedupKey = normalizeSubtitleTextForDedup(text);
        if (!text || !dedupKey) return null;
        if (seen.has(dedupKey)) return null;
        seen.add(dedupKey);
        return {
          time: toSubtitleTimeFromSeconds(u?.start),
          text,
        };
      })
      .filter(Boolean);

    if (!subtitles.length) {
      if (String(fallbackText).trim()) {
        return res.json({
          subtitles: [{time: '00:00', text: safeString(fallbackText, 1200).trim()}],
          source: 'deepgram',
        });
      }
      return res.status(404).json({
        error: 'Deepgram returned no transcript for this MP4 URL.',
      });
    }

    return res.json({subtitles, source: 'deepgram'});
  } catch (e) {
    return res.status(500).json({
      error: e?.message || 'Cannot auto-generate subtitles for MP4.',
    });
  }
});

/**
 * POST /video/subtitles/enrich
 * body: { lines: string[] }
 * returns: { items: [{ text, meaning, pronunciation, partOfSpeechVi }] }
 */
app.post('/video/subtitles/enrich', async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({error: 'Server missing GEMINI_API_KEY'});
    }
    const rawLines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    const seen = new Set();
    const lines = rawLines
      .map((x) => cleanLineForExplain(x))
      .filter((x) => {
        if (!x) return false;
        const k = x.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 120);
    if (!lines.length) {
      return res.status(400).json({error: 'Missing lines'});
    }

    const prompt = `
Bạn là trợ lý ngôn ngữ cho app học tiếng Anh.
Nhiệm vụ: với mỗi dòng tiếng Anh trong danh sách, trả về:
- meaning: nghĩa tiếng Việt tự nhiên, ngắn gọn
- pronunciation: phiên âm gần đúng kiểu IPA đơn giản (vd: /həˈloʊ/)
- partOfSpeechVi: part of speech in ENGLISH (prefer: noun, verb, adjective, adverb, pronoun, preposition, conjunction, interjection, phrase)

Quy tắc:
- Giữ nguyên số lượng phần tử và đúng thứ tự đầu vào.
- Không thêm giải thích ngoài JSON.
- Do not return sentence labels like "question/sentence"; use "phrase" when unsure.

Input lines:
${JSON.stringify(lines)}

Trả về JSON:
{"items":[{"text":"...","meaning":"...","pronunciation":"...","partOfSpeechVi":"..."}]}
`.trim();

    const modelCandidates = await pickModelCandidates();
    if (!modelCandidates.length) {
      throw new Error('No Gemini model available for generateContent.');
    }
    let result = null;
    let lastErr = null;
    for (const modelName of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {temperature: 0.2},
        });
        result = await model.generateContent(prompt);
        if (result) break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!result) {
      const rawMsg = String(lastErr?.message || '');
      if (/503|unavailable|high demand|overloaded/i.test(rawMsg)) {
        throw new Error(
          'AI đang quá tải tạm thời. Vui lòng thử lại sau 30-60 giây.',
        );
      }
      throw new Error(rawMsg || 'Cannot enrich subtitle lines.');
    }
    const raw = result?.response?.text?.() || '{}';
    let parsed = {};
    try {
      parsed = JSON.parse(extractJsonObject(raw));
    } catch (_) {
      parsed = {};
    }
    const itemsRaw = Array.isArray(parsed?.items) ? parsed.items : [];
    const items = lines.map((text, idx) => {
      const row = itemsRaw[idx] || {};
      return {
        text,
        meaning: safeString(row?.meaning, 250).trim() || text,
        pronunciation: safeString(row?.pronunciation, 120).trim(),
        partOfSpeechVi: normalizePartOfSpeechVi(row?.partOfSpeechVi),
      };
    });
    return res.json({items});
  } catch (e) {
    return res.status(500).json({
      error: e?.message || 'Cannot enrich subtitle lines.',
    });
  }
});

/**
 * POST /dialogue/chat
 * body: { scenario: {title, goal, situation}, messages: [{from:'me'|'other', text}], locale?: 'vi' }
 * returns: { replyText, done?: boolean }
 */
app.post('/dialogue/chat', async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({error: 'Server missing GEMINI_API_KEY'});
    }

    const scenario = req.body?.scenario || {};
    const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const locale = req.body?.locale === 'vi' ? 'vi' : 'vi';

    const prompt = `
You are an English conversation partner inside a mobile app called EasyEng.
Role-play a realistic conversation based on the scenario. Do NOT grade "right/wrong".
Keep the conversation moving naturally and stay in-context.
Be short (1-2 sentences) and friendly.
If the user message is unclear, ask a simple follow-up question.
Use English for the role-play message.
Additionally, provide a brief Vietnamese translation after the English, separated by " | ".
When the conversation is naturally finished, set done=true.

Scenario:
- Title: ${safeString(scenario.title, 200)}
- Goal: ${safeString(scenario.goal, 400)}
- Situation: ${safeString(scenario.situation, 600)}

Conversation so far (latest last):
${history
  .slice(-20)
  .map((m) => `${m?.from === 'me' ? 'User' : 'Partner'}: ${safeString(m?.text, 300)}`)
  .join('\n')}

Return ONLY valid JSON:
{"replyText": string, "done": boolean}
`.trim();

    const modelName = await pickModelName();
    if (!modelName) {
      throw new Error(
        'No Gemini model available for generateContent. Check your API key/project.',
      );
    }

    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.7,
      },
    });

    const result = await model.generateContent(prompt);
    const raw = result?.response?.text?.() || '{}';
    let parsed = null;
    try {
      parsed = JSON.parse(extractJsonObject(raw));
    } catch (_) {
      parsed = {replyText: String(raw), done: false};
    }

    const replyText = safeString(parsed?.replyText, 2000);
    const done = Boolean(parsed?.done);

    return res.json({replyText, done, locale});
  } catch (e) {
    return res.status(500).json({error: e?.message || 'AI server error'});
  }
});

/**
 * POST /dialogue/suggestions
 * body: { scenario: {title, goal, situation}, messages: [{from:'me'|'other', text}] }
 * returns: { suggestions: string[] }
 */
app.post('/dialogue/suggestions', async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({error: 'Server missing GEMINI_API_KEY'});
    }

    const scenario = req.body?.scenario || {};
    const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const latestPartner = [...history]
      .reverse()
      .find((m) => m?.from === 'other' && String(m?.text || '').trim().length > 0);

    const prompt = `
You are helping users practice English conversation in a mobile app.
Generate suggested replies for the USER that directly answer ONLY the latest partner message.
Rules:
- Return exactly 3 suggestions in English.
- Each suggestion is one short, natural sentence (8-16 words).
- Suggestions MUST be specific to the latest partner question, not generic.
- Avoid repeating earlier canned self-introduction lines unless latest question asks for it.
- Use first-person voice ("I ...") where appropriate.
- Keep tone friendly and realistic for conversation practice.
- No numbering, no extra explanations.

Scenario:
- Title: ${safeString(scenario.title, 200)}
- Goal: ${safeString(scenario.goal, 400)}
- Situation: ${safeString(scenario.situation, 600)}

Latest partner message (MUST answer this):
${safeString(latestPartner?.text, 500)}

Recent conversation (latest last):
${history
  .slice(-12)
  .map((m) => `${m?.from === 'me' ? 'User' : 'Partner'}: ${safeString(m?.text, 220)}`)
  .join('\n')}

Return ONLY valid JSON:
{"suggestions": ["...", "...", "..."]}
`.trim();

    const modelName = await pickModelName();
    if (!modelName) {
      throw new Error(
        'No Gemini model available for generateContent. Check your API key/project.',
      );
    }

    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.65,
      },
    });

    const result = await model.generateContent(prompt);
    const raw = result?.response?.text?.() || '{}';
    let parsed = null;
    try {
      parsed = JSON.parse(extractJsonObject(raw));
    } catch (_) {
      parsed = {};
    }

    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions
          .map((s) => safeString(s, 140).trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];

    return res.json({suggestions});
  } catch (e) {
    return res.status(500).json({error: e?.message || 'AI server error'});
  }
});

/**
 * POST /dialogue/translate
 * body: { text: string }
 * returns: { translation: string }
 */
app.post('/dialogue/translate', async (req, res) => {
  try {
    if (!apiKey) {
      return res.status(500).json({error: 'Server missing GEMINI_API_KEY'});
    }
    const text = safeString(req.body?.text, 1200).trim();
    if (!text) {
      return res.status(400).json({error: 'Missing text'});
    }

    const prompt = `
Translate the English sentence below into natural Vietnamese.
Rules:
- Return ONLY the Vietnamese translation text.
- Do not explain.
- Do not add quotes.
- Keep meaning faithful and concise.

Sentence:
${text}
`.trim();

    const modelName = await pickModelName();
    if (!modelName) {
      throw new Error(
        'No Gemini model available for generateContent. Check your API key/project.',
      );
    }
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {temperature: 0.1},
    });
    const result = await model.generateContent(prompt);
    const raw = safeString(result?.response?.text?.(), 2000).trim();
    const translation = raw
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^dịch[:\-\s]*/i, '')
      .replace(/^bản dịch[:\-\s]*/i, '')
      .trim();
    return res.json({translation});
  } catch (e) {
    return res.status(500).json({error: e?.message || 'AI server error'});
  }
});

app.listen(port, () => {
  console.log(`[ai-server] listening on :${port}`);
});


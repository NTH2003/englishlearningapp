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

const app = express();
app.use(cors());
app.use(express.json({limit: '1mb'}));

const port = Number(process.env.PORT) || 3001;
const openaiApiKey = String(process.env.OPENAI_API_KEY || '').trim();
const openaiModel = String(process.env.OPENAI_MODEL || '').trim() || 'gpt-4o-mini';
const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
const pexelsApiKey = String(process.env.PEXELS_API_KEY || '').trim();
const ollamaBaseUrl =
  String(process.env.OLLAMA_BASE_URL || '').trim() || 'http://127.0.0.1:11434';
const ollamaModel =
  String(process.env.OLLAMA_MODEL || '').trim() || 'llama3.1:8b';
if (!openaiApiKey) {
  console.warn(
    '[ai-server] Missing OPENAI_API_KEY. AI endpoints will fallback to Ollama.',
  );
}

function safeString(x, max = 2000) {
  return String(x ?? '').slice(0, max);
}

async function callOllamaJson(prompt) {
  const url = `${ollamaBaseUrl.replace(/\/+$/, '')}/api/chat`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      model: ollamaModel,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'You are an English conversation partner for learners in a mobile app. ' +
            'Return ONLY valid JSON. No markdown. No explanations.',
        },
        {role: 'user', content: prompt},
      ],
      options: {temperature: 0.6, num_predict: 140},
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      json?.error ||
        `Ollama error (${resp.status}). Is Ollama running at ${ollamaBaseUrl}?`,
    );
  }
  const raw = json?.message?.content || '{}';
  try {
    return JSON.parse(extractJsonObject(raw));
  } catch (_) {
    return {replyText: String(raw), done: false};
  }
}

async function callOpenAIJson(prompt, options = {}) {
  if (!openaiApiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }
  const temperature = Math.max(
    0,
    Math.min(2, Number(options?.temperature ?? 0.7) || 0.7),
  );
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: openaiModel,
      temperature,
      response_format: {type: 'json_object'},
      messages: [
        {
          role: 'system',
          content:
            'You are an English conversation partner for learners in a mobile app. ' +
            'Return ONLY valid JSON. No markdown. No explanations.',
        },
        {role: 'user', content: prompt},
      ],
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      json?.error?.message || `OpenAI error (${resp.status})`,
    );
  }
  const raw = safeString(json?.choices?.[0]?.message?.content || '{}', 6000);
  try {
    return JSON.parse(extractJsonObject(raw));
  } catch (_) {
    return {replyText: raw, done: false};
  }
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

const SUGGESTION_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'for',
  'with',
  'is',
  'are',
  'am',
  'i',
  'you',
  'we',
  'they',
  'he',
  'she',
  'it',
  'my',
  'your',
  'our',
  'their',
  'in',
  'on',
  'at',
  'this',
  'that',
  'please',
  'could',
  'would',
  'can',
  'will',
]);

function extractIntentKeywords(text) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !SUGGESTION_STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 8);
}

function looksGenericIntroSuggestion(s) {
  const t = String(s || '').toLowerCase();
  return (
    t.includes('nice to meet you') ||
    t.includes('i am') ||
    t.includes("i'm") ||
    t.includes('my name is')
  );
}

function finalizeSuggestions(rawSuggestions, latestPartnerText) {
  const intents = extractIntentKeywords(latestPartnerText);
  const out = [];
  const normalizedRaw = [];
  for (const s of Array.isArray(rawSuggestions) ? rawSuggestions : []) {
    const line = safeString(s, 140).trim();
    if (!line) continue;
    normalizedRaw.push(line);
    // Loại câu quá generic nếu đối tác đang hỏi thông tin cụ thể.
    if (
      intents.length > 0 &&
      looksGenericIntroSuggestion(line) &&
      !/name/.test(String(latestPartnerText || '').toLowerCase())
    ) {
      continue;
    }
    const low = line.toLowerCase();
    const intentHit =
      intents.length === 0 ? true : intents.some((k) => low.includes(k));
    if (!intentHit && intents.length > 0 && out.length < 2) {
      // Chấp nhận tối đa 1-2 câu chưa hit keyword để vẫn tự nhiên.
      continue;
    }
    out.push(line);
    if (out.length >= 3) break;
  }
  if (out.length === 0 && normalizedRaw.length > 0) {
    return normalizedRaw.slice(0, 3);
  }
  return out.slice(0, 3);
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

app.get('/health', (_req, res) => {
  res.json({ok: true});
});

/**
 * GET /media/pexels/search?query=...&perPage=1
 * returns: { photos: [{ id, url, photographer, src: { medium, large, original } }] }
 */
app.get('/media/pexels/search', async (req, res) => {
  try {
    const query = safeString(req.query?.query, 120).trim();
    const perPage = Math.min(5, Math.max(1, Number(req.query?.perPage) || 1));
    if (!query) {
      return res.status(400).json({error: 'Missing query'});
    }
    if (!pexelsApiKey) {
      return res.status(500).json({error: 'Server missing PEXELS_API_KEY'});
    }
    const url =
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
      `&per_page=${perPage}&orientation=landscape&size=medium`;
    const resp = await fetch(url, {
      headers: {Authorization: pexelsApiKey},
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status).json({
        error: json?.error || `Pexels request failed (${resp.status})`,
      });
    }
    const photos = (Array.isArray(json?.photos) ? json.photos : []).map((p) => ({
      id: p?.id,
      url: p?.url,
      photographer: p?.photographer,
      src: {
        medium: p?.src?.medium || '',
        large: p?.src?.large || '',
        original: p?.src?.original || '',
      },
    }));
    return res.json({photos});
  } catch (e) {
    return res.status(500).json({error: e?.message || 'Pexels proxy error'});
  }
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
Nhiệm vụ: với mỗi mục trong danh sách (mỗi mục là một từ hoặc cụm từ ngắn tiếng Anh, không phải cả câu), trả về:
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

    let aiParsed = null;
    if (openaiApiKey) {
      try {
        aiParsed = await callOpenAIJson(prompt, {temperature: 0.2});
      } catch (e) {
        console.warn('[video/subtitles/enrich] OpenAI failed, fallback to Ollama:', e?.message);
      }
    }
    if (!aiParsed) {
      aiParsed = await callOllamaJson(prompt);
    }
    const raw = JSON.stringify(aiParsed || {});
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
  .slice(-10)
  .map((m) => `${m?.from === 'me' ? 'User' : 'Partner'}: ${safeString(m?.text, 300)}`)
  .join('\n')}

Return ONLY valid JSON:
{"replyText": string, "done": boolean}
`.trim();

    let parsed = null;
    // 1) Prefer OpenAI for dialogue chat.
    if (openaiApiKey) {
      try {
        parsed = await callOpenAIJson(prompt);
      } catch (e) {
        console.warn('[dialogue/chat] OpenAI failed, fallback to Ollama:', e?.message);
      }
    }
    // 2) Fallback to Ollama (local) when OpenAI is missing/failed.
    if (!parsed) {
      parsed = await callOllamaJson(prompt);
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
    const scenario = req.body?.scenario || {};
    const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const latestPartner = [...history]
      .reverse()
      .find((m) => m?.from === 'other' && String(m?.text || '').trim().length > 0);

    const prompt = `
Create 3 short English replies for the USER.
Rules:
- Directly answer the latest partner message.
- Natural conversation style, first-person when needed.
- 8-14 words each.
- Return ONLY JSON: {"suggestions":["...","...","..."]}

Scenario title: ${safeString(scenario.title, 120)}
Goal: ${safeString(scenario.goal, 220)}
Latest partner message: ${safeString(latestPartner?.text, 300)}
`.trim();

    let suggestions = [];

    if (openaiApiKey) {
      try {
        const parsed = await callOpenAIJson(prompt, {temperature: 0.65});
        suggestions = finalizeSuggestions(
          Array.isArray(parsed?.suggestions) ? parsed.suggestions : [],
          latestPartner?.text || '',
        );
      } catch (e) {
        console.warn('[dialogue/suggestions] OpenAI failed, fallback to Ollama:', e?.message);
      }
    }

    if (!suggestions.length) {
      const ollamaParsed = await callOllamaJson(prompt);
      const ollamaSuggestions = Array.isArray(ollamaParsed?.suggestions)
        ? ollamaParsed.suggestions
        : [];
      suggestions = finalizeSuggestions(ollamaSuggestions, latestPartner?.text || '');
      if (!suggestions.length && typeof ollamaParsed?.replyText === 'string') {
        suggestions = finalizeSuggestions([ollamaParsed.replyText], latestPartner?.text || '');
      }
    }

    // Fallback lần 2: yêu cầu Ollama trả về 3 dòng plain-text để tránh rỗng do JSON parse.
    if (!suggestions.length) {
      const plainPrompt = `
Generate exactly 3 short English replies for the user.
Rules:
- Directly answer the partner's latest message.
- One reply per line.
- No numbering, no bullets, no JSON.

Latest partner message:
${safeString(latestPartner?.text, 500)}
      `.trim();
      try {
        const plainParsed = await callOllamaJson(plainPrompt);
        const plainRaw = safeString(
          plainParsed?.replyText || plainParsed?.translation || '',
          2000,
        );
        const lines = plainRaw
          .split('\n')
          .map((x) => String(x || '').trim())
          .filter(Boolean)
          .map((x) => x.replace(/^[-*0-9.)\s]+/, '').trim())
          .filter(Boolean)
          .slice(0, 3);
        suggestions = finalizeSuggestions(lines, latestPartner?.text || '');
      } catch (_) {}
    }

    // Nếu AI chỉ trả 1-2 câu, yêu cầu AI bổ sung cho đủ 3 câu (vẫn 100% AI-generated).
    if (suggestions.length > 0 && suggestions.length < 3) {
      const fillPrompt = `
You are generating conversation suggestions for learners.
Current suggestions:
${suggestions.map((s) => `- ${s}`).join('\n')}

Generate ${3 - suggestions.length} additional suggestions so total becomes 3.
Rules:
- New suggestions must be different from existing ones.
- One suggestion per line, no numbering, no bullets.
- Directly answer the latest partner message.

Latest partner message:
${safeString(latestPartner?.text, 500)}
      `.trim();
      try {
        const fillParsed = await callOllamaJson(fillPrompt);
        const fillRaw = safeString(
          fillParsed?.replyText || fillParsed?.translation || '',
          2000,
        );
        const extra = fillRaw
          .split('\n')
          .map((x) => String(x || '').trim())
          .filter(Boolean)
          .map((x) => x.replace(/^[-*0-9.)\s]+/, '').trim())
          .filter(Boolean);
        const combined = [...suggestions, ...extra];
        suggestions = finalizeSuggestions(combined, latestPartner?.text || '');
      } catch (_) {}
    }

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
    const text = safeString(req.body?.text, 1200).trim();
    if (!text) {
      return res.status(400).json({error: 'Missing text'});
    }

    const prompt = `
Translate the English sentence below into natural Vietnamese.
Rules:
- Return ONLY valid JSON:
{"translation":"..."}
- Keep meaning faithful and concise.

Sentence:
${text}
`.trim();

    let translation = '';
    if (openaiApiKey) {
      try {
        const parsed = await callOpenAIJson(prompt, {temperature: 0.1});
        translation = safeString(parsed?.translation, 1500).trim();
      } catch (e) {
        console.warn('[dialogue/translate] OpenAI failed, fallback to Ollama:', e?.message);
      }
    }

    if (!translation) {
      const parsed = await callOllamaJson(prompt);
      translation =
        safeString(parsed?.translation || parsed?.replyText, 1500)
          .replace(/^["'`]+|["'`]+$/g, '')
          .replace(/^dịch[:\-\s]*/i, '')
          .replace(/^bản dịch[:\-\s]*/i, '')
          .trim() || '';
    }

    return res.json({translation});
  } catch (e) {
    return res.status(500).json({error: e?.message || 'AI server error'});
  }
});

/**
 * POST /dialogue/spellcheck
 * body: { text: string }
 * returns: { correctedText: string, explanationVi: string }
 */
app.post('/dialogue/spellcheck', async (req, res) => {
  try {
    const text = safeString(req.body?.text, 1200).trim();
    if (!text) {
      return res.status(400).json({error: 'Missing text'});
    }

    const prompt = `
You help English learners fix spelling and obvious typing mistakes.
Rules:
- Keep the same meaning, intent, and tone (casual stays casual).
- Fix spelling, capitalization at sentence starts, missing apostrophes, and clear wrong-word typos (their/there/they're, its/it's, etc.).
- Do NOT rewrite style, add ideas, or make the message longer unless needed for correctness.
- correctedText must remain English only (no Vietnamese inside correctedText).
Return ONLY valid JSON:
{"correctedText":"...", "explanationVi":"..."}

explanationVi: one short sentence in Vietnamese summarizing what changed.
If nothing meaningful changed, use correctedText equal to the original and explanationVi like "Không thấy lỗi chính tả cần sửa."

Learner text:
${text}
`.trim();

    let correctedText = '';
    let explanationVi = '';

    if (openaiApiKey) {
      try {
        const parsed = await callOpenAIJson(prompt, {temperature: 0.05});
        correctedText = safeString(parsed?.correctedText, 1200).trim();
        explanationVi = safeString(parsed?.explanationVi, 400).trim();
      } catch (e) {
        console.warn('[dialogue/spellcheck] OpenAI failed, fallback to Ollama:', e?.message);
      }
    }

    if (!correctedText) {
      const parsed = await callOllamaJson(prompt);
      correctedText = safeString(parsed?.correctedText || parsed?.replyText, 1200).trim();
      explanationVi = safeString(parsed?.explanationVi || parsed?.translation, 400).trim();
    }

    if (!correctedText) {
      correctedText = text;
    }
    if (!explanationVi) {
      explanationVi = 'Đã kiểm tra nhanh.';
    }

    return res.json({correctedText, explanationVi});
  } catch (e) {
    return res.status(500).json({error: e?.message || 'AI server error'});
  }
});

app.listen(port, () => {
  console.log(`[ai-server] listening on :${port}`);
});


import {useEffect, useMemo, useRef, useState} from 'react';

/** Emoji gợi ý — giống màn Bộ từ (offline) */
export const CMS_ICON_PRESETS = [
  '📘',
  '📚',
  '📝',
  '🎯',
  '✈️',
  '🍔',
  '🏠',
  '💼',
  '🎓',
  '🎬',
  '💬',
  '🌟',
  '⚡',
  '💡',
  '🧠',
  '❤️',
  '🌍',
  '🏖️',
  '🛒',
  '🎵',
  '🏃',
  '💻',
  '🎮',
  '🌈',
  '☕',
  '🏥',
  '✉️',
  '🔔',
];

export function displayCmsEmoji(icon, fallbackEmoji) {
  const s = String(icon ?? '').trim();
  if (/^https?:\/\//i.test(s)) return fallbackEmoji;
  return s || fallbackEmoji;
}

export function normalizeCmsEmojiForSave(raw, fallbackEmoji) {
  const s = String(raw ?? '').trim();
  if (/^https?:\/\//i.test(s)) return fallbackEmoji;
  return s || fallbackEmoji;
}

const ICON_TM = {
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: '#475569',
    marginBottom: 6,
    letterSpacing: '0.02em',
  },
  iconPresetWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  iconInputWrap: {
    width: 'fit-content',
    maxWidth: '100%',
    marginBottom: 4,
  },
  iconPresetBtn: (selected) => ({
    width: 44,
    height: 44,
    borderRadius: 12,
    fontSize: 22,
    lineHeight: 1,
    border: selected ? '2px solid #6366F1' : '1px solid #E2E8F0',
    background: selected ? 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)' : '#fff',
    boxShadow: selected ? '0 2px 10px rgba(99, 102, 241, 0.2)' : '0 1px 2px rgba(15, 23, 42, 0.06)',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    padding: 0,
  }),
};

/**
 * Ô icon nhỏ + gợi ý emoji chỉ hiện khi focus (đồng bộ Bộ từ / Hội thoại).
 */
export function EmojiIconField({
  styles,
  value,
  onChange,
  fallbackEmoji = '📘',
  inputId = 'cms-emoji-icon-input',
  hintClosed = 'Nhấn vào ô bên dưới để mở gợi ý icon hoặc nhập emoji.',
  hintOpen = 'Chọn nhanh hoặc nhập emoji trong ô trên.',
}) {
  const [open, setOpen] = useState(false);
  const blurTimer = useRef(null);

  const inputBase = useMemo(
    () => ({
      ...styles.input,
      borderRadius: 12,
      border: '1px solid #E2E8F0',
      padding: '12px 14px',
    }),
    [styles.input],
  );

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  const shown = displayCmsEmoji(value, fallbackEmoji);

  return (
    <>
      <label style={ICON_TM.label} htmlFor={inputId}>
        Icon
      </label>
      {!open ? (
        <p style={{margin: '0 0 8px', fontSize: 12, color: '#94A3B8', lineHeight: 1.45}}>{hintClosed}</p>
      ) : null}
      <div style={ICON_TM.iconInputWrap}>
        <input
          id={inputId}
          className="topic-icon-compact-input"
          style={{
            ...inputBase,
            display: 'block',
            width: 96,
            minWidth: 96,
            maxWidth: 96,
            height: 48,
            padding: '8px 10px',
            boxSizing: 'border-box',
            textAlign: 'center',
            fontSize: 24,
            lineHeight: 1.1,
          }}
          value={value}
          placeholder="···"
          maxLength={8}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (blurTimer.current) {
              clearTimeout(blurTimer.current);
              blurTimer.current = null;
            }
            setOpen(true);
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => {
              setOpen(false);
              blurTimer.current = null;
            }, 180);
          }}
        />
      </div>
      {open ? (
        <>
          <p style={{margin: '10px 0 8px', fontSize: 12, color: '#64748B', lineHeight: 1.45}}>{hintOpen}</p>
          <div style={ICON_TM.iconPresetWrap}>
            {CMS_ICON_PRESETS.map((emo) => (
              <button
                key={emo}
                type="button"
                title={emo}
                aria-label={`Chọn icon ${emo}`}
                style={{
                  ...ICON_TM.iconPresetBtn(shown === emo),
                  fontFamily: 'inherit',
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange(emo)}>
                {emo}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

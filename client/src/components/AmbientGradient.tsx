import type { OrbState } from './AmbientOrb';

interface AmbientGradientProps {
  orbState: OrbState;
  showConversation: boolean;
}

// RGB per orb state for the ambient radial gradient wash. CSS can't transition
// gradient keywords, so pre-coloured divs cross-fade via opacity transitions.
const STATE_COLORS: Record<OrbState, { rgb: string; conversationAlpha: number; voiceAlpha: number }> = {
  idle:       { rgb: '59,130,246',  conversationAlpha: 0.05, voiceAlpha: 0.14 },
  recording:  { rgb: '37,99,235',   conversationAlpha: 0.07, voiceAlpha: 0.20 },
  processing: { rgb: '245,158,11',  conversationAlpha: 0.06, voiceAlpha: 0.18 },
  thinking:   { rgb: '168,85,247',  conversationAlpha: 0.07, voiceAlpha: 0.20 },
  speaking:   { rgb: '34,197,94',   conversationAlpha: 0.06, voiceAlpha: 0.18 },
};

export default function AmbientGradient({ orbState, showConversation }: AmbientGradientProps) {
  const { rgb } = STATE_COLORS[orbState];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true" style={{ zIndex: 0 }}>
      {(Object.entries(STATE_COLORS) as [OrbState, (typeof STATE_COLORS)[OrbState]][]).map(
        ([state, { rgb: stateRgb, conversationAlpha, voiceAlpha }]) => (
          <div
            key={state}
            className="absolute inset-0 transition-opacity duration-700"
            style={{
              opacity: orbState === state ? 1 : 0,
              background: showConversation
                ? `radial-gradient(ellipse 120% 25% at 50% 0%, rgba(${stateRgb},${conversationAlpha}) 0%, transparent 100%)`
                : `radial-gradient(ellipse 85% 60% at 50% 38%, rgba(${stateRgb},${voiceAlpha}) 0%, transparent 68%)`,
            }}
          />
        )
      )}

      {/* Slowly drifting blurred blobs — backgroundColor (unlike gradients) cross-fades
          via CSS transition when the state color changes */}
      <div
        className="absolute left-[5%] top-[10%] w-[46vw] h-[46vw] max-w-[560px] max-h-[560px] rounded-full animate-ambient-drift-1"
        style={{
          backgroundColor: `rgba(${rgb},${showConversation ? 0.04 : 0.1})`,
          filter: 'blur(90px)',
          transition: 'background-color 700ms ease',
        }}
      />
      <div
        className="absolute right-[2%] bottom-[12%] w-[38vw] h-[38vw] max-w-[460px] max-h-[460px] rounded-full animate-ambient-drift-2"
        style={{
          backgroundColor: `rgba(${rgb},${showConversation ? 0.03 : 0.08})`,
          filter: 'blur(80px)',
          transition: 'background-color 700ms ease',
        }}
      />

      <div className="grain-overlay" />
    </div>
  );
}

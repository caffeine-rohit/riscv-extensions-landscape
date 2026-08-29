/**
 * AskAiLauncher.jsx - Floating AI chat launcher for RISC-V ISA Explorer
 *
 * Provides a draggable, corner-snapping AI launcher featuring the custom RISC-V AI mark.
 * Snaps to any of the 4 screen corners with persistence in localStorage.
 * Clicking opens the Kapa.ai assistant modal.
 */
import React from 'react';
import aiLogoSrc from './assets/ai-logo.png';

const CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
const LS_KEY = 'riscv-ai-corner';

function cornerStyle(corner) {
  const m = 24; // margin from screen edge (px)
  switch (corner) {
    case 'top-left':
      return { top: m, left: m };
    case 'top-right':
      return { top: m, right: m };
    case 'bottom-left':
      return { bottom: m, left: m };
    default:
      return { bottom: m, right: m }; // bottom-right
  }
}

function nearestCorner(x, y) {
  const h = x < window.innerWidth / 2 ? 'left' : 'right';
  const v = y < window.innerHeight / 2 ? 'top' : 'bottom';
  return `${v}-${h}`;
}

const AskAiLauncher = () => {
  const [corner, setCorner] = React.useState(() => {
    try {
      const saved = window.localStorage.getItem(LS_KEY);
      if (CORNERS.includes(saved)) return saved;
    } catch {
      /* storage unavailable */
    }
    return 'bottom-right';
  });

  const [dragging, setDragging] = React.useState(false);
  const [dragPos, setDragPos] = React.useState(null);
  const [kapaReady, setKapaReady] = React.useState(false);

  const dragStartRef = React.useRef(null);

  React.useEffect(() => {
    if (window.Kapa) {
      setKapaReady(true);
      return undefined;
    }
    const id = setInterval(() => {
      if (window.Kapa) {
        setKapaReady(true);
        clearInterval(id);
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

  const openKapa = React.useCallback(() => {
    if (!kapaReady || !window.Kapa) return;
    window.Kapa.open({ mode: 'ai' });
  }, [kapaReady]);

  const onPointerDown = React.useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
  }, []);

  const onPointerMove = React.useCallback((e) => {
    const ds = dragStartRef.current;
    if (!ds) return;
    const dx = Math.abs(e.clientX - ds.startX);
    const dy = Math.abs(e.clientY - ds.startY);
    if (!ds.moved && dx < 6 && dy < 6) return;
    ds.moved = true;
    setDragging(true);
    setDragPos({ x: e.clientX, y: e.clientY });
  }, []);

  const onPointerUp = React.useCallback(
    (e) => {
      const ds = dragStartRef.current;
      dragStartRef.current = null;
      if (!ds) return;
      if (ds.moved) {
        const snapped = nearestCorner(e.clientX, e.clientY);
        setCorner(snapped);
        try {
          window.localStorage.setItem(LS_KEY, snapped);
        } catch {
          /* ignore */
        }
        setDragPos(null);
        setTimeout(() => setDragging(false), 280);
      } else {
        setDragging(false);
        setDragPos(null);
        openKapa();
      }
    },
    [openKapa],
  );

  const posStyle = dragPos
    ? {
      position: 'fixed',
      left: dragPos.x - 33,
      top: dragPos.y - 31,
      right: 'auto',
      bottom: 'auto',
      zIndex: 10001,
    }
    : { position: 'fixed', zIndex: 10000, ...cornerStyle(corner) };

  return (
    <>
      {/* Corner snap-zone hints visible during drag */}
      {dragging && dragPos && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}
          aria-hidden="true"
        >
          {CORNERS.map((c) => {
            const active = c === nearestCorner(dragPos.x, dragPos.y);
            return (
              <div
                key={c}
                className={`ask-ai-snap-hint${active ? ' ask-ai-snap-hint--active' : ''}`}
                style={{ position: 'absolute', ...cornerStyle(c) }}
              />
            );
          })}
        </div>
      )}

      {/* Floating launcher button */}
      <div
        className={`ask-ai-launcher${dragging ? ' ask-ai-launcher--dragging' : ''}`}
        style={posStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragStartRef.current = null;
          setDragging(false);
          setDragPos(null);
        }}
      >
        <button
          className={`ask-ai-btn${dragging ? ' ask-ai-btn--dragging' : ''}`}
          aria-label="Ask AI Assistant"
          title="Ask AI — Click to open, drag to move"
          onClick={(e) => e.stopPropagation()}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openKapa();
            }
          }}
        >
          <img
            src={aiLogoSrc}
            alt=""
            width="32"
            height="29"
            className="ask-ai-btn__icon"
            draggable={false}
          />
          <span className="ask-ai-btn__label">Ask AI</span>
        </button>
      </div>
    </>
  );
};

export default AskAiLauncher;


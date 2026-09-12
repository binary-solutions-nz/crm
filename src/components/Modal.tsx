import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

// How far (px) the sheet must be dragged down on mobile before it counts as a dismiss.
const DISMISS_THRESHOLD = 90;

export default function Modal({ title, onClose, children, wide }: ModalProps) {
  const dragStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Mobile-only: dragging the handle down slides the bottom sheet with your
  // finger and dismisses it past a threshold, like a native app sheet.
  function onDragStart(e: TouchEvent<HTMLDivElement>) {
    dragStartY.current = e.touches[0].clientY;
    setDragging(true);
  }
  function onDragMove(e: TouchEvent<HTMLDivElement>) {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    setDragY(Math.max(0, delta));
  }
  function onDragEnd() {
    if (dragY > DISMISS_THRESHOLD) {
      onClose();
    }
    setDragY(0);
    setDragging(false);
    dragStartY.current = null;
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={`modal-card${wide ? ' modal-wide' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={
          dragY
            ? { transform: `translateY(${dragY}px)`, transition: dragging ? 'none' : undefined }
            : undefined
        }
      >
        <div
          className="modal-drag-handle"
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          aria-hidden
        />
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

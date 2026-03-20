import { useState, useCallback, useEffect } from 'react';

interface UseResizableOptions {
  storageKey: string;
  defaultSize: number;
  minSize: number;
  maxSize: number;
}

export const useResizable = ({
  storageKey,
  defaultSize,
  minSize,
  maxSize,
}: UseResizableOptions) => {
  // Load initial size from localStorage or use default
  const [size, setSize] = useState<number>(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) {
        return Math.max(minSize, Math.min(maxSize, parsed));
      }
    }
    return defaultSize;
  });

  const [isResizing, setIsResizing] = useState(false);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(storageKey, size.toString());
  }, [storageKey, size]);

  const startResize = useCallback(
    (e: React.MouseEvent, direction: 'horizontal' | 'vertical', invert: boolean = false) => {
      e.preventDefault();
      setIsResizing(true);

      const startPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const startSize = size;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPos = direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
        let delta = currentPos - startPos;

        // Invert delta for right/bottom panels
        if (invert) {
          delta = -delta;
        }

        const newSize = Math.max(minSize, Math.min(maxSize, startSize + delta));
        setSize(newSize);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [size, minSize, maxSize]
  );

  return { size, isResizing, startResize };
};

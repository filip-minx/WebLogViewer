import React, { useEffect, useRef, useState } from 'react';
import type { ParsedLogEntry } from '../../models/types';

interface ScrollbarMinimapProps {
  entries: ParsedLogEntry[];
  scrollElement: HTMLElement | null;
  totalHeight: number;
  headerHeight: number;
  onScrollToPosition: (position: number) => void;
}

export const ScrollbarMinimap: React.FC<ScrollbarMinimapProps> = ({
  entries,
  scrollElement,
  totalHeight,
  headerHeight,
  onScrollToPosition,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportRect, setViewportRect] = useState({ top: 0, height: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(600);

  // Update canvas height to match container minus header
  useEffect(() => {
    if (!scrollElement) return;

    const updateHeight = () => {
      const height = scrollElement.clientHeight - headerHeight;
      setCanvasHeight(Math.max(height, 100));
    };

    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(scrollElement);

    return () => resizeObserver.disconnect();
  }, [scrollElement, headerHeight]);

  // Update viewport rectangle on scroll
  useEffect(() => {
    if (!scrollElement || !canvasRef.current) return;

    const updateViewport = () => {
      const scrollTop = scrollElement.scrollTop;
      const clientHeight = scrollElement.clientHeight;
      const scrollHeight = scrollElement.scrollHeight;

      if (scrollHeight === 0) return;

      const ratio = canvasHeight / scrollHeight;

      setViewportRect({
        top: scrollTop * ratio,
        height: Math.max(clientHeight * ratio, 20),
      });
    };

    updateViewport();
    scrollElement.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);

    return () => {
      scrollElement.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, [scrollElement, canvasHeight]);

  // Draw minimap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || entries.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate pixel height per entry
    const pixelsPerEntry = height / entries.length;
    const entryHeight = Math.max(pixelsPerEntry, 1);

    // Draw entries
    entries.forEach((entry, index) => {
      const y = index * pixelsPerEntry;
      const level = entry.level?.toLowerCase();

      // Color based on log level
      let color = 'rgba(255, 255, 255, 0.15)'; // default

      if (level === 'error') {
        color = '#ff5555';
      } else if (level === 'warn' || level === 'warning') {
        color = '#fb923c';
      } else if (level === 'info') {
        color = '#06b6d4';
      } else if (level === 'debug' || level === 'trace') {
        color = 'rgba(255, 255, 255, 0.08)';
      }

      ctx.fillStyle = color;
      ctx.fillRect(0, y, width, Math.ceil(entryHeight));
    });
  }, [entries, canvasHeight]);


  // Handle click to scroll
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!scrollElement || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const ratio = clickY / canvas.height;
    const scrollHeight = scrollElement.scrollHeight;
    const clientHeight = scrollElement.clientHeight;
    const targetScroll = ratio * scrollHeight - clientHeight / 2;

    onScrollToPosition(Math.max(0, Math.min(targetScroll, scrollHeight - clientHeight)));
  };

  if (entries.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="scrollbar-minimap"
      style={{
        top: `${headerHeight}px`,
        height: `${canvasHeight}px`,
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <canvas
        ref={canvasRef}
        width={12}
        height={canvasHeight}
        onClick={handleClick}
        style={{ cursor: 'pointer' }}
      />
      <div
        className="minimap-viewport"
        style={{
          top: `${viewportRect.top}px`,
          height: `${viewportRect.height}px`,
          opacity: isHovering ? 0.4 : 0.2,
        }}
      />
    </div>
  );
};

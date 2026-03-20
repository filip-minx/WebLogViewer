import React from 'react';

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onMouseDown: (e: React.MouseEvent) => void;
  isResizing?: boolean;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction,
  onMouseDown,
  isResizing = false,
}) => {
  return (
    <div
      className={`resize-handle resize-handle-${direction} ${isResizing ? 'resizing' : ''}`}
      onMouseDown={onMouseDown}
    />
  );
};

import React, { useMemo, useState } from 'react';
import type { ZipEntryMetadata } from '../../models/types';
import { FileTreeNode } from './FileTreeNode';

interface FileTreeProps {
  entries: ZipEntryMetadata[];
  selectedPaths: string[];
  onFileSelect: (paths: string[]) => void;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  children: Map<string, TreeNode>;
}

export const FileTree: React.FC<FileTreeProps> = ({ entries, selectedPaths, onFileSelect }) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['/']));

  const tree = useMemo(() => buildTree(entries), [entries]);

  const toggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleFileSelect = (path: string, isCtrlClick: boolean) => {
    if (isCtrlClick) {
      // Toggle selection
      if (selectedPaths.includes(path)) {
        onFileSelect(selectedPaths.filter(p => p !== path));
      } else {
        onFileSelect([...selectedPaths, path]);
      }
    } else {
      // Replace selection
      onFileSelect([path]);
    }
  };

  if (entries.length === 0) {
    return (
      <div className="file-tree-empty">
        <p>No ZIP file selected</p>
      </div>
    );
  }

  return (
    <div className="file-tree">
      {entries.length > 0 && (
        <div className="file-tree-hint">
          💡 Ctrl+Click to select multiple files
        </div>
      )}
      <FileTreeNode
        node={tree}
        level={0}
        expandedPaths={expandedPaths}
        selectedPaths={selectedPaths}
        onToggleExpand={toggleExpand}
        onFileSelect={handleFileSelect}
      />
    </div>
  );
};

function buildTree(entries: ZipEntryMetadata[]): TreeNode {
  const root: TreeNode = {
    name: '/',
    path: '/',
    isDirectory: true,
    size: 0,
    children: new Map(),
  };

  for (const entry of entries) {
    if (entry.isDirectory) continue; // Skip directories for now

    const parts = entry.path.split('/').filter(p => p);
    let current = root;

    // Build path
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLastPart = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: currentPath,
          isDirectory: !isLastPart,
          size: isLastPart ? entry.uncompressedSize : 0,
          children: new Map(),
        });
      }

      current = current.children.get(part)!;
    }
  }

  return root;
}

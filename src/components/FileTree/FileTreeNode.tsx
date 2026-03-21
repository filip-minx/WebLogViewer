import React from 'react';
import { formatFileSize } from '../../utils/textUtils';

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  children: Map<string, TreeNode>;
}

interface FileTreeNodeProps {
  node: TreeNode;
  level: number;
  expandedPaths: Set<string>;
  selectedPaths: string[];
  onToggleExpand: (path: string) => void;
  onFileSelect: (path: string, isCtrlClick: boolean) => void;
}

export const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  level,
  expandedPaths,
  selectedPaths,
  onToggleExpand,
  onFileSelect,
}) => {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPaths.includes(node.path);
  const hasChildren = node.children.size > 0;

  const handleClick = (e: React.MouseEvent) => {
    if (node.isDirectory) {
      onToggleExpand(node.path);
    } else {
      onFileSelect(node.path, e.ctrlKey || e.metaKey);
    }
  };

  return (
    <>
      <div
        className={`tree-node ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 16}px` }}
        onClick={handleClick}
      >
        {node.isDirectory && (
          <span className="tree-icon">{isExpanded ? '▼' : '▶'}</span>
        )}
        {!node.isDirectory && <span className="tree-icon">📄</span>}
        <span className="tree-name">{node.name}</span>
        {!node.isDirectory && (
          <span className="tree-size">{formatFileSize(node.size)}</span>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div className="tree-children">
          {Array.from(node.children.values())
            .sort((a, b) => {
              // Directories first, then alphabetically
              if (a.isDirectory && !b.isDirectory) return -1;
              if (!a.isDirectory && b.isDirectory) return 1;
              return a.name.localeCompare(b.name);
            })
            .map(child => (
              <FileTreeNode
                key={child.path}
                node={child}
                level={level + 1}
                expandedPaths={expandedPaths}
                selectedPaths={selectedPaths}
                onToggleExpand={onToggleExpand}
                onFileSelect={onFileSelect}
              />
            ))}
        </div>
      )}
    </>
  );
};

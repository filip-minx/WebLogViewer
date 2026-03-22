// Package Dock - Mission control for loaded packages

import React from 'react';
import type { LogPackage } from '../../models/types';

interface PackageDockProps {
  packages: LogPackage[];
  activePackageId: string | null;
  onPackageSelect: (packageId: string) => void;
  onPackageClose: (packageId: string) => void | Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '--';
  const mb = bytes / (1024 * 1024);
  return mb >= 0.1 ? `${mb.toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'parsing':
      return '●';
    case 'ready':
      return '✓';
    case 'error':
      return '✕';
    case 'stale':
      return '○';
    default:
      return '○';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'parsing':
      return 'parsing';
    case 'ready':
      return 'ready';
    case 'error':
      return 'error';
    case 'stale':
      return 'stale';
    default:
      return '';
  }
}

export function PackageDock({
  packages,
  activePackageId,
  onPackageSelect,
  onPackageClose,
}: PackageDockProps) {
  if (packages.length === 0) {
    return null;
  }

  return (
    <div className="package-dock">
      <div className="package-dock-header">
        <span className="dock-label">LOADED PACKAGES</span>
        <span className="dock-count">{packages.length}</span>
      </div>
      <div className="package-dock-list">
        {packages.map(pkg => (
          <div
            key={pkg.id}
            className={`package-chip ${pkg.id === activePackageId ? 'active' : ''} status-${pkg.status}`}
            onClick={() => onPackageSelect(pkg.id)}
            title={`${pkg.name}\nStatus: ${pkg.status}\nMemory: ${formatBytes(pkg.memorySize)}\n${pkg.error || ''}`}
          >
            <span className="package-status-icon">{getStatusIcon(pkg.status)}</span>
            <span className="package-name">{pkg.name}</span>
            <span className="package-state">{getStatusLabel(pkg.status)}</span>
            <span className="package-memory">{formatBytes(pkg.memorySize)}</span>
            <button
              className="package-close"
              onClick={(e) => {
                e.stopPropagation();
                onPackageClose(pkg.id);
              }}
              title="Close package"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Package storage - Persist package metadata across sessions

import type { PackageMetadata } from '../models/types';

const STORAGE_KEY = 'weblog-packages';
const ACTIVE_PACKAGE_KEY = 'weblog-active-package';

export class PackageStorage {
  static savePackages(packages: PackageMetadata[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(packages));
    } catch (error) {
      console.error('Failed to save packages:', error);
    }
  }

  static loadPackages(): PackageMetadata[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to load packages:', error);
      return [];
    }
  }

  static saveActivePackage(packageId: string | null): void {
    try {
      if (packageId) {
        localStorage.setItem(ACTIVE_PACKAGE_KEY, packageId);
      } else {
        localStorage.removeItem(ACTIVE_PACKAGE_KEY);
      }
    } catch (error) {
      console.error('Failed to save active package:', error);
    }
  }

  static loadActivePackage(): string | null {
    try {
      return localStorage.getItem(ACTIVE_PACKAGE_KEY);
    } catch (error) {
      console.error('Failed to load active package:', error);
      return null;
    }
  }

  static clearAll(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ACTIVE_PACKAGE_KEY);
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  }
}

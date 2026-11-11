import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  DEFAULT_THEME,
  DEFAULT_THEME_COLORS,
  DEFAULT_THEME_FONTS,
  computeThemeCssVariables,
  loadGoogleFont,
  loadAllPreviewFonts
} from '../utils/themeFonts.js';

const PortalThemeContext = createContext(null);

const STORAGE_KEY = 'intent_digital_portal_theme';

function getCachedTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        colors: { ...DEFAULT_THEME_COLORS, ...(parsed.colors || {}) },
        fonts: { ...DEFAULT_THEME_FONTS, ...(parsed.fonts || {}) },
        apply_to_login: Boolean(parsed.apply_to_login)
      };
    }
  } catch (err) {
    console.warn('Error reading portal theme from localStorage:', err);
  }
  return DEFAULT_THEME;
}

function setCachedTheme(theme) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch (err) {
    console.warn('Error saving portal theme to localStorage:', err);
  }
}

export function PortalThemeProvider({ children }) {
  const [savedTheme, setSavedTheme] = useState(getCachedTheme);
  const [workingTheme, setWorkingTheme] = useState(getCachedTheme);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sync fonts on theme changes
  useEffect(() => {
    if (workingTheme?.fonts?.headingFont) {
      loadGoogleFont(workingTheme.fonts.headingFont);
    }
    if (workingTheme?.fonts?.bodyFont) {
      loadGoogleFont(workingTheme.fonts.bodyFont);
    }
    if (workingTheme?.fonts?.labelFont) {
      loadGoogleFont(workingTheme.fonts.labelFont);
    }
  }, [workingTheme?.fonts]);

  // Fetch active theme from API on portal load
  const fetchTheme = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/settings/theme');
      if (res.ok) {
        const data = await res.json();
        if (data?.theme) {
          const mergedTheme = {
            colors: { ...DEFAULT_THEME_COLORS, ...(data.theme.colors || {}) },
            fonts: { ...DEFAULT_THEME_FONTS, ...(data.theme.fonts || {}) },
            apply_to_login: Boolean(data.theme.apply_to_login)
          };
          setSavedTheme(mergedTheme);
          setWorkingTheme(mergedTheme);
          setCachedTheme(mergedTheme);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch theme from API, using cached/default:', err);
      setError('Unable to load theme from server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTheme();
  }, [fetchTheme]);

  // Save theme to API & cache
  const saveTheme = async (themeToSave) => {
    const payload = themeToSave || workingTheme;
    try {
      const res = await fetch('/api/settings/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save theme');
      }

      const updated = {
        colors: { ...DEFAULT_THEME_COLORS, ...(data.theme?.colors || payload.colors) },
        fonts: { ...DEFAULT_THEME_FONTS, ...(data.theme?.fonts || payload.fonts) },
        apply_to_login: Boolean(data.theme ? data.theme.apply_to_login : payload.apply_to_login)
      };

      setSavedTheme(updated);
      setWorkingTheme(updated);
      setCachedTheme(updated);
      return { success: true, theme: updated };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Revert working theme to saved theme
  const discardChanges = () => {
    setWorkingTheme(savedTheme);
  };

  // Reset to brand default
  const resetToBrandDefault = () => {
    setWorkingTheme(DEFAULT_THEME);
  };

  const hasUnsavedChanges = JSON.stringify(workingTheme) !== JSON.stringify(savedTheme);

  const cssVariables = computeThemeCssVariables(workingTheme);

  return (
    <PortalThemeContext.Provider
      value={{
        savedTheme,
        workingTheme,
        setWorkingTheme,
        saveTheme,
        discardChanges,
        resetToBrandDefault,
        hasUnsavedChanges,
        loading,
        error,
        cssVariables,
        refreshTheme: fetchTheme,
        loadAllPreviewFonts
      }}
    >
      {children}
    </PortalThemeContext.Provider>
  );
}

export function usePortalTheme() {
  const ctx = useContext(PortalThemeContext);
  if (!ctx) {
    throw new Error('usePortalTheme must be used within a PortalThemeProvider');
  }
  return ctx;
}

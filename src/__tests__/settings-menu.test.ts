/**
 * The Settings sub-menu in the sidebar: open on Settings pages, closed
 * elsewhere, and an arrow press that holds only on the page it was made on.
 *
 * The first version kept the press forever, so the menu stayed shut on every
 * Settings page after one tap on the arrow anywhere -- the owner's report was
 * "when I click Settings it must show the dropdown".
 */
import { describe, it, expect } from 'vitest';
import { isSettingsPath, settingsMenuOpen } from '../lib/ui/settings-menu';

describe('settings sub-menu', () => {
  it('knows Settings pages, and nothing that merely starts with the word', () => {
    expect(isSettingsPath('/settings')).toBe(true);
    expect(isSettingsPath('/settings/users')).toBe(true);
    expect(isSettingsPath('/settingsx')).toBe(false);
    expect(isSettingsPath('/dashboard')).toBe(false);
  });

  it('opens by itself on Settings pages and stays shut elsewhere', () => {
    expect(settingsMenuOpen('/settings/account', null)).toBe(true);
    expect(settingsMenuOpen('/dashboard', null)).toBe(false);
  });

  it('honours the arrow on the page it was pressed on', () => {
    expect(settingsMenuOpen('/settings/account', { path: '/settings/account', open: false })).toBe(false);
    expect(settingsMenuOpen('/dashboard', { path: '/dashboard', open: true })).toBe(true);
  });

  it('forgets the arrow once you move to another page', () => {
    // Closed on the dashboard, then Settings opened: it must open.
    expect(settingsMenuOpen('/settings/account', { path: '/dashboard', open: false })).toBe(true);
    // Closed on one Settings page, then another: open again.
    expect(settingsMenuOpen('/settings/widget', { path: '/settings/account', open: false })).toBe(true);
  });
});

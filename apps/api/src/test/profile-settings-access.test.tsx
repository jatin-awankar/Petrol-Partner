// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ProfileSettingsPage from '../../../../app/profile-settings/page';

vi.mock('@/hooks/profile/useProfileData', () => ({
  useProfileData: () => ({
    user: null, vehicles: [], bookings: [], preferences: {}, safetySettings: {},
    securitySettings: {}, loading: false, error: 'Not found',
    savePreferences: vi.fn(), saveSafety: vi.fn(),
    refetch: { user: vi.fn(), vehicles: vi.fn(), bookings: vi.fn(), profileDomains: vi.fn() },
  }),
}));
vi.mock('@/hooks/auth/useUserProfile', () => ({ useUserProfile: () => ({ updateProfile: vi.fn() }) }));
vi.mock('@/hooks/auth/useCurrentUser', () => ({ useCurrentUser: () => ({ user: null, loading: false }) }));

afterEach(cleanup);

it('offers sign-in when a signed-out visitor opens profile settings and the profile request returns 404', () => {
  render(<ProfileSettingsPage />);
  expect(screen.getByRole('link', { name: /sign in/i }).getAttribute('href')).toBe('/login');
  expect(screen.queryByText('Failed to load profile')).toBeNull();
});

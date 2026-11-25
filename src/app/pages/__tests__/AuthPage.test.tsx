import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataError, type DataProvider } from '../../data/provider';
import { AuthPage } from '../AuthPage';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function openAuth(createAccount: boolean, overrides: Pick<Partial<DataProvider>, 'signIn' | 'register'> = {}) {
  const onSuccess = vi.fn(async () => {});
  const onRegistered = vi.fn();
  render(<MemoryRouter><AuthPage provider={overrides as DataProvider} createAccount={createAccount} message=""
    initialUsername="" registered={false} onSuccess={onSuccess} onRegistered={onRegistered} /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'sample-worker' } });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'Pine boats orbit over copper.' } });
  return { onSuccess, onRegistered };
}

describe('account entry', () => {
  it.each([
    ['ERR_AUTHENTICATION', 'Sign-in failed'],
    ['ERR_ACCOUNT_LOCKED', 'Sign-in temporarily locked'],
    ['ERR_RATE_LIMIT', 'Too many requests'],
    ['ERR_OFFLINE', 'Gateway unreachable'],
    ['ERR_SESSION_EXPIRED', 'Session expired'],
  ])('renders %s with password entry still available', async (code, heading) => {
    openAuth(false, { signIn: vi.fn().mockRejectedValue(new DataError(code, 'Request failed.', undefined, undefined, 300)) });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(heading)).toBeTruthy();
    expect(screen.getByLabelText('Password', { exact: true })).toBeTruthy();
  });

  it('requires consent and reuses the registration key after a failed submission', async () => {
    const register = vi.fn()
      .mockRejectedValueOnce(new DataError('ERR_OFFLINE', 'Gateway unreachable.'))
      .mockResolvedValueOnce(undefined);
    const { onRegistered } = openAuth(true, { register });
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Create account' });
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Notice.' }));
    fireEvent.click(submit);
    await screen.findByRole('alert');
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(onRegistered).toHaveBeenCalledWith('sample-worker'));
    expect(register.mock.calls).toHaveLength(2);
    expect(register.mock.calls[0][3]).toHaveLength(36);
    expect(register.mock.calls[0][3]).toBe(register.mock.calls[1][3]);
  });

  it('uses a recovery code through the same staff challenge', async () => {
    const signIn = vi.fn().mockResolvedValueOnce({ status: 'challenge' }).mockResolvedValueOnce({
      status: 'signed-in', session: { role: 'insurer', username: 'sample-worker' }, recoveryCodes: [],
    });
    const { onSuccess } = openAuth(false, { signIn });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Enter authenticator code' });
    fireEvent.click(screen.getByRole('button', { name: /Use a recovery code/i }));
    const code = '0123456789abcdefghij';
    fireEvent.change(screen.getByLabelText('Recovery code', { exact: true }), { target: { value: code } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(signIn.mock.calls[1][2]).toEqual({ code, recovery: true });
  });
});

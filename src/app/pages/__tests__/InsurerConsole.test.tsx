import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DataError, type DataProvider } from '../../data/provider';
import { InsurerConsole } from '../InsurerConsole';

afterEach(cleanup);

function openConsole(methods: Pick<DataProvider, 'events' | 'policies'>) {
  return render(<MemoryRouter><InsurerConsole provider={methods as DataProvider}
    session={{ role: 'insurer', username: 'insurer-test' }} onExpired={vi.fn()} /></MemoryRouter>);
}

it('shows a loading status while fetching policies and then a ledger-backed empty state', async () => {
  openConsole({ events: vi.fn().mockResolvedValue([]), policies: vi.fn().mockResolvedValue([]) });
  expect(screen.getByRole('status').textContent).toContain('Loading ledger views');
  expect(await screen.findByText('No policies match this zone and status.')).toBeTruthy();
});

it('retries a failed ledger request without presenting an empty list as a result', async () => {
  const policies = vi.fn()
    .mockRejectedValueOnce(new DataError('ERR_OFFLINE', 'Gateway unreachable.'))
    .mockResolvedValueOnce([]);
  openConsole({ events: vi.fn().mockResolvedValue([]), policies });
  const failure = await screen.findByRole('alert');
  expect(failure.textContent).toContain('Gateway unreachable.');
  expect(screen.queryByText('No policies match this zone and status.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('No policies match this zone and status.')).toBeTruthy();
  expect(policies).toHaveBeenCalledTimes(2);
});

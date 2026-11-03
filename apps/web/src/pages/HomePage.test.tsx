import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(async () => ({ items: [], nextCursor: null })),
}));

describe('HomePage', () => {
  it('renders brand-forward marketplace hero', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('img', { name: /Nexle/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Your Next Find Starts Here/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Shop now/i })).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('renders brand-forward hero', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('img', { name: /Nexle/i })).toBeInTheDocument();
    expect(screen.getByText(/Your Next Find Starts Here/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Browse products/i })).toBeInTheDocument();
  });
});

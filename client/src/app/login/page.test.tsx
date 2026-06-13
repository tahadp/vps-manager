import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

import Login from './page';

describe('Login page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as any).fetch = vi.fn();
  });

  it('renders the form with a "Sign In" button', () => {
    render(<Login />);
    const button = screen.getByRole('button', { name: /sign in/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('types into email/identifier and password, then submits and the button becomes disabled', async () => {
    const user = userEvent.setup();

    let resolveFetch: (value: any) => void = () => {};
    (globalThis as any).fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(<Login />);

    const identifierInput = screen.getByLabelText(/email or username/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^password/i) as HTMLInputElement;
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(identifierInput, 'admin@example.com');
    await user.type(passwordInput, 'Sup3rSecret!');

    expect(identifierInput.value).toBe('admin@example.com');
    expect(passwordInput.value).toBe('Sup3rSecret!');

    await user.click(submitButton);

    await waitFor(() => {
      expect(submitButton).toBeDisabled();
    });

    expect(submitButton).toHaveTextContent(/please wait/i);
  });
});

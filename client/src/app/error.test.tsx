import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import GlobalError from './error';

describe('app/error.tsx (Next.js 16 GlobalError)', () => {
  it('renders the heading, error message, and digest', () => {
    const error = Object.assign(new Error('Boom from server'), { digest: 'abc-123' });
    const unstable_retry = vi.fn();

    render(<GlobalError error={error} unstable_retry={unstable_retry} />);

    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByText('Boom from server')).toBeInTheDocument();
    expect(screen.getByText(/abc-123/)).toBeInTheDocument();
  });

  it('omits the digest block when the error has no digest', () => {
    const error = new Error('No digest here');
    const unstable_retry = vi.fn();

    render(<GlobalError error={error} unstable_retry={unstable_retry} />);

    expect(screen.getByText('No digest here')).toBeInTheDocument();
    expect(screen.queryByText(/digest:/i)).not.toBeInTheDocument();
  });

  it('renders a "Try Again" button that calls unstable_retry exactly once on click', async () => {
    const user = userEvent.setup();
    const error = Object.assign(new Error('Click me'), { digest: 'd-1' });
    const unstable_retry = vi.fn();

    render(<GlobalError error={error} unstable_retry={unstable_retry} />);

    const button = screen.getByRole('button', { name: /try again/i });
    expect(button).toBeInTheDocument();

    await user.click(button);

    expect(unstable_retry).toHaveBeenCalledTimes(1);
  });
});

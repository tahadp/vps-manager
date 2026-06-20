import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { useFocusTrap } from './useFocusTrap';

function TrapHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const ref = useFocusTrap(open, onClose);
  return (
    <div>
      <button>Outside</button>
      <div ref={ref} role="dialog" aria-modal="true">
        <button>First</button>
        <button>Middle</button>
        <button>Last</button>
      </div>
      <button onClick={() => setOpen(false)}>Close</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('focuses first element on open', () => {
    render(<TrapHarness onClose={() => {}} />);
    expect(document.activeElement?.textContent).toBe('First');
  });
  it('cycles forward with Tab', () => {
    render(<TrapHarness onClose={() => {}} />);
    const last = screen.getByText('Last');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement?.textContent).toBe('First');
  });
  it('cycles backward with Shift+Tab', () => {
    render(<TrapHarness onClose={() => {}} />);
    const first = screen.getByText('First');
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement?.textContent).toBe('Last');
  });
  it('calls onEscape on Escape', () => {
    const onClose = vi.fn();
    render(<TrapHarness onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

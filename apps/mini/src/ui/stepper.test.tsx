import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Stepper } from './stepper';

describe('Stepper', () => {
  it('steps within min and max, with the button at a limit disabled', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Stepper value={1} min={1} max={3} onChange={onChange} />);
    const less = screen.getByRole('button', { name: '减少数量' });
    expect(less.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(less);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '增加数量' }));
    expect(onChange).toHaveBeenCalledWith(2);
    rerender(<Stepper value={3} min={1} max={3} onChange={onChange} />);
    expect(screen.getByRole('button', { name: '增加数量' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect((screen.getByRole('textbox', { name: '数量' }) as HTMLInputElement).value).toBe('3');
  });

  it('clamps a typed number on blur, and restores nonsense', () => {
    const onChange = vi.fn();
    render(<Stepper value={2} max={5} onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: '数量' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(5);
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(input.value).toBe('2');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Field, Textarea } from './field';

function Controlled(props: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <Field
      label="收货人"
      value={value}
      showCount
      maxLength={10}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
    />
  );
}

describe('Field', () => {
  it('reports input, counts characters and clears while focused', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: '收货人' });
    fireEvent.change(input, { target: { value: '张三' } });
    expect(onChange).toHaveBeenLastCalledWith('张三');
    expect(screen.getByText('2/10')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '清除' })).toBeNull();
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole('button', { name: '清除' }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('maps tel to a number keyboard of 11 digits, and shows an error', () => {
    render(
      <Field
        label="手机号"
        type="tel"
        value=""
        onChange={() => undefined}
        error="请输入正确的手机号"
      />,
    );
    const input = screen.getByRole('textbox', { name: '手机号' });
    expect(input.dataset['type']).toBe('number');
    expect(input.getAttribute('maxlength')).toBe('11');
    expect(screen.getByText('请输入正确的手机号')).toBeTruthy();
  });

  it('cannot be typed in when read-only', () => {
    render(<Field label="手机号" value="13800138000" readOnly onChange={() => undefined} />);
    expect((screen.getByRole('textbox', { name: '手机号' }) as HTMLInputElement).disabled).toBe(
      true,
    );
  });
});

describe('Textarea', () => {
  it('counts against its limit', () => {
    const onChange = vi.fn();
    render(<Textarea label="评价" value="很好" maxLength={500} onChange={onChange} />);
    expect(screen.getByText('2/500')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: '评价' }), {
      target: { value: '很好很好' },
    });
    expect(onChange).toHaveBeenCalledWith('很好很好');
  });
});

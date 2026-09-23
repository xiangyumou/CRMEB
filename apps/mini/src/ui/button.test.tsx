import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button, buttonClassName } from './button';

describe('Button', () => {
  it('calls onClick and carries its look as classes', () => {
    const onClick = vi.fn();
    render(
      <Button variant="secondary" size="lg" block onClick={onClick}>
        立即购买
      </Button>,
    );
    const button = screen.getByRole('button', { name: '立即购买' });
    expect(button.className).toBe('shop-btn shop-btn--secondary shop-btn--lg shop-btn--block');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ignores taps while loading or disabled, and says so', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button loading onClick={onClick}>
        提交订单
      </Button>,
    );
    const button = screen.getByRole('button', { name: '提交订单' });
    expect(button.className).toContain('shop-btn--loading');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    rerender(
      <Button disabled onClick={onClick}>
        提交订单
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: '提交订单' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('passes the contact open-type and its session source', () => {
    render(
      <Button openType="contact" sessionFrom="route:product;id:11">
        客服
      </Button>,
    );
    const button = screen.getByRole('button', { name: '客服' });
    expect(button.dataset['openType']).toBe('contact');
    expect(button.dataset['sessionFrom']).toBe('route:product;id:11');
  });

  it('builds the same classes for platform buttons', () => {
    expect(buttonClassName({})).toBe('shop-btn shop-btn--primary shop-btn--md');
    expect(buttonClassName({ variant: 'danger', size: 'sm', disabled: true })).toBe(
      'shop-btn shop-btn--danger shop-btn--sm shop-btn--disabled',
    );
  });
});

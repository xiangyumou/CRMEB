import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Image } from './image';

describe('Image', () => {
  it('keeps its ratio before the picture arrives, and is named when it has a label', () => {
    const { container } = render(
      <Image src="https://cdn.example.com/a.jpg" ratio={2} label="坚果礼盒" />,
    );
    const box = screen.getByRole('img', { name: '坚果礼盒' });
    expect(box.style.paddingTop).toBe('50.0000%');
    expect(box.className).not.toContain('shop-image--loaded');
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/a.jpg');
    fireEvent.load(img as HTMLImageElement);
    expect(box.className).toContain('shop-image--loaded');
  });

  it('shows the placeholder icon when it fails or has no source', () => {
    const { container, rerender } = render(<Image src="/uploads/x.png" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/uploads/x.png');
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.shop-image__fallback')).toBeTruthy();
    rerender(<Image src={null} />);
    expect(container.querySelector('.shop-image__fallback')).toBeTruthy();
  });

  it('tries again when the source changes after a failure', () => {
    const { container, rerender } = render(<Image src="/a.png" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    rerender(<Image src="/b.png" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/b.png');
  });

  it('is decoration without a label', () => {
    const { container } = render(<Image src="/a.png" />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});

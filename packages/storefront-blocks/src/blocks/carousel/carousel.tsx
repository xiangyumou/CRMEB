import { Image, Swiper, SwiperItem } from '@tarojs/components';

import type { CarouselProps } from '@shop/contracts/decor/all-blocks';
import { cssColor, designVars, tapProps } from '../shared/css';
import { BlockFrame } from '../shared/frame';
import type { BlockProps } from '../shared/types';
import styles from './carousel.module.scss';

/** 轮播: full-width slides, each optionally linking somewhere. */
export function Carousel({ props, onLink }: BlockProps<CarouselProps>) {
  const { slides } = props;
  return (
    <BlockFrame type="carousel" frame={props.style}>
      <Swiper
        className={styles.swiper}
        style={designVars({ height: props.height })}
        autoplay={props.autoplay && slides.length > 1}
        interval={props.interval}
        circular
        indicatorDots={props.indicator === 'dots' && slides.length > 1}
        indicatorColor={cssColor(props.indicatorColor)}
        indicatorActiveColor={cssColor(props.indicatorActiveColor)}
      >
        {slides.map((slide, index) => {
          const link = slide.link;
          return (
            <SwiperItem key={index} className={styles.slide}>
              <Image
                className={styles.image}
                src={slide.image}
                mode="aspectFill"
                {...(slide.alt ? { ariaLabel: slide.alt } : {})}
                {...tapProps(link && onLink ? () => onLink(link) : undefined)}
              />
            </SwiperItem>
          );
        })}
      </Swiper>
    </BlockFrame>
  );
}

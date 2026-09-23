import { useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import { useAppConfig } from '@/app-config';
import { assetUrl } from '@/lib/asset-url';
import { navigate, openExternalLink, storage } from '@/platform';
import { Image } from '@/ui/image';
import { Pressable } from '@/ui/pressable';
import { SPLASH_DAY_KEY, shopDay, splashAction, splashDue } from './splash';
import './splash-overlay.scss';

/** A phone screen, portrait: what operators design the picture for (750 × 1334). */
const SCREEN_RATIO = 750 / 1334;

/**
 * 开屏浮层 on 首页 (pages.md §2.1; replaces the old 启动引导页): the shop's picture over the
 * page, a 跳过 button counting down, closes itself when the count ends. Shown at most once a
 * shop day, whatever the number of launches.
 */
export function SplashOverlay() {
  const config = useAppConfig();
  const ad = config?.splashAd;
  const [today] = useState(() => shopDay(Date.now()));
  const [phase, setPhase] = useState<'waiting' | 'open' | 'closed'>('waiting');
  const [left, setLeft] = useState(0);

  // The config may arrive after the first render (no cached copy yet): decided while rendering,
  // once, the way React derives state from props.
  if (phase === 'waiting' && ad && splashDue(ad, storage.get(SPLASH_DAY_KEY), today)) {
    setPhase('open');
    setLeft(Math.max(1, ad.seconds));
  }

  useEffect(() => {
    if (phase === 'open') storage.set(SPLASH_DAY_KEY, today);
  }, [phase, today]);

  useEffect(() => {
    if (phase !== 'open') return;
    const timer = setTimeout(() => {
      if (left <= 1) setPhase('closed');
      else setLeft(left - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [phase, left]);

  const open = phase === 'open';
  if (!open || !ad) return null;
  const action = splashAction(ad.link);
  const close = () => setPhase('closed');
  return (
    <View className="splash" id="splash-overlay">
      {action ? (
        <Pressable
          label="查看活动"
          role="link"
          pressedTint={false}
          className="splash__picture"
          onClick={() => {
            close();
            if (action.kind === 'external') void openExternalLink(action.url);
            else void navigate(action.route);
          }}
        >
          <Image src={assetUrl(ad.imageUrl)} label="开屏图片" ratio={SCREEN_RATIO} lazy={false} />
        </Pressable>
      ) : (
        <View className="splash__picture">
          <Image src={assetUrl(ad.imageUrl)} label="开屏图片" ratio={SCREEN_RATIO} lazy={false} />
        </View>
      )}
      <Pressable label={`跳过，${left} 秒`} className="splash__skip" onClick={close}>
        <Text>跳过 {left}</Text>
      </Pressable>
    </View>
  );
}

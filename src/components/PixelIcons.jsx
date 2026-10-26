// Pixel-art UI icons. Wraps pixelarticons (24x24 grid) behind the same
// names and `size` prop the screens used with lucide-react, and snaps the
// size to a multiple of 6 so the 2-unit strokes land on whole pixels.
import * as P from 'pixelarticons/react';

function pixel(Icon) {
  const Wrapped = ({ size = 24, className = '', style, ...rest }) => {
    const px = Math.max(12, Math.round(size / 6) * 6);
    return (
      <Icon
        width={px}
        height={px}
        className={`pixel-icon ${className}`.trim()}
        style={style}
        shapeRendering="crispEdges"
        aria-hidden="true"
        {...rest}
      />
    );
  };
  return Wrapped;
}

export const Crosshair = pixel(P.Target);
export const Flame = pixel(P.Fire);
export const Zap = pixel(P.Zap);
export const Sparkles = pixel(P.Sparkles);
export const TrendingUp = pixel(P.TrendingUp);
export const Shield = pixel(P.Shield);
export const RotateCcw = pixel(P.Reload);
export const Share2 = pixel(P.Share);
export const Gift = pixel(P.Gift);
export const Activity = pixel(P.Chart);
export const BookOpen = pixel(P.BookOpen);
export const HelpCircle = pixel(P.CircleQuestion);
export const Volume2 = pixel(P.Volume2);
export const VolumeX = pixel(P.VolumeX);
export const FastForward = pixel(P.SpeedFast);
export const Lock = pixel(P.Lock);
export const Play = pixel(P.Play);
export const Home = pixel(P.Home);
export const ShoppingBag = pixel(P.Tools);
export const Maximize2 = pixel(P.Expand);
export const Move = pixel(P.Move);
export const ZoomIn = pixel(P.ZoomIn);
export const ZoomOut = pixel(P.ZoomOut);
export const Tv = pixel(P.Tv);
export const Sword = pixel(P.Sword);
export const Heart = pixel(P.Heart);
export const Castle = pixel(P.Castle);
export const Crown = pixel(P.Crown);
export const Check = pixel(P.Check);
export const Settings = pixel(P.Gear);
export const Skull = pixel(P.Skull);
export const Fire = pixel(P.Fire);
export const Bomb = pixel(P.Bomb);
export const Potion = pixel(P.Potion);
export const Target = pixel(P.Target);
export const Star = pixel(P.Star);
export const Robot = pixel(P.Robot);
export const Coins = pixel(P.Coins);
export const Flag = pixel(P.Flag);

// Gold coin drawn on an 8x8 grid in the game palette; replaces the 🪙 emoji.
export function GoldCoin({ size = 14, className = '' }) {
  const px = Math.max(8, Math.round(size / 4) * 4);
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      className={`pixel-icon gold-coin ${className}`.trim()}
      aria-hidden="true"
    >
      <path fill="#5c3a12" d="M2 0h4v1H2zM1 1h1v1H1zM6 1h1v1H6zM0 2h1v4H0zM7 2h1v4H7zM1 6h1v1H1zM6 6h1v1H6zM2 7h4v1H2z" />
      <path fill="#f5b82e" d="M2 1h4v1H2zM1 2h6v4H1zM2 6h4v1H2z" />
      <path fill="#ffe28a" d="M2 2h1v2H2zM3 2h1v1H3z" />
      <path fill="#c4841a" d="M5 4h1v2H5zM3 5h2v1H3z" />
    </svg>
  );
}

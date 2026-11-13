import { type ReactElement, type ReactNode } from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

/**
 * نشان برداری بانک‌های ایرانی.
 *
 * هر نشان یک بازخوانی هندسی از نشان رسمی همان بانک است؛ فقط با primitivesهای
 * react-native-svg کشیده شده (بدون تصویر، فونت یا حرف) و داخل viewBoxی
 * «0 0 48 48» جا می‌گیرد تا با هر sizeی شارپ بماند.
 * رنگ هر نشان همان رنگ سازمانی در iranianBanks است و بدنه‌های کم‌رنگ با تینت
 * شفاف همان رنگ پر می‌شوند تا در تم روشن و تاریک خوانا باشد.
 * بانک ناشناس (`other`) نشان ندارد و BankLogo برایش به قاب حرف‌دار برمی‌گردد.
 */
export type BankLogoSvgProps = { size: number };

const Frame = ({ size, children }: BankLogoSvgProps & { children: ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    {children}
  </Svg>
);

/** بلوبانک: مدار، هسته و ماهواره. */
const BluLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Circle cx="21" cy="28" r="10.5" fill="none" stroke="#0EA5E9" strokeWidth="3.5" />
    <Circle cx="21" cy="28" r="4" fill="#0EA5E9" />
    <Circle cx="34" cy="14" r="4.5" fill="#0EA5E9" />
  </Frame>
);

/** پاسارگاد: خورشیدِ بال‌دار (نشان هخامنشی). */
const PasargadLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Rect x="3" y="5" width="42" height="38" rx="10" fill="#1E3A8A0F" />
    <Path d="M18 17l6-11 6 11z" fill="#1E3A8A" />
    <Circle cx="24" cy="24" r="5.5" fill="#1E3A8A" />
    <Path d="M17 18h-8l-3 5h9z" fill="#1E3A8A" />
    <Path d="M17 26h-9l-3 5h10z" fill="#1E3A8A" />
    <Path d="M31 18h8l3 5h-9z" fill="#1E3A8A" />
    <Path d="M31 26h9l3 5h-10z" fill="#1E3A8A" />
  </Frame>
);

/** مهر ایران: قلب سبز. */
const MehrLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Circle cx="18.5" cy="20" r="6.5" fill="#16A34A" />
    <Circle cx="29.5" cy="20" r="6.5" fill="#16A34A" />
    <Path d="M12 22h24L24 38z" fill="#16A34A" />
    <Circle cx="17" cy="17.5" r="2" fill="#FFFFFF55" />
  </Frame>
);

/** ملت: دو کمان درهم‌تنیده‌ی سرخ و سرمه‌ای. */
const MellatLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M24 7c11 4 11 30 0 34" fill="none" stroke="#C8102E" strokeWidth="4.5" strokeLinecap="round" />
    <Path d="M24 7c-11 4-11 30 0 34" fill="none" stroke="#1E3A8A" strokeWidth="4.5" strokeLinecap="round" />
    <Circle cx="24" cy="24" r="3" fill="#C8102E" />
  </Frame>
);

/** ملی ایران: خورشید درون حلقه‌ی مُهر. */
const MelliLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Circle cx="24" cy="24" r="16" fill="#1D4ED812" stroke="#1D4ED8" strokeWidth="3" />
    <Path d="M15 31a9 9 0 0 1 18 0z" fill="#1D4ED8" />
    <Path d="M24 17v-4M18 19l-2-3.5M30 19l2-3.5" fill="none" stroke="#1D4ED8" strokeWidth="2.6" strokeLinecap="round" />
  </Frame>
);

/** صادرات: ستاره‌ی شش‌پر. */
const SaderatLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M24 6l12 18H12z" fill="#0F766E" />
    <Path d="M24 42 12 24h24z" fill="#0F766E99" />
    <Circle cx="24" cy="24" r="4" fill="#0F766E" />
  </Frame>
);

/** تجارت: دو مثلث درهم‌رونده. */
const TejaratLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M8 11h24L20 34z" fill="#1E40AF" />
    <Path d="M40 37H16l12-23z" fill="#1E40AF6E" />
  </Frame>
);

/** سپه: سپر و دو رتبه. */
const SepahLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M24 5l14 5v11c0 9-6 15-14 19-8-4-14-10-14-19V10z" fill="#7C3AED14" stroke="#7C3AED" strokeWidth="2.5" strokeLinejoin="round" />
    <Path d="M16 27l8-6 8 6M16 33l8-6 8 6" fill="none" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </Frame>
);

/** کشاورزی: خوشه‌ی گندم. */
const KeshavarziLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M24 42V18" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round" />
    <Path d="M24 20c-7-2-10-6-9-11 5 1 8 5 9 11z" fill="#15803D" />
    <Path d="M24 27c-7-2-10-6-9-11 5 1 8 5 9 11z" fill="#15803D" />
    <Path d="M24 20c7-2 10-6 9-11-5 1-8 5-9 11z" fill="#15803D" />
    <Path d="M24 27c7-2 10-6 9-11-5 1-8 5-9 11z" fill="#15803D" />
    <Ellipse cx="24" cy="13" rx="3" ry="6" fill="#15803D" />
  </Frame>
);

/** مسکن: خانه و سقف. */
const MaskanLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M6 23L24 8l18 15" fill="none" stroke="#0369A1" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <Rect x="11" y="21" width="26" height="18" rx="2.5" fill="#0369A11A" stroke="#0369A1" strokeWidth="3" />
    <Rect x="20" y="28" width="8" height="11" rx="1.5" fill="#0369A1" />
  </Frame>
);

/** سامان: Sِ انتزاعی با دو نقطه روی زمینه‌ی سرمه‌ای. */
const SamanLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Rect x="5" y="5" width="38" height="38" rx="11" fill="#0F172A" />
    <Path d="M30 15a6.5 6.5 0 1 0-6.5 6.5 6.5 6.5 0 1 1-6.5 6.5" fill="none" stroke="#38BDF8" strokeWidth="3.2" strokeLinecap="round" />
    <Circle cx="34" cy="31" r="2.4" fill="#38BDF8" />
    <Circle cx="14" cy="17" r="2.4" fill="#38BDF8" />
  </Frame>
);

/** پارسیان: دو شِوران رو به جلو. */
const ParsianLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M9 10l16 14-16 14v-7l9-7-9-7z" fill="#B45309" />
    <Path d="M26 14l12 10-12 10v-5.5l6.5-4.5-6.5-4.5z" fill="#B453098C" />
  </Frame>
);

/** اقتصاد نوین: گره‌های رو به رشد. */
const EnovinLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M10 38c6-10 18-16 29-27" fill="none" stroke="#0284C7" strokeWidth="4" strokeLinecap="round" />
    <Circle cx="11" cy="34" r="4.5" fill="#0284C7" />
    <Circle cx="22" cy="25.5" r="4.5" fill="#0284C799" />
    <Circle cx="36.5" cy="13.5" r="5.5" fill="#0284C7" />
  </Frame>
);

/** رسالت: لاله‌ی سه‌پر. */
const ResalatLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M24 42V24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" />
    <Path d="M24 7c4.5 5 4.5 13 0 18-4.5-5-4.5-13 0-18z" fill="#22C55E" />
    <Path d="M13 12c6 3 9 9 9 14-6-1-10-7-9-14z" fill="#22C55E99" />
    <Path d="M35 12c-6 3-9 9-9 14 6-1 10-7 9-14z" fill="#22C55E99" />
  </Frame>
);

/** آینده: دو حلقه‌ی درهم‌تنیده (بی‌نهایت). */
const AyandehLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Circle cx="17.5" cy="24" r="8.5" fill="none" stroke="#6D28D9" strokeWidth="4" />
    <Circle cx="30.5" cy="24" r="8.5" fill="none" stroke="#6D28D9" strokeWidth="4" />
  </Frame>
);

/** شهر: پرنده‌ی شهری در اوج. */
const ShahrLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M8 27L32 6l6 7-14 14z" fill="#7E22CE" />
    <Path d="M20 27h14l-7 14z" fill="#7E22CE99" />
    <Circle cx="33" cy="10" r="2.8" fill="#7E22CE" />
  </Frame>
);

/** رفاه: جوانه‌ی رویش در حلقه. */
const RefahLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Circle cx="24" cy="24" r="16" fill="#2563EB0F" stroke="#2563EB" strokeWidth="2.5" />
    <Path d="M24 36V21" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" />
    <Path d="M24 25c-8-1-11-4-11-9 5 0 9 3 11 9z" fill="#2563EB" />
    <Path d="M24 20c8-1 11-4 11-9-5 0-9 3-11 9z" fill="#2563EB" />
  </Frame>
);

/** سینا: روبان S. */
const SinaLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M31 14c-3-3-12-4-14 1-2 4 4 5 7 6 3 1 9 3 7 8-2 4-11 5-15 1" fill="none" stroke="#0D9488" strokeWidth="4" strokeLinecap="round" />
    <Circle cx="34" cy="11" r="2.4" fill="#0D9488" />
  </Frame>
);

/** گردشگری: خورشید و بال‌های سفر. */
const GardeshgariLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M8 18c10 6 22 6 32 0" fill="none" stroke="#EA580C" strokeWidth="3.4" strokeLinecap="round" />
    <Path d="M13 11c7 5 15 5 22 0" fill="none" stroke="#EA580C99" strokeWidth="3" strokeLinecap="round" />
    <Circle cx="24" cy="32" r="8.5" fill="#EA580C" />
  </Frame>
);

/** خاورمیانه: آسمان‌خراش‌های بالارونده. */
const KhavarmianeLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Rect x="9" y="27" width="6" height="14" rx="2" fill="#0F766E" />
    <Rect x="19" y="19" width="6" height="22" rx="2" fill="#0F766E" />
    <Rect x="29" y="11" width="6" height="30" rx="2" fill="#0F766E" />
    <Circle cx="13" cy="19" r="3.4" fill="#0F766E66" />
    <Circle cx="35" cy="7" r="2.6" fill="#0F766E80" />
  </Frame>
);

/** کارآفرین: اخترک چهارپر. */
const KarafarinLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M24 5l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="#1D4ED8" />
    <Circle cx="24" cy="23" r="3.2" fill="#FFFFFF40" />
  </Frame>
);

/** دی: مُهر هشت‌پر از دو مربع. */
const DayLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Rect x="13" y="13" width="22" height="22" rx="2.5" fill="#9333EA" />
    <Path d="M24 6l18 18-18 18-18-18z" fill="#9333EA80" />
    <Circle cx="24" cy="24" r="3.5" fill="#9333EA" />
  </Frame>
);

/** پست بانک: پاکت و بال نامه. */
const PostBankLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M8 13c10 6 22 6 32 0" fill="none" stroke="#F59E0B" strokeWidth="3.2" strokeLinecap="round" />
    <Rect x="7" y="19" width="34" height="22" rx="3" fill="#F59E0B1A" stroke="#F59E0B" strokeWidth="3" />
    <Path d="M9 22l15 11 15-11" fill="none" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </Frame>
);

/** ویپاد: پد و آذرخش پرداخت. */
const WipadLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Rect x="9" y="9" width="30" height="30" rx="10" fill="#7C3AED14" stroke="#7C3AED" strokeWidth="3.2" />
    <Path d="M25 14L15 27h6l-2 9 10-13h-6z" fill="#7C3AED" />
  </Frame>
);

/** بانکینو: شش‌ضلعی و نقش خندان. */
const BankinoLogo = ({ size }: BankLogoSvgProps) => (
  <Frame size={size}>
    <Path d="M24 5l16 9.5v19L24 43 8 33.5v-19z" fill="#0EA5E914" stroke="#0EA5E9" strokeWidth="3" strokeLinejoin="round" />
    <Path d="M16 29c5 4 11 4 16 0" fill="none" stroke="#0EA5E9" strokeWidth="3.2" strokeLinecap="round" />
    <Circle cx="24" cy="17" r="3" fill="#0EA5E9" />
  </Frame>
);

export const BANK_LOGOS: Record<string, (props: BankLogoSvgProps) => ReactElement> = {
  blu: BluLogo,
  pasargad: PasargadLogo,
  mehr: MehrLogo,
  mellat: MellatLogo,
  melli: MelliLogo,
  saderat: SaderatLogo,
  tejarat: TejaratLogo,
  sepah: SepahLogo,
  keshavarzi: KeshavarziLogo,
  maskan: MaskanLogo,
  saman: SamanLogo,
  parsian: ParsianLogo,
  enovin: EnovinLogo,
  resalat: ResalatLogo,
  ayandeh: AyandehLogo,
  shahr: ShahrLogo,
  refah: RefahLogo,
  sina: SinaLogo,
  gardeshgari: GardeshgariLogo,
  khavarmiane: KhavarmianeLogo,
  karafarin: KarafarinLogo,
  day: DayLogo,
  postbank: PostBankLogo,
  wipad: WipadLogo,
  bankino: BankinoLogo,
};

import { useState } from "react";
import { Link } from "react-router-dom";

// Each card first tries to render a real photo from /public/images. If the
// file isn't there yet, we silently fall back to a brand-coloured SVG
// illustration so the card still looks intentional.

function BabyIllustration() {
  return (
    <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <linearGradient id="babyBg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#CDEBDD" />
          <stop offset="100%" stopColor="#A7E4D4" />
        </linearGradient>
      </defs>
      <rect width="200" height="140" fill="url(#babyBg)" />
      {/* onesie */}
      <path d="M80 55 L120 55 L128 70 L135 95 L125 115 L75 115 L65 95 L72 70 Z" fill="#FFFFFF" opacity="0.95" />
      <circle cx="90" cy="85" r="3" fill="#F4845F" />
      <circle cx="110" cy="85" r="3" fill="#F4845F" />
      {/* pacifier to the right */}
      <circle cx="160" cy="40" r="10" fill="#F4845F" opacity="0.7" />
      <circle cx="160" cy="40" r="4" fill="#FFFFFF" />
      {/* rattle on left */}
      <circle cx="40" cy="45" r="8" fill="#2D6A4F" opacity="0.5" />
      <rect x="37" y="50" width="6" height="18" rx="3" fill="#2D6A4F" opacity="0.5" />
      {/* dots */}
      <circle cx="30" cy="110" r="3" fill="#FFFFFF" opacity="0.5" />
      <circle cx="170" cy="100" r="4" fill="#FFFFFF" opacity="0.6" />
      <circle cx="55" cy="25" r="2" fill="#F4845F" opacity="0.7" />
    </svg>
  );
}

function MumIllustration() {
  return (
    <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <linearGradient id="mumBg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#FFD8C9" />
          <stop offset="100%" stopColor="#F4AF97" />
        </linearGradient>
      </defs>
      <rect width="200" height="140" fill="url(#mumBg)" />
      {/* pregnant silhouette */}
      <circle cx="100" cy="42" r="14" fill="#FFFFFF" opacity="0.95" />
      <path d="M82 60 Q80 75 85 90 Q75 95 73 110 Q73 125 85 130 L115 130 Q127 125 127 110 Q125 95 115 90 Q130 80 128 60 Q120 55 100 55 Q88 55 82 60 Z" fill="#FFFFFF" opacity="0.95" />
      {/* belly curve highlight */}
      <circle cx="113" cy="98" r="16" fill="#F4845F" opacity="0.22" />
      {/* heart top left */}
      <path d="M35 35 Q32 30 38 28 Q42 27 42 32 Q42 27 46 28 Q52 30 49 35 L42 44 Z" fill="#F4845F" opacity="0.75" />
      {/* sparkle */}
      <circle cx="170" cy="50" r="2" fill="#FFFFFF" />
      <circle cx="165" cy="90" r="3" fill="#FFFFFF" opacity="0.7" />
      <circle cx="25" cy="110" r="2.5" fill="#2D6A4F" opacity="0.45" />
    </svg>
  );
}

function GiftIllustration() {
  return (
    <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <linearGradient id="giftBg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#FCE5C8" />
          <stop offset="100%" stopColor="#F4C28A" />
        </linearGradient>
      </defs>
      <rect width="200" height="140" fill="url(#giftBg)" />
      {/* gift box */}
      <rect x="60" y="60" width="80" height="60" rx="4" fill="#FFFFFF" />
      <rect x="60" y="60" width="80" height="16" rx="4" fill="#F4845F" />
      {/* vertical ribbon */}
      <rect x="95" y="60" width="10" height="60" fill="#F4845F" />
      {/* horizontal accent */}
      <rect x="60" y="72" width="80" height="4" fill="#D4613C" />
      {/* bow */}
      <path d="M100 48 Q85 38 80 50 Q80 62 100 58 Q120 62 120 50 Q115 38 100 48 Z" fill="#F4845F" />
      <circle cx="100" cy="52" r="5" fill="#D4613C" />
      {/* confetti */}
      <rect x="30" y="30" width="6" height="6" rx="1" fill="#2D6A4F" opacity="0.4" transform="rotate(20 33 33)" />
      <rect x="165" y="40" width="5" height="5" rx="1" fill="#F4845F" opacity="0.7" transform="rotate(40 167 42)" />
      <circle cx="40" cy="100" r="3" fill="#FFFFFF" />
      <circle cx="170" cy="110" r="3" fill="#2D6A4F" opacity="0.4" />
    </svg>
  );
}

function HospitalListIllustration() {
  return (
    <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <linearGradient id="bagBg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#C8DCCF" />
          <stop offset="100%" stopColor="#8FBDA3" />
        </linearGradient>
      </defs>
      <rect width="200" height="140" fill="url(#bagBg)" />
      {/* hospital bag body */}
      <path d="M60 65 L140 65 L148 120 L52 120 Z" fill="#FFFFFF" />
      {/* bag handles */}
      <path d="M78 65 Q78 48 100 48 Q122 48 122 65" stroke="#2D6A4F" strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* cross icon */}
      <rect x="93" y="80" width="14" height="4" fill="#F4845F" />
      <rect x="98" y="75" width="4" height="14" fill="#F4845F" />
      {/* tag */}
      <rect x="130" y="78" width="22" height="14" rx="2" fill="#F4845F" />
      {/* checkmarks */}
      <path d="M33 55 L37 59 L44 52" stroke="#2D6A4F" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <path d="M158 35 L162 39 L170 30" stroke="#FFFFFF" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="30" cy="105" r="2.5" fill="#FFFFFF" opacity="0.7" />
    </svg>
  );
}

// Photo-first card media. If the image fails to load (e.g. file not dropped
// in yet), we swap in the SVG illustration as a graceful fallback.
function CardMedia({ src, alt, Illustration }: { src: string; alt: string; Illustration: React.FC }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Illustration />;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  );
}

export default function ShopShortcuts() {
  const cards = [
    {
      to: "/shop/baby",
      eyebrow: "Baby",
      title: "Baby Shop",
      sub: "Find all baby products here, 0 to 5 years.",
      Illustration: BabyIllustration,
      img: "/images/shop-baby.jpg",
      alt: "Shopping cart filled with baby essentials — diapers, wipes, and bottles — in a Nigerian mall",
    },
    {
      to: "/shop/mum",
      eyebrow: "Mum",
      title: "Mum Shop",
      sub: "Find all products here from pregnancy to postpartum.",
      Illustration: MumIllustration,
      img: "/images/shop-mum.jpg",
      alt: "Smiling pregnant Nigerian woman pushing a shopping cart filled with baby and maternity products",
    },
    {
      to: "/push-gifts",
      eyebrow: "Gifts",
      title: "Gift Shop",
      sub: "Gifts for new parents and push gifts for mums.",
      Illustration: GiftIllustration,
      img: "/images/shop-gifts.jpg",
      alt: "Smiling Nigerian man holding a stack of wrapped gift boxes",
    },
    {
      to: "https://bundledmum.com/bundles/maternity-bundles",
      eyebrow: "Ready-Packed",
      title: "Hospital Lists",
      sub: "Find our pre-packed hospital lists here.",
      Illustration: HospitalListIllustration,
      img: "/images/shop-hospital.jpg",
      alt: "Maternity hospital bag filled with baby and mum essentials",
    },
  ];

  return (
    <section className="py-12 md:py-20 bg-background">
      <div className="max-w-[1200px] mx-auto px-5 md:px-10">
        <div className="text-center mb-8 md:mb-12">
          <span className="text-coral text-[11px] font-semibold uppercase tracking-widest">Shop</span>
          <h2 className="pf text-[24px] md:text-[40px] text-forest font-bold mt-1.5 leading-tight">Everything you need, in one place</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
          {cards.map(c => (
            <Link
              key={c.title}
              to={c.to}
              className="group bg-card rounded-[18px] md:rounded-[20px] overflow-hidden shadow-card hover:shadow-card-hover transition-all border border-border flex flex-col"
            >
              <div className="aspect-[4/3] overflow-hidden relative">
                <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]">
                  <CardMedia src={c.img} alt={c.alt} Illustration={c.Illustration} />
                </div>
              </div>
              <div className="p-4 md:p-5 flex-1 flex flex-col">
                <span className="text-coral text-[10px] font-semibold uppercase tracking-widest">{c.eyebrow}</span>
                <h3 className="pf font-bold text-[16px] md:text-[18px] text-foreground mt-1 mb-1.5 leading-tight">{c.title}</h3>
                <p className="text-text-med text-[12px] md:text-[13px] leading-relaxed flex-1">{c.sub}</p>
                <span className="text-forest font-semibold text-[12px] mt-3 inline-flex items-center gap-1">
                  Explore <span aria-hidden>→</span>
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="text-center mt-8 md:mt-12">
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 rounded-pill bg-coral px-8 py-3.5 font-body font-semibold text-primary-foreground hover:bg-coral-dark interactive text-sm md:text-[15px]"
          >
            See All Our Products <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

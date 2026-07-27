import { useTrustSignals } from "@/hooks/useHomepage";

interface Props { title?: string | null }

export default function TrustBar({ title }: Props) {
  const { data: rawItems } = useTrustSignals();
  
  const items = rawItems?.map(item => {
    let label = item.label;
    let sublabel = item.sublabel;

    if (label === "Lagos Delivery") label = "Fast Delivery";
    if (label === "Brain Express & eFTD" || sublabel === "Brain Express & eFTD") {
      if (label === "Brain Express & eFTD") label = "1–2 working days in Lagos";
      if (sublabel === "Brain Express & eFTD") sublabel = "1–2 working days in Lagos";
    }
    if (sublabel === "Hassle-free within 7 days") sublabel = "Hassle-free within 7 days or less";

    return { ...item, label, sublabel };
  });

  if (!items || items.length === 0) return null;

  return (
    <section className="border-y border-border bg-muted/40">
      <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-3 md:py-4">
        {title && <div className="text-[10px] uppercase tracking-widest text-text-light font-semibold mb-2 text-center">{title}</div>}
        <ul className="flex gap-4 md:gap-6 overflow-x-auto md:overflow-visible md:justify-center scrollbar-none -mx-4 md:mx-0 px-4 md:px-0">
          {items.map(s => (
            <li key={s.id} className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xl">{s.icon}</span>
              <div>
                <div className="text-xs font-semibold leading-tight">{s.label}</div>
                {s.sublabel && <div className="text-[10px] text-text-light leading-tight">{s.sublabel}</div>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

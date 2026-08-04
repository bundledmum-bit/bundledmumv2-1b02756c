import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import PolicyNav from "./PolicyNav";
import { useMarketplacePolicySettings } from "./policySettings";

const SECTIONS = [
  { id: "what-we-collect", label: "What we collect and why" },
  { id: "lawful-basis", label: "Our lawful basis" },
  { id: "who-we-share", label: "Who we share it with" },
  { id: "how-long", label: "How long we keep it" },
  { id: "your-rights", label: "Your rights under the NDPA" },
  { id: "account-security", label: "Keeping your account secure" },
];

/** Privacy policy (design 24a, screen 4), NDPA structured. Same reference
 * layout as Terms. Content itself is not amount-driven, only the contact
 * address at the foot reads live. */
export default function PrivacyPage() {
  const { data: s, isLoading } = useMarketplacePolicySettings();
  if (isLoading || !s) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  return (
    <>
      <PolicyNav />
      <div className="mkt-policy-head">
        <h1>Privacy policy</h1>
        {s.policiesUpdatedAt && <span className="mkt-policy-updated">Last updated {s.policiesUpdatedAt}</span>}
      </div>

      <div className="mkt-policy-body">
        <div className="mkt-policy-col">
          <div className="mkt-policy-section" id={SECTIONS[0].id}>
            <h2>1. What we collect and why</h2>
            <p>We collect your name, email address, and phone or WhatsApp number, to run your account and let buyers and sellers coordinate delivery after payment. We collect listing photos and dispute evidence to keep the marketplace honest. Sellers give us bank details so we can pay them, and a buyer's bank details only when a refund is due to them. We record which device you sign in from so we can alert you to a sign in we don't recognise. Card details are entered directly with Paystack and never reach us.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[1].id}>
            <h2>2. Our lawful basis</h2>
            <p>We process most of this data because it is necessary to perform our contract with you, running your order or your listing. Some, like device information for sign in alerts, is processed under our legitimate interest in keeping accounts secure, balanced against your right to privacy.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[2].id}>
            <h2>3. Who we share it with</h2>
            <p>Paystack processes payments and receives what is needed to do so. Resend sends our emails, including sign in links and order updates. We plan to add an SMS provider for delivery notifications in future. We do not sell personal data to anyone.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[3].id}>
            <h2>4. How long we keep it</h2>
            <p>We keep account and order data for as long as your account is active and for a reasonable period after, to meet tax, dispute and legal record keeping obligations. Dispute evidence is kept longer, as it may be needed to resolve a later disagreement.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[4].id}>
            <h2>5. Your rights under the NDPA</h2>
            <p>Under the Nigeria Data Protection Act, you can ask us what data we hold about you, ask us to correct it, and ask us to delete it where we are not required to keep it for a legal reason such as an open order or dispute. Write to us at the contact address at the foot of this page and we will respond within a reasonable time.</p>
          </div>

          <div className="mkt-policy-section" id={SECTIONS[5].id}>
            <h2>6. Keeping your account secure</h2>
            <p>We use passwordless, emailed sign in links rather than storing passwords. Keep your email account secure, since a link to it can sign in to BundledMum.</p>
          </div>

          <div className="mkt-policy-contact">Questions, or a request under the NDPA? Write to us at <a href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a>.</div>
        </div>

        <aside className="mkt-policy-toc">
          <span className="lbl">On this page</span>
          <nav>
            {SECTIONS.map((sec, i) => <a key={sec.id} href={`#${sec.id}`}>{i + 1}. {sec.label}</a>)}
          </nav>
        </aside>
      </div>
    </>
  );
}

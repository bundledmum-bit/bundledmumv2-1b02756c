import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { usePromptCopy } from "@/hooks/usePromptCopy";

/**
 * Persistent storefront "Install App" entry point (matches the admin pattern):
 *  • Android / desktop Chrome → triggers the native install prompt directly.
 *  • iOS / prompt not yet available → opens the /install steps page.
 *  • Already installed (standalone) → renders nothing.
 */
export default function PwaInstallButton({ className }: { className?: string }) {
  const { canInstallNative, promptInstall, installed } = usePwaInstall();
  const { installCta } = usePromptCopy();
  const navigate = useNavigate();

  // Hide when already installed (standalone, remembered flag, or related app).
  if (installed) return null;

  const onClick = async () => {
    if (canInstallNative) {
      const outcome = await promptInstall();
      if (outcome === "unavailable") navigate("/install");
      return;
    }
    // iOS Safari (no beforeinstallprompt) or prompt not ready → show the steps.
    navigate("/install");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={className ?? "inline-flex items-center gap-1.5 text-sm font-semibold text-forest hover:text-coral transition-colors"}
    >
      <Download className="w-4 h-4" />
      {installCta}
    </button>
  );
}

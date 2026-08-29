/**
 * The block, as a sheet rather than an inline error.
 *
 * An inline message at the foot of a long form is easy to miss, which is
 * part of why a Car seats listing went through unnoticed. This reuses the
 * seller side's existing .mkt-sheet-overlay / .mkt-sheet pattern, the same
 * one DelistToEditSheet and the relist confirm use, rather than a third
 * kind of dialog.
 *
 * Nobody who reads it should be stuck: either film something, or knowingly
 * skip.
 */
export default function VideoRequiredSheet({
  reason, guidance, onAddVideo, onSkip, onClose,
}: {
  reason: string;
  guidance: string | null;
  onAddVideo: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mkt-sheet-overlay" onClick={onClose}>
      <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h3>A video is needed for this item</h3>

        {/* The category's own sentence, verbatim. */}
        <p>{reason}</p>

        {/* And what to actually film for this kind of item. */}
        {guidance && (
          <div className="mkt-video-guidance">
            <span className="ic" aria-hidden>🎬</span>
            <span>{guidance}</span>
          </div>
        )}

        {/* TWO REAL CHOICES. The second is a full button, not a quiet
            link: a seller who genuinely cannot film right now must not feel
            they are losing their listing by taking it. */}
        <button className="mkt-primary" onClick={onAddVideo}>Upload video</button>
        <button className="mkt-secondary" onClick={onSkip}>I cannot record one right now</button>
        <button className="back" onClick={onClose}>Back to my listing</button>
      </div>
    </div>
  );
}

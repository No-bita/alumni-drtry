import { useState } from "react";
import { FeedbackDialog } from "./FeedbackDialog";
import { LineIcon } from "./LineIcon";

/** Bottom of Home: the same in-app feedback form as the account menu. */
export function HomeFeedbackLine() {
  const [open, setOpen] = useState(false);
  return (
    <p className="home-feedback-line">
      <LineIcon name="advice" size={18} />
      <span>Have feedback or an issue?</span>
      <button type="button" className="home-feedback-line__link" onClick={() => setOpen(true)}>
        Give feedback <LineIcon name="arrow" size={16} />
      </button>
      {open ? <FeedbackDialog onClose={() => setOpen(false)} /> : null}
    </p>
  );
}

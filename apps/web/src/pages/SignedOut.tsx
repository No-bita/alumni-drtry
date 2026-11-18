import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { goToLanding } from "../lib/goToLanding";

/** Seconds the goodbye moment shows before moving on to the landing page. */
const AUTO_CONTINUE_SECONDS = 2;

/**
 * Goodbye moment after a successful sign-out: the supplied meme and a plain
 * "You're signed out." line. A tap moves on immediately; otherwise it clears
 * on its own and continues to the public landing page. Sign-out-everywhere
 * arrives with { plain: true } and skips the meme.
 */
export function SignedOut() {
  const location = useLocation();
  const plain = Boolean((location.state as { plain?: boolean } | null)?.plain);

  useEffect(() => {
    const timer = window.setTimeout(goToLanding, AUTO_CONTINUE_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="signed-out">
      <button type="button" className="signed-out__moment" onClick={goToLanding} aria-label="Continue to the Alma Mater homepage">
        {plain ? null : (
          <img
            className="signed-out__meme"
            src={`${import.meta.env.BASE_URL}signout-meme.jpg`}
            alt="Film still of a teary-eyed boy in a green turban, captioned: tussi jaa rahe ho, tussi naa jao"
          />
        )}
        <p className="signed-out__status">You're signed out.</p>
      </button>
    </main>
  );
}

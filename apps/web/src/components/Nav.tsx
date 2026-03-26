import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./Button";

type NavProps = {
  right?: React.ReactNode;
  /** Hide the default “Sign in” link when unauthenticated (e.g. on /login). */
  hideSignInLink?: boolean;
};

export function Nav({ right, hideSignInLink }: NavProps) {
  const auth = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    if (auth.status === "authenticated") {
      await auth.logout();
      navigate("/", { replace: true });
    }
  };

  return (
    <nav className="nav">
      <Link to="/" className="nav__logo">
        IIT BHU <span>Alumni</span>
      </Link>
      <div className="nav__right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {auth.status === "authenticated" ? (
          <>
            {right}
            <Button variant="secondary" onClick={handleSignOut} type="button">
              Sign out
            </Button>
          </>
        ) : hideSignInLink ? (
          right ?? null
        ) : (
          right ?? (
            <Link to="/login" style={{ color: "var(--cream)", fontSize: 13, textDecoration: "none" }}>
              Sign in
            </Link>
          )
        )}
      </div>
    </nav>
  );
}

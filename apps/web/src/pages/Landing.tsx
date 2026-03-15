import { Link } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { Eyebrow } from "../components/Eyebrow";
import { CAMPUS_IMAGE_SMALL } from "../constants/images";

export function Landing() {
  return (
    <>
      <Nav
        right={
          <Link to="/login" style={{ color: "var(--cream)", fontSize: 13, textDecoration: "none" }}>
            Sign in
          </Link>
        }
      />
      <section className="hero">
        <div className="hero__left">
          <Eyebrow>IIT BHU Alumni Network</Eyebrow>
          <h1 className="page-headline" style={{ marginBottom: 12 }}>
            The institution <span className="italic-accent">remembers you</span>.
          </h1>
          <p className="subheadline" style={{ color: "var(--ink-muted)", marginBottom: 24 }}>
            Reconnect with your batch, discover alumni across batches, and reach out meaningfully.
          </p>
          <div style={{ marginBottom: 32 }}>
            <Link to="/login">
              <Button variant="primary">Sign in with institutional email</Button>
            </Link>
          </div>
          <div style={{ display: "flex", gap: "2.5rem" }}>
            <div>
              <span className="stat-number">1K+</span>
              <span className="ui-label" style={{ display: "block", marginTop: 4 }}>
                Alumni
              </span>
            </div>
            <div>
              <span className="stat-number">50+</span>
              <span className="ui-label" style={{ display: "block", marginTop: 4 }}>
                Batches
              </span>
            </div>
          </div>
        </div>
        <div
          className="hero__right"
          style={{
            backgroundImage: `url(${CAMPUS_IMAGE_SMALL})`,
          }}
        >
          {/* Optional: profile list / intentcast strip overlay could go here */}
        </div>
      </section>
      <div className="intentcast-bar">
        <span>Alumni are looking to connect — sign in to see intentcasts.</span>
        <Link to="/login" style={{ color: "var(--cream)", fontWeight: 500 }}>
          Sign in →
        </Link>
      </div>
      <section className="campus-strip" style={{ marginTop: 0 }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="campus-strip__tile"
            style={{
              backgroundImage: `url(${CAMPUS_IMAGE_SMALL})`,
            }}
          />
        ))}
      </section>
    </>
  );
}

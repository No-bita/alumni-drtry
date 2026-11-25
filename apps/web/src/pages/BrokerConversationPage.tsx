import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { BrokerConversationThread } from "../components/broker/BrokerConversationThread";
import "../styles/broker.css";

/** /requests/:requestId/conversation: the asker and the helper who said yes, talking about one request. */
export function BrokerConversationPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <Nav variant="home" />
      <main className="broker-convo-page">
        <button
          type="button"
          className="notifications-page__back"
          onClick={() => (location.key === "default" ? navigate("/notifications#your-requests", { replace: true }) : navigate(-1))}
          aria-label="Go back"
        >
          Back
        </button>
        {requestId ? <BrokerConversationThread key={requestId} requestId={requestId} /> : null}
      </main>
    </>
  );
}

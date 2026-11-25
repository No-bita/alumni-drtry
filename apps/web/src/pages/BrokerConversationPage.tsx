import { useParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { BrokerConversationThread } from "../components/broker/BrokerConversationThread";
import "../styles/broker.css";

/** /requests/:requestId/conversation: the asker and the helper who said yes, talking about one request. */
export function BrokerConversationPage() {
  const { requestId } = useParams<{ requestId: string }>();
  return (
    <>
      <Nav variant="home" />
      {/* The conversation card carries its own Back ("Requests for you" or "Your requests"). */}
      <main className="broker-convo-page">{requestId ? <BrokerConversationThread key={requestId} requestId={requestId} /> : null}</main>
    </>
  );
}

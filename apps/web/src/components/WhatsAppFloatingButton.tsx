import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { fetchWhatsAppSettings, WHATSAPP_SETTINGS_KEY, whatsappChatUrl } from "../lib/whatsapp";
import glyph from "../assets/whatsapp-glyph-white.svg";
import "../styles/whatsapp.css";

import { isWhatsAppMainPage } from "../lib/whatsappMainPage";

export function WhatsAppFloatingButton() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const enabled = auth.status === "authenticated" && isWhatsAppMainPage(pathname, auth.myProfile?.id);
  const query = useQuery({ queryKey: WHATSAPP_SETTINGS_KEY, queryFn: ({ signal }) => fetchWhatsAppSettings(signal), enabled });
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const viewport = window.visualViewport;
      const focus = document.activeElement;
      const typing = focus instanceof HTMLElement && (focus.matches("input, textarea, select") || focus.isContentEditable);
      const keyboard = typing || (viewport != null && viewport.height < window.innerHeight - 140);
      const dialog = !!document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]');
      setHidden(keyboard || dialog);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "open"] });
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, [enabled]);
  const botNumber = query.data?.botNumber;
  if (!enabled || !botNumber || !/^\d{8,15}$/.test(botNumber)) return null;
  return <a className="wa-fab" style={{ bottom: 24 }} hidden={hidden} href={whatsappChatUrl(botNumber)} target="_blank" rel="noopener noreferrer" aria-label="Open Alma on WhatsApp"><img src={glyph} width="30" height="30" alt="" /></a>;
}

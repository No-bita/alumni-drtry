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
  const [layout, setLayout] = useState({ hidden: false, bottom: 24 });
  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const viewport = window.visualViewport;
      const focus = document.activeElement;
      const typing = focus instanceof HTMLElement && (focus.matches("input, textarea, select") || focus.isContentEditable);
      const keyboard = typing || (viewport != null && viewport.height < window.innerHeight - 140);
      const dialog = !!document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]');
      const dock = document.querySelector(".nav-bottom-dock");
      const rect = dock?.getBoundingClientRect();
      const bottom = rect && rect.height > 0 ? window.innerHeight - rect.top + 16 : 24;
      setLayout(prev => prev.hidden === (keyboard || dialog) && prev.bottom === bottom ? prev : { hidden: keyboard || dialog, bottom });
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "open"] });
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    const dock = document.querySelector(".nav-bottom-dock");
    if (dock) resizeObserver?.observe(dock);
    return () => {
      observer.disconnect(); resizeObserver?.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, [enabled]);
  const botNumber = query.data?.botNumber;
  if (!enabled || !botNumber || !/^\d{8,15}$/.test(botNumber)) return null;
  return <a className="wa-fab" style={{ bottom: layout.bottom }} hidden={layout.hidden} href={whatsappChatUrl(botNumber)} target="_blank" rel="noopener noreferrer" aria-label="Open Alma on WhatsApp"><img src={glyph} width="30" height="30" alt="" /></a>;
}

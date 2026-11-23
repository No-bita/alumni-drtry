/** Main signed-in pages only, never shared/other members' profiles or entry/composition routes. */
export function isWhatsAppMainPage(path: string, ownerId: string | null | undefined): boolean {
  return path === "/home" || path === "/events" || path === "/intent/career" || path === "/intent/business" || path === "/intent/location" || path.startsWith("/intent/location/") || path.startsWith("/intent/career/company") || (!!ownerId && path === `/profiles/${ownerId}`);
}


import { useMemo } from "react";
import { WallEmptyPrompt } from "../WallEmptyPrompt";

import { cityEmptyExample } from "../../lib/cityEmptyExample";

/** City-specific examples have their own once-per-city browser-session history. */
export function CityEmptyPrompt({ city, placeId, onAsk }: { city: string; placeId: string; onAsk: () => void }) {
  const examples = useMemo(() => [cityEmptyExample(city)], [city]);
  return (
    <WallEmptyPrompt
      examples={examples}
      sessionKey={`alma.cityEmptyPrompt.played.${placeId}`}
      accessibleLabel={`Ask the ${city} community`}
      onPost={onAsk}
    />
  );
}

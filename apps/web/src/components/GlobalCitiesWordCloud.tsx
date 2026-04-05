/**
 * Static placeholder: global cities word cloud (`public/media/global-cities-word-cloud.png`).
 */
export function GlobalCitiesWordCloud() {
  return (
    <div className="location-global-cloud">
      <img
        src={`${import.meta.env.BASE_URL}media/global-cities-word-cloud.png`}
        alt="Word cloud of cities including London, Paris, New York, Beijing, Berlin, Madrid, Tokyo, Athens, Oslo, Moscow, and others"
        className="location-global-cloud__img"
        decoding="async"
        loading="lazy"
      />
    </div>
  );
}

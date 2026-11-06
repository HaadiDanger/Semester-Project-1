import useAssetUrl from "../hooks/useAssetUrl"
export default function AssetImage({ assetId, alt, className = "asset-image" }) {
  const { url, error } = useAssetUrl(assetId)
  if (!assetId) return null
  return url ? <img src={url} alt={alt} className={className} loading="lazy" /> : <p className="muted text-xs mt-3" role="status">{error ? "Image unavailable for this session." : "Loading image…"}</p>
}

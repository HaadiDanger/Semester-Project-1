export default function HeroOrbit() {
  return <div className="hero-orbit" aria-hidden="true">
    <span className="orbit-plane orbit-plane-outer"><span className="orbit-runner orbit-runner-outer" /></span>
    <span className="orbit-plane orbit-plane-inner"><span className="orbit-runner orbit-runner-inner" /></span>
    <span className="orbit-plane orbit-plane-cross"><span className="orbit-runner orbit-runner-cross" /></span>
    <span className="orbit-core" />
    <span className="orbit-star orbit-star-one" />
    <span className="orbit-star orbit-star-two" />
    <span className="orbit-star orbit-star-three" />
  </div>
}

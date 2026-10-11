import Iridescence from "@/components/Iridescence";
import SpotlightCard from "@/components/SpotlightCard";

const roles = [
  {
    number: "01",
    name: "For shoppers",
    title: "Find the little things, close by.",
    body: "See which nearby shops have what you need, before you step out.",
    symbol: "⌕",
    tint: "rose",
  },
  {
    number: "02",
    name: "For shopkeepers",
    title: "A calmer way to run your shop.",
    body: "Keep stock and everyday work moving, with the final say always yours.",
    symbol: "⌂",
    tint: "lilac",
  },
  {
    number: "03",
    name: "For suppliers",
    title: "Keep local shelves in rhythm.",
    body: "Manage orders and serve the neighbourhood shops that count on you.",
    symbol: "↗",
    tint: "amber",
  },
];

const steps = [
  ["01", "Look around", "Find a nearby shop and check broad stock status."],
  ["02", "Keep things moving", "Shops track stock and bills in one place."],
  ["03", "Restock together", "Suppliers and shops stay in step on orders."],
];

function NetworkIllustration() {
  return (
    <div className="network-art" aria-label="A diagram connecting shoppers, local shops, and suppliers">
      <div className="network-art__orbit network-art__orbit--outer" />
      <div className="network-art__orbit network-art__orbit--inner" />
      <div className="network-art__center"><span>k</span><small>LOCAL<br />LOOP</small></div>
      <div className="network-art__node network-art__node--top"><span>⌕</span><small>SHOPPER</small></div>
      <div className="network-art__node network-art__node--right"><span>⌂</span><small>SHOP</small></div>
      <div className="network-art__node network-art__node--left"><span>↗</span><small>SUPPLIER</small></div>
      <i className="network-art__spark network-art__spark--one" />
      <i className="network-art__spark network-art__spark--two" />
      <i className="network-art__spark network-art__spark--three" />
    </div>
  );
}

function QrPlaceholder() {
  return (
    <div className="qr-placeholder" aria-label="QR code will be added when the Android APK is ready">
      <div className="qr-placeholder__grid" aria-hidden="true">
        <span className="qr-finder qr-finder--tl" /><span className="qr-finder qr-finder--tr" />
        <span className="qr-finder qr-finder--bl" /><span className="qr-dots" /><span className="qr-stamp">k</span>
      </div>
      <span className="qr-placeholder__caption">SCAN TO GET THE APP</span>
    </div>
  );
}

export default function App() {
  return (
    <main className="landing">
      <div className="landing__background" aria-hidden="true">
        <Iridescence
          className="landing__iridescence"
          color="#190e05"
          hueShift={14}
          saturation={1.2}
          brightness={3}
          contrast={1.18}
          speed={0.28}
          scale={1.15}
          detail={9}
          warp={1.15}
          mouseReact
          amplitude={0.09}
          stir={0.55}
          sheen={0.42}
          clickSwirl
          grain={0.035}
          fade={0}
          opacity={0.96}
          resolution={1}
        />
      </div>
      <div className="landing__intro-curtain" aria-hidden="true" />
      <div className="landing__shade" aria-hidden="true" />

      <header className="header">
        <a className="brand" href="#home" aria-label="കnnect home"><img src="/brand-mark.png" alt="കnnect" /></a>
        <nav aria-label="Main navigation"><a className="nav-button" href="#network">The network <span>↘</span></a><a className="nav-button" href="#apps">Who it’s for <span>↘</span></a><a className="nav-button nav-button--primary" href="#download">Get the app <span>↗</span></a></nav>
      </header>

      <section className="hero" id="home">
        <div className="hero__content">
          <h1>Good things<br />move <em>locally.</em></h1>
          <p className="hero__copy">A little more connected. A lot closer to home. കnnect brings neighbourhood shops, shoppers and suppliers into one easy rhythm.</p>
          <div className="hero__actions"><a className="button button--glow" href="#network">Discover the network <span>↘</span></a><a className="hero__text-link" href="#download">Get the app <span>↗</span></a></div>
        </div>
        <div className="hero__chapter"><span>01</span><i /> THE EVERYDAY, RECONNECTED</div>
      </section>

      <div className="ticker" aria-label="Shop local, stay connected, keep good things moving">
        <div className="ticker__track">{Array.from({ length: 2 }).map((_, index) => <span key={index}>SHOP LOCAL <i>✳</i> STAY CONNECTED <i>✳</i> KEEP GOOD THINGS MOVING <i>✳</i> SHOP LOCAL <i>✳</i> STAY CONNECTED <i>✳</i></span>)}</div>
      </div>

      <section className="network" id="network">
        <div className="network__copy-block">
          <p className="section-label"><span>01</span> A SMALLER DISTANCE BETWEEN US</p>
          <h2>One neighbourhood.<br /><em>A thousand little connections.</em></h2>
          <p className="network__description">The shop around the corner is more than a place to pick something up. It’s part of how a neighbourhood looks after itself. കnnect helps that local loop work a little better for everyone in it.</p>
          <a className="dark-link" href="#apps">Meet the people in the loop <span>↗</span></a>
        </div>
        <NetworkIllustration />
        <div className="network__footnote"><span>LOCAL BY NATURE</span><i /> CONNECTED BY കnnect</div>
      </section>

      <section className="roles" id="apps">
        <div className="roles__heading"><div><p className="section-label"><span>02</span> MADE FOR YOUR SIDE OF THE COUNTER</p><h2>One network.<br /><em>Your kind of day.</em></h2></div><p>Three simple experiences,<br />made to work better together.</p></div>
        <div className="roles__grid">
          {roles.map((role) => <SpotlightCard
            className={`role-card role-card--${role.tint}`}
            key={role.number}
            role="article"
            aria-label={`${role.name}: ${role.title}`}
            theme="dark"
            spotlightColor="rgba(255, 190, 113, 0.9)"
            intensity={0.22}
            spotlightSize={220}
            softness={0.76}
            borderGlow={0.58}
            proximity={80}
            smoothing={0.32}
            grain={0.025}
            style={{
              "--spotlight-card-surface": "rgba(31, 17, 7, .2)",
              "--spotlight-card-border": "rgba(255, 210, 164, .22)",
              "--spotlight-card-shadow": "0 22px 55px rgba(5, 2, 0, .18)",
            }}
          >
            <div className="role-card__top"><span className="role-card__signature"><span>{role.number} /</span><img src="/brand-mark.png" alt="കnnect" /><i className="role-card__icon" aria-hidden="true">{role.symbol}</i></span></div>
            <p className="role-card__audience">{role.name}</p>
            <h3>{role.title}</h3>
            <p className="role-card__body">{role.body}</p>
          </SpotlightCard>)}
        </div>
      </section>

      <section className="rhythm">
        <div className="rhythm__heading"><p className="section-label"><span>03</span> A GOOD DAY, IN THREE STEPS</p><h2>Local life,<br /><em>in better rhythm.</em></h2></div>
        <div className="rhythm__steps">
          {steps.map(([number, title, body], index) => <article className="rhythm-step" key={number}>
            <div className="rhythm-step__number">{number}<span>{index === 0 ? "◉" : index === 1 ? "⌂" : "↗"}</span></div>
            <h3>{title}</h3><p>{body}</p>
            {index < steps.length - 1 && <div className="rhythm-step__connector" aria-hidden="true">····································→</div>}
          </article>)}
        </div>
        <div className="rhythm__note"><span>✳</span> Thoughtful tools for the people who keep a neighbourhood going.</div>
      </section>

      <section className="download" id="download">
        <div className="download__copy">
          <p className="section-label"><span>04</span> TAKE കnnect WITH YOU</p>
          <h2>Your neighbourhood<br />is <em>just around the corner.</em></h2>
          <p>Bring the local loop along for the day. The കnnect Android app is getting ready to meet you.</p>
          <a className="button button--disabled" href="#download" aria-disabled="true" onClick={(event) => event.preventDefault()}><span className="button__android">◉</span> Android app coming soon <span>↗</span></a>
          <span className="download__fineprint">The APK link and scannable QR code will go live with the Android release.</span>
        </div>
        <div className="download__device-wrap">
          <div className="download__glow" aria-hidden="true" /><div className="download__halo download__halo--one" /><div className="download__halo download__halo--two" />
          <div className="download__device"><div className="download__device-top"><img src="/brand-mark.png" alt="കnnect" /><span>•••</span></div><div className="download__device-art"><div className="download__device-sun" /><div className="download__device-hill download__device-hill--back" /><div className="download__device-hill download__device-hill--front" /><div className="download__device-shop">⌂</div></div><div className="download__device-caption"><span>GOOD THINGS</span><strong>move locally.</strong><i>Find your neighbourhood.</i></div><div className="download__device-dots"><i /><i /><i /></div></div>
          <div className="download__qr-card"><QrPlaceholder /><div><span>ANDROID</span><strong>Ready when you are.</strong><small>APK + QR arriving soon</small></div></div>
        </div>
      </section>

      <section className="closing">
        <span className="closing__asterisk">✳</span><p>The best things are<br />happening <em>right here.</em></p><a href="#home">Back to the top <span>↑</span></a>
      </section>

      <footer className="footer"><a className="brand" href="#home" aria-label="കnnect home"><img src="/brand-mark.png" alt="കnnect" /></a><span>Good things move locally.</span><nav aria-label="Footer navigation"><a href="#network">Our network</a><a href="#apps">For everyone</a><a href="#download">Get the app</a></nav><span>© 2026 കnnect</span></footer>
    </main>
  );
}

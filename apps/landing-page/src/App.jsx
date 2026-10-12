import Iridescence from "@/components/Iridescence";
import ScrollVelocity from "@/components/ScrollVelocity";
import SpotlightCard from "@/components/SpotlightCard";
import SpecularButton from "@/components/SpecularButton";

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
        <a className="brand" href="#home" aria-label="കnnect home"><img src="/branding/kannect-logo.png" alt="കnnect" /></a>
        <nav aria-label="Main navigation">
          <SpecularButton href="#network" className="nav-button" size="sm" radius={999} tint="#9c5425" tintOpacity={0.07} textColor="#ffefd9" lineColor="#ffd59b" baseColor="#8e542e" intensity={0.78} idleIntensity={0.2} shineSize={7} shineFade={28} thickness={1} glow={0.65} proximity={150} blur={0}>The network <span className="button-arrow">↘</span></SpecularButton>
          <SpecularButton href="#apps" className="nav-button" size="sm" radius={999} tint="#9c5425" tintOpacity={0.07} textColor="#ffefd9" lineColor="#ffd59b" baseColor="#8e542e" intensity={0.78} idleIntensity={0.2} shineSize={7} shineFade={28} thickness={1} glow={0.65} proximity={150} blur={0}>Who it’s for <span className="button-arrow">↘</span></SpecularButton>
          <SpecularButton href="#download" className="nav-button nav-button--primary" size="sm" radius={999} tint="#b66d35" tintOpacity={0.15} textColor="#fff3e4" lineColor="#ffe2b4" baseColor="#b46a35" intensity={0.95} idleIntensity={0.3} shineSize={9} shineFade={30} thickness={1.1} glow={0.9} proximity={170} blur={0}>Get the app <span className="button-arrow">↗</span></SpecularButton>
        </nav>
      </header>

      <section className="hero" id="home">
        <div className="hero__content">
          <h1>Good things<br />move <em>locally.</em></h1>
          <p className="hero__copy">A little more connected. A lot closer to home. കnnect brings neighbourhood shops, shoppers and suppliers into one easy rhythm.</p>
          <div className="hero__actions">
            <SpecularButton href="#network" className="hero__text-link" size="sm" radius={999} tint="#74401f" tintOpacity={0.04} textColor="#ffefd9" lineColor="#efbb7d" baseColor="#a65b2a" intensity={0.8} idleIntensity={0.23} shineSize={6} shineFade={26} thickness={0.9} glow={0.6} proximity={140} blur={0}>Discover the network <span className="button-arrow">↘</span></SpecularButton>
            <SpecularButton href="#download" className="button button--glow" size="md" radius={999} tint="#a85f2d" tintOpacity={0.2} textColor="#fff4e7" lineColor="#ffdda9" baseColor="#a65b2a" intensity={1} idleIntensity={0.28} shineSize={9} shineFade={31} thickness={1.5} glow={1.1} proximity={180} blur={0}>Get the app <span className="button-arrow">↗</span></SpecularButton>
          </div>
        </div>
        <div className="hero__chapter"><span>01</span><i /> THE EVERYDAY, RECONNECTED</div>
      </section>

      <div className="ticker" aria-label="Shop local, stay connected, keep good things moving">
        <ScrollVelocity
          texts={[<>SHOP LOCAL <i>✳</i> STAY CONNECTED <i>✳</i> KEEP GOOD THINGS MOVING <i>✳</i></>]}
          velocity={36}
          className="ticker__copy"
          numCopies={6}
          damping={85}
          stiffness={750}
          parallaxClassName="ticker__parallax"
          scrollerClassName="ticker__track"
        />
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
            <div className="role-card__top"><span className="role-card__signature"><span>{role.number} /</span><img src="/branding/app-icon.ico" alt="കnnect" /><i className="role-card__icon" aria-hidden="true">{role.symbol}</i></span></div>
            <p className="role-card__audience">{role.name}</p>
            <h3>{role.title}</h3>
            <p className="role-card__body">{role.body}</p>
          </SpotlightCard>)}
        </div>
      </section>

      <section className="rhythm">
        <div className="rhythm__heading"><p className="section-label"><span>03</span> A GOOD DAY, IN THREE STEPS</p><h2>Local life,<br /><em>in better rhythm.</em></h2></div>
        <div className="rhythm__steps">
          {steps.map(([number, title, body], index) => <SpotlightCard
            className="rhythm-step"
            key={number}
            role="article"
            aria-label={`${number}: ${title}`}
            theme="dark"
            spotlightColor="rgba(255, 190, 113, 0.9)"
            intensity={0.2}
            spotlightSize={220}
            softness={0.78}
            borderGlow={0.5}
            proximity={80}
            smoothing={0.32}
            grain={0.02}
            style={{
              "--spotlight-card-surface": "linear-gradient(180deg, rgba(192, 105, 39, .14), rgba(32, 18, 8, .28) 72%)",
              "--spotlight-card-border": "rgba(245, 174, 104, .52)",
              "--spotlight-card-shadow": "0 18px 42px rgba(5, 2, 0, .12)",
            }}
          >
            <div className="rhythm-step__number">{number}<span>{index === 0 ? "◉" : index === 1 ? "⌂" : "↗"}</span></div>
            <h3>{title}</h3><p>{body}</p>
            {index < steps.length - 1 && <div className="rhythm-step__connector" aria-hidden="true">····································→</div>}
          </SpotlightCard>)}
        </div>
        <div className="rhythm__note"><span>✳</span> Thoughtful tools for the people who keep a neighbourhood going.</div>
      </section>

      <section className="download" id="download">
        <div className="download__copy">
          <p className="section-label"><span>04</span> TAKE കnnect WITH YOU</p>
          <h2>Your neighbourhood<br />is <em>just around the corner.</em></h2>
          <p>Bring the local loop along for the day. Separate Android apps for shoppers, shops and suppliers are on the way.</p>
          <div className="download__apps" aria-label="Android apps">
            {["Consumer", "Retailer", "Supplier"].map((app) => <SpecularButton key={app} className="button button--disabled download__app-button" size="md" radius={999} tint="#764b2d" tintOpacity={0.1} textColor="#f5dec4" lineColor="#d7a16b" baseColor="#76502f" intensity={0.38} idleIntensity={0.08} shineSize={5} shineFade={22} thickness={0.8} glow={0.35} followMouse={false} blur={0} disabled><span className="button__android">◉</span> {app} <span className="button__coming-soon">Coming soon</span></SpecularButton>)}
          </div>
          <span className="download__fineprint">APK links and app specific QR codes will go live with each release.</span>
        </div>
        <div className="download__device-wrap">
          <div className="download__glow" aria-hidden="true" /><div className="download__halo download__halo--one" /><div className="download__halo download__halo--two" />
          <div className="download__device"><div className="download__device-top"><img src="/branding/app-icon.ico" alt="കnnect" /><span>•••</span></div><div className="download__device-art"><div className="download__device-sun" /><div className="download__device-hill download__device-hill--back" /><div className="download__device-hill download__device-hill--front" /><div className="download__device-shop">⌂</div></div><div className="download__device-caption"><span>GOOD THINGS</span><strong>move locally.</strong><i>Find your neighbourhood.</i></div><div className="download__device-dots"><i /><i /><i /></div></div>
          <div className="download__qr-card"><QrPlaceholder /><div><span>ANDROID</span><strong>Ready when you are.</strong><small>APK + QR arriving soon</small></div></div>
        </div>
      </section>

      <div className="ending">
        <section className="closing">
          <span className="closing__asterisk">✳</span><p>The best things are<br />happening <em>right here.</em></p><a href="#home">Back to the top <span>↑</span></a>
        </section>

        <footer className="footer"><a className="brand" href="#home" aria-label="കnnect home"><img src="/branding/kannect-logo.png" alt="കnnect" /></a><span>Good things move locally.</span><nav aria-label="Footer navigation"><a href="#network">Our network</a><a href="#apps">For everyone</a><a href="#download">Get the app</a></nav><span>© 2026 കnnect</span></footer>
      </div>
    </main>
  );
}

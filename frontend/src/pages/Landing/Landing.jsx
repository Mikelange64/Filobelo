import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import filobeloWaving from '../../assets/mascott/filobelo_waving.svg'
import filobeloReading from '../../assets/mascott/filobelo_reading.svg'
import workspaceShowcase from '../../assets/landing/workspace-showcase.png'
import './Landing.css'

const FEATURES = [
  {
    title: "Workspaces & tasks",
    desc: "Always know what's overdue, due soon, or already handled — one glance, no digging.",
    icon: <ColumnsIcon />,
  },
  {
    title: "Notes",
    desc: "Keep decisions and context where the work happens, instead of scattered across another app.",
    icon: <LinesIcon />,
  },
  {
    title: "Conversations",
    desc: "Ask instead of searching — chat with your team and an assistant that already knows the context.",
    icon: <BubbleIcon />,
  },
  {
    title: "Calendar",
    desc: "Never get blindsided by a deadline hiding in a workspace you forgot about.",
    icon: <GridIcon />,
  },
]

function ColumnsIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true">
      <rect x="1" y="2" width="5" height="16" rx="1.5" />
      <rect x="7.5" y="2" width="5" height="10" rx="1.5" />
      <rect x="14" y="2" width="5" height="13" rx="1.5" />
    </svg>
  )
}

function LinesIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true">
      <rect x="1" y="2" width="18" height="3.2" rx="1.6" />
      <rect x="1" y="8.4" width="18" height="3.2" rx="1.6" />
      <rect x="1" y="14.8" width="11" height="3.2" rx="1.6" />
    </svg>
  )
}

function BubbleIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h13A1.5 1.5 0 0 1 18 3.5v9A1.5 1.5 0 0 1 16.5 14H8l-4.2 3.4a.6.6 0 0 1-1-.46V14h-.3A1.5 1.5 0 0 1 1 12.5v-9z" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="1.5" y="3" width="17" height="15" rx="2" />
      <line x1="13" y1="1" x2="13" y2="5" />
      <line x1="7" y1="1" x2="7" y2="5" />
      <line x1="1.5" y1="8" x2="18.5" y2="8" />
    </svg>
  )
}

function Landing() {
  const rootRef = useRef(null)

  // Scroll-reveal: fade+rise each section in once, the first time it enters
  // the viewport. The hero fades in immediately on load instead (it's
  // already visible), so it isn't in this observed set.
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll('.landing__reveal') ?? []
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('landing__reveal--visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15 }
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="landing" ref={rootRef}>
      <header className="landing__nav">
        <span className="landing__logo">Filobelo</span>
        <div className="landing__nav-actions">
          <Link to="/login" className="landing__nav-link">Log in</Link>
          <Link to="/register" className="landing__btn landing__btn--primary landing__btn--nav">Sign up free</Link>
        </div>
      </header>

      <section className="landing__hero">
        <div className="landing__hero-text">
          <span className="landing__badge">Free, no credit card</span>
          <h1 className="landing__hero-title">Stay organized,<br />without the learning curve</h1>
          <p className="landing__hero-sub">
            Filobelo brings tasks, notes, chats, and calendar into one uncluttered workspace.
            No manual, no setup — just open it and get to work.
          </p>
          <div className="landing__hero-actions">
            <Link to="/register" className="landing__btn landing__btn--primary landing__btn--lg">Sign up free</Link>
            <a href="#features" className="landing__link-cta">See how it works &rarr;</a>
          </div>
        </div>
        <div className="landing__hero-mascot-wrap">
          <img src={filobeloWaving} alt="" className="landing__hero-mascot" />
        </div>
      </section>

      <section className="landing__features landing__reveal" id="features">
        <div className="landing__section-head">
          <h2>Everything in one workspace</h2>
          <p>No juggling five apps to get anything done.</p>
        </div>
        <div className="landing__feature-grid">
          {FEATURES.map((f) => (
            <div className="landing__feature-card" key={f.title}>
              <div className="landing__feature-icon">{f.icon}</div>
              <div className="landing__feature-title">{f.title}</div>
              <div className="landing__feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing__showcase landing__reveal">
        <div className="landing__showcase-text">
          <h2>Your whole workspace, at a glance</h2>
          <p>Tasks, boards, and deadlines sit together on one screen — so you always know what needs you next.</p>
        </div>
        <div className="landing__showcase-img-wrap">
          <img src={workspaceShowcase} alt="A Filobelo Kanban board with tasks across To Do, In Progress, and Done columns" className="landing__showcase-img" />
        </div>
      </section>

      <section className="landing__final-cta landing__reveal">
        <img src={filobeloReading} alt="" className="landing__final-cta-mascot" />
        <h2>Ready to get organized?</h2>
        <p>Free to start. Set up your first workspace in under a minute.</p>
        <Link to="/register" className="landing__btn landing__btn--primary landing__btn--lg">Sign up free</Link>
      </section>

      <footer className="landing__footer">
        <span className="landing__logo landing__logo--footer">Filobelo</span>
        <span>&copy; 2026 Filobelo. All rights reserved.</span>
      </footer>
    </div>
  )
}

export default Landing

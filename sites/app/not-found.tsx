import Link from "next/link";

export default function NotFound() {
  return <main className="not-found"><div className="eyebrow"><span>404</span>ROUTE_REMOVED</div><h1>This route is no longer part of the notebook.</h1><p>The migration intentionally removed theme demonstrations and stale legacy pages.</p><Link className="button button-primary" href="/">Return home</Link></main>;
}

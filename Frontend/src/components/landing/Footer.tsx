import Link from 'next/link';

export function Footer() {
  return (
    <footer role="contentinfo" className="bg-[--footer-bg] border-t border-[--border-color]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[--text-muted]">
            &copy; {new Date().getFullYear()} VertexChain. Powered by the{' '}
            <a href="https://stellar.org" target="_blank" rel="noopener noreferrer" className="hover:text-[--text-primary] transition-colors">
              Stellar Network
            </a>.
          </p>
          <nav aria-label="Footer navigation" className="flex items-center gap-6">
            <Link href="/privacy" className="text-sm text-[--text-muted] hover:text-[--text-primary] transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="text-sm text-[--text-muted] hover:text-[--text-primary] transition-colors">
              Terms
            </Link>
            <Link href="/docs" className="text-sm text-[--text-muted] hover:text-[--text-primary] transition-colors">
              Docs
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

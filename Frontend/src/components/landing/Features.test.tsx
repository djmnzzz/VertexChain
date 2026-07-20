import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { Features } from './Features'
import gsap from 'gsap'

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}))

vi.mock('gsap', () => ({
  default: { fromTo: vi.fn(), registerPlugin: vi.fn(), from: vi.fn() },
}))

vi.mock('@gsap/react', () => ({
  useGSAP: vi.fn((fn: () => void) => fn()),
}))

vi.mock('../magicui/animated-beam', () => ({
  AnimatedBeam: () => null,
}))

vi.mock('./Circle', () => ({
  Circle: ({ children }: { children: React.ReactNode }) => <div data-testid="circle">{children}</div>,
}))

beforeAll(() => {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: vi.fn(() => ({ observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() })),
  })
})

describe('Features', () => {
  it('renders the Core Features badge', () => {
    render(<Features />)
    expect(screen.getByText('Core Features')).toBeInTheDocument()
  })

  it('renders the section heading', () => {
    render(<Features />)
    expect(screen.getByText('The Hyperlocal Information Hub')).toBeInTheDocument()
  })

  it('renders all 3 feature card titles', () => {
    render(<Features />)
    expect(screen.getByText('Truly Anonymous')).toBeInTheDocument()
    expect(screen.getByText('Hyperlocal Focus')).toBeInTheDocument()
    expect(screen.getByText('Real-Time & Unfiltered')).toBeInTheDocument()
  })

  it('renders feature card descriptions', () => {
    render(<Features />)
    expect(screen.getByText(/No accounts, no tracking/)).toBeInTheDocument()
    expect(screen.getByText(/Filter out the noise/)).toBeInTheDocument()
    expect(screen.getByText(/Get live updates as they happen/)).toBeInTheDocument()
  })

  it('renders correctly on a narrow (mobile) viewport', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 })
    window.dispatchEvent(new Event('resize'))
    render(<Features />)
    expect(screen.getByText('The Hyperlocal Information Hub')).toBeInTheDocument()
  })

  it('renders correctly on a wide (desktop) viewport', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 })
    window.dispatchEvent(new Event('resize'))
    render(<Features />)
    expect(screen.getByText('The Hyperlocal Information Hub')).toBeInTheDocument()
  })

  it('does not trigger GSAP animations when prefers-reduced-motion is enabled', () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const mockFromTo = vi.mocked(gsap.fromTo);
    mockFromTo.mockClear();

    render(<Features />);

    expect(mockFromTo).not.toHaveBeenCalled();

    if (originalMatchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: originalMatchMedia,
      });
    } else {
      // @ts-expect-error - deleting matchMedia if it wasn't originally defined
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  })
})
